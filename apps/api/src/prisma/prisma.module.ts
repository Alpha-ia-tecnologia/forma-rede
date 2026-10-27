import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { prisma, forTenant, runAsSystem } from '@formarede/db';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client = prisma;
  readonly forTenant = forTenant;
  readonly runAsSystem = runAsSystem;

  async onModuleInit(): Promise<void> {
    await prisma.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await prisma.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
