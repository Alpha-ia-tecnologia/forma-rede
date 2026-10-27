// Modo demonstracao: responde as chamadas da API a partir de dados em memoria,
// sem backend/banco. Ativado por NEXT_PUBLIC_MOCK=1. Nao afeta o modo real.
import {
  ordenarPorPrioridade, permissionsForRole, resumirAcompanhamento, resumirFrequencia,
  type AcompanhamentoFormacao, type AcompanhamentoFrequencia, type AuthUser, type EntregaParaAvaliar, type EntregaStatus,
  type EtapaTrilha, type EventoAssistenteStream, type FrequenciaProfessor, type MaterialTipo, type MinhaFormacao,
  type PainelConducao, type ParticipacaoFormacao, chamadaPendente,
  ETAPA_FLUXO_LABELS, MODELOS_TRILHA, SITUACAO_FREQUENCIA_LABELS, propostaTrilhaDeExemplo, type GerarTrilhaIaDto, type PropostaTrilhaIa, type LinhaRelatorioConclusao, type LinhaRelatorioFrequencia,
  type Planejamento, type PlanoAprovado, type PlanoFormativoConteudo, type Role, type TrilhaFormacao, type TurnoAssistente,
} from '@formarede/contracts';

const delay = () => new Promise((r) => setTimeout(r, 120));

const TENANT = {
  id: 't-sp',
  slug: 'sao-paulo',
  nome: 'Secretaria Municipal de Educação de São Paulo',
  uf: 'SP',
  config: { corPrimaria: '#0E7C6B', corSecundaria: '#0A5546' },
};

const regionais = [
  { id: 'r1', nome: 'Diretoria Regional Centro', codigo: 'DRE-CENTRO', _count: { escolas: 2 } },
];

const escolas: { id: string; nome: string; tipo: string; ativo: boolean; regional: { nome: string } | null }[] = [
  { id: 'e1', nome: 'EMEF Paulo Freire', tipo: 'ESCOLA', ativo: true, regional: { nome: 'Diretoria Regional Centro' } },
  { id: 'e2', nome: 'CEU Polo Formativo Centro', tipo: 'UNIDADE_FORMATIVA', ativo: true, regional: { nome: 'Diretoria Regional Centro' } },
  { id: 'e3', nome: 'EMEF Anísio Teixeira', tipo: 'ESCOLA', ativo: true, regional: { nome: 'Diretoria Regional Centro' } },
];

const formacoes: Record<string, unknown>[] = [
  {
    id: 'f1', titulo: 'Alfabetização na Idade Certa', tema: 'Práticas de leitura e escrita',
    objetivos: 'Fortalecer as práticas de alfabetização nos anos iniciais com foco em fluência leitora.',
    cargaHoraria: 40, modalidade: 'PRESENCIAL', etapaFluxo: 'EXECUCAO', freqMinimaPct: 75,
    _count: { turmas: 1, modulos: 3, atividades: 3 },
    modulos: [
      { id: 'm1', titulo: 'Módulo 1 - Fundamentos', ordem: 1 },
      { id: 'm2', titulo: 'Módulo 2 - Práticas em ação', ordem: 2 },
      { id: 'm3', titulo: 'Módulo 3 - Aplicação e reflexão', ordem: 3 },
    ],
    turmas: [{ id: 't1', nome: 'Turma 2026.1', vagas: 30, _count: { inscricoes: 24, encontros: 4 } }],
    materiais: [
      { id: 'mf1', material: { id: 'mat1', titulo: 'Guia de práticas de leitura em sala', tipo: 'DOCUMENTO', status: 'APROVADO' } },
      { id: 'mf4', material: { id: 'mat4', titulo: 'As escolas matam a criatividade?', tipo: 'VIDEO', status: 'APROVADO' } },
      { id: 'mf5', material: { id: 'mat5', titulo: 'Alfabetizar e letrar: um processo contínuo', tipo: 'PODCAST', status: 'APROVADO' } },
      { id: 'mf6', material: { id: 'mat6', titulo: 'Base Nacional Comum Curricular (BNCC)', tipo: 'DOCUMENTO', status: 'APROVADO' } },
      { id: 'mf7', material: { id: 'mat7', titulo: 'O desafio da alfabetização no Brasil', tipo: 'PODCAST', status: 'EM_REVISAO' } },
    ],
    atividades: [
      { id: 'a1', titulo: 'Plano de aula de leitura compartilhada', descricao: 'Elabore um plano de leitura compartilhada para a sua turma, com antecipação, leitura em voz alta e conversa sobre o texto.', criterios: 'Clareza dos objetivos; adequação à etapa; momentos de inferência.', prazo: '2026-08-15T23:59:00-03:00', pontuacao: 10 },
      { id: 'a2', titulo: 'Diário reflexivo do módulo 1', descricao: 'Registre, em poucas linhas, o que mudou na sua rotina de leitura depois dos dois primeiros encontros.', criterios: null, prazo: null, pontuacao: 10 },
      { id: 'a3', titulo: 'Registro da aplicação em sala', descricao: 'Aplique a atividade de leitura planejada e conte como foi: o que funcionou, o que você mudaria e duas evidências da aprendizagem das crianças (fotos de produções ou falas transcritas).', criterios: 'Descrição da aplicação; duas evidências; reflexão sobre ajustes.', prazo: '2026-11-12T23:59:00-03:00', pontuacao: 10 },
    ],
    transicoes: [
      { id: 'tr1', deEtapa: 'DESENHO', paraEtapa: 'EXECUCAO', decisao: 'APROVADA', justificativa: null, createdAt: '2026-07-01T14:00:00-03:00', decididoPor: 'Ana Gestora (Rede SP)' },
      { id: 'tr2', deEtapa: 'CURADORIA', paraEtapa: 'DESENHO', decisao: 'APROVADA', justificativa: null, createdAt: '2026-06-20T10:00:00-03:00', decididoPor: 'Bianca Curadora' },
    ],
  },
  {
    id: 'f2', titulo: 'BNCC na Prática: Matemática', tema: 'Pensamento computacional',
    objetivos: 'Integrar habilidades da BNCC ao cotidiano da sala de aula.',
    cargaHoraria: 30, modalidade: 'HIBRIDA', etapaFluxo: 'PLANEJAMENTO', freqMinimaPct: 75,
    _count: { turmas: 0, modulos: 0, atividades: 0 },
    modulos: [], turmas: [], materiais: [], atividades: [], transicoes: [],
  },
  {
    id: 'f3', titulo: 'Educação inclusiva na prática', tema: 'Atendimento educacional especializado',
    objetivos: 'Planejar adaptações e acolher estudantes com deficiência na sala comum.',
    cargaHoraria: 20, modalidade: 'VIRTUAL', etapaFluxo: 'CONCLUIDA', freqMinimaPct: 75,
    _count: { turmas: 1, modulos: 2, atividades: 1 },
    modulos: [{ id: 'm31', titulo: 'Módulo 1 - Acolhimento', ordem: 1 }, { id: 'm32', titulo: 'Módulo 2 - Adaptações', ordem: 2 }],
    turmas: [{ id: 't3', nome: 'Turma 2026.0', vagas: 40, _count: { inscricoes: 32, encontros: 4 } }],
    materiais: [],
    atividades: [{ id: 'a31', titulo: 'Plano de adaptação para um estudante', descricao: 'Escolha um estudante da sua turma e descreva as adaptações de uma aula.', criterios: null, prazo: '2026-05-30T23:59:00-03:00', pontuacao: 10 }],
    transicoes: [{ id: 'tr31', deEtapa: 'AVALIACAO', paraEtapa: 'CONCLUIDA', decisao: 'APROVADA', justificativa: null, createdAt: '2026-06-10T10:00:00-03:00', decididoPor: 'Ana Gestora (Rede SP)' }],
  },
];

// Turma 2026.1: 8 encontros previstos. Os 4 primeiros com chamada, o de 14/10 ja
// ocorreu sem chamada (aparece como pendente) e 3 ainda estao por vir.
const turmaT1 = { id: 't1', formacaoId: 'f1', nome: 'Turma 2026.1', formacao: { titulo: 'Alfabetização na Idade Certa' } };
const encontros = [
  { id: 'en1', titulo: 'Encontro 1 - Acolhida e diagnóstico', inicio: '2026-07-15T18:30:00-03:00', local: 'CEU Polo Formativo Centro', status: 'REALIZADO', turma: turmaT1, modulo: { titulo: 'Módulo 1 - Fundamentos' }, _count: { frequencias: 23 } },
  { id: 'en2', titulo: 'Encontro 2 - Leitura compartilhada', inicio: '2026-07-29T18:30:00-03:00', local: 'CEU Polo Formativo Centro', status: 'REALIZADO', turma: turmaT1, modulo: { titulo: 'Módulo 1 - Fundamentos' }, _count: { frequencias: 23 } },
  { id: 'en3', titulo: 'Encontro 3 - Fluência leitora', inicio: '2026-08-12T18:30:00-03:00', local: 'CEU Polo Formativo Centro', status: 'REALIZADO', turma: turmaT1, modulo: { titulo: 'Módulo 2 - Práticas em ação' }, _count: { frequencias: 23 } },
  { id: 'en4', titulo: 'Encontro 4 - Oficina de planejamento', inicio: '2026-08-26T18:30:00-03:00', local: 'CEU Polo Formativo Centro', status: 'REALIZADO', turma: turmaT1, modulo: { titulo: 'Módulo 2 - Práticas em ação' }, _count: { frequencias: 23 } },
  { id: 'en5', titulo: 'Encontro 5 - Análise de evidências', inicio: '2026-10-14T18:30:00-03:00', local: 'CEU Polo Formativo Centro', status: 'AGENDADO', turma: turmaT1, modulo: { titulo: 'Módulo 3 - Aplicação e reflexão' }, _count: { frequencias: 0 } },
  { id: 'en6', titulo: 'Encontro 6 - Devolutivas em pares', inicio: '2026-11-04T18:30:00-03:00', local: 'CEU Polo Formativo Centro', status: 'AGENDADO', turma: turmaT1, modulo: { titulo: 'Módulo 3 - Aplicação e reflexão' }, _count: { frequencias: 0 } },
  { id: 'en7', titulo: 'Encontro 7 - Mostra de práticas', inicio: '2026-11-18T18:30:00-03:00', local: 'CEU Polo Formativo Centro', status: 'AGENDADO', turma: turmaT1, modulo: { titulo: 'Módulo 3 - Aplicação e reflexão' }, _count: { frequencias: 0 } },
  { id: 'en8', titulo: 'Encontro 8 - Encerramento', inicio: '2026-12-02T18:30:00-03:00', local: 'CEU Polo Formativo Centro', status: 'AGENDADO', turma: turmaT1, modulo: null, _count: { frequencias: 0 } },
];

