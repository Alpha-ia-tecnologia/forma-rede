// Devolutivas da curadoria para quem conduz a formacao. A curadoria (devolutiva:criar)
// escreve sobre o plano, a trilha, as atividades ou os encontros; quem conduz responde e
// marca como resolvida. A vez de responder e de quem nao escreveu a ultima mensagem: e o
// que o Inicio de cada um cobra. O formador ve so as das formacoes em que foi alocado.
import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post,
} from '@nestjs/common';
import { forTenant, prisma } from '@formarede/db';
import {
  AuthUser, CriarDevolutivaDto, criarDevolutivaSchema, DevolutivaFormacao, DevolutivasPendentes,
  formacaoEncerrada, ResolverDevolutivaDto, resolverDevolutivaSchema, ResponderDevolutivaDto,
  responderDevolutivaSchema, TemaDevolutiva,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { AuditService } from '../../audit/audit.module';
import { escopoConducao, exigirFormacao, naFormacao } from '../../common/escopo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const daCuradoria = (u: AuthUser) => u.permissions.includes('*') || u.permissions.includes('devolutiva:criar');

/** De quem e a vez: de quem nao escreveu a ultima mensagem (a devolutiva e sempre da curadoria). */
function aguarda(resolvida: boolean, ultimaDaCuradoria: boolean): DevolutivaFormacao['aguarda'] {
  if (resolvida) return null;
  return ultimaDaCuradoria ? 'CONDUCAO' : 'CURADORIA';
}

@Injectable()
export class DevolutivasService {
  constructor(private readonly audit: AuditService) {}

  private async formacao(user: AuthUser, formacaoId: string) {
    if (!UUID.test(formacaoId)) throw new NotFoundException('Formação não encontrada.');
    const f = await forTenant(user.tenantId).formacao.findFirst({ where: { id: formacaoId, tenantId: user.tenantId }, select: { id: true } });
    if (!f) throw new NotFoundException('Formação não encontrada.');
    await exigirFormacao(user, formacaoId);
  }

  private async devolutiva(user: AuthUser, id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Devolutiva não encontrada.');
    const d = await forTenant(user.tenantId).devolutivaFormacao.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!d) throw new NotFoundException('Devolutiva não encontrada.');
    await exigirFormacao(user, d.formacaoId, 'Devolutiva não encontrada.');
    return d;
  }

  async listar(user: AuthUser, formacaoId: string): Promise<DevolutivaFormacao[]> {
    await this.formacao(user, formacaoId);
    const lista = await forTenant(user.tenantId).devolutivaFormacao.findMany({
      where: { formacaoId, tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      include: { respostas: { orderBy: { createdAt: 'asc' } } },
    });
    // Nomes de quem escreveu (usuario e global, fora do RLS do municipio).
    const ids = [...new Set(lista.flatMap((d) => [d.autorId, d.resolvidaPorId, ...d.respostas.map((r) => r.autorId)]).filter((x): x is string => !!x))];
    const nome = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : []).map((u) => [u.id, u.nome]));
    return lista.map((d) => {
      const ultima = d.respostas.at(-1);
      return {
        id: d.id, tema: d.tema as TemaDevolutiva, texto: d.texto, autor: nome.get(d.autorId) ?? null,
        criadaEm: d.createdAt.toISOString(),
        resolvidaEm: d.resolvidaEm?.toISOString() ?? null,
        resolvidaPor: d.resolvidaPorId ? nome.get(d.resolvidaPorId) ?? null : null,
        respostas: d.respostas.map((r) => ({
          id: r.id, texto: r.texto, autor: nome.get(r.autorId) ?? null, daCuradoria: r.daCuradoria, criadaEm: r.createdAt.toISOString(),
        })),
        aguarda: aguarda(!!d.resolvidaEm, ultima ? ultima.daCuradoria : true),
      };
    });
  }

  async criar(user: AuthUser, formacaoId: string, dto: CriarDevolutivaDto) {
    await this.formacao(user, formacaoId);
    const d = await forTenant(user.tenantId).devolutivaFormacao.create({
      data: { tenantId: user.tenantId, formacaoId, autorId: user.id, tema: dto.tema, texto: dto.texto },
    });
    await this.audit.record({ action: 'CREATE', entity: 'devolutiva_formacao', entityId: d.id, tenantId: user.tenantId, userId: user.id, metadata: { formacaoId, tema: dto.tema } });
    return this.listar(user, formacaoId);
  }

  async responder(user: AuthUser, id: string, dto: ResponderDevolutivaDto) {
    const d = await this.devolutiva(user, id);
    if (d.resolvidaEm) throw new BadRequestException('Esta devolutiva já foi resolvida; reabra para continuar a conversa.');
    await forTenant(user.tenantId).devolutivaResposta.create({
      data: { tenantId: user.tenantId, devolutivaId: id, autorId: user.id, daCuradoria: daCuradoria(user), texto: dto.texto },
    });
    return this.listar(user, d.formacaoId);
  }

  async resolver(user: AuthUser, id: string, dto: ResolverDevolutivaDto) {
    const d = await this.devolutiva(user, id);
    if (dto.resolvida === !!d.resolvidaEm) {
      throw new BadRequestException(dto.resolvida ? 'Esta devolutiva já está resolvida.' : 'Esta devolutiva já está aberta.');
    }
    await forTenant(user.tenantId).devolutivaFormacao.update({
      where: { id },
      data: dto.resolvida ? { resolvidaEm: new Date(), resolvidaPorId: user.id } : { resolvidaEm: null, resolvidaPorId: null },
    });
    await this.audit.record({ action: 'UPDATE', entity: 'devolutiva_formacao', entityId: id, tenantId: user.tenantId, userId: user.id, metadata: { resolvida: dto.resolvida } });
    return this.listar(user, d.formacaoId);
  }

  /** O que espera o usuario, por formacao em andamento: a curadoria ve as respostas; quem conduz, as devolutivas. */
  async pendentes(user: AuthUser): Promise<DevolutivasPendentes[]> {
    const vez = daCuradoria(user) ? 'CURADORIA' : 'CONDUCAO';
    const escopo = await escopoConducao(user);
    const abertas = await forTenant(user.tenantId).devolutivaFormacao.findMany({
      where: { tenantId: user.tenantId, resolvidaEm: null, formacaoId: naFormacao(escopo) },
      include: {
        respostas: { orderBy: { createdAt: 'desc' }, take: 1, select: { daCuradoria: true } },
        formacao: { select: { id: true, titulo: true, etapaFluxo: true } },
      },
    });
    const porFormacao = new Map<string, DevolutivasPendentes>();
    for (const d of abertas) {
      if (formacaoEncerrada(String(d.formacao.etapaFluxo))) continue;
      if (aguarda(false, d.respostas[0]?.daCuradoria ?? true) !== vez) continue;
      const atual = porFormacao.get(d.formacao.id) ?? { formacao: { id: d.formacao.id, titulo: d.formacao.titulo }, quantidade: 0 };
      atual.quantidade += 1;
      porFormacao.set(d.formacao.id, atual);
    }
    return [...porFormacao.values()];
  }
}

