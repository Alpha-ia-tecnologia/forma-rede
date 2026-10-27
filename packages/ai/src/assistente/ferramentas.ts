// Ferramentas do Assistente Pedagogico. Tres sao de leitura (formacoes e materiais
// aprovados, ja no escopo do municipio, via implementacao injetada pela API) e uma
// e o canal estruturado do planejamento, renderizado como cartao para o usuario.
// Todas sao declaradas desde o 1o turno: trocar o conjunto no meio da conversa
// invalidaria os blocos de thinking do historico.
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { TIPOS_PLANEJAMENTO as TIPOS, planejamentoSchema as schemaPlanejamento, type Planejamento } from '@formarede/contracts';

export interface FormacaoResumo {
  id: string;
  titulo: string;
  tema: string | null;
  modalidade: string;
  cargaHoraria: number;
  etapaFluxo: string;
}

export interface FormacaoDetalhe extends FormacaoResumo {
  objetivos: string | null;
  publicoAlvo: string | null;
  freqMinimaPct: number;
  modulos: { titulo: string; descricao: string | null }[];
  atividades: { titulo: string; descricao: string | null; criterios: string | null; prazo: string | null }[];
  materiais: { id: string; titulo: string; tipo: string }[];
  /** Trilha formativa em ordem (so etapas com material aprovado). */
  trilha: { ordem: number; titulo: string; tipo: string; orientacao: string | null; duracaoMin: number | null; obrigatoria: boolean; materialId: string }[];
}

export interface MaterialAprovado {
  id: string;
  titulo: string;
  tipo: string;
  descricao: string | null;
  autoria: string | null;
  licenca: string | null;
  tags: string[];
  url: string | null;
}

/** Acesso a dados que a API fornece, sempre no escopo do municipio e do usuario. */
export interface FerramentasAssistente {
  listarFormacoes(): Promise<FormacaoResumo[]>;
  consultarFormacao(id: string): Promise<FormacaoDetalhe | null>;
  buscarMateriais(filtro: { termo?: string; formacaoId?: string }): Promise<MaterialAprovado[]>;
}

// O formato do planejamento e do contrato compartilhado: o cartao do web usa o mesmo schema.
export const TIPOS_PLANEJAMENTO = TIPOS;
export const planejamentoSchema = schemaPlanejamento;
export type PlanejamentoProposto = Planejamento;

export const ENTRADAS = {
  listar_formacoes: z.object({}),
  consultar_formacao: z.object({ formacao_id: z.string().min(1) }),
  buscar_materiais_aprovados: z.object({ termo: z.string().optional(), formacao_id: z.string().optional() }),
  apresentar_planejamento: planejamentoSchema,
} as const;
export type NomeFerramenta = keyof typeof ENTRADAS;

/** Rotulo exibido enquanto a ferramenta roda (o professor ve o que o assistente esta fazendo). */
export const ROTULOS: Record<NomeFerramenta, string> = {
  listar_formacoes: 'Consultando as formações disponíveis',
  consultar_formacao: 'Lendo a formação',
  buscar_materiais_aprovados: 'Buscando materiais aprovados da rede',
  apresentar_planejamento: 'Montando o cartão do planejamento',
};

const texto = (description: string) => ({ type: 'string', description });
const lista = (description: string) => ({ type: 'array', items: { type: 'string' }, description });

// strict: argumentos conformes ao schema; eager_input_streaming: o planejamento
// (entrada longa) chega aos poucos. Com eager, a validacao fica do nosso lado (ENTRADAS).
export const DEFINICOES_FERRAMENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'listar_formacoes',
    description: 'Lista as formações que a pessoa pode consultar na rede (para professores, as formações em que está inscrita). Use quando ela mencionar uma formação sem dizer qual, ou para descobrir o id antes de consultar_formacao.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: 'consultar_formacao',
    description: 'Retorna objetivos, público, módulos, atividades e materiais vinculados de uma formação. Use para alinhar o planejamento ao que a formação trabalha.',
    input_schema: {
      type: 'object',
      properties: { formacao_id: texto('Id da formação (vem de listar_formacoes ou do contexto).') },
      required: ['formacao_id'],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: 'buscar_materiais_aprovados',
    description: 'Busca materiais pedagógicos aprovados pela curadoria da rede, por palavra-chave e/ou formação. São as únicas fontes institucionais que você pode citar.',
    input_schema: {
      type: 'object',
      properties: {
        termo: texto('Palavra-chave do tema (ex.: "leitura compartilhada"). Omita para listar todos.'),
        formacao_id: texto('Restringe aos materiais vinculados a esta formação.'),
      },
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: 'apresentar_planejamento',
    description: 'Mostra ao professor um planejamento estruturado (plano de aula, sequência didática ou roteiro de encontro formativo) como cartão, para ele revisar e adaptar. Use quando o pedido for um planejamento pronto para usar.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: [...TIPOS_PLANEJAMENTO] },
        titulo: texto('Título curto do planejamento.'),
        publico: texto('Turma ou grupo: etapa, ano e tamanho (ex.: "2º ano do EF, 28 estudantes").'),
        duracao: texto('Duração total (ex.: "2 aulas de 50 minutos").'),
        objetivos: lista('Objetivos de aprendizagem, observáveis.'),
        etapas: {
          type: 'array',
          description: 'Momentos da aula ou do encontro, em ordem.',
          items: {
            type: 'object',
            properties: {
              titulo: texto('Nome do momento.'),
              duracao: texto('Tempo do momento (ex.: "15 min").'),
              descricao: texto('O que o professor faz e o que os estudantes fazem.'),
            },
            required: ['titulo', 'duracao', 'descricao'],
            additionalProperties: false,
          },
        },
        recursos: lista('Materiais e recursos necessários.'),
        avaliacao: texto('Como verificar a aprendizagem.'),
        adaptacoes: lista('Adaptações para estudantes com deficiência ou dificuldades e alternativas de recurso.'),
        fontes: lista('Títulos dos materiais aprovados usados; vazio se nenhum.'),
        observacoes: texto('Cuidados ou pontos a decidir pelo professor.'),
      },
      required: ['tipo', 'titulo', 'publico', 'duracao', 'objetivos', 'etapas', 'recursos', 'avaliacao', 'adaptacoes', 'fontes'],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
];
