import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { FormacoesModule } from './modules/formacoes/formacoes.module';
import { EncontrosModule } from './modules/encontros/encontros.module';
import { FrequenciaModule } from './modules/frequencia/frequencia.module';
import { MateriaisModule } from './modules/materiais/materiais.module';
import { AtividadesModule } from './modules/atividades/atividades.module';
import { ParticipanteModule } from './modules/participante/participante.module';
import { AvaliacoesModule } from './modules/avaliacoes/avaliacoes.module';
import { RelatoriosModule } from './modules/relatorios/relatorios.module';
import { IaModule } from './modules/ia/ia.module';
import { AssistenteModule } from './modules/assistente/assistente.module';
import { TrilhaModule } from './modules/trilha/trilha.module';
import { PainelModule } from './modules/painel/painel.module';
import { DevolutivasModule } from './modules/devolutivas/devolutivas.module';
import { FormadoresModule } from './modules/formadores/formadores.module';
import { JwtAuthGuard, RolesGuard } from './common/security';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    FormacoesModule,
    EncontrosModule,
    FrequenciaModule,
    MateriaisModule,
    AtividadesModule,
    ParticipanteModule,
    AvaliacoesModule,
    RelatoriosModule,
    IaModule,
    AssistenteModule,
    TrilhaModule,
    DevolutivasModule,
    FormadoresModule,
    PainelModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