interface MaterialDemo {
  id: string; titulo: string; tipo: string; url: string | null; descricao: string | null;
  autoria: string | null; licenca: string | null; tags: string[]; status: string;
  formacoes: { formacao: { id: string; titulo: string } }[];
  motivoRecusa?: string | null;
}
const NA_F1 = [{ formacao: { id: 'f1', titulo: 'Alfabetização na Idade Certa' } }];
const materiais: MaterialDemo[] = [
  { id: 'mat1', titulo: 'Guia de práticas de leitura em sala', tipo: 'DOCUMENTO', url: null, descricao: 'Rotinas de leitura compartilhada, leitura em voz alta e roda de conversa para os anos iniciais.', autoria: 'Equipe pedagógica SME-SP', licenca: 'CC BY-NC 4.0', tags: ['alfabetizacao'], status: 'APROVADO', formacoes: NA_F1 },
  { id: 'mat2', titulo: 'Vídeo: sequência didática de leitura', tipo: 'VIDEO', url: null, descricao: null, autoria: null, licenca: null, tags: ['video'], status: 'EM_REVISAO', formacoes: [] },
  { id: 'mat3', titulo: 'Apresentação BNCC Matemática', tipo: 'APRESENTACAO', url: null, descricao: null, autoria: 'Rede SP', licenca: 'CC BY 4.0', tags: ['bncc'], status: 'APROVADO', formacoes: [] },
  // Recursos que entraram pela trilha da f1 (tag 'trilha').
  { id: 'mat4', titulo: 'As escolas matam a criatividade?', tipo: 'VIDEO', url: 'https://www.youtube.com/watch?v=iG9CE55wbtY', descricao: null, autoria: 'Sir Ken Robinson (TED)', licenca: 'CC BY-NC-ND 4.0', tags: ['trilha'], status: 'APROVADO', formacoes: NA_F1 },
  { id: 'mat5', titulo: 'Alfabetizar e letrar: um processo contínuo', tipo: 'PODCAST', url: 'https://open.spotify.com/episode/4Ebe8LRwpboK9ljJ8erkPF', descricao: null, autoria: 'Brasil Educação', licenca: null, tags: ['trilha'], status: 'APROVADO', formacoes: NA_F1 },
  { id: 'mat6', titulo: 'Base Nacional Comum Curricular (BNCC)', tipo: 'DOCUMENTO', url: 'https://basenacionalcomum.mec.gov.br/images/BNCC_EI_EF_110518_versaofinal_site.pdf', descricao: null, autoria: 'Ministério da Educação', licenca: null, tags: ['trilha', 'bncc'], status: 'APROVADO', formacoes: NA_F1 },
  { id: 'mat7', titulo: 'O desafio da alfabetização no Brasil', tipo: 'PODCAST', url: 'https://open.spotify.com/episode/1ap9eoo5aL73GnCHYOBaTg', descricao: null, autoria: 'O Assunto (g1)', licenca: null, tags: ['trilha'], status: 'EM_REVISAO', formacoes: NA_F1 },
];

// Trilha formativa da f1. Paula (professora, inscricao i1) ja concluiu as duas primeiras.
interface EtapaDemo {
  /** materialId null: etapa de modelo ainda sem recurso (tipoPrevisto diz o tipo). */
  id: string; formacaoId: string; materialId: string | null; tipoPrevisto?: string | null; recursoSugerido?: string | null; moduloId: string | null; ordem: number;
  titulo: string; orientacao: string | null; duracaoMin: number | null; obrigatoria: boolean;
  /** Outros cursistas que concluiram (alem da pessoa logada). */
  outrosConcluintes: number;
}
const trilhaDemo: EtapaDemo[] = [
  { id: 'et1', formacaoId: 'f1', materialId: 'mat1', moduloId: 'm1', ordem: 1, titulo: 'Guia de práticas de leitura em sala', orientacao: 'Leia antes do primeiro encontro e anote duas práticas que você já usa com a turma.', duracaoMin: 30, obrigatoria: true, outrosConcluintes: 17 },
  { id: 'et2', formacaoId: 'f1', materialId: 'mat4', moduloId: 'm1', ordem: 2, titulo: 'As escolas matam a criatividade?', orientacao: 'Assista e pense: em que momentos da rotina de leitura e escrita a criatividade das crianças aparece, e em quais ela fica de fora?', duracaoMin: 20, obrigatoria: true, outrosConcluintes: 14 },
  { id: 'et3', formacaoId: 'f1', materialId: 'mat5', moduloId: 'm2', ordem: 3, titulo: 'Alfabetizar e letrar: um processo contínuo', orientacao: 'Ouça no trajeto ou no planejamento. Traga para o encontro 3 uma situação em que a leitura de mundo ajudou a leitura da palavra.', duracaoMin: 26, obrigatoria: true, outrosConcluintes: 9 },
  { id: 'et4', formacaoId: 'f1', materialId: 'mat6', moduloId: 'm2', ordem: 4, titulo: 'BNCC: alfabetização nos anos iniciais', orientacao: 'Consulte a parte de Língua Portuguesa do Ensino Fundamental, em especial as habilidades do 1º e do 2º ano, e marque as que sua turma já trabalha.', duracaoMin: 40, obrigatoria: false, outrosConcluintes: 4 },
  { id: 'et5', formacaoId: 'f1', materialId: 'mat7', moduloId: 'm3', ordem: 5, titulo: 'O desafio da alfabetização no Brasil', orientacao: 'Para a reflexão final: o que os dados nacionais dizem sobre a sua escola?', duracaoMin: 27, obrigatoria: true, outrosConcluintes: 0 },
];
const concluidasDemo = new Set(['et1', 'et2']);

/** Quem esta logado no modo demonstracao (mesma chave do lib/api). */
function usuarioDemo(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('formarede.user') ?? 'null') as AuthUser | null; } catch { return null; }
}

function trilhaDe(formacaoId: string): TrilhaFormacao {
  const u = usuarioDemo();
  const editor = !!u && (u.permissions.includes('*') || u.permissions.includes('trilha:editar'));
  const cursista = u?.role === 'PROFESSOR' && formacaoId === 'f1';
  const f = formacoes.find((x) => x.id === formacaoId);
  const modulos = (f?.modulos as { id: string; titulo: string }[] | undefined) ?? [];
  const etapas: EtapaTrilha[] = trilhaDemo
    .filter((e) => e.formacaoId === formacaoId)
    .sort((a, b) => a.ordem - b.ordem)
    .flatMap((e) => {
      const m = e.materialId ? materiais.find((x) => x.id === e.materialId) : undefined;
      if ((e.materialId && !m) || (!editor && m?.status !== 'APROVADO')) return [];
      const mod = modulos.find((x) => x.id === e.moduloId);
      return [{
        id: e.id, ordem: e.ordem, titulo: e.titulo, orientacao: e.orientacao, duracaoMin: e.duracaoMin, obrigatoria: e.obrigatoria,
        modulo: mod ? { id: mod.id, titulo: mod.titulo } : null,
        material: m ? { id: m.id, titulo: m.titulo, tipo: m.tipo as MaterialTipo, url: m.url, descricao: m.descricao, autoria: m.autoria, licenca: m.licenca, status: m.status } : null,
        tipoPrevisto: m ? null : ((e.tipoPrevisto ?? null) as MaterialTipo | null),
        recursoSugerido: m ? null : (e.recursoSugerido ?? null),
        concluida: cursista && concluidasDemo.has(e.id),
        concluintes: editor ? e.outrosConcluintes + (concluidasDemo.has(e.id) ? 1 : 0) : null,
      }];
    });
  const obrigatorias = etapas.filter((e) => e.obrigatoria && e.material?.status === 'APROVADO');
  return {
    formacaoId, podeEditar: editor, inscricaoId: cursista ? 'i1' : null,
    totalCursistas: editor ? (formacaoId === 'f1' ? 24 : 0) : null,
    progresso: cursista ? { concluidas: obrigatorias.filter((e) => e.concluida).length, obrigatorias: obrigatorias.length } : null,
    etapas,
  };
}

function etapaDemo(id: string): EtapaDemo {
  const e = trilhaDemo.find((x) => x.id === id);
  if (!e) throw new Error('Etapa não encontrada.');
  return e;
}

/** Material da etapa: aprovado do acervo ou recurso novo (EM_REVISAO), que entra na colecao da formacao. */
function materialDaTrilha(formacaoId: string, body: Record<string, unknown> | undefined): MaterialDemo {
  const f = formacoes.find((x) => x.id === formacaoId);
  let m: MaterialDemo | undefined;
  if (body?.materialId) {
    m = materiais.find((x) => x.id === body.materialId && x.status === 'APROVADO');
    if (!m) throw new Error('Escolha um material aprovado do acervo.');
  } else {
    const r = body?.recurso as { tipo: string; titulo: string; url: string; autoria?: string; licenca?: string };
    m = { id: 'mat' + (materiais.length + 1), titulo: r.titulo, tipo: r.tipo, url: r.url, descricao: null, autoria: r.autoria || null, licenca: r.licenca || null, tags: ['trilha'], status: 'EM_REVISAO', formacoes: [] };
    materiais.push(m);
  }
  // Entra na colecao da formacao, como no backend (alimenta o copiloto e o assistente).
  if (f && !m.formacoes.some((x) => x.formacao.id === formacaoId)) {
    m.formacoes.push({ formacao: { id: formacaoId, titulo: f.titulo as string } });
    (f.materiais as unknown[]).push({ id: 'mf-' + m.id, material: { id: m.id, titulo: m.titulo, tipo: m.tipo, status: m.status } });
  }
  return m;
}

/** Propostas de trilha geradas nesta sessao, esperando salvar ou descartar. */
const propostasTrilhaDemo = new Map<string, PropostaTrilhaIa & { formacaoId: string }>();

function resequenciar(formacaoId: string) {
  trilhaDemo.filter((e) => e.formacaoId === formacaoId).sort((a, b) => a.ordem - b.ordem).forEach((e, i) => { e.ordem = i + 1; });
}

const avaliacoes = [
  { id: 'av1', titulo: 'Satisfação - Encontro 1', tipo: 'SATISFACAO', anonima: true, formacao: { id: 'f1', titulo: 'Alfabetização na Idade Certa' }, _count: { entradas: 18 } },
  { id: 'av2', titulo: 'Diagnóstico inicial', tipo: 'DIAGNOSTICA', anonima: false, formacao: { id: 'f1', titulo: 'Alfabetização na Idade Certa' }, _count: { entradas: 22 } },
  { id: 'av3', titulo: 'Avaliação final do curso', tipo: 'SATISFACAO', anonima: true, formacao: { id: 'f3', titulo: 'Educação inclusiva na prática' }, _count: { entradas: 29 } },
];
/** Avaliacoes que Paula (professora) ja respondeu. */
const respondidasDemo = new Set(['av2', 'av3']);

const avaliacaoDetalhe = {
  id: 'av1', titulo: 'Satisfação - Encontro 1', anonima: true, formacao: { titulo: 'Alfabetização na Idade Certa' },
  perguntas: [
    { id: 'p1', tipo: 'ESCALA', texto: 'O conteúdo atendeu as suas expectativas?' },
    { id: 'p2', tipo: 'ESCALA', texto: 'A metodologia favoreceu a aprendizagem?' },
    { id: 'p3', tipo: 'TEXTO', texto: 'O que pode melhorar no próximo encontro?' },
  ],
};

const avaliacaoResultados = {
  avaliacao: { id: 'av1', titulo: 'Satisfação - Encontro 1', tipo: 'SATISFACAO', anonima: true },
  totalRespostas: 18,
  resultados: [
    { pergunta: avaliacaoDetalhe.perguntas[0], media: 4.4, n: 18 },
    { pergunta: avaliacaoDetalhe.perguntas[1], media: 4.1, n: 18 },
    { pergunta: avaliacaoDetalhe.perguntas[2], respostas: ['Mais tempo para as oficinas práticas.', 'Trazer exemplos de outras escolas.', 'Materiais impressos antecipados.'], n: 3 },
  ],
};

/** Certificado da f1 (so quando Paula cumprir os requisitos) e o da f3, ja concluida. */
let certificadoDemo: { codigo: string; emitidoEm: string } | null = null;
const CERTIFICADO_F3 = { codigo: 'F3C9A27B51D4', emitidoEm: '2026-06-12T10:00:00-03:00' };

