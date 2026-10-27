// Curadoria de materiais (RF-045..054): cadastro com autoria/licenca,
// aprovacao pelo curador e vinculo a formacoes (colecoes).
import {
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
  CreateMaterialDto,
  createMaterialSchema,
  DecidirMaterialDto,
  decidirMaterialSchema,
} from '@formarede/contracts';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { AuditService } from '../../audit/audit.module';

const vincularSchema = z.object({ formacaoId: z.string().uuid() });

@Injectable()
export class MateriaisService {
  constructor(private readonly audit: AuditService) {}

  list(tenantId: string, status?: string) {
    return forTenant(tenantId).material.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { formacoes: { include: { formacao: { select: { id: true, titulo: true } } } } },
    });
  }

  create(tenantId: string, userId: string, dto: CreateMaterialDto) {
    // Todo material novo entra EM_REVISAO ate decisao do curador (RF-051).
    return forTenant(tenantId).material.create({
      data: { ...dto, tenantId, criadoPorId: userId, status: 'EM_REVISAO' as never },
    });
  }

  async decidir(tenantId: string, userId: string, id: string, dto: DecidirMaterialDto) {
    const db = forTenant(tenantId);
    const material = await db.material.findFirst({ where: { id } });
    if (!material) throw new NotFoundException('Material nao encontrado.');

    const status = dto.aprovar ? 'APROVADO' : 'REJEITADO';
    const atualizado = await db.material.update({
      where: { id },
      data: { status: status as never, motivoRecusa: dto.aprovar ? null : dto.motivo ?? null },
    });
    await this.audit.record({
      action: dto.aprovar ? 'APPROVE' : 'REJECT',
      entity: 'material', entityId: id, tenantId, userId,
      metadata: dto.aprovar ? undefined : { motivo: dto.motivo },
    });
    return atualizado;
  }

  async vincular(tenantId: string, materialId: string, formacaoId: string) {
    const db = forTenant(tenantId);
    const material = await db.material.findFirst({ where: { id: materialId } });
    if (!material) throw new NotFoundException('Material nao encontrado.');
    return db.materialFormacao.upsert({
      where: { materialId_formacaoId: { materialId, formacaoId } },
      update: {},
      create: { tenantId, materialId, formacaoId },
    });
  }
}

@Controller('materiais')
export class MateriaisController {
  constructor(private readonly svc: MateriaisService) {}

  @Get()
  @RequirePermissions('material:read')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.svc.list(user.tenantId, status);
  }

  @Post()
  @RequirePermissions('material:create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMaterialSchema)) dto: CreateMaterialDto,
  ) {
    return this.svc.create(user.tenantId, user.id, dto);
  }

  @Post(':id/decisao')
  @RequirePermissions('material:aprovar')
  decidir(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decidirMaterialSchema)) dto: DecidirMaterialDto,
  ) {
    return this.svc.decidir(user.tenantId, user.id, id, dto);
  }

  @Post(':id/vincular')
  @RequirePermissions('material:vincular')
  vincular(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(vincularSchema)) dto: { formacaoId: string },
  ) {
    return this.svc.vincular(user.tenantId, id, dto.formacaoId);
  }
}

@Module({
  controllers: [MateriaisController],
  providers: [MateriaisService],
})
export class MateriaisModule {}