@Controller()
export class DevolutivasController {
  constructor(private readonly svc: DevolutivasService) {}

  @Get('formacoes/:id/devolutivas')
  @RequirePermissions('devolutiva:responder')
  listar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.listar(user, id);
  }

  @Post('formacoes/:id/devolutivas')
  @RequirePermissions('devolutiva:criar')
  criar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(criarDevolutivaSchema)) dto: CriarDevolutivaDto) {
    return this.svc.criar(user, id, dto);
  }

  @Post('devolutivas/:id/respostas')
  @RequirePermissions('devolutiva:responder')
  responder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(responderDevolutivaSchema)) dto: ResponderDevolutivaDto) {
    return this.svc.responder(user, id, dto);
  }

  @Post('devolutivas/:id/resolucao')
  @RequirePermissions('devolutiva:responder')
  resolver(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(resolverDevolutivaSchema)) dto: ResolverDevolutivaDto) {
    return this.svc.resolver(user, id, dto);
  }

  @Get('devolutivas/pendentes')
  @RequirePermissions('devolutiva:responder')
  pendentes(@CurrentUser() user: AuthUser) {
    return this.svc.pendentes(user);
  }
}

@Module({
  controllers: [DevolutivasController],
  providers: [DevolutivasService],
})
export class DevolutivasModule {}
