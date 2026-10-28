// IA governada (secoes 06/07 do DRF-001). Fluxo do ciclo de validacao humana:
// 1. copiloto gera rascunho com fontes autorizadas -> AiInteracao + PlanoFormativo
// 2. usuario revisa: aprova, edita ou rejeita (RIA-002); nada e publicado antes
// 3. respostas incorretas podem ser sinalizadas (RIA-010)
// 4. admin controla habilitacao e provider por municipio (RIA-005/013)
// O formador usa o Copiloto so nas formacoes em que foi alocado (common/escopo).
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
  Put,
} from '@nestjs/common';
import { forTenant, Prisma } from '@formarede/db';
import { gerarPlanoFormativo, AiFonte } from '@formarede/ai';
import {
  AuthUser,
  DecisaoIaDto,
  decisaoIaSchema,
  GerarPlanoDto,
  gerarPlanoSchema,
  IaConfigDto,
  iaConfigSchema,
  PlanoAprovado,
  PlanoFormativoConteudo,
  SinalizarIaDto,
  sinalizarIaSchema,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions, Roles } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { AuditService } from '../../audit/audit.module';
import { exigirFormacao } from '../../common/escopo';

@Injectable()
export class IaService {
  constructor(private readonly audit: AuditService) {}

  private async config(tenantId: string) {
    const config = await forTenant(tenantId).tenantConfig.findFirst();
    return {
      iaHabilitada: config?.iaHabilitada ?? true,
      iaProvider: config?.iaProvider ?? 'deepseek',
    };
  }

