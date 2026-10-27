// Agente da FORMAREDE: LangGraph orquestra o laco (agente <-> ferramentas), o estado da
// execucao e o streaming de eventos; cada chamada ao Claude Opus 5.5 vai pelo SDK oficial
// da Anthropic. O mesmo grafo roda perfis diferentes (Assistente Pedagogico, Gerador de
// trilhas): cada perfil traz o prompt versionado, as ferramentas e como executa-las.
// O historico e append-only: as mensagens voltam ao modelo exatamente como vieram,
// inclusive blocos de thinking e de fallback.
import Anthropic from '@anthropic-ai/sdk';
import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from '@langchain/langgraph';
import { maskPii } from './pii';
import type { AiFonte } from './types';
import type { Planejamento } from '@formarede/contracts';

export const MODELO_AGENTE = 'claude-opus-5-5';
// fallback server-side em recusa do classificador; notas de progresso entre ferramentas;
// e descarte (em vez de erro) de thinking antigo se o prompt mudar de versao.
const BETAS = ['server-side-fallback-2026-07-01', 'thinking-display-updates-2026-08-18', 'thinking-binding-controls-2026-08-01'];

const MENSAGEM_RECUSA = 'Não consegui responder a essa solicitação. Reformule o pedido com foco no planejamento ou na prática em sala, por favor.';
const MENSAGEM_LIMITE = 'Limite de consultas desta resposta atingido: responda agora com o que já tem, sem usar ferramentas.';

export type Mensagem = Anthropic.Beta.BetaMessageParam;

export type EventoAgente =
  | { tipo: 'texto'; delta: string }
  | { tipo: 'progresso'; delta: string }
  | { tipo: 'ferramenta'; nome: string; rotulo: string; estado: 'inicio' | 'fim' | 'erro' }
  | { tipo: 'planejamento'; planejamento: Planejamento };

export interface UsoTokens { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }
const USO_ZERO: UsoTokens = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };

/** Saida estruturada registrada por uma ferramenta (cartao de planejamento, proposta de trilha...). */
export interface Estruturado { ferramenta: string; dados: unknown }

/** O que a ferramenta pode devolver alem do texto para o modelo. */
export interface SaidaFerramenta {
  estruturados: Estruturado[];
  fontes: AiFonte[];
  emitir: (e: EventoAgente) => void;
}

/** Entrada de ferramenta que nao confere com o schema: volta ao modelo como INVALID_JSON. */
export class ErroDeEntrada extends Error {}

/** Um uso do agente: prompt, ferramentas e como executa-las. Fixo durante a conversa. */
export interface PerfilAgente {
  system: string;
  ferramentas: Anthropic.Beta.BetaTool[];
  /** Profundidade do raciocinio (no Opus 5.5 o padrao da API e medium). */
  effort: 'low' | 'medium' | 'high';
  /** Chamadas ao modelo por execucao; ao chegar no teto, ele responde sem ferramentas. */
  maxChamadas: number;
  /** Rotulo exibido enquanto a ferramenta roda. */
  rotulo(nome: string): string;
  /** Valida a entrada (lancando ErroDeEntrada) e executa; devolve o texto para o modelo. */
  executar(nome: string, entrada: unknown, saida: SaidaFerramenta): Promise<string>;
  /** Ferramenta de saida estruturada: quando roda com sucesso, a execucao termina ali. */
  encerraCom?: string;
  /** Aviso ao modelo na ultima rodada (o padrao pede resposta sem ferramentas). */
  mensagemLimite?: string;
}

const ultimo = <T>(_atual: T, novo: T) => novo;
const juntar = <T>(atual: T[], novos: T[]) => atual.concat(novos);

const Estado = Annotation.Root({
  /** Turnos anteriores, como gravados (nunca editados). */
  historico: Annotation<Mensagem[]>,
  /** Mensagens desta execucao: pedido, respostas do modelo e resultados de ferramentas. */
  novas: Annotation<Mensagem[]>({ reducer: juntar, default: () => [] }),
  /** Teto de chamadas ao modelo (do perfil). */
  limite: Annotation<number>({ reducer: ultimo, default: () => 6 }),
  /** Ferramenta de saida do perfil: roda mesmo no teto, porque e a entrega. */
  final: Annotation<string | null>({ reducer: ultimo, default: () => null }),
  chamadas: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  parada: Annotation<string | null>({ reducer: ultimo, default: () => null }),
  modelo: Annotation<string>({ reducer: ultimo, default: () => MODELO_AGENTE }),
  recusa: Annotation<{ categoria: string | null } | null>({ reducer: ultimo, default: () => null }),
  uso: Annotation<UsoTokens>({
    reducer: (a, b) => ({
      entrada: a.entrada + b.entrada, saida: a.saida + b.saida,
      cacheLeitura: a.cacheLeitura + b.cacheLeitura, cacheEscrita: a.cacheEscrita + b.cacheEscrita,
    }),
    default: () => USO_ZERO,
  }),
  estruturados: Annotation<Estruturado[]>({ reducer: juntar, default: () => [] }),
  fontes: Annotation<AiFonte[]>({ reducer: juntar, default: () => [] }),
  /** A ferramenta de saida do perfil ja rodou: nao volta ao modelo. */
  encerrado: Annotation<boolean>({ reducer: ultimo, default: () => false }),
});
type EstadoAgente = typeof Estado.State;

