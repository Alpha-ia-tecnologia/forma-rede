// Trilha formativa: etapas em ordem com videos, documentos, podcasts e materiais do
// acervo. Todo recurso e um Material (curadoria, RIA-003/006): recurso novo entra
// EM_REVISAO e so os APROVADOS aparecem para os cursistas. O material entra tambem na
// colecao da formacao (MaterialFormacao), que alimenta o copiloto e o assistente.
// O cursista marca etapas como concluidas; quem edita ve quantos concluiram.
import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Post, Put,
} from '@nestjs/common';
import { forTenant } from '@formarede/db';
import {
  AtualizarEtapaTrilhaDto, atualizarEtapaTrilhaSchema, AuthUser, ConcluirEtapaTrilhaDto,
  concluirEtapaTrilhaSchema, CriarEtapaTrilhaDto, criarEtapaTrilhaSchema, EtapaTrilha,
  MaterialTipo, MoverEtapaTrilhaDto, moverEtapaTrilhaSchema, TrilhaFormacao,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { AuditService } from '../../audit/audit.module';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSCRITO = { in: ['CONFIRMADA', 'CONCLUIDA'] as ('CONFIRMADA' | 'CONCLUIDA')[] };

const podeEditar = (u: AuthUser) => u.permissions.includes('*') || u.permissions.includes('trilha:editar');

@Injectable()
export class TrilhaService {
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
      material: { ...e.material, tipo: e.material.tipo as MaterialTipo, status: String(e.material.status) },
      concluida: concluidas.has(e.id),
      concluintes: editor ? e._count.progresso : null,
    }));
    const obrigatorias = lista.filter((e) => e.obrigatoria && e.material.status === 'APROVADO');
    return {
      formacaoId,
      podeEditar: editor,
      inscricaoId: inscricao?.id ?? null,
      totalCursistas,
      progresso: inscricao ? { concluidas: obrigatorias.filter((e) => e.concluida).length, obrigatorias: obrigatorias.length } : null,
      etapas: lista,
    };
  }

  async criar(user: AuthUser, formacaoId: string, dto: CriarEtapaTrilhaDto): Promise<TrilhaFormacao> {
    await this.formacaoExiste(user.tenantId, formacaoId);
    await this.validarModulo(user.tenantId, formacaoId, dto.moduloId);
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
    if (e.material.status !== 'APROVADO') throw new NotFoundException('Etapa não encontrada.');
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