/** Relatorios pela mesma conta da tela de Frequencia (f1) e o fechamento da f3, ja concluida. */
function relFrequenciaDemo(): LinhaRelatorioFrequencia[] {
  return acompanhamentoDemo(new URLSearchParams()).professores.map((p) => ({
    participante: p.professor.nome, email: p.professor.email, formacao: p.formacao.titulo, turma: p.turma.nome,
    presencas: p.presencas, chamadasRegistradas: p.chamadasRegistradas, encontrosPrevistos: p.encontrosPrevistos,
    frequenciaPct: p.frequenciaPct, minimoPct: p.formacao.freqMinimaPct, situacao: p.situacao,
  }));
}
function relConclusaoDemo(): LinhaRelatorioConclusao[] {
  const r = acompanhamentoDemo(new URLSearchParams()).resumo;
  return [
    { formacao: 'Alfabetização na Idade Certa', etapaFluxo: 'EXECUCAO', inscritos: r.professores, certificados: 0, taxaConclusaoPct: 0, frequenciaMediaPct: r.frequenciaMediaPct, minimoPct: 75, abaixoDoMinimo: r.abaixoDoMinimo },
    { formacao: 'BNCC na Prática: Matemática', etapaFluxo: 'PLANEJAMENTO', inscritos: 0, certificados: 0, taxaConclusaoPct: null, frequenciaMediaPct: null, minimoPct: 75, abaixoDoMinimo: 0 },
    { formacao: 'Educação inclusiva na prática', etapaFluxo: 'CONCLUIDA', inscritos: 32, certificados: 26, taxaConclusaoPct: 81, frequenciaMediaPct: 86, minimoPct: 75, abaixoDoMinimo: 4 },
  ];
}

const iaInteracoes = [
  { id: 'ia1', assistente: 'copiloto-planejamento', provider: 'deepseek', modelo: 'deepseek-chat', promptVersao: 'v1', status: 'APROVADA', sinalizada: false, tokensEntrada: 642, tokensSaida: 908, createdAt: '2026-07-04T10:12:00-03:00', decididoEm: '2026-07-04T10:20:00-03:00' },
];

let iaConfig = { iaHabilitada: true, iaProvider: 'deepseek' };

const planoDemo: PlanoFormativoConteudo = {
  objetivos: [
    'Compreender os fundamentos da fluência leitora e sua relação com a alfabetização.',
    'Promover a reflexão sobre a própria prática docente.',
    'Apoiar a aplicação do conteúdo em sala com evidências.',
  ],
  resultadosEsperados: [
    'Professores aplicam ao menos uma estrategia nova em sala.',
    'Registro de evidências de aplicação prática por participante.',
  ],
  modulos: [
    { titulo: 'Conceitos de Alfabetização e Letramento', descricao: 'Bases conceituais e diagnóstico das práticas atuais.', cargaHoraria: 8 },
    { titulo: 'Práticas de Leitura Compartilhada', descricao: 'Oficinas práticas com planejamento aplicavel.', cargaHoraria: 16 },
    { titulo: 'Aplicação e reflexão', descricao: 'Aplicação em sala, evidências e devolutivas.', cargaHoraria: 16 },
  ],
  metodologias: ['Oficinas práticas', 'Estudos de caso', 'Rodas de conversa', 'Mentoria entre pares'],
  atividadesSugeridas: [
    { titulo: 'Plano de aula aplicado', descricao: 'Elaborar e aplicar um plano de aula, registrando evidências.' },
    { titulo: 'Diário reflexivo', descricao: 'Registrar reflexoes após cada encontro.' },
  ],
  avaliacao: 'Avaliação processual: participação nos encontros, entrega das atividades e evidências de aplicação prática validadas pelo coordenador.',
  observacoes: 'Rascunho de demonstracao (modo mock). Rode a API real com DEEPSEEK_API_KEY para gerar com o modelo.',
};

/** Rascunho da f2 (BNCC na Prática: Matemática), para o Copiloto propor algo do tema da formação. */
const planoMatematicaDemo: PlanoFormativoConteudo = {
  objetivos: [
    'Relacionar as habilidades de Números e Álgebra da BNCC às situações-problema usadas em sala.',
    'Planejar sequências que partam do concreto para o registro e a generalização.',
    'Usar o erro do estudante como ponto de partida da intervenção.',
  ],
  resultadosEsperados: [
    'Cada professor aplica uma sequência com material manipulável e registra as estratégias da turma.',
    'Um banco coletivo de situações-problema alinhadas às habilidades do ano.',
  ],
  modulos: [
    { titulo: 'A BNCC de Matemática por dentro', descricao: 'Unidades temáticas, habilidades e progressão entre os anos.', cargaHoraria: 6 },
    { titulo: 'Resolução de problemas com material concreto', descricao: 'Oficinas com material dourado, reta numérica e jogos.', cargaHoraria: 12 },
    { titulo: 'Erro como dado de aprendizagem', descricao: 'Análise de produções dos estudantes e planejamento da intervenção.', cargaHoraria: 12 },
  ],
  metodologias: ['Oficinas práticas', 'Análise de produções de estudantes', 'Estudo de aula em pares'],
  atividadesSugeridas: [
    { titulo: 'Sequência aplicada', descricao: 'Aplicar uma sequência com material concreto e registrar as estratégias da turma.' },
    { titulo: 'Análise de erros', descricao: 'Selecionar três produções e propor a intervenção para cada uma.' },
  ],
  avaliacao: 'Avaliação processual: participação nas oficinas, sequência aplicada com registro das estratégias e análise de erros com a intervenção proposta.',
  observacoes: 'Rascunho de demonstracao (modo mock). Rode a API real com DEEPSEEK_API_KEY para gerar com o modelo.',
};

/** Rascunhos gerados nesta sessao (esperando decisao) e planos aprovados por formacao. */
const rascunhosDemo = new Map<string, Omit<PlanoAprovado, 'aprovadoEm' | 'aprovadoPor' | 'editado'> & { formacaoId: string }>();
const planosAprovadosDemo: (PlanoAprovado & { formacaoId: string })[] = [
  {
    id: 'pl1', formacaoId: 'f1', interacaoId: 'ia1', aprovadoEm: '2026-07-04T10:20:00-03:00', aprovadoPor: 'Carlos Formador', editado: false,
    fontes: [{ id: 'mat1', titulo: 'Guia de práticas de leitura em sala', tipo: 'DOCUMENTO' }],
    provider: 'deepseek', modelo: 'deepseek-chat', promptVersao: 'v1', conteudo: { ...planoDemo, observacoes: undefined },
  },
];

// Professores da Turma 2026.1 e suas chamadas nos encontros 1 a 4:
// 1 presente, 0 falta, J falta justificada; vazio = inscrito depois das chamadas.
const PROFESSORES_DEMO: { nome: string; email: string; escolaId: string | null; chamadas: string }[] = [
  { nome: 'Paula Professora', email: 'prof.sp@formarede.gov.br', escolaId: 'e1', chamadas: '1111' },
  { nome: 'João Educador', email: 'joao@rede.gov.br', escolaId: 'e1', chamadas: '1J11' },
  { nome: 'Maria Docente', email: 'maria@rede.gov.br', escolaId: 'e3', chamadas: '1100' },
  { nome: 'Renata Albuquerque', email: 'renata.albuquerque@rede.gov.br', escolaId: 'e3', chamadas: '0100' },
  { nome: 'Thiago Moreira', email: 'thiago.moreira@rede.gov.br', escolaId: 'e1', chamadas: '0110' },
  { nome: 'Luciana Prado', email: 'luciana.prado@rede.gov.br', escolaId: 'e3', chamadas: '1011' },
  { nome: 'Carla Menezes', email: 'carla.menezes@rede.gov.br', escolaId: 'e1', chamadas: '11J1' },
  { nome: 'Fábio Nascimento', email: 'fabio.nascimento@rede.gov.br', escolaId: 'e3', chamadas: '0111' },
  { nome: 'Juliana Rocha', email: 'juliana.rocha@rede.gov.br', escolaId: 'e1', chamadas: '1101' },
  { nome: 'Sandra Vieira', email: 'sandra.vieira@rede.gov.br', escolaId: null, chamadas: '' },
  { nome: 'Ana Beatriz Costa', email: 'ana.costa@rede.gov.br', escolaId: 'e1', chamadas: '1111' },
  { nome: 'Bruno Carvalho', email: 'bruno.carvalho@rede.gov.br', escolaId: 'e3', chamadas: '1111' },
  { nome: 'Cecília Ramos', email: 'cecilia.ramos@rede.gov.br', escolaId: 'e1', chamadas: '1111' },
  { nome: 'Daniel Ferreira', email: 'daniel.ferreira@rede.gov.br', escolaId: 'e3', chamadas: '1111' },
  { nome: 'Eduarda Lima', email: 'eduarda.lima@rede.gov.br', escolaId: 'e1', chamadas: '1111' },
  { nome: 'Gabriel Souza', email: 'gabriel.souza@rede.gov.br', escolaId: 'e3', chamadas: '1111' },
  { nome: 'Helena Martins', email: 'helena.martins@rede.gov.br', escolaId: 'e1', chamadas: '1111' },
  { nome: 'Igor Almeida', email: 'igor.almeida@rede.gov.br', escolaId: 'e3', chamadas: '1111' },
  { nome: 'Larissa Gomes', email: 'larissa.gomes@rede.gov.br', escolaId: 'e1', chamadas: '1111' },
  { nome: 'Marcos Teixeira', email: 'marcos.teixeira@rede.gov.br', escolaId: 'e3', chamadas: '1111' },
  { nome: 'Natália Barbosa', email: 'natalia.barbosa@rede.gov.br', escolaId: 'e1', chamadas: '1111' },
  { nome: 'Otávio Ribeiro', email: 'otavio.ribeiro@rede.gov.br', escolaId: 'e3', chamadas: '1111' },
  { nome: 'Priscila Duarte', email: 'priscila.duarte@rede.gov.br', escolaId: 'e1', chamadas: '1111' },
  { nome: 'Rafael Pinto', email: 'rafael.pinto@rede.gov.br', escolaId: null, chamadas: '1111' },
];
const JUSTIFICATIVAS_DEMO = ['Atestado médico', 'Conselho de classe na escola'];

/** Chamadas registradas nesta sessao pela tela de chamada (sobrepoem o historico abaixo). */
const registrosDemo = new Map<string, Map<string, { presente: boolean; justificativa: string | null }>>();
/** Marca do professor (indice) num encontro: '1' presente, '0' falta, 'J' justificada, '' sem chamada. */
function marcaDemo(encontroId: string, idx: number): string {
  const reg = registrosDemo.get(encontroId);
  if (reg) {
    const r = reg.get(`i${idx + 1}`);
    return r ? (r.presente ? '1' : r.justificativa ? 'J' : '0') : '';
  }
  const i = encontros.findIndex((e) => e.id === encontroId);
  return PROFESSORES_DEMO[idx]?.chamadas[i] ?? '';
}
const chamadaFeitaDemo = (encontroId: string) => PROFESSORES_DEMO.some((_, idx) => marcaDemo(encontroId, idx) !== '');
const presentesDemo = (encontroId: string) => PROFESSORES_DEMO.filter((_, idx) => marcaDemo(encontroId, idx) === '1').length;
/** Inscrito depois do encontro (historico mais curto que os encontros 1 a 4): fica fora da chamada. */
function inscritoDepoisDemo(encontroId: string, idx: number): boolean {
  const i = encontros.findIndex((e) => e.id === encontroId);
  return i >= 0 && i < 4 && (PROFESSORES_DEMO[idx]?.chamadas.length ?? 0) <= i;
}
/** Cursistas sem marca no encontro (com chamada feita e alguem sem marca, a chamada esta incompleta). */
const semMarcaDemo = (encontroId: string) =>
  PROFESSORES_DEMO.filter((_, idx) => marcaDemo(encontroId, idx) === '' && !inscritoDepoisDemo(encontroId, idx)).length;