  /** IA-01: gera rascunho de plano com fontes = materiais aprovados da formacao. */
  async gerarPlano(tenantId: string, userId: string, formacaoId: string, dto: GerarPlanoDto) {
    const { iaHabilitada, iaProvider } = await this.config(tenantId);
    if (!iaHabilitada) {
      throw new ForbiddenException('Os recursos de IA estao desabilitados neste municipio.');
    }

    const db = forTenant(tenantId);
    const formacao = await db.formacao.findFirst({
      where: { id: formacaoId },
      include: {
        materiais: { include: { material: true }, where: { material: { status: 'APROVADO' } } },
      },
    });
    if (!formacao) throw new NotFoundException('Formacao nao encontrada.');

    // Fontes autorizadas (RIA-003/006): somente materiais ja aprovados.
    const fontes: AiFonte[] = formacao.materiais.map((mf) => ({
      id: mf.material.id,
      titulo: mf.material.titulo,
      tipo: mf.material.tipo,
    }));

    const resultado = await gerarPlanoFormativo(iaProvider, {
      titulo: formacao.titulo,
      tema: formacao.tema,
      publicoAlvo: formacao.publicoAlvo,
      cargaHoraria: formacao.cargaHoraria,
      modalidade: formacao.modalidade,
      diagnostico: dto.diagnostico,
      contextoExtra: dto.contextoExtra,
      fontes,
    });

    // Log completo da interacao (RIA-004) + rascunho pendente de decisao humana.
    const interacao = await db.aiInteracao.create({
      data: {
        tenantId,
        userId,
        assistente: resultado.promptId,
        provider: resultado.bruto.provider,
        modelo: resultado.bruto.modelo,
        promptVersao: resultado.promptVersao,
        entrada: { prompt: resultado.entradaMascarada, formacaoId } as Prisma.InputJsonValue,
        saida: resultado.bruto.text,
        fontes: fontes as unknown as Prisma.InputJsonValue,
        tokensEntrada: resultado.bruto.tokensEntrada,
        tokensSaida: resultado.bruto.tokensSaida,
      },
    });

    const plano = await db.planoFormativo.create({
      data: {
        tenantId,
        formacaoId,
        interacaoId: interacao.id,
        conteudo: resultado.plano as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      geradoPorIA: true as const, // RIA-001
      interacaoId: interacao.id,
      planoId: plano.id,
      provider: resultado.bruto.provider,
      modelo: resultado.bruto.modelo,
      promptVersao: resultado.promptVersao,
      fontes,
      plano: resultado.plano,
      status: 'RASCUNHO' as const,
    };
  }

  /** RIA-002: aprovar publica o plano; editar substitui a saida; rejeitar descarta. */
  async decidir(user: AuthUser, interacaoId: string, dto: DecisaoIaDto) {
    const { tenantId, id: userId } = user;
    const db = forTenant(tenantId);
    const interacao = await db.aiInteracao.findFirst({
      where: { id: interacaoId },
      include: { plano: true },
    });
    if (!interacao) throw new NotFoundException('Interacao nao encontrada.');
    if (interacao.plano) await exigirFormacao(user, interacao.plano.formacaoId, 'Interacao nao encontrada.');
    if (interacao.status !== 'GERADA') {
      throw new BadRequestException('Esta interacao ja recebeu uma decisao.');
    }

    const statusInteracao =
      dto.decisao === 'APROVAR' ? 'APROVADA' : dto.decisao === 'EDITAR' ? 'EDITADA' : 'REJEITADA';

    let conteudoFinal: Prisma.InputJsonValue | undefined;
    if (dto.decisao === 'EDITAR') {
      try {
        conteudoFinal = JSON.parse(dto.saidaEditada as string) as Prisma.InputJsonValue;
      } catch {
        throw new BadRequestException('O conteudo editado precisa ser JSON valido.');
      }
    }

    await db.aiInteracao.update({
      where: { id: interacaoId },
      data: {
        status: statusInteracao as never,
        decididoPorId: userId,
        decididoEm: new Date(),
        ...(dto.decisao === 'EDITAR' ? { saida: dto.saidaEditada } : {}),
      },
    });

    if (interacao.plano) {
      await db.planoFormativo.update({
        where: { id: interacao.plano.id },
        data: {
          status: dto.decisao === 'REJEITAR' ? 'REJEITADO' : 'APROVADO',
          aprovadoPorId: dto.decisao === 'REJEITAR' ? null : userId,
          ...(conteudoFinal ? { conteudo: conteudoFinal } : {}),
        },
      });
    }

    await this.audit.record({
      action: dto.decisao === 'REJEITAR' ? 'REJECT' : 'APPROVE',
      entity: 'ai_interacao', entityId: interacaoId, tenantId, userId,
      metadata: { decisao: dto.decisao },
    });
    return { interacaoId, decisao: dto.decisao };
  }

  /** Planos aprovados da formacao, com fontes, modelo e quem aprovou (a formacao mostra o vigente). */
  async planosAprovados(tenantId: string, formacaoId: string): Promise<PlanoAprovado[]> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formacaoId)) {
      throw new NotFoundException('Formacao nao encontrada.');
    }
    const db = forTenant(tenantId);
    const planos = await db.planoFormativo.findMany({
      where: { formacaoId, status: 'APROVADO' },
      orderBy: { updatedAt: 'desc' },
      include: { interacao: { select: { provider: true, modelo: true, promptVersao: true, fontes: true, decididoEm: true, status: true } } },
    });
    const ids = [...new Set(planos.flatMap((p) => (p.aprovadoPorId ? [p.aprovadoPorId] : [])))];
    const nomes = new Map(
      (ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [])
        .map((u) => [u.id, u.nome]),
    );
    return planos.map((p) => ({
      id: p.id,
      interacaoId: p.interacaoId,
      aprovadoEm: (p.interacao.decididoEm ?? p.updatedAt).toISOString(),
      aprovadoPor: p.aprovadoPorId ? nomes.get(p.aprovadoPorId) ?? null : null,
      editado: p.interacao.status === 'EDITADA',
      fontes: (p.interacao.fontes as PlanoAprovado['fontes'] | null) ?? [],
      provider: p.interacao.provider,
      modelo: p.interacao.modelo,
      promptVersao: p.interacao.promptVersao,
      conteudo: p.conteudo as unknown as PlanoFormativoConteudo,
    }));
  }

  /** RIA-010: usuario sinaliza resposta incorreta/inadequada. */
  async sinalizar(tenantId: string, userId: string, interacaoId: string, dto: SinalizarIaDto) {
    const db = forTenant(tenantId);
    const interacao = await db.aiInteracao.findFirst({ where: { id: interacaoId } });
    if (!interacao) throw new NotFoundException('Interacao nao encontrada.');
    await db.aiInteracao.update({
      where: { id: interacaoId },
      data: { sinalizada: true, sinalizadaMotivo: dto.motivo },
    });
    await this.audit.record({
      action: 'UPDATE', entity: 'ai_interacao', entityId: interacaoId, tenantId, userId,
      metadata: { sinalizada: true, motivo: dto.motivo },
    });
    return { interacaoId, sinalizada: true };
  }

  /** RIA-004: trilha das interacoes para auditoria. */
  listarInteracoes(tenantId: string) {
    return forTenant(tenantId).aiInteracao.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, assistente: true, provider: true, modelo: true, promptVersao: true,
        status: true, sinalizada: true, tokensEntrada: true, tokensSaida: true,
        createdAt: true, decididoEm: true,
      },
    });
  }

  async getConfig(tenantId: string) {
    return this.config(tenantId);
  }

  /** RIA-005/013: habilitar/desabilitar IA e escolher provider por municipio. */
  async setConfig(tenantId: string, userId: string, dto: IaConfigDto) {
    const db = forTenant(tenantId);
    const existente = await db.tenantConfig.findFirst();
    if (!existente) throw new NotFoundException('Configuracao do municipio nao encontrada.');
    await db.tenantConfig.update({
      where: { id: existente.id },
      data: { iaHabilitada: dto.iaHabilitada, iaProvider: dto.iaProvider },
    });
    await this.audit.record({
      action: 'UPDATE', entity: 'tenant_config', entityId: existente.id, tenantId, userId,
      metadata: { iaHabilitada: dto.iaHabilitada, iaProvider: dto.iaProvider },
    });
    return dto;
  }
}

