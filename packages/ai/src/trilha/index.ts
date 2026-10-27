// Gerador de trilhas: um perfil do agente LangGraph (../agente). Recebe o contexto da
// formacao (objetivos, publico, modulos, plano aprovado, trilha atual e materiais
// aprovados) e o pedido de quem monta a trilha; pode buscar mais materiais aprovados e
// entrega a proposta pela ferramenta apresentar_trilha, validada antes de usar.
import type Anthropic from '@anthropic-ai/sdk';
import {
  MATERIAL_TIPO_LABELS, TEMPO_TRILHA_LABELS, TEMPO_TRILHA_MIN, TIPOS_RECURSO_TRILHA, propostaTrilhaSchema,
  type GerarTrilhaIaDto, type MaterialTipo, type PropostaTrilhaGerada,
} from '@formarede/contracts';
import { maskPii } from '../pii';
import type { AiFonte } from '../types';
import { ErroDeEntrada, executarAgente, type EventoAgente, type PerfilAgente, type UsoTokens } from '../agente';
import { DEFINICOES_FERRAMENTAS, ENTRADAS, ROTULOS, type FerramentasAssistente } from '../assistente/ferramentas';
import { GERADOR_TRILHA } from './prompt';

export { GERADOR_TRILHA } from './prompt';

/** A execucao terminou sem proposta (recusa ou sem entrega): a mensagem vai para quem pediu. */
export class PropostaNaoGerada extends Error {}

/** O que a API reune da formacao, no escopo do municipio. */
export interface ContextoTrilhaIa {
  formacao: {
    titulo: string; tema: string | null; objetivos: string | null; publicoAlvo: string | null;
    cargaHoraria: number; modalidade: string;
  };
  modulos: { titulo: string; descricao: string | null }[];
  /** Plano formativo aprovado mais recente, se houver. */
  plano: { objetivos: string[]; modulos: { titulo: string; descricao: string }[]; metodologias: string[] } | null;
  trilhaAtual: { titulo: string; tipo: string }[];
  /** Materiais aprovados: os vinculados a formacao primeiro. */
  materiais: { id: string; titulo: string; tipo: MaterialTipo; autoria: string | null; tags: string[]; daFormacao: boolean }[];
}