// Entregas das atividades da f1. Paula (i1): a1 avaliada, a2 sem envio, a3 com ajuste pedido.
const TEXTOS_ENTREGA = [
  'Plano para o 2º ano: leitura compartilhada de um conto de repetição em três momentos (antecipação pela capa, leitura em voz alta com pausas para inferências e reconto coletivo).',
  'Organizei a leitura em roda com a turma do 1º ano. Antes, conversamos sobre o título; durante, parei em dois pontos para as crianças preverem o que viria.',
  'Planejei a leitura de um poema com apoio de imagens. A turma recitou em coro e depois ilustrou a estrofe preferida.',
  'Registrei a semana: mudei o horário da leitura para o começo da aula e as crianças chegaram mais atentas.',
];
const NOTA_ENTREGA: Record<string, number> = { a1: 9, a2: 8 };
type EntregaDemo = EntregaParaAvaliar & { atividadeId: string };
const entregasDemo: EntregaDemo[] = [];
function entregaDemo(atividadeId: string, idx: number, status: EntregaStatus, enviadaEm: string, extra: Partial<EntregaDemo> = {}) {
  const p = PROFESSORES_DEMO[idx]!;
  entregasDemo.push({
    id: `ent-${atividadeId}-${idx + 1}`, atividadeId, status, enviadaEm,
    conteudo: TEXTOS_ENTREGA[idx % TEXTOS_ENTREGA.length]!, anexoUrl: null,
    nota: status === 'AVALIADA' ? (NOTA_ENTREGA[atividadeId] ?? 8) : null,
    feedback: status === 'AVALIADA' ? 'Plano consistente e bem conectado à rotina da turma.' : null,
    avaliadaEm: status === 'ENVIADA' ? null : '2026-08-20T10:00:00-03:00',
    inscricao: { id: `i${idx + 1}`, user: { nome: p.nome, email: p.email } },
    ...extra,
  });
}
entregaDemo('a1', 0, 'AVALIADA', '2026-08-12T21:10:00-03:00', {
  feedback: 'Plano claro e bem conectado à rotina da turma. Na próxima, registre como as crianças participaram do reconto.',
});
for (const i of [1, 4, 5, 6, 7, 8, 9, 10, 11]) entregaDemo('a1', i, 'AVALIADA', '2026-08-14T20:00:00-03:00');
for (const i of [2, 12, 13]) entregaDemo('a1', i, 'ENVIADA', '2026-08-15T22:30:00-03:00');
entregaDemo('a1', 3, 'EM_AJUSTE', '2026-08-13T19:00:00-03:00', { feedback: 'Faltou indicar em que momento as crianças fazem as inferências. Ajuste e reenvie.' });
entregaDemo('a2', 6, 'AVALIADA', '2026-09-02T20:00:00-03:00');
for (const i of [1, 5, 10, 14]) entregaDemo('a2', i, 'ENVIADA', '2026-09-20T21:00:00-03:00');
entregaDemo('a3', 0, 'EM_AJUSTE', '2026-10-21T20:40:00-03:00', {
  conteudo: 'Apliquei a leitura compartilhada com o 2º ano B. As crianças anteciparam a história pela capa e várias levantaram hipóteses sobre o final. Na próxima vez, faria pausas mais curtas.',
  feedback: 'Bom relato! Faltaram as evidências: anexe ao menos duas produções das crianças ou falas transcritas e reenvie.',
  avaliadaEm: '2026-10-23T09:15:00-03:00',
});
entregaDemo('a3', 10, 'ENVIADA', '2026-10-24T18:20:00-03:00');

const formacaoDemo = (id: string) => formacoes.find((x) => x.id === id);
const atividadesDe = (f: Record<string, unknown>) =>
  (f.atividades as { id: string; titulo: string; descricao?: string | null; criterios?: string | null; prazo: string | null; pontuacao: number }[])
    .map((a) => ({ id: a.id, titulo: a.titulo, descricao: a.descricao ?? null, criterios: a.criterios ?? null, prazo: a.prazo, pontuacao: a.pontuacao }));
const encontroResumo = (e: (typeof encontros)[number]) => ({
  id: e.id, titulo: e.titulo, inicio: new Date(e.inicio).toISOString(), fim: null, local: e.local ?? null, linkVirtual: null, cancelado: e.status === 'CANCELADO',
});

/** Participacao de Paula (professora) na f1, montada como a API monta. */
function participacaoDemo(formacaoId: string): ParticipacaoFormacao | null {
  const u = usuarioDemo();
  const f = formacaoDemo(formacaoId);
  if (u?.role !== 'PROFESSOR' || !f) return null;
  if (formacaoId === 'f3') return participacaoConcluidaDemo();
  if (formacaoId !== 'f1') return null;
  const agora = new Date();
  const min = f.freqMinimaPct as number;
  const resumo = resumirFrequencia(
    encontros.map((e) => ({ id: e.id, titulo: e.titulo, inicio: e.inicio, cancelado: e.status === 'CANCELADO' })),
    encontros.map((e) => ({ encontroId: e.id, m: marcaDemo(e.id, 0) })).filter((r) => r.m !== '')
      .map((r) => ({ encontroId: r.encontroId, presente: r.m === '1', justificativa: r.m === 'J' ? 'Justificada' : null })),
    min, agora,
  );
  const previstos = resumo.encontrosPrevistos;
  const pct = (n: number) => (previstos ? Math.round((n / previstos) * 100) : 0);
  let necessarias = 0;
  while (necessarias < previstos && pct(necessarias) < min) necessarias += 1;
  const marcas = new Map(resumo.historico.map((h) => [h.encontroId, h.marca]));
  const proximo = encontros.find((e) => e.status !== 'CANCELADO' && new Date(e.inicio) >= agora);
  const atividades = atividadesDe(f).map((a) => {
    const e = entregasDemo.find((x) => x.atividadeId === a.id && x.inscricao.id === 'i1');
    return {
      ...a,
      entrega: e ? { id: e.id, status: e.status, conteudo: e.conteudo, anexoUrl: e.anexoUrl, nota: e.nota, feedback: e.feedback, enviadaEm: e.enviadaEm, avaliadaEm: e.avaliadaEm } : null,
    };
  });
  const certificado = certificadoDemo;
  return {
    inscricaoId: 'i1',
    turma: { id: 't1', nome: 'Turma 2026.1' },
    frequencia: {
      presencas: resumo.presencas, encontrosPrevistos: previstos, presencasNecessarias: necessarias,
      emAberto: resumo.historico.filter((h) => h.marca === 'PENDENTE' || h.marca === 'PREVISTO').length, minimoPct: min,
    },
    encontros: encontros.map((e) => ({ ...encontroResumo(e), marca: marcas.get(e.id) ?? 'PREVISTO' })),
    proximoEncontro: proximo ? encontroResumo(proximo) : null,
    atividades,
    avaliacoes: avaliacoes.filter((a) => a.formacao.id === formacaoId)
      .map((a) => ({ id: a.id, titulo: a.titulo, tipo: a.tipo, anonima: a.anonima, respondida: respondidasDemo.has(a.id) })),
    certificado,
    podeEmitirCertificado: !certificado && pct(resumo.presencas) >= min && atividades.every((a) => a.entrega?.status === 'AVALIADA'),
  };
}

/** Participacao de Paula na f3, concluida e certificada. */
function participacaoConcluidaDemo(): ParticipacaoFormacao {
  const datas = [['en31', 'Encontro 1 - Acolher a diferença', '2026-04-08'], ['en32', 'Encontro 2 - Barreiras e acessibilidade', '2026-04-22'],
    ['en33', 'Encontro 3 - Planejar adaptações', '2026-05-06'], ['en34', 'Encontro 4 - Partilha de práticas', '2026-05-20']];
  return {
    inscricaoId: 'i31',
    turma: { id: 't3', nome: 'Turma 2026.0' },
    frequencia: { presencas: 4, encontrosPrevistos: 4, presencasNecessarias: 3, emAberto: 0, minimoPct: 75 },
    encontros: datas.map(([id, titulo, dia]) => ({
      id: id!, titulo: titulo!, inicio: new Date(`${dia}T18:30:00-03:00`).toISOString(), fim: null, local: 'Sala virtual', linkVirtual: null, cancelado: false, marca: 'PRESENTE' as const,
    })),
    proximoEncontro: null,
    atividades: [{
      id: 'a31', titulo: 'Plano de adaptação para um estudante', descricao: 'Escolha um estudante da sua turma e descreva as adaptações de uma aula.',
      criterios: null, prazo: '2026-05-30T23:59:00-03:00', pontuacao: 10,
      entrega: { id: 'ent-a31-1', status: 'AVALIADA', conteudo: 'Adaptei a leitura com pranchas de comunicação e tempo ampliado para o Lucas.', anexoUrl: null, nota: 10, feedback: 'Plano cuidadoso e possível de aplicar amanhã.', enviadaEm: '2026-05-28T20:00:00-03:00', avaliadaEm: '2026-06-02T09:00:00-03:00' },
    }],
    certificado: CERTIFICADO_F3,
    podeEmitirCertificado: false,
    avaliacoes: avaliacoes.filter((a) => a.formacao.id === 'f3')
      .map((a) => ({ id: a.id, titulo: a.titulo, tipo: a.tipo, anonima: a.anonima, respondida: respondidasDemo.has(a.id) })),
  };
}

/** Minhas formacoes de Paula: a mesma participacao da pagina da formacao. */
function minhasFormacoesDemo(): MinhaFormacao[] {
  return ['f1', 'f3'].flatMap((id) => {
    const part = participacaoDemo(id);
    const f = formacaoDemo(id);
    if (!part || !f) return [];
    return [{ ...part, formacao: { id, titulo: f.titulo as string, cargaHoraria: f.cargaHoraria as number, modalidade: f.modalidade as string, etapaFluxo: f.etapaFluxo as MinhaFormacao['formacao']['etapaFluxo'], freqMinimaPct: f.freqMinimaPct as number } }];
  });
}

/** Inicio de quem conduz: o que precisa de atencao em todas as formacoes (como a API). */
function painelDemo(): PainelConducao {
  const u = usuarioDemo();
  const tem = (perm: string) => !!u && (u.permissions.includes('*') || u.permissions.includes(perm));
  if (!['trilha:editar', 'frequencia:registrar', 'entrega:read', 'inscricao:read', 'formacao:update'].some(tem)) {
    throw new Error('Este painel é de quem conduz ou acompanha formações.');
  }
  const agora = new Date();
  const f1 = { id: 'f1', titulo: 'Alfabetização na Idade Certa' };
  const lista = encontros.map((e) => ({
    ...encontroResumo(e), turma: { id: 't1', nome: 'Turma 2026.1' }, formacao: f1,
    chamadaRegistrada: chamadaFeitaDemo(e.id), presentes: presentesDemo(e.id), semMarca: semMarcaDemo(e.id),
  }));
  const mesmoDia = (iso: string) => new Date(iso).toDateString() === agora.toDateString();
  const veEncontros = tem('frequencia:registrar');
  return {
    hoje: veEncontros ? lista.filter((e) => !e.cancelado && mesmoDia(e.inicio)) : null,
    proximos: veEncontros ? lista.filter((e) => !e.cancelado && !mesmoDia(e.inicio) && new Date(e.inicio) > agora).slice(0, 4) : null,
    chamadasPendentes: veEncontros ? lista.filter((e) => !mesmoDia(e.inicio) && chamadaPendente(e, agora)) : null,
    entregas: tem('entrega:read')
      ? atividadesDe(formacaoDemo('f1')!).map((a) => ({ atividadeId: a.id, titulo: a.titulo, formacao: f1, aguardando: entregasDemo.filter((x) => x.atividadeId === a.id && x.status === 'ENVIADA').length }))
        .filter((x) => x.aguardando > 0)
      : null,
    curadoria: tem('trilha:editar')
      ? (() => {
        const n = trilhaDemo.filter((e) => e.formacaoId === 'f1' && materiais.find((m) => m.id === e.materialId)?.status === 'EM_REVISAO').length;
        return n ? [{ formacao: f1, etapas: n }] : [];
      })()
      : null,
  };
}

