// Assistente Pedagogico: LangGraph orquestra o laco (agente <-> ferramentas), o
// estado do turno e o streaming de eventos; cada chamada ao Claude Opus 5.5 vai
// pelo SDK oficial da Anthropic. O historico e append-only: as mensagens voltam ao
// modelo exatamente como vieram, inclusive blocos de thinking e de fallback.
import Anthropic from '@anthropic-ai/sdk';
import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from '@langchain/langgraph';
import { maskPii } from '../pii';
import type { AiFonte } from '../types';
import { ASSISTENTE_PEDAGOGICO } from './prompt';
import {
  DEFINICOES_FERRAMENTAS, ENTRADAS, ROTULOS,
  type FerramentasAssistente, type NomeFerramenta, type PlanejamentoProposto,
} from './ferramentas';

export const MODELO_ASSISTENTE = 'claude-opus-5-5';
/** Chamadas ao modelo por resposta; ao chegar no teto, ele responde sem ferramentas. */
export const MAX_CHAMADAS_POR_TURNO = 6;
// fallback server-side em recusa do classificador; notas de progresso entre ferramentas;
// e descarte (em vez de erro) de thinking antigo se o prompt mudar de versao.
const BETAS = ['server-side-fallback-2026-07-01', 'thinking-display-updates-2026-08-18', 'thinking-binding-controls-2026-08-01'];

const MENSAGEM_RECUSA = 'Não consegui responder a essa solicitação. Reformule a pergunta com foco no planejamento ou na prática em sala, por favor.';
const MENSAGEM_LIMITE = 'Limite de consultas desta resposta atingido: responda agora com o que já tem, sem usar ferramentas.';

type Mensagem = Anthropic.Beta.BetaMessageParam;

export type EventoAssistente =
  | { tipo: 'texto'; delta: string }
  | { tipo: 'progresso'; delta: string }
  | { tipo: 'ferramenta'; nome: string; rotulo: string; estado: 'inicio' | 'fim' | 'erro' }
  | { tipo: 'planejamento'; planejamento: PlanejamentoProposto };

export interface UsoTokens { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }
const USO_ZERO: UsoTokens = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };

const ultimo = <T>(_atual: T, novo: T) => novo;
const juntar = <T>(atual: T[], novos: T[]) => atual.concat(novos);

const Estado = Annotation.Root({
  /** Turnos anteriores, como gravados (nunca editados). */
  historico: Annotation<Mensagem[]>,
  /** Mensagens deste turno: pergunta, respostas do modelo e resultados de ferramentas. */
  novas: Annotation<Mensagem[]>({ reducer: juntar, default: () => [] }),
  chamadas: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  parada: Annotation<string | null>({ reducer: ultimo, default: () => null }),
  modelo: Annotation<string>({ reducer: ultimo, default: () => MODELO_ASSISTENTE }),
  recusa: Annotation<{ categoria: string | null } | null>({ reducer: ultimo, default: () => null }),
  uso: Annotation<UsoTokens>({
    reducer: (a, b) => ({
      entrada: a.entrada + b.entrada, saida: a.saida + b.saida,
      cacheLeitura: a.cacheLeitura + b.cacheLeitura, cacheEscrita: a.cacheEscrita + b.cacheEscrita,
    }),
    default: () => USO_ZERO,
  }),
  planejamentos: Annotation<PlanejamentoProposto[]>({ reducer: juntar, default: () => [] }),
  fontes: Annotation<AiFonte[]>({ reducer: juntar, default: () => [] }),
});
type EstadoAssistente = typeof Estado.State;

/** Dependencias por requisicao, injetadas no `configurable` (o grafo compila uma vez). */
interface Dependencias { cliente: Anthropic; ferramentas: FerramentasAssistente }

function dependencias(config: LangGraphRunnableConfig): Dependencias {
  const d = config.configurable as Partial<Dependencias> | undefined;
  if (!d?.cliente || !d.ferramentas) throw new Error('Assistente sem cliente ou ferramentas configurados.');
  return d as Dependencias;
}

const usosDeFerramenta = (m: Mensagem | undefined): Anthropic.Beta.BetaToolUseBlock[] =>
  Array.isArray(m?.content)
    ? (m.content as Anthropic.Beta.BetaContentBlock[]).filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    : [];

