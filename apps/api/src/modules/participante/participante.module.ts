// Area do participante (RF-074..082) + inscricoes (RF-027) + certificados
// (RF-120..122). Emissao valida regra de conclusao: frequencia minima da
// formacao E todas as atividades avaliadas. Validacao publica por codigo.
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { forTenant, Prisma, runAsSystem } from '@formarede/db';
import {
  AuthUser, EntregaStatus, EtapaFluxo, InscreverDto, inscreverSchema, MinhaFormacao, ParticipacaoFormacao, resumirFrequencia,
} from '@formarede/contracts';
import { CurrentUser, Public, RequirePermissions } from '../../common/security';
import { ZodValidationPipe } from '../../common/http';
import { AuditService } from '../../audit/audit.module';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INCLUDE_PARTICIPACAO = {
  turma: {
    include: {
      formacao: {
        include: {
          atividades: { orderBy: { createdAt: 'asc' } },
          avaliacoes: { orderBy: { createdAt: 'asc' }, select: { id: true, titulo: true, tipo: true, anonima: true } },
        },
      },
      encontros: { orderBy: { inicio: 'asc' } },
    },
  },
  frequencias: true,
  entregas: true,
  certificado: true,
  respostas: { select: { avaliacaoId: true } },
  participacoesAval: { select: { avaliacaoId: true } },
} satisfies Prisma.InscricaoInclude;

type InscricaoComParticipacao = Prisma.InscricaoGetPayload<{ include: typeof INCLUDE_PARTICIPACAO }>;

/** Monta a participacao de uma inscricao. A conta da frequencia e a mesma do certificado. */
function montarParticipacao(inscricao: InscricaoComParticipacao, agora: Date): ParticipacaoFormacao {
  const { formacao, encontros } = inscricao.turma;
  const resumo = resumirFrequencia(
    encontros.map((e) => ({ id: e.id, titulo: e.titulo, inicio: e.inicio, cancelado: e.status === 'CANCELADO' })),
    inscricao.frequencias.map((f) => ({ encontroId: f.encontroId, presente: f.presente, justificativa: f.justificativa })),
    formacao.freqMinimaPct,
    agora,
  );
  const marcas = new Map(resumo.historico.map((h) => [h.encontroId, h.marca]));
  const validos = encontros.filter((e) => e.status !== 'CANCELADO');
  const resumoEncontro = (e: (typeof encontros)[number]) => ({
    id: e.id, titulo: e.titulo, inicio: e.inicio.toISOString(), fim: e.fim?.toISOString() ?? null,
    local: e.local, linkVirtual: e.linkVirtual, cancelado: e.status === 'CANCELADO',
  });
  const proximo = validos.find((e) => (e.fim ?? e.inicio).getTime() >= agora.getTime());

  // Mesma conta do certificado: presencas / encontros previstos, arredondado.
  const previstos = validos.length;
  const pct = (n: number) => (previstos ? Math.round((n / previstos) * 100) : 0);
  let necessarias = 0;
  while (necessarias < previstos && pct(necessarias) < formacao.freqMinimaPct) necessarias += 1;

  const porAtividade = new Map(inscricao.entregas.map((e) => [e.atividadeId, e]));
  const avaliadas = formacao.atividades.filter((a) => porAtividade.get(a.id)?.status === 'AVALIADA').length;
  const respondidas = new Set([...inscricao.respostas, ...inscricao.participacoesAval].map((r) => r.avaliacaoId));

  return {
    inscricaoId: inscricao.id,
    turma: { id: inscricao.turma.id, nome: inscricao.turma.nome },
    frequencia: {
      presencas: resumo.presencas,
      encontrosPrevistos: previstos,
      presencasNecessarias: previstos ? necessarias : 0,
      emAberto: resumo.historico.filter((h) => h.marca === 'PENDENTE' || h.marca === 'PREVISTO').length,
      minimoPct: formacao.freqMinimaPct,
    },
    encontros: validos.map((e) => ({ ...resumoEncontro(e), marca: marcas.get(e.id) ?? 'PREVISTO' })),
    proximoEncontro: proximo ? resumoEncontro(proximo) : null,
    atividades: formacao.atividades.map((a) => {
      const e = porAtividade.get(a.id);
      return {
        id: a.id, titulo: a.titulo, descricao: a.descricao, criterios: a.criterios,
        prazo: a.prazo?.toISOString() ?? null, pontuacao: a.pontuacao,
        entrega: e ? {
          id: e.id, status: e.status as EntregaStatus, conteudo: e.conteudo, anexoUrl: e.anexoUrl,
          nota: e.nota, feedback: e.feedback, enviadaEm: e.enviadaEm.toISOString(), avaliadaEm: e.avaliadaEm?.toISOString() ?? null,
        } : null,
      };
    }),
    certificado: inscricao.certificado
      ? { codigo: inscricao.certificado.codigo, emitidoEm: inscricao.certificado.emitidoEm.toISOString() }
      : null,
    podeEmitirCertificado: !inscricao.certificado && previstos > 0 && pct(resumo.presencas) >= formacao.freqMinimaPct
      && avaliadas === formacao.atividades.length,
    avaliacoes: formacao.avaliacoes.map((a) => ({
      id: a.id, titulo: a.titulo, tipo: String(a.tipo), anonima: a.anonima, respondida: respondidas.has(a.id),
    })),
  };
}