/** Painel de quem conduz a f1 (turma, encontros com a chamada, fila de entregas). */
function conducaoDemo(formacaoId: string): AcompanhamentoFormacao {
  const u = usuarioDemo();
  const tem = (p: string) => !!u && (u.permissions.includes('*') || u.permissions.includes(p));
  if (!['trilha:editar', 'frequencia:registrar', 'entrega:read', 'inscricao:read', 'formacao:update'].some(tem)) {
    throw new Error('Este painel é de quem conduz ou acompanha a formação.');
  }
  const f = formacaoDemo(formacaoId);
  if (!f || formacaoId !== 'f1') {
    return { cursistas: 0, turmas: [], encontros: [], proximoEncontro: null, chamadasPendentes: [], atividades: f && tem('entrega:read') ? atividadesDe(f).map((a) => ({ ...a, enviadas: 0, aguardando: 0, emAjuste: 0, avaliadas: 0 })) : null };
  }
  const agora = Date.now();
  const lista = encontros.map((e) => {
    return { ...encontroResumo(e), turma: { id: 't1', nome: 'Turma 2026.1' }, chamadaRegistrada: chamadaFeitaDemo(e.id), presentes: presentesDemo(e.id), semMarca: semMarcaDemo(e.id) };
  });
  return {
    cursistas: PROFESSORES_DEMO.length,
    turmas: [{ id: 't1', nome: 'Turma 2026.1', vagas: 30, inscritos: PROFESSORES_DEMO.length }],
    encontros: lista,
    proximoEncontro: lista.find((e) => !e.cancelado && new Date(e.inicio).getTime() >= agora) ?? null,
    chamadasPendentes: lista.filter((e) => chamadaPendente(e, new Date(agora))),
    atividades: tem('entrega:read')
      ? atividadesDe(f).map((a) => {
        const es = entregasDemo.filter((e) => e.atividadeId === a.id);
        const conta = (st: EntregaStatus) => es.filter((e) => e.status === st).length;
        return { ...a, enviadas: es.length, aguardando: conta('ENVIADA'), emAjuste: conta('EM_AJUSTE'), avaliadas: conta('AVALIADA') };
      })
      : null,
  };
}

function acompanhamentoDemo(query: URLSearchParams): AcompanhamentoFrequencia {
  const agora = new Date();
  const formacao = { id: 'f1', titulo: 'Alfabetização na Idade Certa', freqMinimaPct: 75 };
  const turma = { id: 't1', nome: 'Turma 2026.1' };
  const base = encontros.map((e) => ({ id: e.id, titulo: e.titulo, inicio: e.inicio, cancelado: e.status === 'CANCELADO' }));
  const escolaDe = (id: string | null) => {
    const e = escolas.find((x) => x.id === id);
    return e ? { id: e.id, nome: e.nome } : null;
  };

  const todos: FrequenciaProfessor[] = PROFESSORES_DEMO.map((p, idx) => ({
    inscricaoId: `i${idx + 1}`,
    professor: { id: `u-prof-${idx + 1}`, nome: p.nome, email: p.email },
    escola: escolaDe(p.escolaId),
    formacao,
    turma,
    ...resumirFrequencia(
      base,
      encontros.map((e) => ({ encontroId: e.id, c: marcaDemo(e.id, idx) })).filter((r) => r.c !== '').map((r) => ({
        encontroId: r.encontroId,
        presente: r.c === '1',
        justificativa: r.c === 'J' ? JUSTIFICATIVAS_DEMO[idx % JUSTIFICATIVAS_DEMO.length]! : null,
      })),
      formacao.freqMinimaPct,
      agora,
    ),
  }));

  const recorte = todos.filter((p) =>
    (!query.get('formacaoId') || p.formacao.id === query.get('formacaoId'))
    && (!query.get('turmaId') || p.turma.id === query.get('turmaId'))
    && (!query.get('escolaId') || p.escola?.id === query.get('escolaId')));
  const comChamada = new Set(encontros.filter((e) => chamadaFeitaDemo(e.id)).map((e) => e.id));
  const ocorridos = recorte.length ? encontros.filter((e) => e.status !== 'CANCELADO' && new Date(e.inicio) <= agora) : [];

  return {
    geradoEm: agora.toISOString(),
    resumo: { ...resumirAcompanhamento(recorte), encontrosRealizados: ocorridos.filter((e) => comChamada.has(e.id)).length },
    chamadasPendentes: ocorridos.filter((e) => semMarcaDemo(e.id) > 0).map((e) => ({
      encontroId: e.id, titulo: e.titulo, inicio: new Date(e.inicio).toISOString(), turma: e.turma.nome, formacao: e.turma.formacao.titulo,
      semMarca: comChamada.has(e.id) ? semMarcaDemo(e.id) : null,
    })),
    professores: ordenarPorPrioridade(recorte),
    opcoes: {
      formacoes: [{ id: formacao.id, titulo: formacao.titulo }],
      turmas: [{ id: turma.id, nome: turma.nome, formacaoId: formacao.id }],
      escolas: [...new Map(todos.flatMap((p) => (p.escola ? [[p.escola.id, p.escola]] as const : []))).values()]
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    },
  };
}

