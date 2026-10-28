// Formadores do municipio: a curadoria (formador:alocar) aloca cada formador nas turmas que
// ele conduz, pela turma ou pelo formador, e gera links de cadastro (formador:convidar). O
// link e compartilhavel: vale ate a data escolhida, pode ser desativado e, se tiver turmas,
// ja aloca quem se cadastrar. O cadastro pelo link e publico; a pessoa entra logada.
import { randomBytes } from 'node:crypto';
import {
  BadRequestException, Body, ConflictException, Controller, Get, GoneException, Injectable, Module,
  NotFoundException, Param, Post, Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import bcrypt from 'bcryptjs';
import { forTenant, prisma, Prisma, runAsSystem } from '@formarede/db';
import {
  AlocarFormadoresDto, alocarFormadoresSchema, AuthUser, CadastroFormadorDto, cadastroFormadorSchema,
  ConviteFormador, ConvitePublico, CriarConviteDto, criarConviteSchema, formacaoEncerrada, FormadorRede,
  SituacaoConvite, TurmaAlocacao, TurmaRef, TurmasDoFormadorDto, turmasDoFormadorSchema,
} from '@formarede/contracts';
import { CurrentUser, Public, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { exigirFormadores } from '../../common/escopo';
import { AuditService } from '../../audit/audit.module';
import { AuthModule } from '../../auth/auth.module';
import { AuthService } from '../../auth/auth.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
const DIA = 24 * 60 * 60 * 1000;

type TurmaComFormacao = { id: string; nome: string; formacao: { id: string; titulo: string } };
const turmaRef = (t: TurmaComFormacao): TurmaRef => ({ id: t.id, nome: t.nome, formacao: t.formacao });
const TURMA_REF = { id: true, nome: true, formacao: { select: { id: true, titulo: true } } } as const;

function situacao(c: { expiraEm: Date; desativadoEm: Date | null }, agora = new Date()): SituacaoConvite {
  if (c.desativadoEm) return 'DESATIVADO';
  return c.expiraEm.getTime() < agora.getTime() ? 'EXPIRADO' : 'ATIVO';
}

@Injectable()
export class FormadoresService {
  constructor(private readonly audit: AuditService, private readonly auth: AuthService) {}

  /** As turmas informadas precisam existir no municipio; devolve-as com a formacao. */
  private async turmasDoMunicipio(tenantId: string, ids: string[]): Promise<TurmaComFormacao[]> {
    const unicos = [...new Set(ids)];
    if (!unicos.length) return [];
    const turmas = await forTenant(tenantId).turma.findMany({ where: { tenantId, id: { in: unicos } }, select: TURMA_REF });
    if (turmas.length !== unicos.length) throw new BadRequestException('Escolha turmas deste município.');
    return turmas;
  }

  async listar(user: AuthUser): Promise<FormadorRede[]> {
    const db = forTenant(user.tenantId);
    const vinculos = await db.membership.findMany({
      where: { tenantId: user.tenantId, role: 'FORMADOR', ativo: true },
      select: { userId: true, createdAt: true },
    });
    const ids = vinculos.map((v) => v.userId);
    if (!ids.length) return [];
    const [pessoas, alocacoes] = await Promise.all([
      // Usuario e global (fora do RLS do municipio): so os ids que tem vinculo aqui.
      prisma.user.findMany({ where: { id: { in: ids }, ativo: true }, select: { id: true, nome: true, email: true } }),
      db.turmaFormador.findMany({
        where: { tenantId: user.tenantId, userId: { in: ids } },
        orderBy: { createdAt: 'asc' },
        select: { userId: true, turma: { select: TURMA_REF } },
      }),
    ]);
    const desde = new Map(vinculos.map((v) => [v.userId, v.createdAt]));
    return pessoas
      .map((p) => ({
        id: p.id, nome: p.nome, email: p.email,
        desde: (desde.get(p.id) ?? new Date()).toISOString(),
        turmas: alocacoes.filter((a) => a.userId === p.id).map((a) => turmaRef(a.turma)),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  /** Todas as turmas do municipio com quem conduz cada uma (as sem formador primeiro). */
  async turmas(user: AuthUser): Promise<TurmaAlocacao[]> {
    const turmas = await forTenant(user.tenantId).turma.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, nome: true,
        formacao: { select: { id: true, titulo: true, etapaFluxo: true } },
        _count: { select: { inscricoes: { where: { status: { in: ['CONFIRMADA', 'CONCLUIDA'] } } } } },
        formadores: { orderBy: { createdAt: 'asc' }, select: { user: { select: { id: true, nome: true } } } },
      },
    });
    return turmas
      .map((t) => ({
        id: t.id, nome: t.nome, formacao: { id: t.formacao.id, titulo: t.formacao.titulo },
        encerrada: formacaoEncerrada(String(t.formacao.etapaFluxo)),
        inscritos: t._count.inscricoes,
        formadores: t.formadores.map((f) => f.user),
      }))
      .sort((a, b) => Number(a.encerrada) - Number(b.encerrada) || Number(a.formadores.length > 0) - Number(b.formadores.length > 0));
  }

  /** Troca as turmas de um formador pela lista informada. */
  async definirTurmas(user: AuthUser, formadorId: string, dto: TurmasDoFormadorDto): Promise<FormadorRede> {
    if (!UUID.test(formadorId)) throw new NotFoundException('Formador não encontrado.');
    await exigirFormadores(user.tenantId, [formadorId]);
    const turmas = await this.turmasDoMunicipio(user.tenantId, dto.turmaIds);
    const db = forTenant(user.tenantId);
    const ids = turmas.map((t) => t.id);
    await db.turmaFormador.deleteMany({ where: { tenantId: user.tenantId, userId: formadorId, turmaId: { notIn: ids } } });
    await db.turmaFormador.createMany({
      data: ids.map((turmaId) => ({ tenantId: user.tenantId, turmaId, userId: formadorId, alocadoPorId: user.id })),
      skipDuplicates: true,
    });
    await this.audit.record({
      action: 'UPDATE', entity: 'membership', entityId: formadorId, tenantId: user.tenantId, userId: user.id,
      metadata: { turmasDoFormador: ids },
    });
    const atual = (await this.listar(user)).find((f) => f.id === formadorId);
    if (!atual) throw new NotFoundException('Formador não encontrado.');
    return atual;
  }

  /** Troca quem conduz a turma pela lista informada. */
  async definirFormadores(user: AuthUser, turmaId: string, dto: AlocarFormadoresDto) {
    if (!UUID.test(turmaId)) throw new NotFoundException('Turma não encontrada.');
    const db = forTenant(user.tenantId);
    if (!(await db.turma.findFirst({ where: { id: turmaId, tenantId: user.tenantId }, select: { id: true } }))) {
      throw new NotFoundException('Turma não encontrada.');
    }
    const formadores = await exigirFormadores(user.tenantId, dto.formadorIds);
    await db.turmaFormador.deleteMany({ where: { tenantId: user.tenantId, turmaId, userId: { notIn: formadores } } });
    await db.turmaFormador.createMany({
      data: formadores.map((userId) => ({ tenantId: user.tenantId, turmaId, userId, alocadoPorId: user.id })),
      skipDuplicates: true,
    });
    await this.audit.record({
      action: 'UPDATE', entity: 'turma', entityId: turmaId, tenantId: user.tenantId, userId: user.id,
      metadata: { formadores },
    });
    const alocados = await db.turmaFormador.findMany({
      where: { tenantId: user.tenantId, turmaId }, orderBy: { createdAt: 'asc' }, select: { user: { select: { id: true, nome: true } } },
    });
    return alocados.map((a) => a.user);
  }

  // ---------- Links de cadastro ----------

  async convites(user: AuthUser): Promise<ConviteFormador[]> {
    const db = forTenant(user.tenantId);
    const lista = await db.conviteFormador.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const turmaIds = [...new Set(lista.flatMap((c) => c.turmaIds))];
    const autores = [...new Set(lista.map((c) => c.criadoPorId))];
    const [turmas, pessoas] = await Promise.all([
      turmaIds.length ? db.turma.findMany({ where: { tenantId: user.tenantId, id: { in: turmaIds } }, select: TURMA_REF }) : [],
      autores.length ? prisma.user.findMany({ where: { id: { in: autores } }, select: { id: true, nome: true } }) : [],
    ]);
    const turma = new Map(turmas.map((t) => [t.id, turmaRef(t)]));
    const nome = new Map(pessoas.map((p) => [p.id, p.nome]));
    const agora = new Date();
    return lista.map((c) => ({
      id: c.id, token: c.token, criadoEm: c.createdAt.toISOString(), criadoPor: nome.get(c.criadoPorId) ?? null,
      expiraEm: c.expiraEm.toISOString(), desativadoEm: c.desativadoEm?.toISOString() ?? null,
      situacao: situacao(c, agora), cadastros: c.cadastros,
      // Turma apagada depois de gerar o link some da lista (e do cadastro).
      turmas: c.turmaIds.flatMap((id) => turma.get(id) ?? []),
    }));
  }

  async criarConvite(user: AuthUser, dto: CriarConviteDto): Promise<ConviteFormador> {
    const turmas = await this.turmasDoMunicipio(user.tenantId, dto.turmaIds);
    const c = await forTenant(user.tenantId).conviteFormador.create({
      data: {
        tenantId: user.tenantId, criadoPorId: user.id, token: randomBytes(32).toString('base64url'),
        expiraEm: new Date(Date.now() + dto.validadeDias * DIA), turmaIds: turmas.map((t) => t.id),
      },
    });
    await this.audit.record({
      action: 'CREATE', entity: 'convite_formador', entityId: c.id, tenantId: user.tenantId, userId: user.id,
      metadata: { validadeDias: dto.validadeDias, turmas: c.turmaIds },
    });
    const criado = (await this.convites(user)).find((x) => x.id === c.id);
    if (!criado) throw new NotFoundException('Link não encontrado.');
    return criado;
  }

  async desativarConvite(user: AuthUser, id: string): Promise<ConviteFormador[]> {
    if (!UUID.test(id)) throw new NotFoundException('Link não encontrado.');
    const db = forTenant(user.tenantId);
    const c = await db.conviteFormador.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!c) throw new NotFoundException('Link não encontrado.');
    if (c.desativadoEm) throw new BadRequestException('Este link já está desativado.');
    await db.conviteFormador.update({ where: { id }, data: { desativadoEm: new Date() } });
    await this.audit.record({ action: 'UPDATE', entity: 'convite_formador', entityId: id, tenantId: user.tenantId, userId: user.id, metadata: { desativado: true } });
    return this.convites(user);
  }

  // ---------- Cadastro publico pelo link ----------

  /** O convite pelo token, sem contexto de municipio; recusa o expirado e o desativado. */
  private async conviteValido(tx: Prisma.TransactionClient, token: string) {
    if (!TOKEN.test(token)) throw new NotFoundException('Link de cadastro não encontrado.');
    const c = await tx.conviteFormador.findUnique({ where: { token }, include: { tenant: { select: { id: true, nome: true, slug: true } } } });
    if (!c) throw new NotFoundException('Link de cadastro não encontrado.');
    if (situacao(c) !== 'ATIVO') {
      throw new GoneException('Este link de cadastro não vale mais. Peça um novo à curadoria do seu município.');
    }
    return c;
  }

  async convitePublico(token: string): Promise<ConvitePublico> {
    return runAsSystem(async (tx) => {
      const c = await this.conviteValido(tx, token);
      const turmas = c.turmaIds.length
        ? await tx.turma.findMany({ where: { tenantId: c.tenantId, id: { in: c.turmaIds } }, select: TURMA_REF })
        : [];
      return { municipio: c.tenant.nome, expiraEm: c.expiraEm.toISOString(), turmas: turmas.map(turmaRef) };
    });
  }

  async cadastrar(token: string, dto: CadastroFormadorDto) {
    const { tenantSlug, userId, conviteId, tenantId } = await runAsSystem(async (tx) => {
      const c = await this.conviteValido(tx, token);
      let pessoa = await tx.user.findUnique({ where: { email: dto.email } });
      if (pessoa) {
        // Quem ja tem conta confirma com a senha dela; o cadastro nao troca a senha de ninguem.
        if (!pessoa.ativo || !(await bcrypt.compare(dto.senha, pessoa.senhaHash))) {
          throw new ConflictException('Este e-mail já tem cadastro na plataforma. Use a senha dessa conta, ou outro e-mail.');
        }
        const outro = await tx.membership.findFirst({ where: { tenantId: c.tenantId, userId: pessoa.id, role: { not: 'FORMADOR' } } });
        if (outro) throw new ConflictException('Este e-mail já está na rede com outro perfil. Fale com a curadoria do seu município.');
      } else {
        pessoa = await tx.user.create({ data: { email: dto.email, nome: dto.nome, senhaHash: await bcrypt.hash(dto.senha, 10) } });
      }
      const vinculo = await tx.membership.findFirst({ where: { tenantId: c.tenantId, userId: pessoa.id, role: 'FORMADOR' } });
      if (!vinculo) await tx.membership.create({ data: { tenantId: c.tenantId, userId: pessoa.id, role: 'FORMADOR' } });
      else if (!vinculo.ativo) await tx.membership.update({ where: { id: vinculo.id }, data: { ativo: true } });
      // Turmas do link que ainda existem: quem se cadastra ja conduz.
      const turmas = c.turmaIds.length
        ? await tx.turma.findMany({ where: { tenantId: c.tenantId, id: { in: c.turmaIds } }, select: { id: true } })
        : [];
      await tx.turmaFormador.createMany({
        data: turmas.map((t) => ({ tenantId: c.tenantId, turmaId: t.id, userId: pessoa.id, alocadoPorId: c.criadoPorId })),
        skipDuplicates: true,
      });
      await tx.conviteFormador.update({ where: { id: c.id }, data: { cadastros: { increment: 1 } } });
      return { tenantSlug: c.tenant.slug, userId: pessoa.id, conviteId: c.id, tenantId: c.tenantId };
    });
    await this.audit.record({
      action: 'CREATE', entity: 'membership', entityId: userId, tenantId, userId,
      metadata: { papel: 'FORMADOR', conviteId },
    });
    return this.auth.login(dto.email, dto.senha, tenantSlug);
  }
}

@Controller()
export class FormadoresController {
  constructor(private readonly svc: FormadoresService) {}

  @Get('formadores')
  @RequirePermissions('formador:alocar')
  listar(@CurrentUser() user: AuthUser) {
    return this.svc.listar(user);
  }

  @Get('turmas')
  @RequirePermissions('formador:alocar')
  turmas(@CurrentUser() user: AuthUser) {
    return this.svc.turmas(user);
  }

  @Put('formadores/:id/turmas')
  @RequirePermissions('formador:alocar')
  definirTurmas(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(turmasDoFormadorSchema)) dto: TurmasDoFormadorDto) {
    return this.svc.definirTurmas(user, id, dto);
  }

  @Put('turmas/:id/formadores')
  @RequirePermissions('formador:alocar')
  definirFormadores(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(alocarFormadoresSchema)) dto: AlocarFormadoresDto) {
    return this.svc.definirFormadores(user, id, dto);
  }

  @Get('convites')
  @RequirePermissions('formador:convidar')
  convites(@CurrentUser() user: AuthUser) {
    return this.svc.convites(user);
  }

  @Post('convites')
  @RequirePermissions('formador:convidar')
  criarConvite(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(criarConviteSchema)) dto: CriarConviteDto) {
    return this.svc.criarConvite(user, dto);
  }

  @Post('convites/:id/desativar')
  @RequirePermissions('formador:convidar')
  desativarConvite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.desativarConvite(user, id);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('convites/publico/:token')
  convitePublico(@Param('token') token: string) {
    return this.svc.convitePublico(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('convites/publico/:token/cadastro')
  cadastrar(@Param('token') token: string, @Body(new ZodValidationPipe(cadastroFormadorSchema)) dto: CadastroFormadorDto) {
    return this.svc.cadastrar(token, dto);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [FormadoresController],
  providers: [FormadoresService],
})
export class FormadoresModule {}
