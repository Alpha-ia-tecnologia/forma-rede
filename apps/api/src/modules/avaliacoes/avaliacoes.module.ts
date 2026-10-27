// Avaliacoes (RF-100..105): questionarios com escalas de percepcao (1-5) e
// perguntas discursivas. Feedback anonimo quando configurado (RF-104):
// a resposta nao referencia a inscricao. Resultados sempre agregados.
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
  Query,
} from '@nestjs/common';
import { forTenant } from '@formarede/db';
import {
  AuthUser,
  CreateAvaliacaoDto,
  createAvaliacaoSchema,
  PerguntaAvaliacao,
  ResponderAvaliacaoDto,
  responderAvaliacaoSchema,
  ResultadoPergunta,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';

type RespostaItem = { perguntaId: string; valor?: number; texto?: string };
const tem = (u: AuthUser, p: string) => u.permissions.includes('*') || u.permissions.includes(p);

@Injectable()
export class AvaliacoesService {
  /**
   * Quem conduz ve todas as avaliacoes. O cursista ve so as das formacoes em que esta
   * inscrito, com `respondida` (a identificada pela resposta; a anonima pela participacao,
   * que nao guarda o conteudo).
   */
  async list(user: AuthUser, formacaoId?: string) {
    const db = forTenant(user.tenantId);
    const cursista = !tem(user, 'avaliacao:read') && tem(user, 'participante:area');
    const inscricoes = cursista
      ? await db.inscricao.findMany({
        where: { userId: user.id, status: { in: ['CONFIRMADA', 'CONCLUIDA'] } },
        select: { turma: { select: { formacaoId: true } }, respostas: { select: { avaliacaoId: true } }, participacoesAval: { select: { avaliacaoId: true } } },
      })
      : [];
    const minhas = inscricoes.map((i) => i.turma.formacaoId);
    const respondidas = new Set(inscricoes.flatMap((i) => [...i.respostas, ...i.participacoesAval].map((r) => r.avaliacaoId)));
    const lista = await db.avaliacao.findMany({
      where: {
        ...(formacaoId ? { formacaoId } : {}),
        ...(cursista ? { formacaoId: { in: formacaoId ? minhas.filter((f) => f === formacaoId) : minhas } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        formacao: { select: { id: true, titulo: true } },
        _count: { select: { entradas: true } },
      },
    });
    return lista.map((a) => ({ ...a, respondida: cursista ? respondidas.has(a.id) : null }));
  }

  async detail(tenantId: string, id: string) {
    const avaliacao = await forTenant(tenantId).avaliacao.findFirst({
      where: { id },
      include: { formacao: { select: { id: true, titulo: true } } },
    });
    if (!avaliacao) throw new NotFoundException('Avaliacao nao encontrada.');
    return avaliacao;
  }

  create(tenantId: string, formacaoId: string, dto: CreateAvaliacaoDto) {
    let n = 0;
    const perguntas: PerguntaAvaliacao[] = [
      ...dto.escalas.map((texto) => ({ id: `p${++n}`, tipo: 'ESCALA' as const, texto })),
      ...dto.abertas.map((texto) => ({ id: `p${++n}`, tipo: 'TEXTO' as const, texto })),
    ];
    return forTenant(tenantId).avaliacao.create({
      data: {
        tenantId,
        formacaoId,
        titulo: dto.titulo,
        tipo: dto.tipo,
        anonima: dto.anonima,
        perguntas: perguntas as object[],
      },
    });
  }

  async responder(tenantId: string, userId: string, id: string, dto: ResponderAvaliacaoDto) {
    const db = forTenant(tenantId);
    const avaliacao = await db.avaliacao.findFirst({ where: { id } });
    if (!avaliacao) throw new NotFoundException('Avaliacao nao encontrada.');

    const inscricao = await db.inscricao.findFirst({
      where: { userId, turma: { formacaoId: avaliacao.formacaoId }, status: 'CONFIRMADA' },
    });
    // Nao anonima: exige inscricao na formacao e impede resposta duplicada.
    if (!avaliacao.anonima) {
      if (!inscricao) throw new ForbiddenException('Você não está inscrito nesta formação.');
      const existente = await db.respostaAvaliacao.findFirst({
        where: { avaliacaoId: id, inscricaoId: inscricao.id },
      });
      if (existente) throw new BadRequestException('Você já respondeu esta avaliação.');
      return db.respostaAvaliacao.create({
        data: { tenantId, avaliacaoId: id, inscricaoId: inscricao.id, respostas: dto.respostas as object[] },
      });
    }

    // Anonima: a resposta nao referencia a inscricao. Quem esta inscrito deixa so a
    // participacao (sem data), que mostra o que esta pendente e barra a duplicidade.
    if (inscricao) {
      const ja = await db.avaliacaoParticipacao.findFirst({ where: { avaliacaoId: id, inscricaoId: inscricao.id } });
      if (ja) throw new BadRequestException('Você já respondeu esta avaliação.');
      await db.avaliacaoParticipacao.create({ data: { tenantId, avaliacaoId: id, inscricaoId: inscricao.id } });
    }
    try {
      return await db.respostaAvaliacao.create({
        data: { tenantId, avaliacaoId: id, inscricaoId: null, respostas: dto.respostas as object[] },
      });
    } catch (e) {
      if (inscricao) await db.avaliacaoParticipacao.deleteMany({ where: { avaliacaoId: id, inscricaoId: inscricao.id } });
      throw e;
    }
  }

  /** Resultados agregados: media por escala, lista de textos (sem autoria). */
  async resultados(tenantId: string, id: string) {
    const db = forTenant(tenantId);
    const avaliacao = await db.avaliacao.findFirst({ where: { id }, include: { formacao: { select: { id: true, titulo: true } } } });
    if (!avaliacao) throw new NotFoundException('Avaliacao nao encontrada.');
    // Taxa de resposta: quantos cursistas da formacao poderiam responder.
    const cursistas = await db.inscricao.count({
      where: { status: { in: ['CONFIRMADA', 'CONCLUIDA'] }, turma: { formacaoId: avaliacao.formacaoId } },
    });

    const entradas = await db.respostaAvaliacao.findMany({ where: { avaliacaoId: id } });
    const perguntas = avaliacao.perguntas as unknown as PerguntaAvaliacao[];

    const resultados: ResultadoPergunta[] = perguntas.map((pergunta) => {
      const itens = entradas
        .flatMap((e) => e.respostas as unknown as RespostaItem[])
        .filter((r) => r.perguntaId === pergunta.id);
      if (pergunta.tipo === 'ESCALA') {
        const valores = itens.map((r) => r.valor).filter((v): v is number => typeof v === 'number');
        const media = valores.length
          ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10
          : undefined;
        return { pergunta, media, n: valores.length };
      }
      const textos = itens.map((r) => r.texto).filter((t): t is string => !!t?.trim());
      return { pergunta, respostas: textos, n: textos.length };
    });

    return {
      avaliacao: { id: avaliacao.id, titulo: avaliacao.titulo, tipo: avaliacao.tipo, anonima: avaliacao.anonima },
      formacao: avaliacao.formacao,
      cursistas,
      totalRespostas: entradas.length,
      resultados,
    };
  }
}

@Controller()
export class AvaliacoesController {
  constructor(private readonly svc: AvaliacoesService) {}

  // Listagem/detalhe sem guard de permissao especifica: qualquer autenticado
  // do tenant pode ver o questionario (necessario para responder).
  @Get('avaliacoes')
  list(@CurrentUser() user: AuthUser, @Query('formacaoId') formacaoId?: string) {
    return this.svc.list(user, formacaoId);
  }

  @Get('avaliacoes/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.detail(user.tenantId, id);
  }

  @Post('formacoes/:formacaoId/avaliacoes')
  @RequirePermissions('avaliacao:create')
  create(
    @CurrentUser() user: AuthUser,
    @Param('formacaoId') formacaoId: string,
    @Body(new ZodValidationPipe(createAvaliacaoSchema)) dto: CreateAvaliacaoDto,
  ) {
    return this.svc.create(user.tenantId, formacaoId, dto);
  }

  @Post('avaliacoes/:id/respostas')
  @RequirePermissions('avaliacao:responder')
  responder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(responderAvaliacaoSchema)) dto: ResponderAvaliacaoDto,
  ) {
    return this.svc.responder(user.tenantId, user.id, id, dto);
  }

  @Get('avaliacoes/:id/resultados')
  @RequirePermissions('avaliacao:read')
  resultados(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.resultados(user.tenantId, id);
  }
}

@Module({
  controllers: [AvaliacoesController],
  providers: [AvaliacoesService],
})
export class AvaliacoesModule {}
