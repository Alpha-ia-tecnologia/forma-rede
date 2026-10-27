// Assistente Pedagogico: um perfil do agente LangGraph (../agente). Conversa com
// professores e formadores; as ferramentas leem formacoes e materiais aprovados no
// escopo do municipio e uma delas entrega o planejamento estruturado como cartao.
import type Anthropic from '@anthropic-ai/sdk';
import { maskPii } from '../pii';
import type { AiFonte } from '../types';
import {
  ErroDeEntrada, MODELO_AGENTE, descreverErroAgente, executarAgente, grafoAgente,
  type EventoAgente, type Mensagem, type PerfilAgente, type UsoTokens,
} from '../agente';
import { ASSISTENTE_PEDAGOGICO } from './prompt';
import {
  DEFINICOES_FERRAMENTAS, ENTRADAS, ROTULOS,
  type FerramentasAssistente, type NomeFerramenta, type PlanejamentoProposto,
} from './ferramentas';

export const MODELO_ASSISTENTE = MODELO_AGENTE;
/** Chamadas ao modelo por resposta; ao chegar no teto, ele responde sem ferramentas. */
export const MAX_CHAMADAS_POR_TURNO = 6;
export const grafoAssistente = grafoAgente;
export const descreverErroAssistente = descreverErroAgente;
export type EventoAssistente = EventoAgente;
export type { UsoTokens };

/** O perfil do Assistente, com o acesso a dados da requisicao (escopo do usuario). */
function perfilAssistente(dados: FerramentasAssistente): PerfilAgente {
  return {
    system: ASSISTENTE_PEDAGOGICO.system,
    ferramentas: DEFINICOES_FERRAMENTAS,
    effort: 'medium',
    maxChamadas: MAX_CHAMADAS_POR_TURNO,
    rotulo: (nome) => ROTULOS[nome as NomeFerramenta] ?? nome,
    async executar(nome, entrada, saida) {
      const schema = ENTRADAS[nome as NomeFerramenta];
      if (!schema) throw new ErroDeEntrada(`Ferramenta desconhecida: ${nome}`);
      // O parser tolerante do SDK pode devolver entrada truncada: valida antes de rodar.
      const lida = schema.safeParse(entrada);
      if (!lida.success) throw new ErroDeEntrada(JSON.stringify(entrada));

      switch (nome as NomeFerramenta) {
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
          saida.estruturados.push({ ferramenta: nome, dados: planejamento });
          saida.emitir({ tipo: 'planejamento', planejamento });
          return 'Cartão exibido ao professor logo abaixo da sua resposta, como rascunho para revisão. Comente as escolhas em poucas linhas, sem repetir o plano.';
        }
      }
      throw new ErroDeEntrada(`Ferramenta desconhecida: ${nome}`);
    },
  };
}

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

  const r = await executarAgente(perfilAssistente(opts.ferramentas), {
    historico: opts.historico, primeira, onEvento: opts.onEvento, signal: opts.signal, cliente: opts.cliente,
  });
  return {
    pergunta,
    mensagens: r.mensagens,
    resposta: r.resposta || 'Não consegui concluir a resposta desta vez. Tente reformular ou dividir o pedido em partes.',
    planejamentos: r.estruturados.filter((e) => e.ferramenta === 'apresentar_planejamento').map((e) => e.dados as PlanejamentoProposto),
    fontes: r.fontes,
    uso: r.uso,
    modelo: r.modelo,
    chamadas: r.chamadas,
    parada: r.parada,
    recusa: r.recusa,
  };
}
