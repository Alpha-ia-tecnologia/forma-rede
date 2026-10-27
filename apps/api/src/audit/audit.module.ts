import { Global, Injectable, Module } from '@nestjs/common';
import { runAsSystem, AuditAction, Prisma } from '@formarede/db';

export interface AuditParams {
  action: AuditAction;
  entity: string;
  entityId?: string;
  tenantId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Trilha de auditoria imutavel (RF-131/132, CA-03). */
@Injectable()
export class AuditService {
  async record(params: AuditParams): Promise<void> {
    await runAsSystem((tx) =>
      tx.auditLog.create({
        data: {
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          tenantId: params.tenantId,
          userId: params.userId,
          metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: params.ip,
        },
      }),
    );
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