@Controller('ia')
export class IaController {
  constructor(private readonly svc: IaService) {}

  @Post('formacoes/:formacaoId/plano')
  @RequirePermissions('ia:usar')
  async gerarPlano(
    @CurrentUser() user: AuthUser,
    @Param('formacaoId') formacaoId: string,
    @Body(new ZodValidationPipe(gerarPlanoSchema)) dto: GerarPlanoDto,
  ) {
    await exigirFormacao(user, formacaoId);
    return this.svc.gerarPlano(user.tenantId, user.id, formacaoId, dto);
  }

  @Get('formacoes/:formacaoId/planos')
  @RequirePermissions('ia:usar')
  async planos(@CurrentUser() user: AuthUser, @Param('formacaoId') formacaoId: string) {
    await exigirFormacao(user, formacaoId);
    return this.svc.planosAprovados(user.tenantId, formacaoId);
  }

  @Post('interacoes/:id/decisao')
  @RequirePermissions('ia:usar')
  decidir(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decisaoIaSchema)) dto: DecisaoIaDto,
  ) {
    return this.svc.decidir(user, id, dto);
  }

  @Post('interacoes/:id/sinalizar')
  sinalizar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sinalizarIaSchema)) dto: SinalizarIaDto,
  ) {
    return this.svc.sinalizar(user.tenantId, user.id, id, dto);
  }

  @Get('interacoes')
  @RequirePermissions('ia:auditar')
  listar(@CurrentUser() user: AuthUser) {
    return this.svc.listarInteracoes(user.tenantId);
  }

  @Get('config')
  config(@CurrentUser() user: AuthUser) {
    return this.svc.getConfig(user.tenantId);
  }

  @Put('config')
  @RequirePermissions('ia:config')
  setConfig(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(iaConfigSchema)) dto: IaConfigDto,
  ) {
    return this.svc.setConfig(user.tenantId, user.id, dto);
  }
}

@Module({
  controllers: [IaController],
  providers: [IaService],
})
export class IaModule {}