/** Dependencias por requisicao, injetadas no `configurable` (o grafo compila uma vez). */
interface Dependencias { cliente: Anthropic; perfil: PerfilAgente }

function dependencias(config: LangGraphRunnableConfig): Dependencias {
  const d = config.configurable as Partial<Dependencias> | undefined;
  if (!d?.cliente || !d.perfil) throw new Error('Agente sem cliente ou perfil configurados.');
  return d as Dependencias;
}

const usosDeFerramenta = (m: Mensagem | undefined): Anthropic.Beta.BetaToolUseBlock[] =>
  Array.isArray(m?.content)
    ? (m.content as Anthropic.Beta.BetaContentBlock[]).filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    : [];

// ---------------------------------------------------------------------------
// Nos
// ---------------------------------------------------------------------------

async function agente(state: EstadoAgente, config: LangGraphRunnableConfig): Promise<Partial<EstadoAgente>> {
  const { cliente, perfil } = dependencias(config);
  const emitir = (e: EventoAgente) => config.writer?.(e);
  let tentativas = 0;

  for (;;) {
    const stream = cliente.beta.messages.stream(
      {
        model: MODELO_AGENTE,
        max_tokens: 64000, // o thinking conta aqui, alem da resposta
        betas: BETAS,
        system: [{ type: 'text', text: perfil.system, cache_control: { type: 'ephemeral' } }],
        tools: perfil.ferramentas,
        thinking: { type: 'adaptive', display: 'updates', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
        output_config: { effort: perfil.effort },
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

async function ferramentas(state: EstadoAgente, config: LangGraphRunnableConfig): Promise<Partial<EstadoAgente>> {
  const { perfil } = dependencias(config);
  const emitir = (e: EventoAgente) => config.writer?.(e);
  const saida: SaidaFerramenta = { estruturados: [], fontes: [], emitir };

  // Leituras independentes rodam em paralelo; os resultados voltam todos numa
  // unica mensagem do usuario, na ordem dos pedidos.
  const resultados = await Promise.all(usosDeFerramenta(state.novas.at(-1)).map(async (uso) => {
    const rotulo = perfil.rotulo(uso.name);
    emitir({ tipo: 'ferramenta', nome: uso.name, rotulo, estado: 'inicio' });
    try {
      const conteudo = await perfil.executar(uso.name, uso.input, saida);
      emitir({ tipo: 'ferramenta', nome: uso.name, rotulo, estado: 'fim' });
      return { type: 'tool_result', tool_use_id: uso.id, content: maskPii(conteudo) } satisfies Anthropic.Beta.BetaToolResultBlockParam;
    } catch (e) {
      emitir({ tipo: 'ferramenta', nome: uso.name, rotulo, estado: 'erro' });
      const motivo = e instanceof ErroDeEntrada ? JSON.stringify({ INVALID_JSON: e.message }) : 'Falha ao consultar os dados da plataforma.';
      return { type: 'tool_result', tool_use_id: uso.id, is_error: true, content: motivo } satisfies Anthropic.Beta.BetaToolResultBlockParam;
    }
  }));

  const ultimaRodada = state.chamadas >= state.limite - 1;
  const content: Anthropic.Beta.BetaContentBlockParam[] = ultimaRodada
    ? [...resultados, { type: 'text', text: perfil.mensagemLimite ?? MENSAGEM_LIMITE }]
    : resultados;
  const encerrado = !!perfil.encerraCom && saida.estruturados.some((s) => s.ferramenta === perfil.encerraCom);
  return { novas: [{ role: 'user', content }], estruturados: saida.estruturados, fontes: saida.fontes, encerrado };
}

/** Fecha a execucao quando o teto chega com ferramentas pendentes: todo tool_use precisa de tool_result. */
function encerrar(state: EstadoAgente): Partial<EstadoAgente> {
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

function depoisDoAgente(state: EstadoAgente): 'ferramentas' | 'encerrar' | 'agente' | typeof END {
  const usos = usosDeFerramenta(state.novas.at(-1));
  const pendentes = usos.length > 0;
  // Entrada de ferramenta cortada por max_tokens nao roda.
  if (state.parada === 'max_tokens') return pendentes ? 'encerrar' : END;
  if (state.parada === 'tool_use' && pendentes) {
    // No teto so roda se for a entrega do perfil (perde-la seria perder o trabalho).
    const entrega = !!state.final && usos.some((u) => u.name === state.final);
    return state.chamadas >= state.limite && !entrega ? 'encerrar' : 'ferramentas';
  }
  if (state.parada === 'pause_turn' && state.chamadas < state.limite) return 'agente';
  return END;
}

// Depois do teto, uma chamada a mais so para refazer uma entrega recusada pela validacao.
const depoisDasFerramentas = (state: EstadoAgente): 'agente' | typeof END =>
  (state.encerrado || state.chamadas > state.limite ? END : 'agente');

// ---------------------------------------------------------------------------
// Grafo
// ---------------------------------------------------------------------------

export const grafoAgente = new StateGraph(Estado)
  .addNode('agente', agente)
  .addNode('ferramentas', ferramentas)
  .addNode('encerrar', encerrar)
  .addEdge(START, 'agente')
  .addConditionalEdges('agente', depoisDoAgente, ['ferramentas', 'encerrar', 'agente', END])
  .addConditionalEdges('ferramentas', depoisDasFerramentas, ['agente', END])
  .addEdge('encerrar', END)
  .compile();

export interface ResultadoAgente {
  /** Mensagens desta execucao, na ordem: gravar e reenviar sem alteracao. */
  mensagens: Mensagem[];
  /** Texto do modelo nesta execucao. */
  resposta: string;
  estruturados: Estruturado[];
  fontes: AiFonte[];
  uso: UsoTokens;
  modelo: string;
  chamadas: number;
  parada: string | null;
  recusa: { categoria: string | null } | null;
}

/** Roda o grafo com um perfil a partir do historico e da primeira mensagem desta execucao. */
export async function executarAgente(perfil: PerfilAgente, opts: {
  historico: Mensagem[];
  primeira: Mensagem;
  onEvento?: (e: EventoAgente) => void;
  signal?: AbortSignal;
  cliente?: Anthropic;
}): Promise<ResultadoAgente> {
  const fluxo = await grafoAgente.stream(
    { historico: opts.historico, novas: [opts.primeira], limite: perfil.maxChamadas, final: perfil.encerraCom ?? null },
    {
      streamMode: ['custom', 'values'],
      configurable: { cliente: opts.cliente ?? new Anthropic(), perfil },
      signal: opts.signal,
      recursionLimit: perfil.maxChamadas * 3 + 2,
    },
  );

  let final: EstadoAgente | undefined;
  for await (const [modo, dado] of fluxo as AsyncIterable<[string, unknown]>) {
    if (modo === 'custom') opts.onEvento?.(dado as EventoAgente);
    else if (modo === 'values') final = dado as EstadoAgente;
  }
  if (!final) throw new Error('O agente terminou sem estado final.');

  const resposta = final.novas
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => (Array.isArray(m.content) ? m.content : [{ type: 'text' as const, text: m.content }]))
    .filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');

  const unicas = new Map(final.fontes.map((f) => [f.id, f]));
  return {
    mensagens: final.novas,
    resposta,
    estruturados: final.estruturados,
    fontes: [...unicas.values()],
    uso: final.uso,
    modelo: final.modelo,
    chamadas: final.chamadas,
    parada: final.parada,
    recusa: final.recusa,
  };
}

/** Mensagem para o usuario a partir de um erro do SDK (sem expor detalhes internos). */
export function descreverErroAgente(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'A chave de acesso da Anthropic é inválida ou não foi configurada (ANTHROPIC_API_KEY).';
  if (e instanceof Anthropic.PermissionDeniedError) return 'A chave da Anthropic não tem permissão para usar este modelo.';
  if (e instanceof Anthropic.RateLimitError) return 'O serviço de IA está com muitas solicitações agora. Tente de novo em instantes.';
  if (e instanceof Anthropic.APIConnectionError) return 'Não foi possível conectar ao serviço de IA. Verifique a conexão do servidor.';
  if (e instanceof Anthropic.BadRequestError) return 'O serviço de IA recusou a solicitação. Tente reformular o pedido.';
  if (e instanceof Anthropic.InternalServerError) return 'O serviço de IA está instável no momento. Tente de novo em instantes.';
  if (e instanceof Anthropic.APIError) return 'Falha no serviço de IA. Tente de novo em instantes.';
  return 'Falha inesperada no serviço de IA. Tente de novo.';
}
