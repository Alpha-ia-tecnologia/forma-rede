// Catalogo de prompts versionados (RIA-011). Toda mudanca de prompt gera nova
// versao; a versao usada fica registrada em cada AiInteracao.
import type { AiFonte } from './types';

export interface PromptVersionado {
  id: string;
  versao: string;
  system: string;
}

/** Contexto da formacao usado para montar o prompt do copiloto. */
export interface ContextoCopiloto {
  titulo: string;
  tema?: string | null;
  publicoAlvo?: string | null;
  cargaHoraria: number;
  modalidade: string;
  diagnostico?: string;
  contextoExtra?: string;
  fontes: AiFonte[];
}

export const COPILOTO_PLANEJAMENTO: PromptVersionado = {
  id: 'copiloto-planejamento',
  versao: 'v1',
  system: [
    'Voce e o copiloto de planejamento formativo da plataforma FORMAREDE,',
    'especializado em formacao continuada de professores da educacao basica brasileira.',
    'Gere uma primeira versao ESTRUTURADA de plano de formacao a partir do contexto fornecido.',
    'Regras inegociaveis:',
    '- Baseie-se APENAS no contexto e nas fontes listadas; nao invente codigos da BNCC,',
    '  competencias ou referencias inexistentes.',
    '- Se o contexto for insuficiente para algum campo, declare a limitacao no campo',
    '  "observacoes" em vez de inventar.',
    '- A proposta e um RASCUNHO que sera revisado por um curador humano antes de valer.',
    '- Escreva em portugues do Brasil, com linguagem clara e pratica.',
    'Responda ESTRITAMENTE com JSON valido no formato pedido, sem markdown.',
  ].join('\n'),
};

/** JSON Schema da saida do copiloto (structured outputs quando suportado). */
export const PLANO_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'objetivos', 'resultadosEsperados', 'modulos', 'metodologias',
    'atividadesSugeridas', 'avaliacao',
  ],
  properties: {
    objetivos: { type: 'array', items: { type: 'string' } },
    resultadosEsperados: { type: 'array', items: { type: 'string' } },
    modulos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'descricao', 'cargaHoraria'],
        properties: {
          titulo: { type: 'string' },
          descricao: { type: 'string' },
          cargaHoraria: { type: 'integer' },
        },
      },
    },
    metodologias: { type: 'array', items: { type: 'string' } },
    atividadesSugeridas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'descricao'],
        properties: {
          titulo: { type: 'string' },
          descricao: { type: 'string' },
        },
      },
    },
    avaliacao: { type: 'string' },
    observacoes: { type: 'string' },
  },
};

export function montarPromptCopiloto(ctx: ContextoCopiloto): string {
  const fontes = ctx.fontes.length
    ? ctx.fontes.map((f) => `- [${f.id}] ${f.titulo} (${f.tipo})`).join('\n')
    : '(nenhum material aprovado vinculado ainda)';
  return [
    `FORMACAO: ${ctx.titulo}`,
    `Tema: ${ctx.tema ?? 'nao informado'}`,
    `Publico-alvo: ${ctx.publicoAlvo ?? 'nao informado'}`,
    `Carga horaria: ${ctx.cargaHoraria}h - Modalidade: ${ctx.modalidade}`,
    '',
    'DIAGNOSTICO DA NECESSIDADE FORMATIVA:',
    ctx.diagnostico?.trim() || '(nao informado)',
    '',
    'CONTEXTO ADICIONAL:',
    ctx.contextoExtra?.trim() || '(nenhum)',
    '',
    'MATERIAIS APROVADOS DISPONIVEIS (fontes autorizadas):',
    fontes,
    '',
    'Gere o plano formativo em JSON.',
  ].join('\n');
}