// ---------------------------------------------------------------------------
// Nos
// ---------------------------------------------------------------------------

async function agente(state: EstadoAssistente, config: LangGraphRunnableConfig): Promise<Partial<EstadoAssistente>> {
  const { cliente } = dependencias(config);
  const emitir = (e: EventoAssistente) => config.writer?.(e);
  let tentativas = 0;

  for (;;) {
    const stream = cliente.beta.messages.stream(
      {
        model: MODELO_ASSISTENTE,
        max_tokens: 64000, // o thinking conta aqui, alem da resposta
        betas: BETAS,
        system: [{ type: 'text', text: ASSISTENTE_PEDAGOGICO.system, cache_control: { type: 'ephemeral' } }],
        tools: DEFINICOES_FERRAMENTAS,
        thinking: { type: 'adaptive', display: 'updates', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
        output_config: { effort: 'medium' },
        fallbacks: 'default',
        cache_control: { type: 'ephemeral' },
        messages: [...state.historico, ...state.novas],
      },
      { signal: config.signal },
    );
    stream.on('text', (delta) => emitir({ tipo: 'texto', delta }));
    // Com display "updates", so as notas de progresso trazem texto; o raciocinio vem vazio.
    stream.on('thinking', (delta) => { if (delta) emitir({ tipo: 'progresso', delta }); });

    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
    } catch (e) {
      // Com eager_input_streaming, finalMessage rejeita se a entrada de uma ferramenta
      // nao vier como JSON: so esse caso e reemitido. Erros da API e cancelamento sobem.
      if (e instanceof Anthropic.APIError || config.signal?.aborted || tentativas++ >= 2) throw e;
      continue;
    }

    const uso: UsoTokens = {
      entrada: msg.usage.input_tokens,
      saida: msg.usage.output_tokens,
      cacheLeitura: msg.usage.cache_read_input_tokens ?? 0,
      cacheEscrita: msg.usage.cache_creation_input_tokens ?? 0,
    };

    if (msg.stop_reason === 'refusal') {
      // A resposta recusada pode trazer tool_use cortado: nao entra no historico.
      // No lugar dela fica um texto curto, para o turno continuar valido.
      return {
        chamadas: 1, uso, modelo: msg.model, parada: 'refusal',
        recusa: { categoria: msg.stop_details?.category ?? null },
        novas: [{ role: 'assistant', content: [{ type: 'text', text: MENSAGEM_RECUSA }] }],
      };
    }
    return {
      chamadas: 1, uso, modelo: msg.model, parada: msg.stop_reason,
      novas: [{ role: 'assistant', content: msg.content }],
    };
  }
}

async function ferramentas(state: EstadoAssistente, config: LangGraphRunnableConfig): Promise<Partial<EstadoAssistente>> {
  const deps = dependencias(config);
  const emitir = (e: EventoAssistente) => config.writer?.(e);
  const planejamentos: PlanejamentoProposto[] = [];
  const fontes: AiFonte[] = [];

  // Leituras independentes rodam em paralelo; os resultados voltam todos numa
  // unica mensagem do usuario, na ordem dos pedidos.
  const resultados = await Promise.all(usosDeFerramenta(state.novas.at(-1)).map(async (uso) => {
    const nome = uso.name as NomeFerramenta;
    const rotulo = ROTULOS[nome] ?? uso.name;
    emitir({ tipo: 'ferramenta', nome: uso.name, rotulo, estado: 'inicio' });
    try {
      const conteudo = await executar(nome, uso.input, deps.ferramentas, { planejamentos, fontes, emitir });
      emitir({ tipo: 'ferramenta', nome: uso.name, rotulo, estado: 'fim' });
      return { type: 'tool_result', tool_use_id: uso.id, content: maskPii(conteudo) } satisfies Anthropic.Beta.BetaToolResultBlockParam;
    } catch (e) {
      emitir({ tipo: 'ferramenta', nome: uso.name, rotulo, estado: 'erro' });
      const motivo = e instanceof ErroDeEntrada ? JSON.stringify({ INVALID_JSON: e.message }) : 'Falha ao consultar os dados da plataforma.';
      return { type: 'tool_result', tool_use_id: uso.id, is_error: true, content: motivo } satisfies Anthropic.Beta.BetaToolResultBlockParam;
    }
  }));

  const ultimaRodada = state.chamadas >= MAX_CHAMADAS_POR_TURNO - 1;
  const content: Anthropic.Beta.BetaContentBlockParam[] = ultimaRodada
    ? [...resultados, { type: 'text', text: MENSAGEM_LIMITE }]
    : resultados;
  return { novas: [{ role: 'user', content }], planejamentos, fontes };
}

