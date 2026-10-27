// Client Prisma com contexto de tenant (Row-Level Security).
//
// - prisma        : client base (uso interno / tabelas globais como User).
// - forTenant(id) : client que injeta app.tenant_id em cada operacao => RLS filtra
//                   automaticamente pelo municipio. Use nos servicos de dominio.
// - runAsSystem   : executa em transacao com bypass de RLS (seed, superadmin,
//                   tarefas cross-tenant). Nunca exponha isto a request de usuario.
import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Retorna um client escopado ao municipio. Cada operacao roda numa transacao
 * que fixa app.tenant_id (local), fazendo o Postgres impor o isolamento.
 */
export function forTenant(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`,
            query(args),
          ]);
          return result as unknown;
        },
      },
    },
  });
}

/**
 * Executa fn numa transacao com bypass de RLS (app.bypass_rls = on, local).
 * Use apenas em contextos de sistema/superadmin.
 * O limite padrao do Prisma (5 s) nao comporta o seed num banco remoto (~150 ms por ida
 * e volta); 30 s cobrem o seed e as tarefas de sistema sem prender conexao a toa.
 */
export async function runAsSystem<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx);
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

export type TenantClient = ReturnType<typeof forTenant>;
export { Prisma };
export * from '@prisma/client';
