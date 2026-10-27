// Contratos compartilhados (web + api). Fonte unica de verdade para papeis,
// permissoes (RBAC), DTOs (Zod) e formato de resposta da API.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Papeis e permissoes
// ---------------------------------------------------------------------------

export const ROLES = [
  'SUPERADMIN',
  'ADMIN_REDE',
  'COORDENADOR',
  'CURADOR',
  'FORMADOR',
  'PROFESSOR',
  'GESTOR_ESCOLAR',
  'AVALIADOR',
  'SUPORTE',
  'AUDITOR',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: 'Superadministrador',
  ADMIN_REDE: 'Administrador da rede',
  COORDENADOR: 'Coordenador pedagógico',
  CURADOR: 'Curador pedagógico',
  FORMADOR: 'Formador',
  PROFESSOR: 'Professor participante',
  GESTOR_ESCOLAR: 'Gestor escolar',
  AVALIADOR: 'Avaliador / observador',
  SUPORTE: 'Suporte técnico',
  AUDITOR: 'Auditor',
};

export type Permission = string;
const ALL: Permission[] = ['*'];

const LEITURA_BASE: Permission[] = [
  'tenant:read', 'formacao:read', 'turma:read', 'encontro:read', 'material:read',
];

/** Matriz de privilegio minimo (Etapas 1+2). */
export const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  SUPERADMIN: ALL,
  ADMIN_REDE: [
    ...LEITURA_BASE,
    'tenant:update',
    'regional:read', 'regional:create', 'regional:update', 'regional:delete',
    'escola:read', 'escola:create', 'escola:update', 'escola:delete',
    'user:read', 'user:create', 'user:update',
    'formacao:create', 'formacao:update', 'formacao:delete', 'formacao:transicao',
    'turma:create', 'turma:update', 'modulo:create',
    'encontro:create', 'encontro:update', 'frequencia:registrar',
    'material:create', 'material:update', 'material:aprovar', 'material:vincular', 'trilha:editar',
    'atividade:create', 'atividade:update', 'entrega:read', 'entrega:avaliar',
    'inscricao:read', 'inscricao:create', 'inscricao:gerenciar',
    'certificado:emitir', 'certificado:read',
    'avaliacao:create', 'avaliacao:read', 'avaliacao:responder', 'report:export',
    'ia:usar', 'ia:config', 'ia:auditar',
    'audit:read', 'report:read', 'frequencia:acompanhar', 'ia:assistente',
  ],
  COORDENADOR: [
    ...LEITURA_BASE, 'escola:read', 'regional:read',
    'inscricao:read', 'entrega:read', 'report:read', 'certificado:read', 'avaliacao:read',
    'frequencia:acompanhar', 'ia:assistente',
  ],
  CURADOR: [
    ...LEITURA_BASE,
    'formacao:create', 'formacao:update', 'formacao:transicao', 'modulo:create',
    'material:create', 'material:update', 'material:aprovar', 'material:vincular', 'trilha:editar',
    'ia:usar', 'ia:assistente',
  ],
  FORMADOR: [
    ...LEITURA_BASE, 'escola:read',
    'encontro:create', 'encontro:update', 'frequencia:registrar', 'frequencia:acompanhar', 'trilha:editar',
    'atividade:create', 'atividade:update',
    'entrega:read', 'entrega:avaliar', 'inscricao:read',
    'avaliacao:create', 'avaliacao:read',
    'ia:usar', 'ia:assistente',
  ],
  PROFESSOR: [
    ...LEITURA_BASE,
    'inscricao:create', 'entrega:create', 'certificado:read', 'participante:area',
    'avaliacao:responder', 'ia:assistente',
  ],
  // Gestao escolar acompanha so os professores da propria escola (escopo na API).
  GESTOR_ESCOLAR: [...LEITURA_BASE, 'escola:read', 'inscricao:read', 'report:read', 'frequencia:acompanhar'],
  AVALIADOR: [...LEITURA_BASE, 'entrega:read', 'report:read', 'avaliacao:read'],
  SUPORTE: ['tenant:read'],
  AUDITOR: ['tenant:read', 'audit:read', 'report:read', 'ia:auditar'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = PERMISSION_MATRIX[role] ?? [];
  return perms.includes('*') || perms.includes(permission);
}

export function permissionsForRole(role: Role): Permission[] {
  return PERMISSION_MATRIX[role] ?? [];
}

// ---------------------------------------------------------------------------
// Enums de dominio (espelham o Prisma)
// ---------------------------------------------------------------------------

export const UNIDADE_TIPOS = ['ESCOLA', 'POLO', 'UNIDADE_FORMATIVA'] as const;
export const ETAPAS_ENSINO = [
  'INFANTIL', 'FUND_ANOS_INICIAIS', 'FUND_ANOS_FINAIS', 'ENSINO_MEDIO',
  'EJA', 'EDUCACAO_ESPECIAL', 'ESCOLA_DO_CAMPO', 'MULTISSERIADA',
] as const;
export const MODALIDADES = ['PRESENCIAL', 'VIRTUAL', 'HIBRIDA'] as const;
/**
 * Ciclo da formacao: Em andamento (EXECUCAO) e Encerrada (CONCLUIDA). Quem cria a formacao
 * e quem a valida, entao nao ha aprovacao por etapas; as demais etapas so existem em dados
 * antigos (CANCELADA conta como encerrada).
 */
export const ETAPAS_FLUXO = [
  'PLANEJAMENTO', 'CURADORIA', 'DESENHO', 'EXECUCAO', 'AVALIACAO', 'CONCLUIDA', 'CANCELADA',
] as const;
export type EtapaFluxo = (typeof ETAPAS_FLUXO)[number];
export const ETAPA_FLUXO_LABELS: Record<EtapaFluxo, string> = {
  PLANEJAMENTO: 'Planejamento',
  CURADORIA: 'Curadoria',
  DESENHO: 'Desenho pedagógico',
  EXECUCAO: 'Em andamento',
  AVALIACAO: 'Avaliação e reflexão',
  CONCLUIDA: 'Encerrada',
  CANCELADA: 'Cancelada',
};
/** Encerrada: sai das listas de formacoes em andamento e entra nos relatorios de conclusao. */
export function formacaoEncerrada(etapa: string): boolean {
  return etapa === 'CONCLUIDA' || etapa === 'CANCELADA';
}

export const MATERIAL_TIPOS = [
  'DOCUMENTO', 'APRESENTACAO', 'VIDEO', 'AUDIO', 'IMAGEM', 'PLANILHA', 'LINK', 'PODCAST',
] as const;
export type MaterialTipo = (typeof MATERIAL_TIPOS)[number];
export const MATERIAL_TIPO_LABELS: Record<MaterialTipo, string> = {
  DOCUMENTO: 'Documento', APRESENTACAO: 'Apresentação', VIDEO: 'Vídeo', AUDIO: 'Áudio',
  IMAGEM: 'Imagem', PLANILHA: 'Planilha', LINK: 'Link', PODCAST: 'Podcast',
};
export const MATERIAL_STATUS = ['RASCUNHO', 'EM_REVISAO', 'APROVADO', 'REJEITADO'] as const;