@Injectable()
export class ParticipanteService {
  constructor(private readonly audit: AuditService) {}

  async inscrever(tenantId: string, userId: string, dto: InscreverDto) {
    const db = forTenant(tenantId);
    const turma = await db.turma.findFirst({
      where: { id: dto.turmaId },
      include: { _count: { select: { inscricoes: true } } },
    });
    if (!turma) throw new NotFoundException('Turma nao encontrada.');
    if (turma.vagas > 0 && turma._count.inscricoes >= turma.vagas) {
      throw new BadRequestException('Turma sem vagas disponiveis.');
    }
    return db.inscricao.upsert({
      where: { turmaId_userId: { turmaId: dto.turmaId, userId } },
      update: { status: 'CONFIRMADA' },
      create: { tenantId, turmaId: dto.turmaId, userId },
    });
  }

  /** Minhas formacoes: para cada inscricao, a mesma participacao que a pagina da formacao mostra. */
  async minhasFormacoes(tenantId: string, userId: string): Promise<MinhaFormacao[]> {
    const inscricoes = await forTenant(tenantId).inscricao.findMany({
      where: { userId, status: { in: ['CONFIRMADA', 'CONCLUIDA'] } },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE_PARTICIPACAO,
    });
    const agora = new Date();
    return inscricoes.map((i) => {
      const f = i.turma.formacao;
      return {
        ...montarParticipacao(i, agora),
        formacao: {
          id: f.id, titulo: f.titulo, cargaHoraria: f.cargaHoraria, modalidade: String(f.modalidade),
          etapaFluxo: f.etapaFluxo as EtapaFluxo, freqMinimaPct: f.freqMinimaPct,
        },
      };
    });
  }

  /**
   * A participacao do cursista numa formacao, para a pagina da formacao: frequencia
   * contada como no certificado, encontros com a propria presenca, atividades com a
   * propria entrega, avaliacoes a responder e o que falta para o certificado.
   * null se nao estiver inscrito.
   */
  async minhaParticipacao(tenantId: string, userId: string, formacaoId: string): Promise<ParticipacaoFormacao | null> {
    if (!UUID.test(formacaoId)) throw new NotFoundException('Formação não encontrada.');
    const inscricao = await forTenant(tenantId).inscricao.findFirst({
      where: { userId, status: { in: ['CONFIRMADA', 'CONCLUIDA'] }, turma: { formacaoId } },
      include: INCLUDE_PARTICIPACAO,
    });
    return inscricao ? montarParticipacao(inscricao, new Date()) : null;
  }