/** Ferramentas: a busca no acervo do Assistente e a entrega estruturada da trilha. */
const BUSCA = DEFINICOES_FERRAMENTAS.find((f) => f.name === 'buscar_materiais_aprovados')!;
const texto = (description: string) => ({ type: 'string', description });
const APRESENTAR_TRILHA: Anthropic.Beta.BetaTool = {
  name: 'apresentar_trilha',
  description: 'Entrega a proposta de trilha para revisão de quem monta a trilha. Chame uma única vez, com todas as etapas em ordem de estudo.',
  input_schema: {
    type: 'object',
    properties: {
      resumo: texto('Uma ou duas frases: o percurso proposto e como ele atende ao objetivo pedido.'),
      etapas: {
        type: 'array',
        description: 'Etapas em ordem de estudo, na quantidade pedida.',
        items: {
          type: 'object',
          properties: {
            titulo: texto('Título curto da etapa (até 80 caracteres), sem colchetes.'),
            tipo: { type: 'string', enum: [...TIPOS_RECURSO_TRILHA], description: 'Formato do recurso; com material, o tipo do material.' },
            orientacao: texto('Para o cursista, em uma ou duas frases: o que observar e o que trazer para o encontro.'),
            duracao_min: { type: 'integer', description: 'Tempo estimado de estudo, em minutos.' },
            obrigatoria: { type: 'boolean', description: 'Se conta no progresso do cursista.' },
            material_id: { type: ['string', 'null'], description: 'Id exato de um material aprovado do contexto ou da busca; null quando nenhum servir.' },
            recurso_sugerido: { type: ['string', 'null'], description: 'Sem material: o que procurar (formato, duração, foco), sem inventar títulos ou links. Com material: null.' },
          },
          required: ['titulo', 'tipo', 'orientacao', 'duracao_min', 'obrigatoria', 'material_id', 'recurso_sugerido'],
          additionalProperties: false,
        },
      },
      observacoes: { type: ['string', 'null'], description: 'O que quem monta a trilha precisa decidir ou conferir; null se nada.' },
    },
    required: ['resumo', 'etapas', 'observacoes'],
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
};

/** Bloco de contexto e pedido (a primeira mensagem da execucao). */
export function montarPedidoTrilha(ctx: ContextoTrilhaIa, pedido: GerarTrilhaIaDto): string {
  const f = ctx.formacao;
  const linhas = [
    '<formacao>',
    `Título: ${f.titulo}`,
    f.tema ? `Tema: ${f.tema}` : '',
    f.publicoAlvo ? `Público: ${f.publicoAlvo}` : '',
    `Carga horária: ${f.cargaHoraria} h · Modalidade: ${f.modalidade.toLowerCase()}`,
    f.objetivos ? `Objetivos: ${f.objetivos}` : '',
    ctx.modulos.length ? `Módulos:\n${ctx.modulos.map((m) => `- ${m.titulo}${m.descricao ? `: ${m.descricao}` : ''}`).join('\n')}` : 'Módulos: nenhum cadastrado',
    '</formacao>',
    ctx.plano ? [
      '<plano_aprovado>',
      `Objetivos: ${ctx.plano.objetivos.join('; ')}`,
      `Módulos do plano:\n${ctx.plano.modulos.map((m) => `- ${m.titulo}: ${m.descricao}`).join('\n')}`,
      `Metodologias: ${ctx.plano.metodologias.join('; ')}`,
      '</plano_aprovado>',
    ].join('\n') : '<plano_aprovado>nenhum</plano_aprovado>',
    `<trilha_atual>${ctx.trilhaAtual.length ? `\n${ctx.trilhaAtual.map((e) => `- ${e.titulo} (${e.tipo})`).join('\n')}\n` : 'vazia'}</trilha_atual>`,
    '<materiais_aprovados>',
    ctx.materiais.length
      ? ctx.materiais.map((m) => `- id ${m.id} | ${MATERIAL_TIPO_LABELS[m.tipo] ?? m.tipo} | ${m.titulo}${m.autoria ? ` | ${m.autoria}` : ''}${m.tags.length ? ` | tags: ${m.tags.join(', ')}` : ''}${m.daFormacao ? ' | já vinculado a esta formação' : ''}`).join('\n')
      : 'nenhum',
    '</materiais_aprovados>',
    '<pedido>',
    `Objetivo da trilha: ${pedido.objetivo}`,
    `Quantidade de etapas: ${pedido.quantidade}`,
    `Tempo total de estudo: ${TEMPO_TRILHA_LABELS[pedido.tempo].toLowerCase()} (${TEMPO_TRILHA_MIN[pedido.tempo]} min)`,
    `Formatos: ${pedido.formatos.map((t) => MATERIAL_TIPO_LABELS[t]).join(', ')}`,
    `Priorizar materiais aprovados do acervo: ${pedido.usarAcervo ? 'sim' : 'não; proponha recursos a definir'}`,
    `Trilha atual: ${pedido.substituir ? 'será substituída pela proposta (os materiais dela podem ser reaproveitados)' : 'continua; a proposta entra depois dela'}`,
    '</pedido>',
  ];
  return linhas.filter(Boolean).join('\n');
}

function perfilTrilha(buscarMateriais: FerramentasAssistente['buscarMateriais']): PerfilAgente {
  return {
    system: GERADOR_TRILHA.system,
    ferramentas: [BUSCA, APRESENTAR_TRILHA],
    effort: 'medium',
    maxChamadas: 6,
    mensagemLimite: 'Limite de consultas atingido: entregue agora a trilha com apresentar_trilha, usando o que já tem; deixe a definir as etapas sem material.',
    rotulo: (nome) => (nome === 'apresentar_trilha' ? 'Montando a proposta de trilha' : ROTULOS.buscar_materiais_aprovados),
    async executar(nome, entrada, saida) {
      if (nome === 'buscar_materiais_aprovados') {
        const lida = ENTRADAS.buscar_materiais_aprovados.safeParse(entrada);
        if (!lida.success) throw new ErroDeEntrada(JSON.stringify(entrada));
        const materiais = await buscarMateriais({ termo: lida.data.termo, formacaoId: lida.data.formacao_id });
        saida.fontes.push(...materiais.map((m) => ({ id: m.id, titulo: m.titulo, tipo: m.tipo })));
        return materiais.length ? JSON.stringify(materiais) : 'Nenhum material aprovado encontrado para essa busca.';
      }
      if (nome === 'apresentar_trilha') {
        // O parser tolerante do SDK pode devolver entrada truncada: valida antes de aceitar.
        const lida = propostaTrilhaSchema.safeParse(entrada);
        if (!lida.success) throw new ErroDeEntrada(JSON.stringify(lida.error.issues.slice(0, 5)));
        saida.estruturados.push({ ferramenta: nome, dados: lida.data });
        return 'Proposta entregue para revisão.';
      }
      throw new ErroDeEntrada(`Ferramenta desconhecida: ${nome}`);
    },
    encerraCom: 'apresentar_trilha',
  };
}

export interface ResultadoTrilhaIa {
  proposta: PropostaTrilhaGerada;
  /** Contexto e pedido como enviados ao modelo (PII mascarada), para o log da interacao. */
  entrada: string;
  fontes: AiFonte[];
  uso: UsoTokens;
  modelo: string;
  chamadas: number;
  promptId: string;
  promptVersao: string;
}

/**
 * Gera a proposta de trilha com o agente. Quem chama confere os materiais, registra a
 * AiInteracao e so grava as etapas depois da revisao humana (RIA-002).
 */
export async function gerarTrilhaComIa(opts: {
  contexto: ContextoTrilhaIa;
  pedido: GerarTrilhaIaDto;
  buscarMateriais: FerramentasAssistente['buscarMateriais'];
  /** Progresso da execucao (ferramentas, notas do modelo). */
  onEvento?: (e: EventoAgente) => void;
  signal?: AbortSignal;
  cliente?: Anthropic;
}): Promise<ResultadoTrilhaIa> {
  const entrada = maskPii(montarPedidoTrilha(opts.contexto, opts.pedido));
  const r = await executarAgente(perfilTrilha(opts.buscarMateriais), {
    historico: [], primeira: { role: 'user', content: entrada }, onEvento: opts.onEvento, signal: opts.signal, cliente: opts.cliente,
  });
  const proposta = r.estruturados.find((e) => e.ferramenta === 'apresentar_trilha')?.dados as PropostaTrilhaGerada | undefined;
  if (!proposta) {
    throw new PropostaNaoGerada(r.recusa
      ? 'A IA não pôde atender a este pedido. Reformule o objetivo da trilha com foco na formação.'
      : 'A IA não concluiu a proposta desta vez. Tente gerar de novo.');
  }
  return {
    proposta, entrada, fontes: r.fontes, uso: r.uso, modelo: r.modelo, chamadas: r.chamadas,
    promptId: GERADOR_TRILHA.id, promptVersao: GERADOR_TRILHA.versao,
  };
}