// ---------------------------------------------------------------------------
// DTOs (Zod)
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.string().min(6, 'A senha deve ter ao menos 6 caracteres.'),
  tenantSlug: z.string().optional(),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const createTenantSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Use letras minusculas, numeros e hifen.'),
  nome: z.string().min(3),
  uf: z.string().length(2),
  codigoIbge: z.string().optional(),
  corPrimaria: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export type CreateTenantDto = z.infer<typeof createTenantSchema>;

export const createRegionalSchema = z.object({
  nome: z.string().min(2),
  codigo: z.string().optional(),
});
export type CreateRegionalDto = z.infer<typeof createRegionalSchema>;

export const createEscolaSchema = z.object({
  nome: z.string().min(2),
  tipo: z.enum(UNIDADE_TIPOS).default('ESCOLA'),
  regionalId: z.string().uuid().optional(),
  inep: z.string().optional(),
  etapas: z.array(z.enum(ETAPAS_ENSINO)).default([]),
  municipio: z.string().optional(),
});
export type CreateEscolaDto = z.infer<typeof createEscolaSchema>;

export const createFormacaoSchema = z.object({
  titulo: z.string().min(3, 'Título deve ter ao menos 3 caracteres.'),
  tema: z.string().optional(),
  subtema: z.string().optional(),
  objetivos: z.string().optional(),
  publicoAlvo: z.string().optional(),
  cargaHoraria: z.coerce.number().int().min(0).default(0),
  modalidade: z.enum(MODALIDADES).default('PRESENCIAL'),
  freqMinimaPct: z.coerce.number().int().min(0).max(100).default(75),
});
export type CreateFormacaoDto = z.infer<typeof createFormacaoSchema>;


export const createModuloSchema = z.object({
  titulo: z.string().min(2),
  descricao: z.string().optional(),
  ordem: z.coerce.number().int().min(1).default(1),
});
export type CreateModuloDto = z.infer<typeof createModuloSchema>;

export const createTurmaSchema = z.object({
  nome: z.string().min(2),
  vagas: z.coerce.number().int().min(0).default(0),
});
export type CreateTurmaDto = z.infer<typeof createTurmaSchema>;

