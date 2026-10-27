// Formacoes: CRUD, modulos, turmas e o fluxo das 5 etapas (RF-017..034).
// Avancar exige decisao APROVADA; DEVOLVIDA volta uma etapa com justificativa;
// CANCELADA encerra. Toda transicao vira EtapaTransicao + AuditLog.
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { forTenant } from '@formarede/db';
import {
  AcompanhamentoFormacao,
  AuthUser,
  chamadaPendente,
  contarSemMarca,
  CreateFormacaoDto,
  createFormacaoSchema,
  CreateModuloDto,
  createModuloSchema,
  CreateTurmaDto,
  createTurmaSchema,
  TransicaoEtapaDto,
  transicaoEtapaSchema,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { AuditService } from '../../audit/audit.module';

const ORDEM: string[] = ['PLANEJAMENTO', 'CURADORIA', 'DESENHO', 'EXECUCAO', 'AVALIACAO', 'CONCLUIDA'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tem = (u: AuthUser, p: string) => u.permissions.includes('*') || u.permissions.includes(p);
/** Quem conduz ou acompanha a formacao (o cursista tem a propria participacao). */
const CONDUZ = ['trilha:editar', 'frequencia:registrar', 'entrega:read', 'inscricao:read', 'formacao:update'];

@Injectable()
export class FormacoesService {
  constructor(private readonly audit: AuditService) {}

  list(tenantId: string) {
    return forTenant(tenantId).formacao.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { turmas: true, modulos: true, atividades: true } } },
    });
  }

  async detail(tenantId: string, id: string) {
    const formacao = await forTenant(tenantId).formacao.findFirst({
      where: { id },
      include: {
        modulos: { orderBy: { ordem: 'asc' } },
        turmas: { include: { _count: { select: { inscricoes: true, encontros: true } } } },
        materiais: { include: { material: true } },
        atividades: { orderBy: { createdAt: 'asc' } },
        transicoes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!formacao) throw new NotFoundException('Formacao nao encontrada.');
    // Quem decidiu cada transicao (governanca: a decisao tem autoria).
    const ids = [...new Set(formacao.transicoes.map((t) => t.decididoPorId))];
    const pessoas = ids.length
      ? await forTenant(tenantId).user.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
      : [];
    const nome = new Map(pessoas.map((p) => [p.id, p.nome]));
    return {
      ...formacao,
      transicoes: formacao.transicoes.map((t) => ({ ...t, decididoPor: nome.get(t.decididoPorId) ?? null })),
    };
  }

  /**
   * Painel de quem conduz: turmas, encontros com a situacao da chamada, proximo
   * encontro, chamadas pendentes e, para quem acompanha entregas, a fila por atividade.
   */
  async acompanhamento(user: AuthUser, id: string): Promise<AcompanhamentoFormacao> {
    if (!CONDUZ.some((p) => tem(user, p))) {
      throw new ForbiddenException('Este painel é de quem conduz ou acompanha a formação.');
    }
    if (!UUID.test(id)) throw new NotFoundException('Formacao nao encontrada.');
    const f = await forTenant(user.tenantId).formacao.findFirst({
      where: { id },
      include: {
        turmas: {
          orderBy: { createdAt: 'asc' },
          include: {
            _count: { select: { inscricoes: { where: { status: { in: ['CONFIRMADA', 'CONCLUIDA'] } } } } },
            inscricoes: { where: { status: 'CONFIRMADA' }, select: { id: true, createdAt: true } },
            encontros: { orderBy: { inicio: 'asc' }, include: { frequencias: { select: { presente: true, inscricaoId: true } } } },
          },
        },
        atividades: { orderBy: { createdAt: 'asc' }, include: { entregas: { select: { status: true } } } },
      },
    });
    if (!f) throw new NotFoundException('Formacao nao encontrada.');

    const agora = Date.now();
    const encontros = f.turmas
      .flatMap((t) => t.encontros.map((e) => ({
        id: e.id, titulo: e.titulo, inicio: e.inicio.toISOString(), fim: e.fim?.toISOString() ?? null,
        local: e.local, linkVirtual: e.linkVirtual, cancelado: e.status === 'CANCELADO',
        turma: { id: t.id, nome: t.nome },
        chamadaRegistrada: e.frequencias.length > 0,
        presentes: e.frequencias.filter((r) => r.presente).length,
        semMarca: contarSemMarca(t.inscricoes, e.frequencias, e),
      })))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const fimDe = (e: (typeof encontros)[number]) => new Date(e.fim ?? e.inicio).getTime();

    return {
      cursistas: f.turmas.reduce((s, t) => s + t._count.inscricoes, 0),
      turmas: f.turmas.map((t) => ({ id: t.id, nome: t.nome, vagas: t.vagas, inscritos: t._count.inscricoes })),
      encontros,
      proximoEncontro: encontros.find((e) => !e.cancelado && fimDe(e) >= agora) ?? null,
      chamadasPendentes: encontros.filter((e) => chamadaPendente(e, new Date(agora))),
      atividades: tem(user, 'entrega:read')
        ? f.atividades.map((a) => {
          const conta = (st: string) => a.entregas.filter((e) => e.status === st).length;
          return {
            id: a.id, titulo: a.titulo, descricao: a.descricao, criterios: a.criterios,
            prazo: a.prazo?.toISOString() ?? null, pontuacao: a.pontuacao,
            enviadas: a.entregas.length, aguardando: conta('ENVIADA'), emAjuste: conta('EM_AJUSTE'), avaliadas: conta('AVALIADA'),
          };
        })
        : null,
    };
  }

  async create(tenantId: string, userId: string, dto: CreateFormacaoDto) {
    const formacao = await forTenant(tenantId).formacao.create({
      data: { ...dto, tenantId, criadoPorId: userId },
    });
    await this.audit.record({
      action: 'CREATE', entity: 'formacao', entityId: formacao.id, tenantId, userId,
    });
    return formacao;
  }

  async transicao(tenantId: string, userId: string, id: string, dto: TransicaoEtapaDto) {
    const db = forTenant(tenantId);
    const formacao = await db.formacao.findFirst({ where: { id } });
    if (!formacao) throw new NotFoundException('Formacao nao encontrada.');

    const atual = formacao.etapaFluxo as string;
    if (atual === 'CONCLUIDA' || atual === 'CANCELADA') {
      throw new BadRequestException('Formacao ja encerrada.');
    }

    let proxima: string;
    if (dto.decisao === 'CANCELADA') {
      proxima = 'CANCELADA';
    } else if (dto.decisao === 'DEVOLVIDA') {
      const idx = ORDEM.indexOf(atual);
      if (idx <= 0) throw new BadRequestException('Nao ha etapa anterior para devolver.');
      proxima = ORDEM[idx - 1] as string;
    } else {
      const idx = ORDEM.indexOf(atual);
      if (idx < 0 || idx >= ORDEM.length - 1) {
        throw new BadRequestException('Nao ha proxima etapa.');
      }
      proxima = ORDEM[idx + 1] as string;
    }

    const [atualizada] = await Promise.all([
      db.formacao.update({ where: { id }, data: { etapaFluxo: proxima as never } }),
      db.etapaTransicao.create({
        data: {
          tenantId,
          formacaoId: id,
          deEtapa: atual as never,
          paraEtapa: proxima as never,
          decisao: dto.decisao,
          justificativa: dto.justificativa,
          decididoPorId: userId,
        },
      }),
    ]);
    await this.audit.record({
      action: dto.decisao === 'APROVADA' ? 'APPROVE' : 'REJECT',
      entity: 'formacao', entityId: id, tenantId, userId,
      metadata: { de: atual, para: proxima, justificativa: dto.justificativa },
    });
    return atualizada;
  }

  createModulo(tenantId: string, formacaoId: string, dto: CreateModuloDto) {
    return forTenant(tenantId).moduloFormacao.create({
      data: { ...dto, tenantId, formacaoId },
    });
  }

  createTurma(tenantId: string, formacaoId: string, dto: CreateTurmaDto) {
    return forTenant(tenantId).turma.create({
      data: { ...dto, tenantId, formacaoId },
    });
  }
}

@Controller('formacoes')
export class FormacoesController {
  constructor(private readonly svc: FormacoesService) {}

  @Get()
  @RequirePermissions('formacao:read')
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('formacao:read')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.detail(user.tenantId, id);
  }

  @Get(':id/acompanhamento')
  @RequirePermissions('formacao:read')
  acompanhamento(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.acompanhamento(user, id);
  }

  @Post()
  @RequirePermissions('formacao:create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createFormacaoSchema)) dto: CreateFormacaoDto,
  ) {
    return this.svc.create(user.tenantId, user.id, dto);
  }

  @Post(':id/transicao')
  @RequirePermissions('formacao:transicao')
  transicao(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transicaoEtapaSchema)) dto: TransicaoEtapaDto,
  ) {
    return this.svc.transicao(user.tenantId, user.id, id, dto);
  }

  @Post(':id/modulos')
  @RequirePermissions('modulo:create')
  createModulo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createModuloSchema)) dto: CreateModuloDto,
  ) {
    return this.svc.createModulo(user.tenantId, id, dto);
  }

  @Post(':id/turmas')
  @RequirePermissions('turma:create')
  createTurma(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createTurmaSchema)) dto: CreateTurmaDto,
  ) {
    return this.svc.createTurma(user.tenantId, id, dto);
  }
}

@Module({
  controllers: [FormacoesController],
  providers: [FormacoesService],
})
export class FormacoesModule {}