// ----- Assistente pedagogico (demonstracao: respostas simuladas, sem chamar o modelo) -----
interface ConversaDemo {
  id: string; titulo: string; formacao: { id: string; titulo: string } | null; atualizadaEm: string; turnos: TurnoAssistente[];
}
const conversasDemo: ConversaDemo[] = [];
const resumoConversa = (c: ConversaDemo) => ({ id: c.id, titulo: c.titulo, formacao: c.formacao, turnos: c.turnos.length, atualizadaEm: c.atualizadaEm });
const tituloConversa = (p: string) => { const t = p.replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 57).trimEnd()}...` : t; };

const PLANO_DEMO: Planejamento = {
  tipo: 'PLANO_DE_AULA',
  titulo: 'Leitura compartilhada de parlenda: ajustar o falado ao escrito',
  publico: '2º ano do Ensino Fundamental, 25 estudantes',
  duracao: '1 aula de 50 minutos',
  objetivos: [
    'Antecipar sentidos do texto a partir do título e de palavras conhecidas.',
    'Localizar palavras no texto usando pistas (letra inicial, tamanho, repetições).',
    'Ajustar o que se recita ao que está escrito, verso a verso.',
  ],
  etapas: [
    { titulo: 'Roda e antecipação', duracao: '8 min', descricao: 'Recite a parlenda com a turma e pergunte o que esperam encontrar escrito no cartaz.' },
    { titulo: 'Primeira leitura pelo professor', duracao: '7 min', descricao: 'Leia apontando cada verso; as crianças acompanham com o dedo no ar.' },
    { titulo: 'Leitura conjunta verso a verso', duracao: '10 min', descricao: 'A turma lê junto; pare em palavras-chave e pergunte como sabem onde está escrito.' },
    { titulo: 'Onde está escrito?', duracao: '12 min', descricao: 'Peça que localizem 4 a 6 palavras e expliquem a pista usada; registre as pistas no cartaz.' },
    { titulo: 'Ordenar versos em duplas', duracao: '10 min', descricao: 'Duplas recebem os versos recortados e montam a parlenda, conferindo com o cartaz.' },
    { titulo: 'Fechamento', duracao: '3 min', descricao: 'Recitação final e retomada das pistas que mais ajudaram.' },
  ],
  recursos: ['Cartaz com a parlenda em letra bastão', 'Versos recortados (1 jogo por dupla)', 'Marcadores coloridos'],
  avaliacao: 'Observe quais pistas cada criança usa para localizar palavras e anote em uma lista de acompanhamento da turma.',
  adaptacoes: [
    'Cartaz com fonte ampliada e alto contraste para quem tem baixa visão.',
    'Versos com imagens de apoio para quem ainda não se apoia nas letras.',
    'Duplas planejadas: quem lê com mais autonomia junto de quem precisa de apoio.',
  ],
  fontes: ['Guia de práticas de leitura em sala'],
  observacoes: 'Escolha uma parlenda que a turma já saiba de cor.',
};

function respostaDemo(pergunta: string): { texto: string; planejamento: Planejamento | null } {
  const aviso = '\n\n_Resposta de demonstração: no modo real, o Claude Opus 5.5 responde a partir dos dados da sua rede._';
  if (/plan|aula|roteiro|sequ[eê]ncia/i.test(pergunta)) {
    return {
      planejamento: PLANO_DEMO,
      texto: 'Montei o plano no cartão abaixo para você revisar e adaptar.\n\n**Por que estas escolhas**\n- **Parlenda conhecida:** a turma já sabe o texto de cor, então consegue ajustar o falado ao escrito mesmo antes de ler com autonomia.\n- **Modelo antes da autonomia:** você mostra como usar as pistas com a turma toda; depois as duplas aplicam ao ordenar os versos.\n- **Avaliação por observação:** o registro das pistas já serve para a atividade de aplicação da formação.' + aviso,
    };
  }
  return {
    planejamento: null,
    texto: 'Boa pergunta. Um caminho que costuma funcionar:\n\n1. **Comece pequeno:** aplique a ideia em um momento curto da aula (10 a 15 minutos) antes de levar para a aula inteira.\n2. **Combine o objetivo com a turma:** diga em uma frase o que vão aprender e como vão perceber que aprenderam.\n3. **Registre evidências:** anote duas ou três falas ou produções das crianças; elas ajudam na devolutiva do formador.\n\nSe me disser a etapa, o ano e o tempo que tem, adapto para a sua turma.' + aviso,
  };
}

/** Streaming simulado: mesmos eventos da API real (texto, ferramentas, planejamento, fim). */
export async function mockStream<E>(path: string, data: unknown, onEvento: (e: E) => void, signal?: AbortSignal): Promise<void> {
  const m = path.match(/^\/assistente\/conversas\/([^/]+)\/mensagens$/);
  if (!m) throw new Error('Rota de streaming desconhecida no modo demonstração.');
  const conversa = conversasDemo.find((c) => c.id === m[1]);
  if (!conversa) throw new Error('Conversa não encontrada.');
  const pergunta = String((data as { texto?: string }).texto ?? '').trim();
  const emitir = (e: EventoAssistenteStream) => onEvento(e as unknown as E);
  const pausa = (ms: number) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Cancelado', 'AbortError')); }, { once: true });
  });

  const { texto, planejamento } = respostaDemo(pergunta);
  const abertura = 'Vou consultar a formação e os materiais aprovados da rede.';
  const fontes = [{ id: 'mat1', titulo: 'Guia de práticas de leitura em sala', tipo: 'DOCUMENTO' }];
  emitir({ tipo: 'texto', delta: abertura });
  await pausa(500);
  emitir({ tipo: 'ferramenta', nome: 'buscar_materiais_aprovados', rotulo: 'Buscando materiais aprovados da rede', estado: 'inicio' });
  await pausa(900);
  emitir({ tipo: 'ferramenta', nome: 'buscar_materiais_aprovados', rotulo: 'Buscando materiais aprovados da rede', estado: 'fim' });
  if (planejamento) {
    emitir({ tipo: 'ferramenta', nome: 'apresentar_planejamento', rotulo: 'Montando o cartão do planejamento', estado: 'inicio' });
    await pausa(1100);
    emitir({ tipo: 'planejamento', planejamento });
    emitir({ tipo: 'ferramenta', nome: 'apresentar_planejamento', rotulo: 'Montando o cartão do planejamento', estado: 'fim' });
  }
  emitir({ tipo: 'texto', delta: '\n\n' });
  for (const pedaco of texto.split(/(\s+)/)) {
    emitir({ tipo: 'texto', delta: pedaco });
    await pausa(14);
  }
  const turno: TurnoAssistente = {
    id: `turno-${conversa.turnos.length + 1}-${conversa.id}`,
    pergunta,
    resposta: `${abertura}\n\n${texto}`,
    planejamentos: planejamento ? [planejamento] : [],
    fontes,
    interacaoId: `ia-demo-${Date.now()}`,
    criadoEm: new Date().toISOString(),
  };
  conversa.turnos.push(turno);
  if (conversa.titulo === 'Nova conversa') conversa.titulo = tituloConversa(pergunta);
  conversa.atualizadaEm = turno.criadoEm;
  emitir({ tipo: 'fim', turno });
}

function roleFromEmail(email: string): Role {
  const e = email.toLowerCase();
  if (e.includes('super')) return 'SUPERADMIN';
  if (e.includes('prof')) return 'PROFESSOR';
  if (e.includes('formador')) return 'FORMADOR';
  if (e.includes('curador')) return 'CURADOR';
  return 'ADMIN_REDE';
}

function buildUser(email: string): AuthUser {
  const role = roleFromEmail(email);
  const nome =
    role === 'SUPERADMIN' ? 'Super Administrador'
      : role === 'PROFESSOR' ? 'Paula Professora'
      : role === 'FORMADOR' ? 'Carlos Formador'
      : role === 'CURADOR' ? 'Bianca Curadora'
      : 'Ana Gestora (Rede SP)';
  return { id: 'u-' + role, email, nome, tenantId: TENANT.id, tenantSlug: TENANT.slug, role, permissions: permissionsForRole(role) };
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n');
}

const match = (p: string, re: RegExp) => re.test(p);

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await delay();
  const method = init?.method ?? 'GET';
  const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
  const p = path.split('?')[0] as string;
  const as = <U>(v: U) => v as unknown as T;

  // ----- Autenticacao -----
  if (p === '/auth/login' && method === 'POST') {
    const user = buildUser((body?.email as string) ?? 'admin.sp@formarede.gov.br');
    return as({ accessToken: 'mock-token', user, tenants: [{ slug: TENANT.slug, nome: TENANT.nome, role: user.role }] });
  }

  // ----- Organizacao -----
  if (p === '/tenants/current') return as(TENANT);
  if (p === '/dashboard') {
    return as({
      escolas: escolas.length, regionais: regionais.length, formacoes: formacoes.length, turmas: 1,
      pendencias: { formacoesAvaliacao: 1, entregasAvaliar: 3, encontrosHoje: 1, planosIa: 1 },
      resultados: { frequenciaMedia: 78, certificadosEmitidos: 26 },
      analytics: {
        kpis: { professoresAtivos: 24, formacoesAtivas: 1, horasOfertadas: 70, taxaConclusao: 46, satisfacaoMedia: 4.3 },
        // Contados dos mesmos dados das outras telas, para os numeros baterem.
        formacoesPorModalidade: ['PRESENCIAL', 'HIBRIDA', 'VIRTUAL'].map((chave) => ({ chave, n: formacoes.filter((f) => f.modalidade === chave).length })),
        materiaisPorStatus: ['APROVADO', 'EM_REVISAO', 'RASCUNHO', 'REJEITADO'].map((chave) => ({ chave, n: materiais.filter((m) => m.status === chave).length })),
        entregasPorStatus: (['ENVIADA', 'EM_AJUSTE', 'AVALIADA'] as const).map((chave) => ({ chave, n: entregasDemo.filter((e) => e.status === chave).length })),
        inscritosPorStatus: [{ chave: 'CONFIRMADA', n: 16 }, { chave: 'CONCLUIDA', n: 8 }],
        frequenciaFaixas: [{ chave: 'RISCO', n: 3 }, { chave: 'MEDIO', n: 6 }, { chave: 'ALTO', n: 15 }],
        ia: { total: 12, aprovadas: 9, rejeitadas: 2, sinalizadas: 1 },
        satisfacaoPorPergunta: [
          { pergunta: 'O conteúdo atendeu às suas expectativas?', media: 4.4, n: 18 },
          { pergunta: 'A metodologia favoreceu a aprendizagem?', media: 4.1, n: 18 },
          { pergunta: 'Você aplicaria o que aprendeu em sala?', media: 4.6, n: 18 },
        ],
        topFormacoes: [
          { id: 'f1', titulo: 'Alfabetização na Idade Certa', etapaFluxo: 'EXECUCAO', modalidade: 'PRESENCIAL', cargaHoraria: 40, inscritos: 24 },
          { id: 'f2', titulo: 'BNCC na Prática: Matemática', etapaFluxo: 'PLANEJAMENTO', modalidade: 'HIBRIDA', cargaHoraria: 30, inscritos: 0 },
        ],
      },
    });
  }
  if (p === '/tenants') {
    return as([
      { id: TENANT.id, nome: TENANT.nome, uf: TENANT.uf, slug: TENANT.slug, config: TENANT.config, _count: { escolas: escolas.length, formacoes: formacoes.length } },
      { id: 't-rec', nome: 'Secretaria de Educação de Recife', uf: 'PE', slug: 'recife', config: { corPrimaria: '#8a3ffc' }, _count: { escolas: 12, formacoes: 5 } },
      { id: 't-cur', nome: 'Secretaria de Educação de Curitiba', uf: 'PR', slug: 'curitiba', config: { corPrimaria: '#0f62fe' }, _count: { escolas: 8, formacoes: 3 } },
    ]);
  }
  if (p === '/regionais' && method === 'GET') return as(regionais);
  if (p === '/regionais' && method === 'POST') {
    const n = { id: 'r' + (regionais.length + 1), nome: body?.nome as string, codigo: (body?.codigo as string) ?? null, _count: { escolas: 0 } };
    regionais.push(n);
    return as(n);
  }
  if (p === '/escolas' && method === 'GET') return as(escolas);
  if (p === '/escolas' && method === 'POST') {
    const n = { id: 'e' + (escolas.length + 1), nome: body?.nome as string, tipo: (body?.tipo as string) ?? 'ESCOLA', ativo: true, regional: null };
    escolas.push(n);
    return as(n);
  }
  if (match(p, /^\/escolas\/[^/]+$/) && method === 'DELETE') {
    const id = p.split('/')[2];
    const e = escolas.find((x) => x.id === id);
    if (e) e.ativo = false;
    return as(e ?? {});
  }

  // ----- Formações -----
  if (p === '/formacoes' && method === 'GET') return as(formacoes);
  if (p === '/formacoes' && method === 'POST') {
    const n = {
      id: 'f' + (formacoes.length + 1),
      titulo: body?.titulo as string,
      tema: (body?.tema as string) ?? null,
      subtema: (body?.subtema as string) ?? null,
      objetivos: (body?.objetivos as string) ?? null,
      publicoAlvo: (body?.publicoAlvo as string) ?? null,
      cargaHoraria: (body?.cargaHoraria as number) ?? 0,
      modalidade: (body?.modalidade as string) ?? 'PRESENCIAL',
      etapaFluxo: 'PLANEJAMENTO',
      freqMinimaPct: (body?.freqMinimaPct as number) ?? 75,
      _count: { turmas: 0, modulos: 0, atividades: 0 },
      modulos: [], turmas: [], materiais: [], atividades: [], transicoes: [],
    };
    formacoes.push(n);
    return as(n);
  }
  const fDetail = p.match(/^\/formacoes\/([^/]+)$/);
  // Copia: a tela recarrega o detalhe depois de mexer na trilha e precisa de um objeto novo.
  if (fDetail && method === 'GET') return as(structuredClone(formacoes.find((x) => x.id === fDetail[1]) ?? formacoes[0]));
  if (match(p, /^\/formacoes\/[^/]+\/transicao$/)) {
    const id = p.split('/')[2];
    const f = formacoes.find((x) => x.id === id);
    if (f) {
      const ordem = ['PLANEJAMENTO', 'CURADORIA', 'DESENHO', 'EXECUCAO', 'AVALIACAO', 'CONCLUIDA'];
      const atual = f.etapaFluxo as string;
      const d = body?.decisao as string;
      const idx = ordem.indexOf(atual);
      f.etapaFluxo = d === 'CANCELADA' ? 'CANCELADA' : d === 'DEVOLVIDA' ? ordem[Math.max(0, idx - 1)] : ordem[Math.min(ordem.length - 1, idx + 1)];
    }
    return as(f ?? {});
  }
  const fSub = p.match(/^\/formacoes\/([^/]+)\/(modulos|turmas|atividades|avaliacoes)$/);
  if (fSub) {
    // Persiste modulos/turmas criados para a demo refletir o assistente de criacao.
    const f = formacoes.find((x) => x.id === fSub[1]);
    if (f && fSub[2] === 'modulos') {
      const arr = f.modulos as { id: string; titulo: string; ordem: number }[];
      arr.push({ id: `m${arr.length + 1}-${f.id}`, titulo: (body?.titulo as string) ?? 'Módulo', ordem: (body?.ordem as number) ?? arr.length + 1 });
      (f._count as { modulos: number }).modulos = arr.length;
    }
    if (f && fSub[2] === 'atividades' && method === 'POST') {
      const arr = f.atividades as Record<string, unknown>[];
      const n = { id: `a${arr.length + 1}-${f.id}`, titulo: body?.titulo as string, descricao: (body?.descricao as string) ?? null, criterios: (body?.criterios as string) ?? null, prazo: (body?.prazo as string) ?? null, pontuacao: (body?.pontuacao as number) ?? 10 };
      arr.push(n);
      (f._count as { atividades: number }).atividades = arr.length;
      return as(n);
    }
    if (f && fSub[2] === 'turmas') {
      const arr = f.turmas as { id: string; nome: string; vagas: number; _count: { inscricoes: number; encontros: number } }[];
      arr.push({ id: `t${arr.length + 1}-${f.id}`, nome: (body?.nome as string) ?? 'Turma', vagas: (body?.vagas as number) ?? 0, _count: { inscricoes: 0, encontros: 0 } });
      (f._count as { turmas: number }).turmas = arr.length;
    }
    return as({ ok: true });
  }

  // ----- Encontros -----
  if (p === '/encontros' && method === 'GET') {
    return as(encontros.map((e) => ({ ...e, semMarca: semMarcaDemo(e.id), _count: { frequencias: PROFESSORES_DEMO.filter((_, idx) => marcaDemo(e.id, idx) !== '').length } })));
  }
  if (p === '/encontros' && method === 'POST') {
    const n = {
      id: `en${encontros.length + 1}-${Date.now()}`, titulo: body?.titulo as string, inicio: body?.inicio as string,
      local: (body?.local as string) || 'A definir', status: 'AGENDADO', turma: turmaT1, modulo: null, _count: { frequencias: 0 },
    };
    encontros.push(n as (typeof encontros)[number]);
    encontros.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return as(n);
  }
  const chamadaEnc = p.match(/^\/encontros\/([^/]+)\/chamada$/);
  if (chamadaEnc) {
    const id = chamadaEnc[1] as string;
    return as(PROFESSORES_DEMO.map((pr, idx) => {
      const m = marcaDemo(id, idx);
      const reg = registrosDemo.get(id)?.get(`i${idx + 1}`);
      return {
        inscricaoId: `i${idx + 1}`, participante: { id: `u-prof-${idx + 1}`, nome: pr.nome, email: pr.email },
        escola: escolas.find((e) => e.id === pr.escolaId)?.nome ?? null,
        presente: m === '' ? null : m === '1',
        justificativa: reg?.justificativa ?? (m === 'J' ? JUSTIFICATIVAS_DEMO[idx % JUSTIFICATIVAS_DEMO.length]! : null),
        inscritoDepois: inscritoDepoisDemo(id, idx),
      };
    }));
  }
  const freqEnc = p.match(/^\/encontros\/([^/]+)\/frequencia$/);
  if (freqEnc && method === 'POST') {
    const registros = (body?.registros as { inscricaoId: string; presente: boolean; justificativa?: string }[]) ?? [];
    const atual = registrosDemo.get(freqEnc[1] as string) ?? new Map();
    for (const r of registros) atual.set(r.inscricaoId, { presente: r.presente, justificativa: r.justificativa ?? null });
    registrosDemo.set(freqEnc[1] as string, atual);
    return as({ registrados: registros.length });
  }
  const encDet = p.match(/^\/encontros\/([^/]+)$/);
  if (encDet && method === 'GET') {
    const e = encontros.find((x) => x.id === encDet[1]);
    if (!e) throw new Error('Encontro não encontrado.');
    return as({ ...e, turma: { id: 't1', nome: 'Turma 2026.1', formacao: { id: 'f1', titulo: 'Alfabetização na Idade Certa' } }, _count: { frequencias: PROFESSORES_DEMO.filter((_, idx) => marcaDemo(e.id, idx) !== '').length } });
  }

  // ----- Inicio de quem conduz -----
  if (p === '/painel/conducao') return as(painelDemo());

  // ----- Acompanhamento de frequencia -----
  if (p === '/frequencia/professores') return as(acompanhamentoDemo(new URLSearchParams(path.split('?')[1] ?? '')));

  // ----- Materiais -----
  if (p === '/materiais' && method === 'GET') return as(materiais);
  if (p === '/materiais' && method === 'POST') {
    const n: MaterialDemo = { id: 'mat' + (materiais.length + 1), titulo: body?.titulo as string, tipo: (body?.tipo as string) ?? 'DOCUMENTO', url: (body?.url as string) ?? null, descricao: (body?.descricao as string) ?? null, autoria: (body?.autoria as string) ?? null, licenca: (body?.licenca as string) ?? null, tags: [], status: 'EM_REVISAO', formacoes: [] };
    materiais.push(n);
    return as(n);
  }
  if (match(p, /^\/materiais\/[^/]+\/decisao$/)) {
    const id = p.split('/')[2];
    const m = materiais.find((x) => x.id === id);
    if (m) {
      if (!body?.aprovar && ((body?.motivo as string | undefined)?.trim().length ?? 0) < 3) {
        throw new Error('Diga em poucas palavras por que o material foi recusado.');
      }
      m.status = body?.aprovar ? 'APROVADO' : 'REJEITADO';
      m.motivoRecusa = body?.aprovar ? null : (body?.motivo as string).trim();
      for (const f of formacoes) {
        for (const mf of f.materiais as { material: { id: string; status: string } }[]) if (mf.material.id === id) mf.material.status = m.status;
      }
    }
    return as(m ?? {});
  }
  if (match(p, /^\/materiais\/[^/]+\/vincular$/)) return as({ ok: true });

  // ----- Pagina da formacao: participacao do cursista e painel de quem conduz -----
  const partF = p.match(/^\/formacoes\/([^/]+)\/minha-participacao$/);
  if (partF && method === 'GET') return as(participacaoDemo(partF[1] as string));
  const condF = p.match(/^\/formacoes\/([^/]+)\/acompanhamento$/);
  if (condF && method === 'GET') return as(conducaoDemo(condF[1] as string));
  const entregasAt = p.match(/^\/atividades\/([^/]+)\/entregas$/);
  if (entregasAt && method === 'GET') {
    const ordem: Record<EntregaStatus, number> = { ENVIADA: 0, EM_AJUSTE: 1, AVALIADA: 2 };
    return as(entregasDemo.filter((e) => e.atividadeId === entregasAt[1]).sort((a, b) => ordem[a.status] - ordem[b.status] || a.enviadaEm.localeCompare(b.enviadaEm)));
  }
  const enviarAt = p.match(/^\/atividades\/([^/]+)\/entrega$/);
  if (enviarAt && method === 'POST') {
    const atividadeId = enviarAt[1] as string;
    const agora = new Date().toISOString();
    const atual = entregasDemo.find((e) => e.atividadeId === atividadeId && e.inscricao.id === 'i1');
    if (atual) Object.assign(atual, { conteudo: body?.conteudo as string, anexoUrl: (body?.anexoUrl as string) ?? null, status: 'ENVIADA', enviadaEm: agora });
    else entregaDemo(atividadeId, 0, 'ENVIADA', agora, { conteudo: body?.conteudo as string, anexoUrl: (body?.anexoUrl as string) ?? null });
    return as(entregasDemo.find((e) => e.atividadeId === atividadeId && e.inscricao.id === 'i1'));
  }
  const avaliarEnt = p.match(/^\/entregas\/([^/]+)\/avaliacao$/);
  if (avaliarEnt && method === 'POST') {
    const e = entregasDemo.find((x) => x.id === avaliarEnt[1]);
    if (!e) throw new Error('Entrega não encontrada.');
    const ajuste = !!body?.solicitarAjuste;
    Object.assign(e, { status: ajuste ? 'EM_AJUSTE' : 'AVALIADA', nota: ajuste ? null : (body?.nota as number) ?? null, feedback: body?.feedback as string, avaliadaEm: new Date().toISOString() });
    return as(e);
  }

  // ----- Trilha formativa -----
  const trilhaF = p.match(/^\/formacoes\/([^/]+)\/trilha$/);
  if (trilhaF && method === 'GET') return as(trilhaDe(trilhaF[1] as string));
  const novaEtapa = p.match(/^\/formacoes\/([^/]+)\/trilha\/etapas$/);
  if (novaEtapa && method === 'POST') {
    const formacaoId = novaEtapa[1] as string;
    const m = materialDaTrilha(formacaoId, body);
    const ordem = Math.max(0, ...trilhaDemo.filter((e) => e.formacaoId === formacaoId).map((e) => e.ordem)) + 1;
    trilhaDemo.push({
      id: 'et' + Date.now(), formacaoId, materialId: m.id, moduloId: (body?.moduloId as string) || null, ordem,
      titulo: (body?.titulo as string) || m.titulo, orientacao: (body?.orientacao as string) || null,
      duracaoMin: (body?.duracaoMin as number) ?? null, obrigatoria: body?.obrigatoria !== false, outrosConcluintes: 0,
    });
    return as(trilhaDe(formacaoId));
  }
  const modeloTrilha = p.match(/^\/formacoes\/([^/]+)\/trilha\/modelo$/);
  if (modeloTrilha && method === 'POST') {
    const formacaoId = modeloTrilha[1] as string;
    const modelo = MODELOS_TRILHA.find((x) => x.id === body?.modeloId);
    if (!modelo) throw new Error('Escolha um dos modelos de trilha.');
    const ultima = Math.max(0, ...trilhaDemo.filter((e) => e.formacaoId === formacaoId).map((e) => e.ordem));
    modelo.etapas.forEach((e, i) => trilhaDemo.push({
      id: `et${Date.now()}-${i}`, formacaoId, materialId: null, tipoPrevisto: e.tipo, moduloId: null, ordem: ultima + i + 1,
      titulo: e.titulo, orientacao: e.orientacao, duracaoMin: e.duracaoMin, obrigatoria: e.obrigatoria, outrosConcluintes: 0,
    }));
    return as(trilhaDe(formacaoId));
  }
  // Gerar com IA: no modo demonstracao, a proposta de exemplo (a mesma do provider mock da API).
  const iaTrilha = p.match(/^\/formacoes\/([^/]+)\/trilha\/ia(?:\/([^/]+))?$/);
  if (iaTrilha && method === 'POST') {
    const formacaoId = iaTrilha[1] as string;
    const interacaoId = iaTrilha[2];
    if (!interacaoId) {
      const f = formacoes.find((x) => x.id === formacaoId);
      const aprovados = materiais.filter((m) => m.status === 'APROVADO')
        .sort((a, b) => Number(b.formacoes.some((x) => x.formacao.id === formacaoId)) - Number(a.formacoes.some((x) => x.formacao.id === formacaoId)));
      const gerada = propostaTrilhaDeExemplo(
        { formacao: { titulo: (f?.titulo as string) ?? 'Formação', tema: (f?.tema as string) ?? null }, materiais: aprovados.map((m) => ({ id: m.id, titulo: m.titulo, tipo: m.tipo as MaterialTipo })) },
        body as unknown as GerarTrilhaIaDto,
      );
      await new Promise((r) => setTimeout(r, 900)); // a espera da geracao aparece na demonstracao
      const proposta: PropostaTrilhaIa = {
        interacaoId: 'ia-trilha-' + Date.now(), geradoPorIA: true, provider: 'mock', modelo: 'demonstracao',
        resumo: gerada.resumo, observacoes: gerada.observacoes,
        etapas: gerada.etapas.map((e) => {
          const m = e.material_id ? materiais.find((x) => x.id === e.material_id) : undefined;
          return {
            titulo: e.titulo, tipo: e.tipo, orientacao: e.orientacao, duracaoMin: e.duracao_min, obrigatoria: e.obrigatoria,
            material: m ? { id: m.id, titulo: m.titulo, tipo: m.tipo as MaterialTipo } : null, recursoSugerido: m ? null : e.recurso_sugerido,
          };
        }),
      };
      propostasTrilhaDemo.set(proposta.interacaoId, { ...proposta, formacaoId });
      return as(proposta);
    }
    const proposta = propostasTrilhaDemo.get(interacaoId);
    if (!proposta || proposta.formacaoId !== formacaoId) throw new Error('Proposta não encontrada.');
    const incluir = [...new Set(body?.incluir as number[])].filter((i) => i < proposta.etapas.length).sort((a, b) => a - b);
    if (!incluir.length) throw new Error('Escolha ao menos uma etapa para salvar.');
    const ultima = Math.max(0, ...trilhaDemo.filter((e) => e.formacaoId === formacaoId).map((e) => e.ordem));
    incluir.forEach((i, k) => {
      const e = proposta.etapas[i]!;
      if (e.material) materialDaTrilha(formacaoId, { materialId: e.material.id });
      trilhaDemo.push({
        id: `et${Date.now()}-ia${k}`, formacaoId, materialId: e.material?.id ?? null, tipoPrevisto: e.material ? null : e.tipo,
        recursoSugerido: e.material ? null : e.recursoSugerido, moduloId: null, ordem: ultima + k + 1,
        titulo: e.titulo, orientacao: e.orientacao, duracaoMin: e.duracaoMin, obrigatoria: e.obrigatoria, outrosConcluintes: 0,
      });
    });
    propostasTrilhaDemo.delete(interacaoId);
    return as(trilhaDe(formacaoId));
  }
  const etapaRota = p.match(/^\/trilha\/etapas\/([^/]+)(?:\/(mover|conclusao|recurso))?$/);
  if (etapaRota) {
    const e = etapaDemo(etapaRota[1] as string);
    const acao = etapaRota[2];
    if (acao === 'mover') {
      const irmas = trilhaDemo.filter((x) => x.formacaoId === e.formacaoId).sort((a, b) => a.ordem - b.ordem);
      const i = irmas.indexOf(e);
      const viz = irmas[body?.direcao === 'subir' ? i - 1 : i + 1];
      if (viz) [e.ordem, viz.ordem] = [viz.ordem, e.ordem];
    } else if (acao === 'recurso') {
      const m = materialDaTrilha(e.formacaoId, body);
      e.materialId = m.id;
      e.tipoPrevisto = null;
      e.recursoSugerido = null;
      if (body?.titulo) e.titulo = body.titulo as string;
      if (body?.orientacao !== undefined) e.orientacao = (body.orientacao as string) || null;
      if (body?.duracaoMin !== undefined) e.duracaoMin = body.duracaoMin as number | null;
      if (body?.moduloId !== undefined) e.moduloId = body.moduloId as string | null;
      e.obrigatoria = body?.obrigatoria !== false;
    } else if (acao === 'conclusao') {
      if (body?.concluida) concluidasDemo.add(e.id); else concluidasDemo.delete(e.id);
    } else if (method === 'PUT') {
      if (body?.titulo !== undefined) e.titulo = body.titulo as string;
      if (body?.orientacao !== undefined) e.orientacao = (body.orientacao as string) || null;
      if (body?.duracaoMin !== undefined) e.duracaoMin = body.duracaoMin as number | null;
      if (body?.moduloId !== undefined) e.moduloId = body.moduloId as string | null;
      if (body?.obrigatoria !== undefined) e.obrigatoria = !!body.obrigatoria;
    } else if (method === 'DELETE') {
      trilhaDemo.splice(trilhaDemo.indexOf(e), 1);
      resequenciar(e.formacaoId);
    }
    return as(trilhaDe(e.formacaoId));
  }

  // ----- Avaliações -----
  if (p === '/avaliacoes' && method === 'GET') {
    const cursista = usuarioDemo()?.role === 'PROFESSOR';
    return as(avaliacoes.filter((a) => !cursista || ['f1', 'f3'].includes(a.formacao.id))
      .map((a) => ({ ...a, respondida: cursista ? respondidasDemo.has(a.id) : null })));
  }
  const resAv = p.match(/^\/avaliacoes\/([^/]+)\/resultados$/);
  if (resAv) {
    const a = avaliacoes.find((x) => x.id === resAv[1]) ?? avaliacoes[0]!;
    return as({ ...avaliacaoResultados, avaliacao: { ...avaliacaoResultados.avaliacao, id: a.id, titulo: a.titulo, anonima: a.anonima },
      formacao: a.formacao, cursistas: a.formacao.id === 'f1' ? PROFESSORES_DEMO.length : 32, totalRespostas: a._count.entradas });
  }
  const respAv = p.match(/^\/avaliacoes\/([^/]+)\/respostas$/);
  if (respAv && method === 'POST') {
    const id = respAv[1] as string;
    if (usuarioDemo()?.role === 'PROFESSOR') {
      if (respondidasDemo.has(id)) throw new Error('Você já respondeu esta avaliação.');
      respondidasDemo.add(id);
    }
    const a = avaliacoes.find((x) => x.id === id);
    if (a) a._count.entradas += 1;
    return as({ ok: true });
  }
  const detAv = p.match(/^\/avaliacoes\/([^/]+)$/);
  if (detAv && method === 'GET') {
    const a = avaliacoes.find((x) => x.id === detAv[1]) ?? avaliacoes[0]!;
    return as({ ...avaliacaoDetalhe, id: a.id, titulo: a.titulo, anonima: a.anonima, formacao: { id: a.formacao.id, titulo: a.formacao.titulo } });
  }

  // ----- Relatórios -----
  if (p === '/relatorios/frequencia') return as(relFrequenciaDemo());
  if (p === '/relatorios/conclusao') return as(relConclusaoDemo());
  if (p === '/relatorios/frequencia/csv') {
    return as({ filename: 'relatório-frequência.csv', csv: toCsv(['Participante', 'E-mail', 'Formação', 'Turma', 'Presenças', 'Chamadas registradas', 'Encontros previstos', 'Frequência %', 'Mínimo %', 'Situação'],
      relFrequenciaDemo().map((r) => [r.participante, r.email, r.formacao, r.turma, r.presencas, r.chamadasRegistradas, r.encontrosPrevistos, r.frequenciaPct ?? '', r.minimoPct, SITUACAO_FREQUENCIA_LABELS[r.situacao]])) });
  }
  if (p === '/relatorios/conclusao/csv') {
    return as({ filename: 'relatório-conclusão.csv', csv: toCsv(['Formação', 'Etapa', 'Inscritos', 'Certificados', 'Taxa de conclusão %', 'Frequência média %', 'Mínimo %', 'Abaixo do mínimo'],
      relConclusaoDemo().map((r) => [r.formacao, ETAPA_FLUXO_LABELS[r.etapaFluxo], r.inscritos, r.certificados, r.taxaConclusaoPct ?? '', r.frequenciaMediaPct ?? '', r.minimoPct, r.abaixoDoMinimo])) });
  }

  // ----- Participante -----
  if (p === '/participante/minhas-formacoes') return as(minhasFormacoesDemo());
  if (match(p, /^\/inscricoes\/[^/]+\/certificado$/)) {
    // Mesma regra da API: frequencia minima e todas as atividades avaliadas.
    const part = participacaoDemo('f1');
    if (!part) throw new Error('Inscrição não encontrada.');
    if (part.certificado) return as(part.certificado);
    if (!part.podeEmitirCertificado) {
      throw new Error(part.frequencia.presencas < part.frequencia.presencasNecessarias
        ? `Frequência abaixo do mínimo de ${part.frequencia.minimoPct}%.`
        : 'Há atividade sem entrega avaliada.');
    }
    certificadoDemo = { codigo: 'A1B2C3D4E5F6', emitidoEm: new Date().toISOString() };
    return as(certificadoDemo);
  }
  const validar = p.match(/^\/certificados\/validar\/([^/]+)$/);
  if (validar) {
    const cod = (validar[1] as string).toUpperCase();
    const emitido = cod === CERTIFICADO_F3.codigo ? { formacao: 'Educação inclusiva na prática', cargaHoraria: 20, emitidoEm: CERTIFICADO_F3.emitidoEm }
      : certificadoDemo && cod === certificadoDemo.codigo ? { formacao: 'Alfabetização na Idade Certa', cargaHoraria: 40, emitidoEm: certificadoDemo.emitidoEm }
        : null;
    return as(emitido ? { valido: true, participante: 'Paula Professora', instituicao: TENANT.nome, ...emitido } : { valido: false });
  }
  if (p === '/inscricoes' && method === 'POST') return as({ ok: true });

  // ----- Assistente pedagogico -----
  if (p === '/assistente/conversas' && method === 'GET') {
    return as([...conversasDemo].sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm)).map(resumoConversa));
  }
  if (p === '/assistente/conversas' && method === 'POST') {
    const f = formacoes.find((x) => x.id === body?.formacaoId);
    const c: ConversaDemo = {
      id: `c${conversasDemo.length + 1}-${Date.now()}`, titulo: 'Nova conversa',
      formacao: f ? { id: f.id as string, titulo: f.titulo as string } : null, atualizadaEm: new Date().toISOString(), turnos: [],
    };
    conversasDemo.push(c);
    return as(resumoConversa(c));
  }
  const conv = p.match(/^\/assistente\/conversas\/([^/]+)$/);
  if (conv && method === 'GET') {
    const c = conversasDemo.find((x) => x.id === conv[1]);
    if (!c) throw new Error('Conversa não encontrada.');
    return as({ id: c.id, titulo: c.titulo, formacao: c.formacao, atualizadaEm: c.atualizadaEm, turnos: c.turnos });
  }
  if (conv && method === 'DELETE') {
    const i = conversasDemo.findIndex((x) => x.id === conv[1]);
    if (i >= 0) conversasDemo.splice(i, 1);
    return as({ id: conv[1], excluida: true });
  }

  // ----- IA governada -----
  if (p === '/ia/config' && method === 'GET') return as(iaConfig);
  if (p === '/ia/config' && method === 'PUT') {
    iaConfig = { iaHabilitada: body?.iaHabilitada as boolean, iaProvider: body?.iaProvider as string };
    return as(iaConfig);
  }
  if (p === '/ia/interacoes') return as(iaInteracoes);
  const planosForm = p.match(/^\/ia\/formacoes\/([^/]+)\/planos$/);
  if (planosForm) {
    return as(planosAprovadosDemo.filter((x) => x.formacaoId === planosForm[1])
      .sort((a, b) => b.aprovadoEm.localeCompare(a.aprovadoEm))
      .map(({ formacaoId: _f, ...x }) => x));
  }
  const gerarPlano = p.match(/^\/ia\/formacoes\/([^/]+)\/plano$/);
  if (gerarPlano) {
    const formacaoId = gerarPlano[1] as string;
    const r = {
      formacaoId, id: 'pl-' + Math.floor(performance.now()), interacaoId: 'ia-' + Math.floor(performance.now()), provider: iaConfig.iaProvider,
      modelo: iaConfig.iaProvider === 'deepseek' ? 'deepseek-chat' : iaConfig.iaProvider === 'anthropic' ? 'claude-opus-4-8' : 'mock-determinista',
      promptVersao: 'v1',
      fontes: formacaoId === 'f1' ? [{ id: 'mat1', titulo: 'Guia de práticas de leitura em sala', tipo: 'DOCUMENTO' }] : [],
      conteudo: formacaoId === 'f1' ? planoDemo : planoMatematicaDemo,
    };
    rascunhosDemo.set(r.interacaoId, r);
    return as({
      geradoPorIA: true, interacaoId: r.interacaoId, provider: r.provider, modelo: r.modelo, promptVersao: r.promptVersao,
      fontes: r.fontes, plano: r.conteudo, status: 'RASCUNHO',
    });
  }
  const decisaoIa = p.match(/^\/ia\/interacoes\/([^/]+)\/decisao$/);
  if (decisaoIa) {
    // Aprovar publica o plano na formacao, com o nome de quem decidiu; editar publica a
    // versao da pessoa (como a API).
    const r = rascunhosDemo.get(decisaoIa[1] as string);
    if (r && (body?.decisao === 'APROVAR' || body?.decisao === 'EDITAR')) {
      const editado = body.decisao === 'EDITAR';
      const conteudo = editado ? JSON.parse(body.saidaEditada as string) as PlanoFormativoConteudo : r.conteudo;
      planosAprovadosDemo.push({ ...r, conteudo, editado, aprovadoEm: new Date().toISOString(), aprovadoPor: usuarioDemo()?.nome ?? null });
    }
    rascunhosDemo.delete(decisaoIa[1] as string);
    propostasTrilhaDemo.delete(decisaoIa[1] as string);
    return as({ interacaoId: decisaoIa[1], decisao: body?.decisao });
  }
  if (match(p, /^\/ia\/interacoes\/[^/]+\/sinalizar$/)) return as({ ok: true });

  // Fallback: lista vazia
  return as([]);
}
