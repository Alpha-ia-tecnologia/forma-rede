// Trilha formativa: etapas em ordem com videos, documentos, podcasts e materiais do
// acervo. Todo recurso e um Material (curadoria, RIA-003/006): recurso novo entra
// EM_REVISAO e so os APROVADOS aparecem para os cursistas. O material entra tambem na
// colecao da formacao (MaterialFormacao), que alimenta o copiloto e o assistente.
// O cursista marca etapas como concluidas; quem edita ve quantos concluiram.
// Modelos prontos (MODELOS_TRILHA) criam etapas sem recurso, com textos de exemplo; quem
// edita substitui titulo, orientacao e recurso, e so entao a etapa chega aos cursistas.
// Gerar com IA: o Gerador de trilhas (agente LangGraph em @formarede/ai) le a formacao e o
// acervo aprovado e propoe as etapas; nada entra na trilha antes de quem edita salvar.
import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Logger, Module,
  NotFoundException, Param, Post, Put, ServiceUnavailableException,
} from '@nestjs/common';
import { forTenant, Prisma } from '@formarede/db';
import {
  GERADOR_TRILHA, PropostaNaoGerada, descreverErroAgente, gerarTrilhaComIa, montarPedidoTrilha,
  type AiFonte, type ContextoTrilhaIa,
} from '@formarede/ai';
import {
  AplicarModeloTrilhaDto, aplicarModeloTrilhaSchema, AtualizarEtapaTrilhaDto, atualizarEtapaTrilhaSchema,
  AuthUser, ConcluirEtapaTrilhaDto, concluirEtapaTrilhaSchema, CriarEtapaTrilhaDto, criarEtapaTrilhaSchema,
  EtapaTrilha, GerarTrilhaIaDto, gerarTrilhaIaSchema, MaterialTipo, MODELOS_TRILHA, MoverEtapaTrilhaDto,
  moverEtapaTrilhaSchema, propostaTrilhaDeExemplo, PropostaTrilhaIa, SalvarTrilhaIaDto, salvarTrilhaIaSchema,
  SubstituirEtapaTrilhaDto, substituirEtapaTrilhaSchema, TIPOS_RECURSO_TRILHA, TrilhaFormacao,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { AuditService } from '../../audit/audit.module';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSCRITO = { in: ['CONFIRMADA', 'CONCLUIDA'] as ('CONFIRMADA' | 'CONCLUIDA')[] };

const podeEditar = (u: AuthUser) => u.permissions.includes('*') || u.permissions.includes('trilha:editar');

/** Proposta como fica gravada na AiInteracao (saida): o que a tela mostrou. */
type PropostaGravada = Omit<PropostaTrilhaIa, 'interacaoId'>;

@Injectable()
export class TrilhaService {
  private readonly logger = new Logger('Trilha');
  constructor(private readonly audit: AuditService) {}

  private async formacaoExiste(tenantId: string, formacaoId: string) {
    if (!UUID.test(formacaoId)) throw new NotFoundException('Formação não encontrada.');
    const f = await forTenant(tenantId).formacao.findFirst({ where: { id: formacaoId }, select: { id: true } });
    if (!f) throw new NotFoundException('Formação não encontrada.');
  }

  private async etapa(tenantId: string, etapaId: string) {
    if (!UUID.test(etapaId)) throw new NotFoundException('Etapa não encontrada.');
    const e = await forTenant(tenantId).trilhaEtapa.findFirst({
      where: { id: etapaId }, include: { material: { select: { status: true } } },
    });
    if (!e) throw new NotFoundException('Etapa não encontrada.');
    return e;
  }

  /** O modulo informado precisa ser da mesma formacao. */
  private async validarModulo(tenantId: string, formacaoId: string, moduloId?: string | null) {
    if (!moduloId) return;
    const m = await forTenant(tenantId).moduloFormacao.findFirst({ where: { id: moduloId, formacaoId }, select: { id: true } });
    if (!m) throw new BadRequestException('Escolha um módulo desta formação.');
  }

  async obter(user: AuthUser, formacaoId: string): Promise<TrilhaFormacao> {
    await this.formacaoExiste(user.tenantId, formacaoId);
    const db = forTenant(user.tenantId);
    const editor = podeEditar(user);
    const inscricao = await db.inscricao.findFirst({
      where: { userId: user.id, status: INSCRITO, turma: { formacaoId } }, select: { id: true },
    });
    const etapas = await db.trilhaEtapa.findMany({
      // Cursista ve so o que a curadoria aprovou; quem edita ve tudo, com a situacao.
      where: { formacaoId, ...(editor ? {} : { material: { status: 'APROVADO' } }) },
      orderBy: { ordem: 'asc' },
      include: {
        modulo: { select: { id: true, titulo: true } },
        material: { select: { id: true, titulo: true, tipo: true, url: true, descricao: true, autoria: true, licenca: true, status: true } },
        _count: { select: { progresso: true } },
      },
    });
    const concluidas = inscricao
      ? new Set((await db.trilhaProgresso.findMany({ where: { inscricaoId: inscricao.id }, select: { etapaId: true } })).map((p) => p.etapaId))
      : new Set<string>();
    const totalCursistas = editor
      ? await db.inscricao.count({ where: { status: INSCRITO, turma: { formacaoId } } })
      : null;

    const lista: EtapaTrilha[] = etapas.map((e) => ({
      id: e.id, ordem: e.ordem, titulo: e.titulo, orientacao: e.orientacao, duracaoMin: e.duracaoMin,
      obrigatoria: e.obrigatoria, modulo: e.modulo,
      material: e.material ? { ...e.material, tipo: e.material.tipo as MaterialTipo, status: String(e.material.status) } : null,
      tipoPrevisto: e.material ? null : (e.tipoPrevisto as MaterialTipo | null),
      recursoSugerido: e.material ? null : e.recursoSugerido,
      concluida: concluidas.has(e.id),
      concluintes: editor ? e._count.progresso : null,
    }));
    const obrigatorias = lista.filter((e) => e.obrigatoria && e.material?.status === 'APROVADO');
    return {
      formacaoId,
      podeEditar: editor,
      inscricaoId: inscricao?.id ?? null,
      totalCursistas,
      progresso: inscricao ? { concluidas: obrigatorias.filter((e) => e.concluida).length, obrigatorias: obrigatorias.length } : null,
      etapas: lista,
    };
  }

  /**
   * Material da etapa: um aprovado do acervo ou um recurso novo, que entra EM_REVISAO.
   * Nos dois casos ele passa a fazer parte da colecao da formacao.
   */
  private async resolverMaterial(user: AuthUser, formacaoId: string, dto: CriarEtapaTrilhaDto) {
    const db = forTenant(user.tenantId);
    let material: { id: string; titulo: string };
    if (dto.materialId) {
      const m = await db.material.findFirst({ where: { id: dto.materialId, status: 'APROVADO' }, select: { id: true, titulo: true } });
      if (!m) throw new BadRequestException('Escolha um material aprovado do acervo.');
      material = m;
    } else {
      const r = dto.recurso!;
      // Recurso novo passa pela curadoria antes de chegar aos cursistas (RF-051).
      material = await db.material.create({
        data: {
          tenantId: user.tenantId, titulo: r.titulo, tipo: r.tipo, url: r.url,
          autoria: r.autoria || null, licenca: r.licenca || null, tags: ['trilha'],
          status: 'EM_REVISAO', criadoPorId: user.id,
        },
        select: { id: true, titulo: true },
      });
      await this.audit.record({ action: 'CREATE', entity: 'material', entityId: material.id, tenantId: user.tenantId, userId: user.id, metadata: { origem: 'trilha', formacaoId } });
    }

    await db.materialFormacao.upsert({
      where: { materialId_formacaoId: { materialId: material.id, formacaoId } },
      update: {},
      create: { tenantId: user.tenantId, materialId: material.id, formacaoId },
    });
    return material;
  }

  async criar(user: AuthUser, formacaoId: string, dto: CriarEtapaTrilhaDto): Promise<TrilhaFormacao> {
    await this.formacaoExiste(user.tenantId, formacaoId);
    await this.validarModulo(user.tenantId, formacaoId, dto.moduloId);
    const db = forTenant(user.tenantId);
    const material = await this.resolverMaterial(user, formacaoId, dto);
    const ultima = await db.trilhaEtapa.aggregate({ where: { formacaoId }, _max: { ordem: true } });
    const etapa = await db.trilhaEtapa.create({
      data: {
        tenantId: user.tenantId, formacaoId, materialId: material.id, moduloId: dto.moduloId ?? null,
        ordem: (ultima._max.ordem ?? 0) + 1, titulo: dto.titulo || material.titulo,
        orientacao: dto.orientacao || null, duracaoMin: dto.duracaoMin ?? null, obrigatoria: dto.obrigatoria,
      },
    });
    await this.audit.record({ action: 'CREATE', entity: 'trilha_etapa', entityId: etapa.id, tenantId: user.tenantId, userId: user.id, metadata: { formacaoId } });
    return this.obter(user, formacaoId);
  }

  /** Poe as etapas do modelo no fim da trilha, sem recurso (so quem edita as ve). */
  async aplicarModelo(user: AuthUser, formacaoId: string, dto: AplicarModeloTrilhaDto): Promise<TrilhaFormacao> {
    await this.formacaoExiste(user.tenantId, formacaoId);
    const modelo = MODELOS_TRILHA.find((m) => m.id === dto.modeloId);
    if (!modelo) throw new BadRequestException('Escolha um dos modelos de trilha.');
    const db = forTenant(user.tenantId);
    const ultima = (await db.trilhaEtapa.aggregate({ where: { formacaoId }, _max: { ordem: true } }))._max.ordem ?? 0;
    await db.trilhaEtapa.createMany({
      data: modelo.etapas.map((e, i) => ({
        tenantId: user.tenantId, formacaoId, ordem: ultima + i + 1, titulo: e.titulo, orientacao: e.orientacao,
        duracaoMin: e.duracaoMin, obrigatoria: e.obrigatoria, tipoPrevisto: e.tipo, materialId: null,
      })),
    });
    await this.audit.record({ action: 'UPDATE', entity: 'formacao', entityId: formacaoId, tenantId: user.tenantId, userId: user.id, metadata: { trilha: 'modelo', modelo: modelo.id, etapas: modelo.etapas.length } });
    return this.obter(user, formacaoId);
  }

  /** Troca o recurso da etapa (a do modelo recebe o primeiro) e, junto, os textos dela. */
  async substituir(user: AuthUser, etapaId: string, dto: SubstituirEtapaTrilhaDto): Promise<TrilhaFormacao> {
    const e = await this.etapa(user.tenantId, etapaId);
    await this.validarModulo(user.tenantId, e.formacaoId, dto.moduloId);
    const material = await this.resolverMaterial(user, e.formacaoId, dto);
    await forTenant(user.tenantId).trilhaEtapa.update({
      where: { id: etapaId },
      data: {
        materialId: material.id, tipoPrevisto: null, recursoSugerido: null,
        titulo: dto.titulo || e.titulo,
        ...(dto.orientacao !== undefined ? { orientacao: dto.orientacao || null } : {}),
        ...(dto.duracaoMin !== undefined ? { duracaoMin: dto.duracaoMin } : {}),
        ...(dto.moduloId !== undefined ? { moduloId: dto.moduloId } : {}),
        obrigatoria: dto.obrigatoria,
      },
    });
    await this.audit.record({ action: 'UPDATE', entity: 'trilha_etapa', entityId: etapaId, tenantId: user.tenantId, userId: user.id, metadata: { formacaoId: e.formacaoId, materialId: material.id } });
    return this.obter(user, e.formacaoId);
  }

  /** Busca no acervo aprovado do municipio (mesma regra da ferramenta do Assistente). */
  private buscarMateriais(tenantId: string) {
    return async ({ termo, formacaoId }: { termo?: string; formacaoId?: string }) => {
      const t = termo?.trim();
      const materiais = await forTenant(tenantId).material.findMany({
        where: {
          tenantId, status: 'APROVADO',
          ...(t ? {
            OR: [
              { titulo: { contains: t, mode: 'insensitive' } },
              { descricao: { contains: t, mode: 'insensitive' } },
              { tags: { has: t.toLowerCase() } },
            ],
          } : {}),
          ...(formacaoId && UUID.test(formacaoId) ? { formacoes: { some: { formacaoId } } } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 12,
        select: { id: true, titulo: true, tipo: true, descricao: true, autoria: true, licenca: true, tags: true, url: true },
      });
      return materiais.map((m) => ({ ...m, tipo: String(m.tipo) }));
    };
  }

  /**
   * O que o Gerador de trilhas le da formacao: dados, modulos, plano aprovado, trilha e acervo.
   * As consultas filtram o municipio alem do RLS: o contexto vai para fora da plataforma.
   */
  private async contextoIa(tenantId: string, formacaoId: string): Promise<ContextoTrilhaIa> {
    const db = forTenant(tenantId);
    const f = await db.formacao.findFirst({
      where: { id: formacaoId },
      include: {
        modulos: { orderBy: { ordem: 'asc' }, select: { titulo: true, descricao: true } },
        materiais: { select: { materialId: true } },
        trilha: { orderBy: { ordem: 'asc' }, select: { titulo: true, tipoPrevisto: true, material: { select: { tipo: true } } } },
      },
    });
    if (!f) throw new NotFoundException('Formação não encontrada.');
    const plano = await db.planoFormativo.findFirst({ where: { formacaoId, status: 'APROVADO' }, orderBy: { updatedAt: 'desc' }, select: { conteudo: true } });
    const c = (plano?.conteudo ?? null) as { objetivos?: unknown; modulos?: unknown; metodologias?: unknown } | null;
    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    const daFormacao = new Set(f.materiais.map((m) => m.materialId));
    // Os vinculados a formacao primeiro; o resto do acervo aprovado ate um teto (a IA ainda pode buscar).
    const aprovados = await db.material.findMany({
      where: { tenantId, status: 'APROVADO' }, orderBy: { updatedAt: 'desc' }, take: 60,
      select: { id: true, titulo: true, tipo: true, autoria: true, tags: true },
    });
    aprovados.sort((a, b) => Number(daFormacao.has(b.id)) - Number(daFormacao.has(a.id)));
    return {
      formacao: {
        titulo: f.titulo, tema: f.tema, objetivos: f.objetivos, publicoAlvo: f.publicoAlvo,
        cargaHoraria: f.cargaHoraria, modalidade: String(f.modalidade),
      },
      modulos: f.modulos,
      plano: c ? {
        objetivos: lista(c.objetivos),
        modulos: Array.isArray(c.modulos)
          ? (c.modulos as { titulo?: unknown; descricao?: unknown }[]).map((m) => ({ titulo: String(m.titulo ?? ''), descricao: String(m.descricao ?? '') }))
          : [],
        metodologias: lista(c.metodologias),
      } : null,
      trilhaAtual: f.trilha.map((e) => ({ titulo: e.titulo, tipo: String(e.material?.tipo ?? e.tipoPrevisto ?? 'LINK') })),
      materiais: aprovados.map((m) => ({ ...m, tipo: m.tipo as MaterialTipo, daFormacao: daFormacao.has(m.id) })),
    };
  }

  /** Gera a proposta (sem gravar etapas): o Gerador de trilhas, ou o exemplo no provider mock. */
  async gerarComIa(user: AuthUser, formacaoId: string, dto: GerarTrilhaIaDto): Promise<PropostaTrilhaIa> {
    await this.formacaoExiste(user.tenantId, formacaoId);
    const db = forTenant(user.tenantId);
    // Filtro explicito alem do RLS: a configuracao e a deste municipio.
    const config = await db.tenantConfig.findFirst({ where: { tenantId: user.tenantId } });
    if (config && !config.iaHabilitada) throw new ForbiddenException('Os recursos de IA estão desabilitados neste município.');
    const ctx = await this.contextoIa(user.tenantId, formacaoId);

    let gerada;
    let meta: { provider: string; modelo: string; entrada: string; fontes: AiFonte[]; tokensEntrada: number; tokensSaida: number };
    if (config?.iaProvider === 'mock') {
      gerada = propostaTrilhaDeExemplo({ formacao: ctx.formacao, materiais: ctx.materiais }, dto);
      meta = { provider: 'mock', modelo: 'mock-trilha', entrada: montarPedidoTrilha(ctx, dto), fontes: [], tokensEntrada: 0, tokensSaida: 0 };
    } else {
      try {
        const r = await gerarTrilhaComIa({ contexto: ctx, pedido: dto, buscarMateriais: this.buscarMateriais(user.tenantId) });
        gerada = r.proposta;
        meta = {
          provider: 'anthropic', modelo: r.modelo, entrada: r.entrada, fontes: r.fontes,
          tokensEntrada: r.uso.entrada + r.uso.cacheLeitura + r.uso.cacheEscrita, tokensSaida: r.uso.saida,
        };
      } catch (e) {
        if (e instanceof PropostaNaoGerada) throw new ServiceUnavailableException(e.message);
        this.logger.error(`Gerador de trilhas falhou: ${e instanceof Error ? e.message : String(e)}`);
        throw new ServiceUnavailableException(descreverErroAgente(e));
      }
    }

    // Material citado pela IA so vale se for aprovado neste municipio; senao a etapa fica a definir.
    const ids = [...new Set(gerada.etapas.flatMap((e) => (e.material_id && UUID.test(e.material_id) ? [e.material_id] : [])))];
    const materiais = new Map((ids.length
      ? await db.material.findMany({ where: { id: { in: ids }, tenantId: user.tenantId, status: 'APROVADO' }, select: { id: true, titulo: true, tipo: true } })
      : []).map((m) => [m.id, { ...m, tipo: m.tipo as MaterialTipo }]));
    const proposta: PropostaGravada = {
      geradoPorIA: true, provider: meta.provider, modelo: meta.modelo,
      resumo: gerada.resumo, observacoes: gerada.observacoes,
      etapas: gerada.etapas.map((e) => {
        const material = (e.material_id && materiais.get(e.material_id)) || null;
        return {
          titulo: e.titulo, tipo: e.tipo, orientacao: e.orientacao, duracaoMin: e.duracao_min, obrigatoria: e.obrigatoria,
          material, recursoSugerido: material ? null : e.recurso_sugerido,
        };
      }),
    };

    // Log completo da interacao (RIA-004); a decisao humana vem ao salvar ou descartar.
    const interacao = await db.aiInteracao.create({
      data: {
        tenantId: user.tenantId, userId: user.id, assistente: GERADOR_TRILHA.id, provider: meta.provider, modelo: meta.modelo,
        promptVersao: GERADOR_TRILHA.versao,
        entrada: { prompt: meta.entrada, formacaoId, pedido: dto } as Prisma.InputJsonValue,
        saida: JSON.stringify(proposta),
        fontes: meta.fontes as unknown as Prisma.InputJsonValue,
        tokensEntrada: meta.tokensEntrada, tokensSaida: meta.tokensSaida,
      },
    });
    return { interacaoId: interacao.id, ...proposta };
  }

  /** Grava na trilha as etapas escolhidas da proposta: a decisao humana (RIA-002). */
  async salvarDaIa(user: AuthUser, formacaoId: string, interacaoId: string, dto: SalvarTrilhaIaDto): Promise<TrilhaFormacao> {
    await this.formacaoExiste(user.tenantId, formacaoId);
    if (!UUID.test(interacaoId)) throw new NotFoundException('Proposta não encontrada.');
    const db = forTenant(user.tenantId);
    const interacao = await db.aiInteracao.findFirst({ where: { id: interacaoId, tenantId: user.tenantId, assistente: GERADOR_TRILHA.id } });
    if (!interacao || (interacao.entrada as { formacaoId?: string } | null)?.formacaoId !== formacaoId) {
      throw new NotFoundException('Proposta não encontrada.');
    }
    if (interacao.status !== 'GERADA') throw new BadRequestException('Esta proposta já foi salva ou descartada.');
    const proposta = JSON.parse(interacao.saida) as PropostaGravada;
    const indices = [...new Set(dto.incluir)].filter((i) => i < proposta.etapas.length).sort((a, b) => a - b);
    if (!indices.length) throw new BadRequestException('Escolha ao menos uma etapa para salvar.');
    const escolhidas = indices.map((i) => proposta.etapas[i]!);

    // O material pode ter saido do acervo desde a proposta: so entra se ainda estiver aprovado.
    const citados = escolhidas.flatMap((e) => (e.material ? [e.material.id] : []));
    const aprovados = new Set((citados.length
      ? await db.material.findMany({ where: { id: { in: citados }, tenantId: user.tenantId, status: 'APROVADO' }, select: { id: true } })
      : []).map((m) => m.id));
    // Pedido de substituir: as etapas atuais saem e a proposta comeca na posicao 1. Se a gravacao
    // falhar depois daqui, a proposta segue GERADA e pode ser salva de novo.
    const substituir = (interacao.entrada as { pedido?: { substituir?: boolean } } | null)?.pedido?.substituir === true;
    const removidas = substituir ? (await db.trilhaEtapa.deleteMany({ where: { formacaoId, tenantId: user.tenantId } })).count : 0;
    const ultima = substituir ? 0 : (await db.trilhaEtapa.aggregate({ where: { formacaoId }, _max: { ordem: true } }))._max.ordem ?? 0;
    const tipos = TIPOS_RECURSO_TRILHA as readonly string[];
    const linhas = escolhidas.map((e, k) => {
      const materialId = e.material && aprovados.has(e.material.id) ? e.material.id : null;
      return {
        tenantId: user.tenantId, formacaoId, ordem: ultima + k + 1, titulo: e.titulo, orientacao: e.orientacao,
        duracaoMin: e.duracaoMin, obrigatoria: e.obrigatoria, materialId,
        tipoPrevisto: materialId || !tipos.includes(e.tipo) ? null : e.tipo,
        recursoSugerido: materialId ? null : e.recursoSugerido,
      };
    });
    const vinculos = [...new Set(linhas.flatMap((l) => (l.materialId ? [l.materialId] : [])))];
    if (vinculos.length) {
      await db.materialFormacao.createMany({ data: vinculos.map((materialId) => ({ tenantId: user.tenantId, materialId, formacaoId })), skipDuplicates: true });
    }
    await db.trilhaEtapa.createMany({ data: linhas });
    await db.aiInteracao.update({
      where: { id: interacaoId },
      data: { status: indices.length === proposta.etapas.length ? 'APROVADA' : 'EDITADA', decididoPorId: user.id, decididoEm: new Date() },
    });
    await this.audit.record({
      action: 'APPROVE', entity: 'ai_interacao', entityId: interacaoId, tenantId: user.tenantId, userId: user.id,
      metadata: { trilha: true, formacaoId, etapas: indices.length, de: proposta.etapas.length, substituiu: removidas },
    });
    return this.obter(user, formacaoId);
  }

  async atualizar(user: AuthUser, etapaId: string, dto: AtualizarEtapaTrilhaDto): Promise<TrilhaFormacao> {
    const e = await this.etapa(user.tenantId, etapaId);
    await this.validarModulo(user.tenantId, e.formacaoId, dto.moduloId);
    await forTenant(user.tenantId).trilhaEtapa.update({
      where: { id: etapaId },
      data: {
        ...(dto.titulo !== undefined ? { titulo: dto.titulo } : {}),
        ...(dto.orientacao !== undefined ? { orientacao: dto.orientacao || null } : {}),
        ...(dto.duracaoMin !== undefined ? { duracaoMin: dto.duracaoMin } : {}),
        ...(dto.moduloId !== undefined ? { moduloId: dto.moduloId } : {}),
        ...(dto.obrigatoria !== undefined ? { obrigatoria: dto.obrigatoria } : {}),
      },
    });
    return this.obter(user, e.formacaoId);
  }

  /** Troca a ordem com a etapa vizinha. */
  async mover(user: AuthUser, etapaId: string, dto: MoverEtapaTrilhaDto): Promise<TrilhaFormacao> {
    const e = await this.etapa(user.tenantId, etapaId);
    const db = forTenant(user.tenantId);
    const subir = dto.direcao === 'subir';
    const vizinha = await db.trilhaEtapa.findFirst({
      where: { formacaoId: e.formacaoId, ordem: subir ? { lt: e.ordem } : { gt: e.ordem } },
      orderBy: { ordem: subir ? 'desc' : 'asc' },
    });
    if (vizinha) {
      await db.trilhaEtapa.update({ where: { id: e.id }, data: { ordem: vizinha.ordem } });
      await db.trilhaEtapa.update({ where: { id: vizinha.id }, data: { ordem: e.ordem } });
    }
    return this.obter(user, e.formacaoId);
  }

  /** Tira a etapa da trilha (o material continua no acervo e na colecao). */
  async remover(user: AuthUser, etapaId: string): Promise<TrilhaFormacao> {
    const e = await this.etapa(user.tenantId, etapaId);
    const db = forTenant(user.tenantId);
    await db.trilhaEtapa.delete({ where: { id: etapaId } });
    const restantes = await db.trilhaEtapa.findMany({ where: { formacaoId: e.formacaoId }, orderBy: { ordem: 'asc' }, select: { id: true, ordem: true } });
    for (const [i, r] of restantes.entries()) {
      if (r.ordem !== i + 1) await db.trilhaEtapa.update({ where: { id: r.id }, data: { ordem: i + 1 } });
    }
    await this.audit.record({ action: 'DELETE', entity: 'trilha_etapa', entityId: etapaId, tenantId: user.tenantId, userId: user.id, metadata: { formacaoId: e.formacaoId } });
    return this.obter(user, e.formacaoId);
  }

  /** O cursista marca (ou desmarca) uma etapa aprovada como concluida. */
  async concluir(user: AuthUser, etapaId: string, dto: ConcluirEtapaTrilhaDto): Promise<TrilhaFormacao> {
    const e = await this.etapa(user.tenantId, etapaId);
    if (e.material?.status !== 'APROVADO') throw new NotFoundException('Etapa não encontrada.');
    const db = forTenant(user.tenantId);
    const inscricao = await db.inscricao.findFirst({
      where: { userId: user.id, status: INSCRITO, turma: { formacaoId: e.formacaoId } }, select: { id: true },
    });
    if (!inscricao) throw new BadRequestException('Só quem está inscrito numa turma desta formação registra o progresso.');
    if (dto.concluida) {
      await db.trilhaProgresso.upsert({
        where: { etapaId_inscricaoId: { etapaId, inscricaoId: inscricao.id } },
        update: {},
        create: { tenantId: user.tenantId, etapaId, inscricaoId: inscricao.id },
      });
    } else {
      await db.trilhaProgresso.deleteMany({ where: { etapaId, inscricaoId: inscricao.id } });
    }
    return this.obter(user, e.formacaoId);
  }
}

@Controller()
export class TrilhaController {
  constructor(private readonly svc: TrilhaService) {}

  @Get('formacoes/:id/trilha')
  @RequirePermissions('formacao:read')
  obter(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.obter(user, id);
  }

  @Post('formacoes/:id/trilha/etapas')
  @RequirePermissions('trilha:editar')
  criar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(criarEtapaTrilhaSchema)) dto: CriarEtapaTrilhaDto) {
    return this.svc.criar(user, id, dto);
  }

  @Post('formacoes/:id/trilha/modelo')
  @RequirePermissions('trilha:editar')
  aplicarModelo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(aplicarModeloTrilhaSchema)) dto: AplicarModeloTrilhaDto) {
    return this.svc.aplicarModelo(user, id, dto);
  }

  @Post('formacoes/:id/trilha/ia')
  @RequirePermissions('trilha:editar', 'ia:usar')
  gerarComIa(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(gerarTrilhaIaSchema)) dto: GerarTrilhaIaDto) {
    return this.svc.gerarComIa(user, id, dto);
  }

  @Post('formacoes/:id/trilha/ia/:interacaoId')
  @RequirePermissions('trilha:editar')
  salvarDaIa(
    @CurrentUser() user: AuthUser, @Param('id') id: string, @Param('interacaoId') interacaoId: string,
    @Body(new ZodValidationPipe(salvarTrilhaIaSchema)) dto: SalvarTrilhaIaDto,
  ) {
    return this.svc.salvarDaIa(user, id, interacaoId, dto);
  }

  @Put('trilha/etapas/:etapaId/recurso')
  @RequirePermissions('trilha:editar')
  substituir(@CurrentUser() user: AuthUser, @Param('etapaId') etapaId: string, @Body(new ZodValidationPipe(substituirEtapaTrilhaSchema)) dto: SubstituirEtapaTrilhaDto) {
    return this.svc.substituir(user, etapaId, dto);
  }

  @Put('trilha/etapas/:etapaId')
  @RequirePermissions('trilha:editar')
  atualizar(@CurrentUser() user: AuthUser, @Param('etapaId') etapaId: string, @Body(new ZodValidationPipe(atualizarEtapaTrilhaSchema)) dto: AtualizarEtapaTrilhaDto) {
    return this.svc.atualizar(user, etapaId, dto);
  }

  @Post('trilha/etapas/:etapaId/mover')
  @RequirePermissions('trilha:editar')
  mover(@CurrentUser() user: AuthUser, @Param('etapaId') etapaId: string, @Body(new ZodValidationPipe(moverEtapaTrilhaSchema)) dto: MoverEtapaTrilhaDto) {
    return this.svc.mover(user, etapaId, dto);
  }

  @Delete('trilha/etapas/:etapaId')
  @RequirePermissions('trilha:editar')
  remover(@CurrentUser() user: AuthUser, @Param('etapaId') etapaId: string) {
    return this.svc.remover(user, etapaId);
  }

  @Post('trilha/etapas/:etapaId/conclusao')
  @RequirePermissions('participante:area')
  concluir(@CurrentUser() user: AuthUser, @Param('etapaId') etapaId: string, @Body(new ZodValidationPipe(concluirEtapaTrilhaSchema)) dto: ConcluirEtapaTrilhaDto) {
    return this.svc.concluir(user, etapaId, dto);
  }
}

@Module({
  controllers: [TrilhaController],
  providers: [TrilhaService],
})
export class TrilhaModule {}
