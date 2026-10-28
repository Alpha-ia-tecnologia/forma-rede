// Encontros e frequencia (RF-065..073). O formador agenda encontros por turma
// e registra presenca em lote (upsert por inscricao). O formador ve e age so nas turmas
// em que foi alocado (common/escopo); um encontro de outra turma responde 404.
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { forTenant } from '@formarede/db';
import {
  AuthUser,
  contarSemMarca,
  CreateEncontroDto,
  inscritoDepois,
  createEncontroSchema,
  RegistrarFrequenciaDto,
  registrarFrequenciaSchema,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { escopoConducao, exigirTurma, naTurma } from '../../common/escopo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class EncontrosService {
  async list(user: AuthUser, turmaId?: string) {
    const escopo = await escopoConducao(user);
    if (escopo && turmaId && !escopo.turmas.includes(turmaId)) return [];
    const encontros = await forTenant(user.tenantId).encontro.findMany({
      where: { turmaId: turmaId ?? naTurma(escopo) },
      orderBy: { inicio: 'asc' },
      include: {
        modulo: true,
        turma: { include: { formacao: { select: { titulo: true } }, inscricoes: { where: { status: 'CONFIRMADA' }, select: { id: true, createdAt: true } } } },
        frequencias: { select: { inscricaoId: true } },
        _count: { select: { frequencias: true } },
      },
    });
    // A lista diz quantos cursistas ainda estao sem marca (chamada incompleta).
    return encontros.map(({ frequencias, turma: { inscricoes, ...turma }, ...e }) => ({
      ...e, turma, semMarca: contarSemMarca(inscricoes, frequencias, e),
    }));
  }

  async create(user: AuthUser, dto: CreateEncontroDto) {
    const { turmaId, moduloId, ...rest } = dto;
    await exigirTurma(user, turmaId);
    return forTenant(user.tenantId).encontro.create({
      data: { ...rest, tenantId: user.tenantId, turmaId, moduloId },
    });
  }

  /** O encontro, se for de uma turma que a pessoa conduz (404 como se nao existisse). */
  private async encontroNoEscopo(user: AuthUser, id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Encontro nao encontrado.');
    const e = await forTenant(user.tenantId).encontro.findFirst({ where: { id }, select: { turmaId: true } });
    if (!e) throw new NotFoundException('Encontro nao encontrado.');
    await exigirTurma(user, e.turmaId, 'Encontro nao encontrado.');
  }

  /** Um encontro com turma e formacao: o contexto da tela de chamada. */
  async detalhe(user: AuthUser, id: string) {
    await this.encontroNoEscopo(user, id);
    const e = await forTenant(user.tenantId).encontro.findFirst({
      where: { id },
      include: {
        modulo: { select: { titulo: true } },
        turma: { select: { id: true, nome: true, formacao: { select: { id: true, titulo: true } } } },
        _count: { select: { frequencias: true } },
      },
    });
    if (!e) throw new NotFoundException('Encontro nao encontrado.');
    return e;
  }

  /** Lista participantes da turma do encontro com a presenca ja registrada e a escola de cada um. */
  async chamada(user: AuthUser, encontroId: string) {
    await this.encontroNoEscopo(user, encontroId);
    const db = forTenant(user.tenantId);
    const encontro = await db.encontro.findFirst({
      where: { id: encontroId },
      include: { frequencias: true },
    });
    if (!encontro) throw new NotFoundException('Encontro nao encontrado.');

    const inscricoes = await db.inscricao.findMany({
      where: { turmaId: encontro.turmaId, status: 'CONFIRMADA' },
      include: { user: { select: { id: true, nome: true, email: true } } },
    });

    const vinculos = await db.membership.findMany({
      where: { userId: { in: inscricoes.map((i) => i.userId) }, escolaId: { not: null } },
      select: { userId: true, escola: { select: { nome: true } } },
    });
    const escolaDe = new Map(vinculos.map((v) => [v.userId, v.escola?.nome ?? null]));

    const porInscricao = new Map(encontro.frequencias.map((f) => [f.inscricaoId, f]));
    return inscricoes.map((i) => ({
      inscricaoId: i.id,
      participante: i.user,
      escola: escolaDe.get(i.userId) ?? null,
      presente: porInscricao.get(i.id)?.presente ?? null,
      justificativa: porInscricao.get(i.id)?.justificativa ?? null,
      // Inscricao feita depois do encontro: aparece na lista, mas nao precisa de marca.
      inscritoDepois: inscritoDepois(i, encontro),
    }));
  }

  async registrarFrequencia(user: AuthUser, encontroId: string, dto: RegistrarFrequenciaDto) {
    await this.encontroNoEscopo(user, encontroId);
    const tenantId = user.tenantId;
    const db = forTenant(tenantId);
    const encontro = await db.encontro.findFirst({ where: { id: encontroId } });
    if (!encontro) throw new NotFoundException('Encontro nao encontrado.');

    // So inscricoes da turma do encontro: o id vem do cliente, e o RLS so garante o municipio.
    const ids = [...new Set(dto.registros.map((r) => r.inscricaoId))];
    const daTurma = await db.inscricao.count({ where: { id: { in: ids }, turmaId: encontro.turmaId } });
    if (daTurma !== ids.length) {
      throw new BadRequestException('A chamada tem participantes que não são desta turma.');
    }

    for (const r of dto.registros) {
      await db.frequencia.upsert({
        where: { encontroId_inscricaoId: { encontroId, inscricaoId: r.inscricaoId } },
        update: { presente: r.presente, justificativa: r.justificativa },
        create: {
          tenantId,
          encontroId,
          inscricaoId: r.inscricaoId,
          presente: r.presente,
          justificativa: r.justificativa,
        },
      });
    }
    return { registrados: dto.registros.length };
  }
}

@Controller('encontros')
export class EncontrosController {
  constructor(private readonly svc: EncontrosService) {}

  @Get()
  @RequirePermissions('encontro:read')
  list(@CurrentUser() user: AuthUser, @Query('turmaId') turmaId?: string) {
    return this.svc.list(user, turmaId);
  }

  @Post()
  @RequirePermissions('encontro:create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEncontroSchema)) dto: CreateEncontroDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('encontro:read')
  detalhe(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.detalhe(user, id);
  }

  @Get(':id/chamada')
  @RequirePermissions('frequencia:registrar')
  chamada(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.chamada(user, id);
  }

  @Post(':id/frequencia')
  @RequirePermissions('frequencia:registrar')
  registrar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(registrarFrequenciaSchema)) dto: RegistrarFrequenciaDto,
  ) {
    return this.svc.registrarFrequencia(user, id, dto);
  }
}

@Module({
  controllers: [EncontrosController],
  providers: [EncontrosService],
})
export class EncontrosModule {}
