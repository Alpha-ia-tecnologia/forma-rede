// Assistente Pedagogico (IA): conversa com professores e formadores para construir
// planejamentos e tirar duvidas de aula. O agente (LangGraph + Claude Opus 5.5) mora
// no gateway @formarede/ai; aqui ficam o escopo dos dados (RLS + usuario), a
// persistencia append-only das conversas, o log de interacao (RIA-004) e o SSE.
import {
  Body, Controller, Delete, ForbiddenException, Get, Injectable, Logger, Module,
  NotFoundException, Param, Post, Res, ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { forTenant, Prisma } from '@formarede/db';
import {
  ASSISTENTE_PEDAGOGICO, blocoDeContexto, descreverErroAssistente, executarAssistente,
  type FerramentasAssistente,
} from '@formarede/ai';
import {
  AuthUser, ConversaDetalhe, ConversaResumo, CriarConversaDto, criarConversaSchema,
  EnviarMensagemAssistenteDto, enviarMensagemAssistenteSchema, EventoAssistenteStream,
  FonteAssistente, Planejamento, ROLE_LABELS, TurnoAssistente,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';

const TITULO_PADRAO = 'Nova conversa';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Mensagens = Parameters<typeof executarAssistente>[0]['historico'];

interface Preparo {
  conversa: { id: string; titulo: string; formacao: { id: string; titulo: string } | null };
  historico: Mensagens;
  contexto?: string;
}

function tituloDe(pergunta: string): string {
  const limpo = pergunta.replace(/\s+/g, ' ').trim();
  return limpo.length > 60 ? `${limpo.slice(0, 57).trimEnd()}...` : limpo;
}

function turnoDto(t: {
  id: string; pergunta: string; resposta: string; planejamentos: Prisma.JsonValue;
  fontes: Prisma.JsonValue; interacaoId: string | null; createdAt: Date;
}): TurnoAssistente {
  return {
    id: t.id,
    pergunta: t.pergunta,
    resposta: t.resposta,
    planejamentos: (t.planejamentos ?? []) as unknown as Planejamento[],
    fontes: (t.fontes ?? []) as unknown as FonteAssistente[],
    interacaoId: t.interacaoId,
    criadoEm: t.createdAt.toISOString(),
  };
}

@Injectable()
export class AssistenteService {
  private async exigirIaHabilitada(tenantId: string) {
    // Sem credencial o SDK so falharia no meio do stream; avisa antes, com o que fazer.
    if (!process.env.ANTHROPIC_API_KEY?.trim() && !process.env.ANTHROPIC_AUTH_TOKEN?.trim()) {
      throw new ServiceUnavailableException('O assistente não está configurado: defina ANTHROPIC_API_KEY no .env e reinicie a API.');
    }
    const config = await forTenant(tenantId).tenantConfig.findFirst();
    if (config && !config.iaHabilitada) {
      throw new ForbiddenException('Os recursos de IA estão desabilitados neste município.');
    }
  }

  /** Conversa do proprio usuario (um professor nao ve a conversa de outro). */
  private async conversaDoUsuario(user: AuthUser, id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Conversa não encontrada.');
    const conversa = await forTenant(user.tenantId).assistenteConversa.findFirst({
      where: { id, userId: user.id },
      include: { formacao: { select: { id: true, titulo: true } } },
    });
    if (!conversa) throw new NotFoundException('Conversa não encontrada.');
    return conversa;
  }

  async listar(user: AuthUser): Promise<ConversaResumo[]> {
    const conversas = await forTenant(user.tenantId).assistenteConversa.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { formacao: { select: { id: true, titulo: true } }, _count: { select: { turnos: true } } },
    });
    return conversas.map((c) => ({
      id: c.id, titulo: c.titulo, formacao: c.formacao, turnos: c._count.turnos, atualizadaEm: c.updatedAt.toISOString(),
    }));
  }

  async criar(user: AuthUser, dto: CriarConversaDto): Promise<ConversaResumo> {
    await this.exigirIaHabilitada(user.tenantId);
    const db = forTenant(user.tenantId);
    if (dto.formacaoId && !(await db.formacao.findFirst({ where: { id: dto.formacaoId }, select: { id: true } }))) {
      throw new NotFoundException('Formação não encontrada.');
    }
    const c = await db.assistenteConversa.create({
      data: {
        tenantId: user.tenantId, userId: user.id, formacaoId: dto.formacaoId ?? null,
        titulo: TITULO_PADRAO, promptVersao: ASSISTENTE_PEDAGOGICO.versao,
      },
      include: { formacao: { select: { id: true, titulo: true } } },
    });
    return { id: c.id, titulo: c.titulo, formacao: c.formacao, turnos: 0, atualizadaEm: c.updatedAt.toISOString() };
  }

  async detalhe(user: AuthUser, id: string): Promise<ConversaDetalhe> {
    const conversa = await this.conversaDoUsuario(user, id);
    const turnos = await forTenant(user.tenantId).assistenteTurno.findMany({
      where: { conversaId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, pergunta: true, resposta: true, planejamentos: true, fontes: true, interacaoId: true, createdAt: true },
    });
    return {
      id: conversa.id, titulo: conversa.titulo, formacao: conversa.formacao,
      atualizadaEm: conversa.updatedAt.toISOString(), turnos: turnos.map(turnoDto),
    };
  }

  async excluir(user: AuthUser, id: string) {
    await this.conversaDoUsuario(user, id);
    await forTenant(user.tenantId).assistenteConversa.delete({ where: { id } });
    return { id, excluida: true };
  }

  /** Validacoes e historico, antes de abrir o stream (erros aqui viram resposta JSON). */
  async preparar(user: AuthUser, id: string): Promise<Preparo> {
    await this.exigirIaHabilitada(user.tenantId);
    const conversa = await this.conversaDoUsuario(user, id);
    const db = forTenant(user.tenantId);
    const turnos = await db.assistenteTurno.findMany({
      where: { conversaId: id }, orderBy: { createdAt: 'asc' }, select: { mensagens: true },
    });
    // Append-only: as mensagens voltam exatamente como foram gravadas.
    const historico = turnos.flatMap((t) => t.mensagens as unknown as Mensagens);

    let contexto: string | undefined;
    if (historico.length === 0) {
      const tenant = await db.tenant.findFirst({ select: { nome: true } });
      contexto = blocoDeContexto({
        papel: ROLE_LABELS[user.role], municipio: tenant?.nome ?? user.tenantSlug, formacao: conversa.formacao,
      });
    }
    return { conversa: { id: conversa.id, titulo: conversa.titulo, formacao: conversa.formacao }, historico, contexto };
  }

  async executarTurno(
    user: AuthUser, preparo: Preparo, texto: string,
    emitir: (e: EventoAssistenteStream) => void, signal: AbortSignal,
  ): Promise<TurnoAssistente> {
    const r = await executarAssistente({
      historico: preparo.historico,
      pergunta: texto,
      contexto: preparo.contexto,
      ferramentas: this.ferramentas(user),
      onEvento: emitir,
      signal,
    });

    const db = forTenant(user.tenantId);
    // Log completo da interacao (RIA-004); permite sinalizar a resposta (RIA-010).
    const interacao = await db.aiInteracao.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        assistente: ASSISTENTE_PEDAGOGICO.id,
        provider: 'anthropic',
        modelo: r.modelo,
        promptVersao: ASSISTENTE_PEDAGOGICO.versao,
        entrada: {
          pergunta: r.pergunta, conversaId: preparo.conversa.id, chamadas: r.chamadas, parada: r.parada,
          recusa: r.recusa, cache: { leitura: r.uso.cacheLeitura, escrita: r.uso.cacheEscrita },
        } as Prisma.InputJsonValue,
        saida: r.resposta,
        fontes: r.fontes as unknown as Prisma.InputJsonValue,
        tokensEntrada: r.uso.entrada + r.uso.cacheLeitura + r.uso.cacheEscrita,
        tokensSaida: r.uso.saida,
      },
    });
    const turno = await db.assistenteTurno.create({
      data: {
        tenantId: user.tenantId,
        conversaId: preparo.conversa.id,
        pergunta: r.pergunta,
        resposta: r.resposta,
        planejamentos: r.planejamentos as unknown as Prisma.InputJsonValue,
        fontes: r.fontes as unknown as Prisma.InputJsonValue,
        mensagens: r.mensagens as unknown as Prisma.InputJsonValue,
        interacaoId: interacao.id,
      },
    });
    await db.assistenteConversa.update({
      where: { id: preparo.conversa.id },
      data: {
        updatedAt: new Date(),
        ...(preparo.conversa.titulo === TITULO_PADRAO ? { titulo: tituloDe(r.pergunta) } : {}),
      },
    });
    return turnoDto(turno);
  }

  /** Dados que o agente pode ler, no escopo do municipio (RLS) e do usuario. */
  private ferramentas(user: AuthUser): FerramentasAssistente {
    const db = forTenant(user.tenantId);
    // Professor ve, na listagem, as formacoes em que esta inscrito.
    const escopoFormacao: Prisma.FormacaoWhereInput = user.role === 'PROFESSOR'
      ? { turmas: { some: { inscricoes: { some: { userId: user.id } } } } }
      : {};
    return {
      listarFormacoes: async () => {
        const formacoes = await db.formacao.findMany({
          where: { etapaFluxo: { not: 'CANCELADA' }, ...escopoFormacao },
          orderBy: { updatedAt: 'desc' },
          take: 30,
          select: { id: true, titulo: true, tema: true, modalidade: true, cargaHoraria: true, etapaFluxo: true },
        });
        return formacoes.map((f) => ({ ...f, modalidade: String(f.modalidade), etapaFluxo: String(f.etapaFluxo) }));
      },
      consultarFormacao: async (id) => {
        if (!UUID.test(id)) return null;
        const f = await db.formacao.findFirst({
          where: { id },
          include: {
            modulos: { orderBy: { ordem: 'asc' }, select: { titulo: true, descricao: true } },
            atividades: { select: { titulo: true, descricao: true, criterios: true, prazo: true } },
            // Fontes autorizadas (RIA-003/006): so materiais aprovados.
            materiais: { where: { material: { status: 'APROVADO' } }, include: { material: { select: { id: true, titulo: true, tipo: true } } } },
            trilha: { where: { material: { status: 'APROVADO' } }, orderBy: { ordem: 'asc' }, include: { material: { select: { tipo: true } } } },
          },
        });
        if (!f) return null;
        return {
          id: f.id, titulo: f.titulo, tema: f.tema, modalidade: String(f.modalidade), cargaHoraria: f.cargaHoraria,
          etapaFluxo: String(f.etapaFluxo), objetivos: f.objetivos, publicoAlvo: f.publicoAlvo, freqMinimaPct: f.freqMinimaPct,
          modulos: f.modulos,
          atividades: f.atividades.map((a) => ({ ...a, prazo: a.prazo?.toISOString() ?? null })),
          materiais: f.materiais.map((m) => ({ id: m.material.id, titulo: m.material.titulo, tipo: String(m.material.tipo) })),
          trilha: f.trilha.map((e) => ({
            ordem: e.ordem, titulo: e.titulo, tipo: String(e.material.tipo), orientacao: e.orientacao,
            duracaoMin: e.duracaoMin, obrigatoria: e.obrigatoria, materialId: e.materialId,
          })),
        };
      },
      buscarMateriais: async ({ termo, formacaoId }) => {
        const t = termo?.trim();
        const materiais = await db.material.findMany({
          where: {
            status: 'APROVADO',
            ...(t ? {
              OR: [
                { titulo: { contains: t, mode: 'insensitive' } },
                { descricao: { contains: t, mode: 'insensitive' } },
                { tags: { has: t.toLowerCase() } },
              ],
            } : {}),
            ...(formacaoId && UUID.test(formacaoId) ? { formacoes: { some: { formacaoId } } } : {}),
          },
          orderBy: { updatedAt: 'desc' },
          take: 12,
          select: { id: true, titulo: true, tipo: true, descricao: true, autoria: true, licenca: true, tags: true, url: true },
        });
        return materiais.map((m) => ({ ...m, tipo: String(m.tipo) }));
      },
    };
  }
}