/** Fecha o turno quando o teto chega com ferramentas pendentes: todo tool_use precisa de tool_result. */
function encerrar(state: EstadoAssistente): Partial<EstadoAssistente> {
  const pendentes = usosDeFerramenta(state.novas.at(-1));
  return {
    novas: [{
      role: 'user',
      content: pendentes.map((u) => ({
        type: 'tool_result' as const, tool_use_id: u.id, is_error: true,
        content: 'Não executada: limite de consultas desta resposta.',
      })),
    }],
  };
}

function depoisDoAgente(state: EstadoAssistente): 'ferramentas' | 'encerrar' | 'agente' | typeof END {
  const pendentes = usosDeFerramenta(state.novas.at(-1)).length > 0;
  // Entrada de ferramenta cortada por max_tokens nao roda.
  if (state.parada === 'max_tokens') return pendentes ? 'encerrar' : END;
  if (state.parada === 'tool_use' && pendentes) return state.chamadas >= MAX_CHAMADAS_POR_TURNO ? 'encerrar' : 'ferramentas';
  if (state.parada === 'pause_turn' && state.chamadas < MAX_CHAMADAS_POR_TURNO) return 'agente';
  return END;
}

// ---------------------------------------------------------------------------
// Execucao das ferramentas
// ---------------------------------------------------------------------------

class ErroDeEntrada extends Error {}

async function executar(
  nome: NomeFerramenta,
  entrada: unknown,
  dados: FerramentasAssistente,
  saida: { planejamentos: PlanejamentoProposto[]; fontes: AiFonte[]; emitir: (e: EventoAssistente) => void },
): Promise<string> {
  const schema = ENTRADAS[nome];
  if (!schema) throw new ErroDeEntrada(`Ferramenta desconhecida: ${String(nome)}`);
  // O parser tolerante do SDK pode devolver entrada truncada: valida antes de rodar.
  const lida = schema.safeParse(entrada);
  if (!lida.success) throw new ErroDeEntrada(JSON.stringify(entrada));

  switch (nome) {
    case 'listar_formacoes':
      return JSON.stringify(await dados.listarFormacoes());
    case 'consultar_formacao': {
      const { formacao_id } = lida.data as { formacao_id: string };
      const f = await dados.consultarFormacao(formacao_id);
      if (!f) return 'Formação não encontrada ou fora do seu acesso.';
      saida.fontes.push(...f.materiais.map((m) => ({ id: m.id, titulo: m.titulo, tipo: m.tipo })));
      return JSON.stringify(f);
    }
    case 'buscar_materiais_aprovados': {
      const { termo, formacao_id } = lida.data as { termo?: string; formacao_id?: string };
      const materiais = await dados.buscarMateriais({ termo, formacaoId: formacao_id });
      saida.fontes.push(...materiais.map((m) => ({ id: m.id, titulo: m.titulo, tipo: m.tipo })));
      return materiais.length ? JSON.stringify(materiais) : 'Nenhum material aprovado encontrado para essa busca.';
    }
    case 'apresentar_planejamento': {
      const planejamento = lida.data as PlanejamentoProposto;
      saida.planejamentos.push(planejamento);
      saida.emitir({ tipo: 'planejamento', planejamento });
      return 'Cartão exibido ao professor logo abaixo da sua resposta, como rascunho para revisão. Comente as escolhas em poucas linhas, sem repetir o plano.';
    }
  }
}

// ---------------------------------------------------------------------------
// Grafo
// ---------------------------------------------------------------------------

