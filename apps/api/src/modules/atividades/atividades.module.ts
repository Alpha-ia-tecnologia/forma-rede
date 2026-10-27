// Atividades e entregas (RF-083..088): formador cria atividades por formacao;
// professor envia entrega; formador avalia com nota/feedback ou pede ajuste.
import {
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
  AuthUser,
  AvaliarEntregaDto,
  avaliarEntregaSchema,
  CreateAtividadeDto,
  createAtividadeSchema,
  EnviarEntregaDto,
  enviarEntregaSchema,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';

@Injectable()
export class AtividadesService {
  create(tenantId: string, formacaoId: string, dto: CreateAtividadeDto) {
    return forTenant(tenantId).atividade.create({
      data: { ...dto, tenantId, formacaoId },
    });
  }

  /** Entregas de uma atividade, para avaliacao do formador. */
  entregas(tenantId: string, atividadeId: string) {
    return forTenant(tenantId).entrega.findMany({
      where: { atividadeId },
      orderBy: { enviadaEm: 'asc' },
      include: {
        inscricao: { include: { user: { select: { nome: true, email: true } } } },
      },
    });
  }

  /** Professor envia (ou reenvia apos ajuste) a propria entrega. */
  async enviar(tenantId: string, userId: string, atividadeId: string, dto: EnviarEntregaDto) {
    const db = forTenant(tenantId);
    const atividade = await db.atividade.findFirst({ where: { id: atividadeId } });
    if (!atividade) throw new NotFoundException('Atividade nao encontrada.');

    const inscricao = await db.inscricao.findFirst({
      where: { userId, turma: { formacaoId: atividade.formacaoId }, status: 'CONFIRMADA' },
    });
    if (!inscricao) {
      throw new ForbiddenException('Voce nao esta inscrito nesta formacao.');
    }

    return db.entrega.upsert({
      where: { atividadeId_inscricaoId: { atividadeId, inscricaoId: inscricao.id } },
      update: { ...dto, status: 'ENVIADA', enviadaEm: new Date() },
      create: { ...dto, tenantId, atividadeId, inscricaoId: inscricao.id },
    });
  }

  async avaliar(tenantId: string, userId: string, entregaId: string, dto: AvaliarEntregaDto) {
    const db = forTenant(tenantId);
    const entrega = await db.entrega.findFirst({ where: { id: entregaId } });
    if (!entrega) throw new NotFoundException('Entrega nao encontrada.');

    return db.entrega.update({
      where: { id: entregaId },
      data: {
        nota: dto.solicitarAjuste ? null : dto.nota,
        feedback: dto.feedback,
        status: dto.solicitarAjuste ? 'EM_AJUSTE' : 'AVALIADA',
        avaliadoPorId: userId,
        avaliadaEm: new Date(),
      },
    });
  }
}

@Controller()
export class AtividadesController {
  constructor(private readonly svc: AtividadesService) {}

  @Post('formacoes/:formacaoId/atividades')
  @RequirePermissions('atividade:create')
  create(
    @CurrentUser() user: AuthUser,
    @Param('formacaoId') formacaoId: string,
    @Body(new ZodValidationPipe(createAtividadeSchema)) dto: CreateAtividadeDto,
  ) {
    return this.svc.create(user.tenantId, formacaoId, dto);
  }

  @Get('atividades/:id/entregas')
  @RequirePermissions('entrega:read')
  entregas(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.entregas(user.tenantId, id);
  }

  @Post('atividades/:id/entrega')
  @RequirePermissions('entrega:create')
  enviar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(enviarEntregaSchema)) dto: EnviarEntregaDto,
  ) {
    return this.svc.enviar(user.tenantId, user.id, id, dto);
  }

  @Post('entregas/:id/avaliacao')
  @RequirePermissions('entrega:avaliar')
  avaliar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(avaliarEntregaSchema)) dto: AvaliarEntregaDto,
  ) {
    return this.svc.avaliar(user.tenantId, user.id, id, dto);
  }
}

@Module({
  controllers: [AtividadesController],
  providers: [AtividadesService],
})
export class AtividadesModule {}