// So http(s): o endereco vira link, player ou embed na tela.
const urlWeb = z.string().trim().url('Informe um endereço completo, começando com https://')
  .refine((u) => /^https?:\/\//i.test(u), 'Use um endereço que comece com http:// ou https://');

export const createEncontroSchema = z.object({
  turmaId: z.string().uuid(),
  moduloId: z.string().uuid().optional(),
  titulo: z.string().min(2),
  pauta: z.string().optional(),
  local: z.string().optional(),
  linkVirtual: urlWeb.optional(),
  inicio: z.coerce.date(),
});
export type CreateEncontroDto = z.infer<typeof createEncontroSchema>;

export const registrarFrequenciaSchema = z.object({
  registros: z.array(z.object({
    inscricaoId: z.string().uuid(),
    presente: z.boolean(),
    justificativa: z.string().optional(),
  })).min(1),
});
export type RegistrarFrequenciaDto = z.infer<typeof registrarFrequenciaSchema>;

export const createMaterialSchema = z.object({
  titulo: z.string().min(2),
  descricao: z.string().optional(),
  tipo: z.enum(MATERIAL_TIPOS).default('DOCUMENTO'),
  url: urlWeb.optional(),
  autoria: z.string().optional(),
  fonte: z.string().optional(),
  licenca: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type CreateMaterialDto = z.infer<typeof createMaterialSchema>;

export const decidirMaterialSchema = z.object({
  aprovar: z.boolean(),
  /** Obrigatorio ao recusar: quem cadastrou ve o motivo no acervo. */
  motivo: z.string().trim().max(500).optional(),
}).refine((d) => d.aprovar || (d.motivo?.length ?? 0) >= 3, {
  message: 'Diga em poucas palavras por que o material foi recusado.',
});
export type DecidirMaterialDto = z.infer<typeof decidirMaterialSchema>;

export const createAtividadeSchema = z.object({
  titulo: z.string().min(2),
  descricao: z.string().optional(),
  criterios: z.string().optional(),
  prazo: z.coerce.date().optional(),
  pontuacao: z.coerce.number().int().min(0).default(10),
});
export type CreateAtividadeDto = z.infer<typeof createAtividadeSchema>;

/** Novo prazo de entrega de uma atividade; null deixa a atividade sem prazo. */
export const prazoAtividadeSchema = z.object({
  prazo: z.coerce.date({ invalid_type_error: 'Informe uma data válida.' }).nullable(),
});
export type PrazoAtividadeDto = z.infer<typeof prazoAtividadeSchema>;

export const enviarEntregaSchema = z.object({
  conteudo: z.string().trim().min(1, 'Descreva a entrega.').max(5000, 'Use até 5.000 caracteres; o restante pode ir num link.'),
  anexoUrl: urlWeb.optional(),
});
export type EnviarEntregaDto = z.infer<typeof enviarEntregaSchema>;

export const avaliarEntregaSchema = z.object({
  nota: z.coerce.number().int().min(0).max(100).optional(),
  feedback: z.string().trim().min(1, 'Escreva a devolutiva.').max(3000),
  solicitarAjuste: z.boolean().default(false),
});
export type AvaliarEntregaDto = z.infer<typeof avaliarEntregaSchema>;

export const inscreverSchema = z.object({
  turmaId: z.string().uuid(),
});
export type InscreverDto = z.infer<typeof inscreverSchema>;

// ---------------------------------------------------------------------------
// Envelope e sessao
// ---------------------------------------------------------------------------

export interface PageMeta { total: number; page: number; limit: number; }
export type ApiOk<T> = { success: true; data: T; meta?: PageMeta };
export type ApiErr = { success: false; error: string; code?: string };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  tenantId: string;
  tenantSlug: string;
  role: Role;
  permissions: Permission[];
}

// ---------------------------------------------------------------------------
// Avaliacoes (RF-100..105)
// ---------------------------------------------------------------------------

export const AVALIACAO_TIPOS = ['DIAGNOSTICA', 'SATISFACAO', 'FINAL'] as const;
export type AvaliacaoTipo = (typeof AVALIACAO_TIPOS)[number];
export const AVALIACAO_TIPO_LABELS: Record<AvaliacaoTipo, string> = {
  DIAGNOSTICA: 'Diagnóstica',
  SATISFACAO: 'Satisfação',
  FINAL: 'Final',
};

export interface PerguntaAvaliacao {
  id: string;
  tipo: 'ESCALA' | 'TEXTO';
  texto: string;
}

export const createAvaliacaoSchema = z.object({
  titulo: z.string().min(2),
  tipo: z.enum(AVALIACAO_TIPOS).default('SATISFACAO'),
  anonima: z.boolean().default(false),
  escalas: z.array(z.string().min(2)).default([]),
  abertas: z.array(z.string().min(2)).default([]),
}).refine((d) => d.escalas.length + d.abertas.length > 0, {
  message: 'Inclua ao menos uma pergunta.',
});
export type CreateAvaliacaoDto = z.infer<typeof createAvaliacaoSchema>;

export const responderAvaliacaoSchema = z.object({
  respostas: z.array(z.object({
    perguntaId: z.string().min(1),
    valor: z.coerce.number().int().min(1).max(5).optional(),
    texto: z.string().optional(),
  })).min(1),
});
export type ResponderAvaliacaoDto = z.infer<typeof responderAvaliacaoSchema>;

export interface ResultadoPergunta {
  pergunta: PerguntaAvaliacao;
  media?: number;
  respostas?: string[];
  n: number;
}

// ---------------------------------------------------------------------------
// IA governada (secoes 06 e 07 do DRF-001)
// ---------------------------------------------------------------------------

export const IA_PROVIDERS = ['deepseek', 'anthropic', 'mock'] as const;

export const gerarPlanoSchema = z.object({
  diagnostico: z.string().optional(),
  contextoExtra: z.string().optional(),
});
export type GerarPlanoDto = z.infer<typeof gerarPlanoSchema>;

export const decisaoIaSchema = z.object({
  decisao: z.enum(['APROVAR', 'REJEITAR', 'EDITAR']),
  saidaEditada: z.string().optional(),
}).refine((d) => d.decisao !== 'EDITAR' || !!d.saidaEditada?.trim(), {
  message: 'Informe o conteúdo editado.',
});
export type DecisaoIaDto = z.infer<typeof decisaoIaSchema>;

export const sinalizarIaSchema = z.object({
  motivo: z.string().min(3, 'Descreva o problema da resposta.'),
});
export type SinalizarIaDto = z.infer<typeof sinalizarIaSchema>;

export const iaConfigSchema = z.object({
  iaHabilitada: z.boolean(),
  iaProvider: z.enum(IA_PROVIDERS),
});
export type IaConfigDto = z.infer<typeof iaConfigSchema>;

// ---------------------------------------------------------------------------
// Acompanhamento da frequencia dos professores (cursistas)
// ---------------------------------------------------------------------------
// Duas medidas, com propositos diferentes:
// - frequencia acumulada = presencas / chamadas ja registradas para o professor
//   (o retrato de agora; sem chamada nao ha percentual);
// - projecao maxima = (presencas + encontros que ainda podem contar) / previstos
//   (o teto alcancavel; a certificacao usa presencas / previstos ao final).

export const SITUACOES_FREQUENCIA = ['CRITICO', 'EM_RISCO', 'ATENCAO', 'SEM_CHAMADA', 'REGULAR'] as const;
export type SituacaoFrequencia = (typeof SITUACOES_FREQUENCIA)[number];

export const SITUACAO_FREQUENCIA_LABELS: Record<SituacaoFrequencia, string> = {
  CRITICO: 'Não alcança o mínimo',
  EM_RISCO: 'Abaixo do mínimo',
  ATENCAO: 'Atenção',
  SEM_CHAMADA: 'Sem chamada',
  REGULAR: 'Regular',
};

/** Margem acima do minimo que ainda pede atencao (pontos percentuais). */
export const FREQUENCIA_MARGEM_ATENCAO = 10;
/** Ausencias seguidas, nas chamadas mais recentes, que pedem contato. */
export const FREQUENCIA_AUSENCIAS_SEGUIDAS = 2;

export type MarcaFrequencia = 'PRESENTE' | 'AUSENTE' | 'JUSTIFICADA' | 'PENDENTE' | 'PREVISTO';

export interface EncontroFrequencia {
  encontroId: string;
  titulo: string;
  inicio: string;
  marca: MarcaFrequencia;
  justificativa: string | null;
}

export interface ResumoFrequencia {
  encontrosPrevistos: number;
  chamadasRegistradas: number;
  presencas: number;
  faltas: number;
  faltasJustificadas: number;
  frequenciaPct: number | null;
  projecaoMaximaPct: number | null;
  ausenciasSeguidas: number;
  ultimaPresenca: string | null;
  situacao: SituacaoFrequencia;
  historico: EncontroFrequencia[];
}

export interface FrequenciaProfessor extends ResumoFrequencia {
  inscricaoId: string;
  professor: { id: string; nome: string; email: string };
  escola: { id: string; nome: string } | null;
  formacao: { id: string; titulo: string; freqMinimaPct: number };
  turma: { id: string; nome: string };
}

export interface ChamadaPendente {
  encontroId: string;
  titulo: string;
  inicio: string;
  turma: string;
  formacao: string;
  /** null: nenhuma marca ainda; numero: chamada incompleta, com tantos cursistas sem marca. */
  semMarca: number | null;
}

export interface AcompanhamentoFrequencia {
  geradoEm: string;
  resumo: {
    professores: number;
    comChamada: number;
    frequenciaMediaPct: number | null;
    abaixoDoMinimo: number;
    naoAlcancamMinimo: number;
    atencao: number;
    faltasSemJustificativa: number;
    encontrosRealizados: number;
  };
  chamadasPendentes: ChamadaPendente[];
  professores: FrequenciaProfessor[];
  opcoes: {
    formacoes: { id: string; titulo: string }[];
    turmas: { id: string; nome: string; formacaoId: string }[];
    escolas: { id: string; nome: string }[];
  };
}

/**
 * Resume a frequencia de uma inscricao a partir dos encontros da turma e das
 * chamadas registradas. Funcao pura: a API e o modo demonstracao usam a mesma regra.
 */
export function resumirFrequencia(
  encontros: { id: string; titulo: string; inicio: string | Date; cancelado: boolean }[],
  registros: { encontroId: string; presente: boolean; justificativa: string | null }[],
  freqMinimaPct: number,
  agora: Date,
): ResumoFrequencia {
  const porEncontro = new Map(registros.map((r) => [r.encontroId, r]));
  const validos = encontros
    .filter((e) => !e.cancelado)
    .map((e) => ({ ...e, inicio: new Date(e.inicio) }))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  const historico: EncontroFrequencia[] = validos.map((e) => {
    const r = porEncontro.get(e.id);
    const marca: MarcaFrequencia = r
      ? r.presente ? 'PRESENTE' : r.justificativa?.trim() ? 'JUSTIFICADA' : 'AUSENTE'
      : e.inicio.getTime() <= agora.getTime() ? 'PENDENTE' : 'PREVISTO';
    return { encontroId: e.id, titulo: e.titulo, inicio: e.inicio.toISOString(), marca, justificativa: r?.justificativa ?? null };
  });

  const conta = (m: MarcaFrequencia) => historico.filter((h) => h.marca === m).length;
  const presencas = conta('PRESENTE');
  const faltasJustificadas = conta('JUSTIFICADA');
  const faltas = conta('AUSENTE') + faltasJustificadas;
  const chamadasRegistradas = presencas + faltas;
  // Encontro sem chamada (pendente ou por vir) ainda pode virar presenca.
  const emAberto = conta('PENDENTE') + conta('PREVISTO');
  const previstos = historico.length;

  const frequenciaPct = chamadasRegistradas ? Math.round((presencas / chamadasRegistradas) * 100) : null;
  const projecaoMaximaPct = previstos ? Math.round(((presencas + emAberto) / previstos) * 100) : null;

  // Sequencia de faltas a partir da chamada registrada mais recente.
  let ausenciasSeguidas = 0;
  for (const h of [...historico].reverse()) {
    if (h.marca === 'PENDENTE' || h.marca === 'PREVISTO') continue;
    if (h.marca === 'PRESENTE') break;
    ausenciasSeguidas += 1;
  }
  const ultimaPresenca = [...historico].reverse().find((h) => h.marca === 'PRESENTE')?.inicio ?? null;

  const situacao: SituacaoFrequencia =
    frequenciaPct === null ? 'SEM_CHAMADA'
      : projecaoMaximaPct !== null && projecaoMaximaPct < freqMinimaPct ? 'CRITICO'
      : frequenciaPct < freqMinimaPct ? 'EM_RISCO'
      : ausenciasSeguidas >= FREQUENCIA_AUSENCIAS_SEGUIDAS || frequenciaPct < freqMinimaPct + FREQUENCIA_MARGEM_ATENCAO ? 'ATENCAO'
      : 'REGULAR';

  return {
    encontrosPrevistos: previstos, chamadasRegistradas, presencas, faltas, faltasJustificadas,
    frequenciaPct, projecaoMaximaPct, ausenciasSeguidas, ultimaPresenca, situacao, historico,
  };
}

/** Linha do relatorio de frequencia (prestacao de contas): a mesma conta da tela de Frequencia. */
export interface LinhaRelatorioFrequencia {
  participante: string;
  email: string;
  formacao: string;
  turma: string;
  presencas: number;
  chamadasRegistradas: number;
  encontrosPrevistos: number;
  /** null: nenhuma chamada registrada ainda (sem base de calculo). */
  frequenciaPct: number | null;
  minimoPct: number;
  situacao: SituacaoFrequencia;
}

/** Linha do relatorio de conclusao por formacao. */
export interface LinhaRelatorioConclusao {
  formacao: string;
  etapaFluxo: EtapaFluxo;
  inscritos: number;
  certificados: number;
  /** null: ninguem inscrito. */
  taxaConclusaoPct: number | null;
  /** Media por professor (cada um pesa igual); null sem chamada registrada. */
  frequenciaMediaPct: number | null;
  minimoPct: number;
  /** Professores abaixo do minimo de frequencia (em risco ou que ja nao alcancam). */
  abaixoDoMinimo: number;
}

/** Indicadores do recorte: media por professor (cada um pesa igual) e contagens por situacao. */
export function resumirAcompanhamento(
  professores: ResumoFrequencia[],
): Omit<AcompanhamentoFrequencia['resumo'], 'encontrosRealizados'> {
  const comChamada = professores.filter((p) => p.frequenciaPct !== null);
  const conta = (s: SituacaoFrequencia) => professores.filter((p) => p.situacao === s).length;
  return {
    professores: professores.length,
    comChamada: comChamada.length,
    frequenciaMediaPct: comChamada.length
      ? Math.round(comChamada.reduce((soma, p) => soma + (p.frequenciaPct ?? 0), 0) / comChamada.length)
      : null,
    abaixoDoMinimo: conta('EM_RISCO') + conta('CRITICO'),
    naoAlcancamMinimo: conta('CRITICO'),
    atencao: conta('ATENCAO'),
    faltasSemJustificativa: professores.reduce((soma, p) => soma + p.faltas - p.faltasJustificadas, 0),
  };
}

/** Ordem de prioridade do acompanhamento: quem precisa de contato primeiro. */
export function ordenarPorPrioridade<T extends ResumoFrequencia>(lista: T[]): T[] {
  const peso = (s: SituacaoFrequencia) => SITUACOES_FREQUENCIA.indexOf(s);
  return [...lista].sort((a, b) =>
    peso(a.situacao) - peso(b.situacao)
    || (a.frequenciaPct ?? 101) - (b.frequenciaPct ?? 101)
    || b.ausenciasSeguidas - a.ausenciasSeguidas);
}

// ---------------------------------------------------------------------------
// Assistente Pedagogico (IA): planejamento e duvidas de professores e formadores
// ---------------------------------------------------------------------------

export const TIPOS_PLANEJAMENTO = ['PLANO_DE_AULA', 'SEQUENCIA_DIDATICA', 'ROTEIRO_DE_ENCONTRO'] as const;
export type TipoPlanejamento = (typeof TIPOS_PLANEJAMENTO)[number];
export const TIPO_PLANEJAMENTO_LABELS: Record<TipoPlanejamento, string> = {
  PLANO_DE_AULA: 'Plano de aula',
  SEQUENCIA_DIDATICA: 'Sequência didática',
  ROTEIRO_DE_ENCONTRO: 'Roteiro de encontro formativo',
};

/** Planejamento estruturado proposto pelo assistente (rascunho para o professor revisar). */
export const planejamentoSchema = z.object({
  tipo: z.enum(TIPOS_PLANEJAMENTO),
  titulo: z.string().min(3),
  publico: z.string().min(2),
  duracao: z.string().min(2),
  objetivos: z.array(z.string().min(2)).min(1),
  etapas: z.array(z.object({
    titulo: z.string().min(2),
    duracao: z.string().min(1),
    descricao: z.string().min(2),
  })).min(1),
  recursos: z.array(z.string()),
  avaliacao: z.string().min(2),
  adaptacoes: z.array(z.string()),
  fontes: z.array(z.string()),
  observacoes: z.string().optional(),
});
export type Planejamento = z.infer<typeof planejamentoSchema>;

export const criarConversaSchema = z.object({
  formacaoId: z.string().uuid().optional(),
});
export type CriarConversaDto = z.infer<typeof criarConversaSchema>;

export const enviarMensagemAssistenteSchema = z.object({
  texto: z.string().trim().min(2, 'Escreva sua pergunta.').max(8000, 'A pergunta passou de 8.000 caracteres.'),
});
export type EnviarMensagemAssistenteDto = z.infer<typeof enviarMensagemAssistenteSchema>;

export interface FonteAssistente { id: string; titulo: string; tipo: string }

export interface TurnoAssistente {
  id: string;
  pergunta: string;
  resposta: string;
  planejamentos: Planejamento[];
  fontes: FonteAssistente[];
  /** AiInteracao do turno: usada para sinalizar resposta incorreta (RIA-010). */
  interacaoId: string | null;
  criadoEm: string;
}

export interface ConversaResumo {
  id: string;
  titulo: string;
  formacao: { id: string; titulo: string } | null;
  turnos: number;
  atualizadaEm: string;
}

export interface ConversaDetalhe extends Omit<ConversaResumo, 'turnos'> {
  turnos: TurnoAssistente[];
}

/** Eventos do stream (SSE) de uma resposta do assistente. */
export type EventoAssistenteStream =
  | { tipo: 'texto'; delta: string }
  | { tipo: 'progresso'; delta: string }
  | { tipo: 'ferramenta'; nome: string; rotulo: string; estado: 'inicio' | 'fim' | 'erro' }
  | { tipo: 'planejamento'; planejamento: Planejamento }
  | { tipo: 'fim'; turno: TurnoAssistente }
  | { tipo: 'erro'; mensagem: string };

// ---------------------------------------------------------------------------
// Trilha formativa: etapas com videos, documentos, podcasts e materiais do acervo
// ---------------------------------------------------------------------------

/** Tipos de recurso novo que podem entrar direto pela trilha (vao para a curadoria). */
export const TIPOS_RECURSO_TRILHA = ['VIDEO', 'DOCUMENTO', 'PODCAST', 'LINK'] as const;
export type TipoRecursoTrilha = (typeof TIPOS_RECURSO_TRILHA)[number];

const camposEtapa = {
  titulo: z.string().trim().min(2, 'Dê um título à etapa.').max(160).optional(),
  orientacao: z.string().trim().max(1000).optional(),
  /** Minutos estimados; null limpa na edicao. */
  duracaoMin: z.number().int('Informe o tempo em minutos inteiros.').min(1, 'O tempo estimado vai de 1 a 600 minutos.').max(600, 'O tempo estimado vai de 1 a 600 minutos.').nullable().optional(),
  obrigatoria: z.boolean().default(true),
  moduloId: z.string().uuid().nullable().optional(),
};

export const criarEtapaTrilhaSchema = z.object({
  ...camposEtapa,
  /** Material ja aprovado do acervo da rede... */
  materialId: z.string().uuid().optional(),
  /** ...ou um recurso novo, que entra na curadoria (EM_REVISAO). */
  recurso: z.object({
    tipo: z.enum(TIPOS_RECURSO_TRILHA),
    titulo: z.string().trim().min(2, 'Dê um título ao recurso.').max(160),
    url: urlWeb,
    autoria: z.string().trim().max(160).optional(),
    licenca: z.string().trim().max(80).optional(),
  }).optional(),
}).refine((d) => !!d.materialId !== !!d.recurso, {
  message: 'Escolha um material do acervo ou informe um recurso novo.',
});
export type CriarEtapaTrilhaDto = z.infer<typeof criarEtapaTrilhaSchema>;

export const atualizarEtapaTrilhaSchema = z.object({ ...camposEtapa, obrigatoria: z.boolean().optional() });
export type AtualizarEtapaTrilhaDto = z.infer<typeof atualizarEtapaTrilhaSchema>;

export const moverEtapaTrilhaSchema = z.object({ direcao: z.enum(['subir', 'descer']) });
export type MoverEtapaTrilhaDto = z.infer<typeof moverEtapaTrilhaSchema>;

export const concluirEtapaTrilhaSchema = z.object({ concluida: z.boolean() });
export type ConcluirEtapaTrilhaDto = z.infer<typeof concluirEtapaTrilhaSchema>;

/** Etapa que veio de um modelo recebe o recurso e os textos de quem monta a trilha (mesmos campos de criar). */
export const substituirEtapaTrilhaSchema = criarEtapaTrilhaSchema;
export type SubstituirEtapaTrilhaDto = CriarEtapaTrilhaDto;

/**
 * Modelo pronto de trilha: o percurso ja estruturado, com o tipo de recurso de cada etapa,
 * a orientacao e o tempo. Os trechos entre colchetes sao para trocar pelo conteudo da
 * formacao; a etapa so chega aos cursistas depois de receber o recurso.
 */
export interface ModeloTrilha {
  id: string;
  nome: string;
  /** Para que serve, em uma frase. */
  resumo: string;
  etapas: { titulo: string; tipo: TipoRecursoTrilha; orientacao: string; duracaoMin: number; obrigatoria: boolean }[];
}

export const MODELOS_TRILHA: readonly ModeloTrilha[] = [
  {
    id: 'entre-encontros',
    nome: 'Percurso entre dois encontros',
    resumo: 'Prepara o próximo encontro: um vídeo para abrir o tema, uma leitura de base, uma escuta opcional e uma prática com a turma.',
    etapas: [
      { tipo: 'VIDEO', titulo: 'Vídeo de abertura: [tema do encontro]', duracaoMin: 15, obrigatoria: true,
        orientacao: 'Assista antes do encontro e anote uma pergunta que o vídeo deixou para você.' },
      { tipo: 'DOCUMENTO', titulo: 'Leitura de base: [texto de referência]', duracaoMin: 30, obrigatoria: true,
        orientacao: 'Leia e destaque dois trechos que conversam com a realidade da sua turma.' },
      { tipo: 'PODCAST', titulo: 'Para ouvir: [experiência de outra escola]', duracaoMin: 20, obrigatoria: false,
        orientacao: 'Ouça no trajeto ou no planejamento e traga para o encontro uma ideia que você gostaria de testar.' },
      { tipo: 'LINK', titulo: 'Na sala de aula: [proposta para aplicar]', duracaoMin: 30, obrigatoria: true,
        orientacao: 'Aplique a proposta com a turma e registre o que aconteceu (foto, anotação ou produção dos alunos) para compartilhar no encontro.' },
    ],
  },
  {
    id: 'ciclo-pratica',
    nome: 'Ciclo de prática: ver, planejar, aplicar e refletir',
    resumo: 'Uma estratégia de ensino do começo ao fim: a prática filmada, o fundamento, o planejamento, a aplicação e a reflexão.',
    etapas: [
      { tipo: 'VIDEO', titulo: 'Ver a prática: [estratégia em sala de aula]', duracaoMin: 15, obrigatoria: true,
        orientacao: 'Observe o que a professora faz antes, durante e depois da atividade, e como as crianças respondem.' },
      { tipo: 'DOCUMENTO', titulo: 'Por que funciona: [texto sobre a estratégia]', duracaoMin: 20, obrigatoria: true,
        orientacao: 'Leia para entender o fundamento da estratégia e anote o que você já faz parecido.' },
      { tipo: 'DOCUMENTO', titulo: 'Roteiro de planejamento: [nome do roteiro]', duracaoMin: 20, obrigatoria: true,
        orientacao: 'Use o roteiro para planejar a aplicação com a sua turma: objetivo, tempo, materiais e como vai observar a aprendizagem.' },
      { tipo: 'LINK', titulo: 'Aplicar e registrar: [onde enviar o registro]', duracaoMin: 45, obrigatoria: true,
        orientacao: 'Aplique com a turma e registre evidências da aprendizagem dos alunos para levar ao próximo encontro.' },
      { tipo: 'PODCAST', titulo: 'Para refletir: [conversa sobre a prática]', duracaoMin: 20, obrigatoria: false,
        orientacao: 'Ouça depois de aplicar e compare com o que aconteceu na sua sala.' },
    ],
  },
  {
    id: 'documento-curricular',
    nome: 'Estudo de um documento curricular',
    resumo: 'Leitura guiada da BNCC ou do currículo da rede, com um exemplo de planejamento e o ajuste de uma aula real.',
    etapas: [
      { tipo: 'DOCUMENTO', titulo: 'Documento de referência: [BNCC ou currículo da rede]', duracaoMin: 40, obrigatoria: true,
        orientacao: 'Leia a parte indicada pela formação e marque as habilidades que a sua turma já trabalha.' },
      { tipo: 'VIDEO', titulo: 'Explicação comentada: [vídeo sobre o documento]', duracaoMin: 20, obrigatoria: true,
        orientacao: 'Assista para tirar as dúvidas da leitura e anote o que ainda ficou confuso.' },
      { tipo: 'DOCUMENTO', titulo: 'Exemplo de planejamento: [ano ou etapa]', duracaoMin: 25, obrigatoria: false,
        orientacao: 'Compare com o seu planejamento: o que você manteria e o que ajustaria?' },
      { tipo: 'LINK', titulo: 'Seu planejamento: [onde registrar a aula ajustada]', duracaoMin: 30, obrigatoria: true,
        orientacao: 'Ajuste uma aula da próxima semana usando o documento e traga o planejamento para o encontro.' },
    ],
  },
  {
    id: 'acolhida',
    nome: 'Acolhida e diagnóstico',
    resumo: 'Para o início da formação: boas-vindas da equipe, o plano da formação e um questionário que orienta os encontros.',
    etapas: [
      { tipo: 'VIDEO', titulo: 'Boas-vindas: [equipe de formação]', duracaoMin: 10, obrigatoria: true,
        orientacao: 'Conheça o percurso, os encontros e o que se espera de cada cursista.' },
      { tipo: 'DOCUMENTO', titulo: 'Plano da formação: [nome da formação]', duracaoMin: 15, obrigatoria: true,
        orientacao: 'Leia os objetivos e o calendário e anote o que você mais quer aprender.' },
      { tipo: 'LINK', titulo: 'Questionário de diagnóstico: [nome do questionário]', duracaoMin: 15, obrigatoria: true,
        orientacao: 'Responda antes do primeiro encontro: as respostas ajudam a equipe a ajustar a formação à sua realidade.' },
    ],
  },
];

export const aplicarModeloTrilhaSchema = z.object({
  modeloId: z.string().refine((id) => MODELOS_TRILHA.some((m) => m.id === id), 'Escolha um dos modelos de trilha.'),
});
export type AplicarModeloTrilhaDto = z.infer<typeof aplicarModeloTrilhaSchema>;

// ---------------------------------------------------------------------------
// Trilha gerada com IA: o Gerador de trilhas (agente LangGraph) le a formacao e o
// acervo aprovado e propoe as etapas; quem edita revisa e salva (RIA-002).
// ---------------------------------------------------------------------------

export const TEMPOS_TRILHA = ['ate-1h', 'ate-2h', 'ate-4h'] as const;
export type TempoTrilha = (typeof TEMPOS_TRILHA)[number];
export const TEMPO_TRILHA_LABELS: Record<TempoTrilha, string> = { 'ate-1h': 'Até 1 hora', 'ate-2h': 'Até 2 horas', 'ate-4h': 'Até 4 horas' };
export const TEMPO_TRILHA_MIN: Record<TempoTrilha, number> = { 'ate-1h': 60, 'ate-2h': 120, 'ate-4h': 240 };

/** O pedido: o basico que so quem monta a trilha sabe; o resto vem do contexto da formacao. */
export const gerarTrilhaIaSchema = z.object({
  objetivo: z.string().trim().min(15, 'Conte em uma ou duas frases o que a trilha deve alcançar.').max(600),
  quantidade: z.number().int().min(3, 'De 3 a 8 etapas.').max(8, 'De 3 a 8 etapas.').default(5),
  tempo: z.enum(TEMPOS_TRILHA).default('ate-2h'),
  formatos: z.array(z.enum(TIPOS_RECURSO_TRILHA)).min(1, 'Escolha ao menos um formato.').default([...TIPOS_RECURSO_TRILHA]),
  /** Priorizar materiais ja aprovados no acervo da rede. */
  usarAcervo: z.boolean().default(true),
  /** A proposta fica no lugar das etapas atuais (ex.: as de um modelo pronto) em vez de entrar no fim. */
  substituir: z.boolean().default(false),
});
export type GerarTrilhaIaDto = z.infer<typeof gerarTrilhaIaSchema>;

/** Saida estruturada do Gerador de trilhas (ferramenta apresentar_trilha), validada antes de usar. */
export const propostaTrilhaSchema = z.object({
  resumo: z.string().trim().min(1).max(600),
  etapas: z.array(z.object({
    titulo: z.string().trim().min(2).max(160),
    tipo: z.enum(TIPOS_RECURSO_TRILHA),
    orientacao: z.string().trim().min(1).max(1000),
    duracao_min: z.number().int().min(1).max(600),
    obrigatoria: z.boolean(),
    /** Id de um material aprovado que a IA recebeu ou encontrou; null = recurso a definir. */
    material_id: z.string().nullable(),
    /** O que procurar quando a etapa fica sem material. */
    recurso_sugerido: z.string().trim().max(300).nullable(),
  })).min(1).max(10),
  observacoes: z.string().trim().max(800).nullable(),
});
export type PropostaTrilhaGerada = z.infer<typeof propostaTrilhaSchema>;

/** O que a tela recebe: a proposta com os materiais do acervo conferidos no municipio. */
export interface PropostaTrilhaIa {
  interacaoId: string;
  geradoPorIA: true;
  provider: string;
  modelo: string;
  resumo: string;
  observacoes: string | null;
  etapas: {
    titulo: string;
    tipo: TipoRecursoTrilha;
    orientacao: string;
    duracaoMin: number;
    obrigatoria: boolean;
    material: { id: string; titulo: string; tipo: MaterialTipo } | null;
    recursoSugerido: string | null;
  }[];
}

export const salvarTrilhaIaSchema = z.object({
  /** Posicoes das etapas da proposta que entram na trilha, na ordem da proposta. */
  incluir: z.array(z.number().int().min(0)).min(1, 'Escolha ao menos uma etapa para salvar.'),
});
export type SalvarTrilhaIaDto = z.infer<typeof salvarTrilhaIaSchema>;

/** Contexto minimo de uma proposta (o gerador de exemplo usa so isto). */
export interface ContextoTrilhaExemplo {
  formacao: { titulo: string; tema: string | null };
  /** Materiais aprovados disponiveis, os da formacao primeiro. */
  materiais: { id: string; titulo: string; tipo: MaterialTipo }[];
}

const ORIENTACAO_EXEMPLO: Record<TipoRecursoTrilha, string> = {
  VIDEO: 'Assista e anote uma ideia que você gostaria de testar com a turma.',
  DOCUMENTO: 'Leia e destaque dois trechos que conversam com a sua prática.',
  PODCAST: 'Ouça no trajeto ou no planejamento e traga uma pergunta para o encontro.',
  LINK: 'Acesse e registre o que você aplicaria com a sua turma, para compartilhar no encontro.',
};
const MOMENTOS_EXEMPLO = ['Para abrir o tema', 'Leitura de base', 'Ver na prática', 'Para aprofundar', 'Planejar com a turma', 'Aplicar e registrar', 'Para refletir', 'Síntese'];

/**
 * Proposta deterministica, sem modelo (provider "mock" e modo demonstracao): alterna os
 * formatos pedidos, usa materiais aprovados do mesmo tipo quando pedido e deixa o resto
 * a definir, com a sugestao do que procurar.
 */
export function propostaTrilhaDeExemplo(ctx: ContextoTrilhaExemplo, pedido: GerarTrilhaIaDto): PropostaTrilhaGerada {
  const tema = ctx.formacao.tema || ctx.formacao.titulo;
  const porEtapa = Math.max(10, Math.round(TEMPO_TRILHA_MIN[pedido.tempo] / pedido.quantidade / 5) * 5);
  const usados = new Set<string>();
  const etapas = Array.from({ length: pedido.quantidade }, (_, i) => {
    const tipo = pedido.formatos[i % pedido.formatos.length] ?? 'LINK';
    const material = pedido.usarAcervo ? ctx.materiais.find((m) => m.tipo === tipo && !usados.has(m.id)) : undefined;
    if (material) usados.add(material.id);
    return {
      titulo: `${MOMENTOS_EXEMPLO[i] ?? `Etapa ${i + 1}`}: ${material ? material.titulo : tema}`,
      tipo,
      orientacao: ORIENTACAO_EXEMPLO[tipo],
      duracao_min: porEtapa,
      obrigatoria: i < pedido.quantidade - 1,
      material_id: material?.id ?? null,
      recurso_sugerido: material ? null : `${MATERIAL_TIPO_LABELS[tipo]} curto e de fonte confiável sobre ${tema.toLowerCase()}, ligado ao objetivo da trilha.`,
    };
  });
  return {
    resumo: `${etapas.length} etapas sobre ${tema.toLowerCase()} para: ${pedido.objetivo}`,
    etapas,
    observacoes: 'Proposta de exemplo, sem modelo de IA (provider "mock"). Revise os títulos e escolha os recursos que faltam.',
  };
}

export interface EtapaTrilha {
  id: string;
  ordem: number;
  titulo: string;
  orientacao: string | null;
  duracaoMin: number | null;
  obrigatoria: boolean;
  modulo: { id: string; titulo: string } | null;
  /** null na etapa de um modelo que ainda nao recebeu recurso (so quem edita a ve). */
  material: {
    id: string; titulo: string; tipo: MaterialTipo; url: string | null; descricao: string | null;
    autoria: string | null; licenca: string | null; status: string;
  } | null;
  /** Etapa de modelo sem recurso: o tipo previsto (video, documento...). */
  tipoPrevisto: MaterialTipo | null;
  /** Etapa proposta pela IA sem recurso: o que procurar (texto da IA). */
  recursoSugerido: string | null;
  /** Cursista: se ele ja concluiu. */
  concluida: boolean;
  /** Quem edita: quantos cursistas concluiram. */
  concluintes: number | null;
}

export interface TrilhaFormacao {
  formacaoId: string;
  podeEditar: boolean;
  /** Inscricao do usuario numa turma da formacao (cursista), se houver. */
  inscricaoId: string | null;
  totalCursistas: number | null;
  /** Do cursista: etapas obrigatorias visiveis e quantas concluiu. */
  progresso: { concluidas: number; obrigatorias: number } | null;
  etapas: EtapaTrilha[];
}

// ---------------------------------------------------------------------------
// Pagina da formacao: a participacao do cursista e o acompanhamento de quem conduz
// ---------------------------------------------------------------------------

export const ENTREGA_STATUS = ['ENVIADA', 'EM_AJUSTE', 'AVALIADA'] as const;
export type EntregaStatus = (typeof ENTREGA_STATUS)[number];

export interface EncontroResumo {
  id: string;
  titulo: string;
  inicio: string;
  fim: string | null;
  local: string | null;
  linkVirtual: string | null;
  cancelado: boolean;
}

export interface EntregaCursista {
  id: string;
  status: EntregaStatus;
  conteudo: string | null;
  anexoUrl: string | null;
  nota: number | null;
  feedback: string | null;
  enviadaEm: string;
  avaliadaEm: string | null;
}

export interface AtividadeFormacao {
  id: string;
  titulo: string;
  descricao: string | null;
  criterios: string | null;
  prazo: string | null;
  pontuacao: number;
}

/** O que o cursista ve da propria participacao (GET /formacoes/:id/minha-participacao). */
export interface ParticipacaoFormacao {
  inscricaoId: string;
  turma: { id: string; nome: string };
  /** Frequencia como o certificado conta: presencas / encontros previstos. */
  frequencia: {
    presencas: number;
    encontrosPrevistos: number;
    presencasNecessarias: number;
    /** Encontros sem chamada ainda (por vir ou aguardando registro): podem virar presenca. */
    emAberto: number;
    minimoPct: number;
  };
  encontros: (EncontroResumo & { marca: MarcaFrequencia })[];
  proximoEncontro: EncontroResumo | null;
  atividades: (AtividadeFormacao & { entrega: EntregaCursista | null })[];
  certificado: { codigo: string; emitidoEm: string } | null;
  podeEmitirCertificado: boolean;
  /** Avaliacoes (pesquisas) da formacao e se a pessoa ja respondeu. */
  avaliacoes: AvaliacaoCursista[];
}

export interface AvaliacaoCursista {
  id: string;
  titulo: string;
  tipo: string;
  anonima: boolean;
  respondida: boolean;
}

/** Item de Minhas formacoes (GET /participante/minhas-formacoes): a mesma conta da pagina da formacao. */
export type MinhaFormacao = ParticipacaoFormacao & {
  formacao: { id: string; titulo: string; cargaHoraria: number; modalidade: string; etapaFluxo: EtapaFluxo; freqMinimaPct: number };
};

export interface EncontroAcompanhamento extends EncontroResumo {
  turma: { id: string; nome: string };
  /** Chamada registrada (ao menos um registro de presenca). */
  chamadaRegistrada: boolean;
  presentes: number;
  /** Cursistas confirmados da turma ainda sem marca neste encontro (chamada incompleta se > 0 com registro). */
  semMarca: number;
}

/** O que quem conduz a formacao acompanha (GET /formacoes/:id/acompanhamento). */
export interface AcompanhamentoFormacao {
  cursistas: number;
  turmas: { id: string; nome: string; vagas: number; inscritos: number }[];
  encontros: EncontroAcompanhamento[];
  proximoEncontro: EncontroAcompanhamento | null;
  /** Encontros que ja aconteceram sem chamada ou com a chamada incompleta. */
  chamadasPendentes: EncontroAcompanhamento[];
  /** null quando a pessoa nao acompanha entregas (sem entrega:read). */
  atividades: (AtividadeFormacao & { enviadas: number; aguardando: number; emAjuste: number; avaliadas: number })[] | null;
}

/** Entrega listada para avaliacao (GET /atividades/:id/entregas). */
export interface EntregaParaAvaliar extends EntregaCursista {
  inscricao: { id: string; user: { nome: string; email: string } };
}

// ---------------------------------------------------------------------------
// Inicio de quem conduz: o que precisa de atencao, em todas as formacoes
// ---------------------------------------------------------------------------

export interface FormacaoRef { id: string; titulo: string }

/** GET /painel/conducao. Cada lista vem null quando a pessoa nao age sobre aquilo. */
export interface PainelConducao {
  /** Encontros de hoje (com ou sem chamada). */
  hoje: (EncontroAcompanhamento & { formacao: FormacaoRef })[] | null;
  /** Proximos encontros depois de hoje (ate 4). */
  proximos: (EncontroAcompanhamento & { formacao: FormacaoRef })[] | null;
  /** Encontros que ja aconteceram sem chamada ou com a chamada incompleta. */
  chamadasPendentes: (EncontroAcompanhamento & { formacao: FormacaoRef })[] | null;
  /** Atividades com entrega aguardando devolutiva. */
  entregas: { atividadeId: string; titulo: string; formacao: FormacaoRef; aguardando: number }[] | null;
  /** Etapas da trilha cujo material aguarda curadoria, por formacao. */
  curadoria: { formacao: FormacaoRef; etapas: number }[] | null;
}

// ---------------------------------------------------------------------------
// Plano formativo do Copiloto (IA-01): o que foi aprovado e por quem
// ---------------------------------------------------------------------------

/** Conteudo do plano proposto pelo Copiloto. */
export interface PlanoFormativoConteudo {
  objetivos: string[];
  resultadosEsperados: string[];
  modulos: { titulo: string; descricao: string; cargaHoraria: number }[];
  metodologias: string[];
  atividadesSugeridas: { titulo: string; descricao: string }[];
  avaliacao: string;
  observacoes?: string;
}

/** Plano aprovado da formacao (GET /ia/formacoes/:id/planos), do mais recente ao mais antigo. */
export interface PlanoAprovado {
  id: string;
  interacaoId: string;
  aprovadoEm: string;
  aprovadoPor: string | null;
  /** Quem aprovou editou o rascunho da IA antes (a auditoria guarda as duas versoes). */
  editado: boolean;
  fontes: { id: string; titulo: string; tipo: string }[];
  provider: string;
  modelo: string;
  promptVersao: string;
  conteudo: PlanoFormativoConteudo;
}

// ---------------------------------------------------------------------------
// Vocabulario unico de status (o mesmo texto em todas as telas)
// ---------------------------------------------------------------------------

export const MATERIAL_STATUS_LABELS: Record<string, string> = {
  APROVADO: 'Aprovado', EM_REVISAO: 'Em revisão', RASCUNHO: 'Rascunho', REJEITADO: 'Recusado',
};

export const ENTREGA_STATUS_LABELS: Record<EntregaStatus, string> = {
  ENVIADA: 'Aguardando devolutiva', EM_AJUSTE: 'Ajuste pedido', AVALIADA: 'Avaliada',
};

export type SituacaoEncontro = 'CANCELADO' | 'HOJE' | 'PREVISTO' | 'CHAMADA_FEITA' | 'CHAMADA_INCOMPLETA' | 'SEM_CHAMADA';

export const SITUACAO_ENCONTRO_LABELS: Record<SituacaoEncontro, string> = {
  CANCELADO: 'Cancelado', HOJE: 'Hoje', PREVISTO: 'Previsto', CHAMADA_FEITA: 'Chamada feita',
  CHAMADA_INCOMPLETA: 'Chamada incompleta', SEM_CHAMADA: 'Sem chamada',
};

/**
 * Situacao de um encontro para quem conduz: a mesma regra no Inicio, em Encontros e na formacao.
 * Chamada com registro mas com cursista sem marca e incompleta: ninguem fica sem presenca em silencio.
 */
export function situacaoEncontro(
  e: { inicio: string | Date; cancelado: boolean; chamadaRegistrada: boolean; semMarca?: number },
  agora: Date,
): SituacaoEncontro {
  if (e.cancelado) return 'CANCELADO';
  if (e.chamadaRegistrada) return (e.semMarca ?? 0) > 0 ? 'CHAMADA_INCOMPLETA' : 'CHAMADA_FEITA';
  const inicio = new Date(e.inicio);
  const mesmoDia = inicio.toDateString() === agora.toDateString();
  if (mesmoDia) return 'HOJE';
  return inicio.getTime() < agora.getTime() ? 'SEM_CHAMADA' : 'PREVISTO';
}

/** Inscricao feita depois do encontro: a pessoa nao estava na turma naquele dia e fica fora da chamada. */
export function inscritoDepois(inscricao: { createdAt: string | Date }, encontro: { inicio: string | Date; fim?: string | Date | null }): boolean {
  return new Date(inscricao.createdAt).getTime() > new Date(encontro.fim ?? encontro.inicio).getTime();
}

/**
 * Cursistas confirmados sem registro de presenca no encontro (a conta da chamada incompleta).
 * Quem se inscreveu depois do encontro nao conta: nao ha presenca a marcar para essa pessoa.
 */
export function contarSemMarca(
  confirmadas: { id: string; createdAt: string | Date }[],
  registros: { inscricaoId: string }[],
  encontro: { inicio: string | Date; fim?: string | Date | null },
): number {
  const marcadas = new Set(registros.map((r) => r.inscricaoId));
  return confirmadas.filter((i) => !marcadas.has(i.id) && !inscritoDepois(i, encontro)).length;
}

/** Encontro que ja comecou e ainda pede chamada: sem nenhuma marca ou com a chamada incompleta. */
export function chamadaPendente(
  e: { inicio: string | Date; cancelado: boolean; chamadaRegistrada: boolean; semMarca?: number },
  agora: Date,
): boolean {
  if (e.cancelado || new Date(e.inicio).getTime() > agora.getTime()) return false;
  return !e.chamadaRegistrada || (e.semMarca ?? 0) > 0;
}