export const grafoAssistente = new StateGraph(Estado)
  .addNode('agente', agente)
  .addNode('ferramentas', ferramentas)
  .addNode('encerrar', encerrar)
  .addEdge(START, 'agente')
  .addConditionalEdges('agente', depoisDoAgente, ['ferramentas', 'encerrar', 'agente', END])
  .addEdge('ferramentas', 'agente')
  .addEdge('encerrar', END)
  .compile();

export interface ResultadoAssistente {
  /** Pergunta como enviada ao modelo (PII mascarada). */
  pergunta: string;
  /** Mensagens deste turno, na ordem: gravar e reenviar sem alteracao. */
  mensagens: Mensagem[];
  resposta: string;
  planejamentos: PlanejamentoProposto[];
  fontes: AiFonte[];
  uso: UsoTokens;
  modelo: string;
  chamadas: number;
  parada: string | null;
  recusa: { categoria: string | null } | null;
}

/**
 * Executa um turno do Assistente Pedagogico. `contexto` entra so no primeiro turno
 * (junto da pergunta), para o prefixo da conversa nao mudar depois.
 */
export async function executarAssistente(opts: {
  historico: Mensagem[];
  pergunta: string;
  contexto?: string;
  ferramentas: FerramentasAssistente;
  onEvento?: (e: EventoAssistente) => void;
  signal?: AbortSignal;
  cliente?: Anthropic;
}): Promise<ResultadoAssistente> {
  const pergunta = maskPii(opts.pergunta.trim());
  const primeira: Mensagem = {
    role: 'user',
    content: opts.historico.length === 0 && opts.contexto
      ? [{ type: 'text', text: opts.contexto }, { type: 'text', text: pergunta }]
      : pergunta,
  };

  const fluxo = await grafoAssistente.stream(
    { historico: opts.historico, novas: [primeira] },
    {
      streamMode: ['custom', 'values'],
      configurable: { cliente: opts.cliente ?? new Anthropic(), ferramentas: opts.ferramentas },
      signal: opts.signal,
      recursionLimit: MAX_CHAMADAS_POR_TURNO * 3 + 2,
    },
  );

  let final: EstadoAssistente | undefined;
  for await (const [modo, dado] of fluxo as AsyncIterable<[string, unknown]>) {
    if (modo === 'custom') opts.onEvento?.(dado as EventoAssistente);
    else if (modo === 'values') final = dado as EstadoAssistente;
  }
  if (!final) throw new Error('O assistente terminou sem estado final.');

  const resposta = final.novas
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => (Array.isArray(m.content) ? m.content : [{ type: 'text' as const, text: m.content }]))
    .filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');

  const unicas = new Map(final.fontes.map((f) => [f.id, f]));
  return {
    pergunta,
    mensagens: final.novas,
    resposta: resposta || 'Não consegui concluir a resposta desta vez. Tente reformular ou dividir o pedido em partes.',
    planejamentos: final.planejamentos,
    fontes: [...unicas.values()],
    uso: final.uso,
    modelo: final.modelo,
    chamadas: final.chamadas,
    parada: final.parada,
    recusa: final.recusa,
  };
}

/** Mensagem para o usuario a partir de um erro do SDK (sem expor detalhes internos). */
export function descreverErroAssistente(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'A chave de acesso da Anthropic é inválida ou não foi configurada (ANTHROPIC_API_KEY).';
  if (e instanceof Anthropic.PermissionDeniedError) return 'A chave da Anthropic não tem permissão para usar este modelo.';
  if (e instanceof Anthropic.RateLimitError) return 'O serviço de IA está com muitas solicitações agora. Tente de novo em instantes.';
  if (e instanceof Anthropic.APIConnectionError) return 'Não foi possível conectar ao serviço de IA. Verifique a conexão do servidor.';
  if (e instanceof Anthropic.BadRequestError) return 'O serviço de IA recusou a solicitação. Tente reformular a pergunta.';
  if (e instanceof Anthropic.InternalServerError) return 'O serviço de IA está instável no momento. Tente de novo em instantes.';
  if (e instanceof Anthropic.APIError) return 'Falha no serviço de IA. Tente de novo em instantes.';
  return 'Falha inesperada no assistente. Tente de novo.';
}