@Controller('assistente')
export class AssistenteController {
  private readonly logger = new Logger('Assistente');

  constructor(private readonly svc: AssistenteService) {}

  @Get('conversas')
  @RequirePermissions('ia:assistente')
  listar(@CurrentUser() user: AuthUser) {
    return this.svc.listar(user);
  }

  @Post('conversas')
  @RequirePermissions('ia:assistente')
  criar(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(criarConversaSchema)) dto: CriarConversaDto) {
    return this.svc.criar(user, dto);
  }

  @Get('conversas/:id')
  @RequirePermissions('ia:assistente')
  detalhe(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.detalhe(user, id);
  }

  @Delete('conversas/:id')
  @RequirePermissions('ia:assistente')
  excluir(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.excluir(user, id);
  }

  /**
   * Resposta em streaming (SSE): texto, notas de progresso, ferramentas em uso e o
   * cartao de planejamento, terminando em `fim` (turno gravado) ou `erro`.
   */
  @Post('conversas/:id/mensagens')
  @RequirePermissions('ia:assistente')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async enviar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(enviarMensagemAssistenteSchema)) dto: EnviarMensagemAssistenteDto,
    @Res() res: Response,
  ): Promise<void> {
    const preparo = await this.svc.preparar(user, id);

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    // Navegador fechou: cancela a chamada ao modelo e nada e gravado.
    const controle = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controle.abort(); });
    const enviar = (e: EventoAssistenteStream) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`); };
    const ping = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 15_000);

    try {
      const turno = await this.svc.executarTurno(user, preparo, dto.texto, enviar, controle.signal);
      enviar({ tipo: 'fim', turno });
    } catch (e) {
      if (!controle.signal.aborted) {
        this.logger.error(`Falha no turno da conversa ${id}: ${e instanceof Error ? e.message : String(e)}`);
        enviar({ tipo: 'erro', mensagem: descreverErroAssistente(e) });
      }
    } finally {
      clearInterval(ping);
      res.end();
    }
  }
}

@Module({
  controllers: [AssistenteController],
  providers: [AssistenteService],
})
export class AssistenteModule {}