  /** Emite certificado se a regra de conclusao for atendida (CA-06). */
  async emitirCertificado(tenantId: string, userId: string, inscricaoId: string) {
    const db = forTenant(tenantId);
    const inscricao = await db.inscricao.findFirst({
      where: { id: inscricaoId, userId },
      include: {
        turma: {
          include: {
            formacao: { include: { atividades: true } },
            encontros: { where: { status: { not: 'CANCELADO' } } },
          },
        },
        frequencias: true,
        entregas: true,
        certificado: true,
      },
    });
    if (!inscricao) throw new NotFoundException('Inscricao nao encontrada.');
    if (inscricao.certificado) return inscricao.certificado;

    const { formacao } = inscricao.turma;
    const totalEncontros = inscricao.turma.encontros.length;
    const presencas = inscricao.frequencias.filter((f) => f.presente).length;
    const freqPct = totalEncontros ? Math.round((presencas / totalEncontros) * 100) : 0;
    if (freqPct < formacao.freqMinimaPct) {
      throw new BadRequestException(
        `Frequencia de ${freqPct}% abaixo do minimo de ${formacao.freqMinimaPct}%.`,
      );
    }

    const avaliadas = new Set(
      inscricao.entregas.filter((e) => e.status === 'AVALIADA').map((e) => e.atividadeId),
    );
    const pendentes = formacao.atividades.filter((a) => !avaliadas.has(a.id));
    if (pendentes.length > 0) {
      throw new BadRequestException(
        `Ha ${pendentes.length} atividade(s) sem entrega avaliada.`,
      );
    }

    const certificado = await db.certificado.create({
      data: {
        tenantId,
        inscricaoId,
        codigo: randomBytes(6).toString('hex').toUpperCase(),
        cargaHoraria: formacao.cargaHoraria,
      },
    });
    await this.audit.record({
      action: 'CREATE', entity: 'certificado', entityId: certificado.id, tenantId, userId,
    });
    return certificado;
  }

  /** Validacao publica por codigo (RF-122) - sem autenticacao, dado minimo. */
  async validarCertificado(codigo: string) {
    const certificado = await runAsSystem((tx) =>
      tx.certificado.findUnique({
        where: { codigo },
        include: {
          inscricao: {
            include: {
              user: { select: { nome: true } },
              turma: { include: { formacao: { select: { titulo: true } } } },
            },
          },
          tenant: { select: { nome: true } },
        },
      }),
    );
    if (!certificado) return { valido: false as const };
    return {
      valido: true as const,
      participante: certificado.inscricao.user.nome,
      formacao: certificado.inscricao.turma.formacao.titulo,
      instituicao: certificado.tenant.nome,
      cargaHoraria: certificado.cargaHoraria,
      emitidoEm: certificado.emitidoEm,
    };
  }
}

@Controller()
export class ParticipanteController {
  constructor(private readonly svc: ParticipanteService) {}

  @Post('inscricoes')
  @RequirePermissions('inscricao:create')
  inscrever(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(inscreverSchema)) dto: InscreverDto,
  ) {
    return this.svc.inscrever(user.tenantId, user.id, dto);
  }

  @Get('participante/minhas-formacoes')
  @RequirePermissions('participante:area')
  minhas(@CurrentUser() user: AuthUser) {
    return this.svc.minhasFormacoes(user.tenantId, user.id);
  }

  @Get('formacoes/:id/minha-participacao')
  @RequirePermissions('participante:area')
  minhaParticipacao(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.minhaParticipacao(user.tenantId, user.id, id);
  }

  @Post('inscricoes/:id/certificado')
  @RequirePermissions('certificado:read')
  emitir(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.emitirCertificado(user.tenantId, user.id, id);
  }

  @Public()
  @Get('certificados/validar/:codigo')
  validar(@Param('codigo') codigo: string) {
    return this.svc.validarCertificado(codigo);
  }
}

@Module({
  controllers: [ParticipanteController],
  providers: [ParticipanteService],
})
export class ParticipanteModule {}
