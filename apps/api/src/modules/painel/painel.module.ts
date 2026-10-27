// Inicio de quem conduz formacoes: o que precisa de atencao agora, em todas as
// formacoes do municipio. Cada item leva ao ponto exato da tarefa (a chamada do
// encontro, a fila de entregas da atividade, a etapa da trilha) e cada lista so
// vem para quem age sobre ela. As regras sao as mesmas da pagina da formacao.
import { Controller, ForbiddenException, Get, Injectable, Module } from '@nestjs/common';
import { forTenant } from '@formarede/db';
import { AuthUser, PainelConducao, chamadaPendente, contarSemMarca } from '@formarede/contracts';
import { CurrentUser } from '../../common/security';

const tem = (u: AuthUser, p: string) => u.permissions.includes('*') || u.permissions.includes(p);
/** Quem conduz ou acompanha formacoes (mesma regra do painel da formacao). */
const CONDUZ = ['trilha:editar', 'frequencia:registrar', 'entrega:read', 'inscricao:read', 'formacao:update'];
const DIA = 24 * 60 * 60 * 1000;

@Injectable()
export class PainelService {
  async conducao(user: AuthUser): Promise<PainelConducao> {
    if (!CONDUZ.some((p) => tem(user, p))) {
      throw new ForbiddenException('Este painel é de quem conduz ou acompanha formações.');
    }
    const db = forTenant(user.tenantId);
    const agora = new Date();
    const ativas = { etapaFluxo: { notIn: ['CONCLUIDA', 'CANCELADA'] as ('CONCLUIDA' | 'CANCELADA')[] } };

    let hoje: PainelConducao['hoje'] = null;
    let proximos: PainelConducao['proximos'] = null;
    let chamadasPendentes: PainelConducao['chamadasPendentes'] = null;
    if (tem(user, 'frequencia:registrar')) {
      // Janela: chamadas pendentes dos ultimos 120 dias e encontros dos proximos 60.
      const encontros = await db.encontro.findMany({
        where: {
          inicio: { gte: new Date(agora.getTime() - 120 * DIA), lte: new Date(agora.getTime() + 60 * DIA) },
          turma: { formacao: ativas },
        },
        orderBy: { inicio: 'asc' },
        include: {
          turma: {
            select: {
              id: true, nome: true, formacao: { select: { id: true, titulo: true } },
              inscricoes: { where: { status: 'CONFIRMADA' }, select: { id: true, createdAt: true } },
            },
          },
          frequencias: { select: { presente: true, inscricaoId: true } },
        },
      });
      const lista = encontros.map((e) => ({
        id: e.id, titulo: e.titulo, inicio: e.inicio.toISOString(), fim: e.fim?.toISOString() ?? null,
        local: e.local, linkVirtual: e.linkVirtual, cancelado: e.status === 'CANCELADO',
        turma: { id: e.turma.id, nome: e.turma.nome },
        formacao: e.turma.formacao,
        chamadaRegistrada: e.frequencias.length > 0,
        presentes: e.frequencias.filter((f) => f.presente).length,
        semMarca: contarSemMarca(e.turma.inscricoes, e.frequencias, e),
      }));
      const mesmoDia = (iso: string) => new Date(iso).toDateString() === agora.toDateString();
      hoje = lista.filter((e) => !e.cancelado && mesmoDia(e.inicio));
      proximos = lista.filter((e) => !e.cancelado && !mesmoDia(e.inicio) && new Date(e.inicio) > agora).slice(0, 4);
      chamadasPendentes = lista.filter((e) => !mesmoDia(e.inicio) && chamadaPendente(e, agora));
    }

    let entregas: PainelConducao['entregas'] = null;
    if (tem(user, 'entrega:read')) {
      const atividades = await db.atividade.findMany({
        where: { entregas: { some: { status: 'ENVIADA' } }, formacao: ativas },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, titulo: true,
          formacao: { select: { id: true, titulo: true } },
          _count: { select: { entregas: { where: { status: 'ENVIADA' } } } },
        },
      });
      entregas = atividades.map((a) => ({ atividadeId: a.id, titulo: a.titulo, formacao: a.formacao, aguardando: a._count.entregas }));
    }

    let curadoria: PainelConducao['curadoria'] = null;
    if (tem(user, 'trilha:editar')) {
      const etapas = await db.trilhaEtapa.findMany({
        where: { material: { status: 'EM_REVISAO' }, formacao: ativas },
        select: { formacao: { select: { id: true, titulo: true } } },
      });
      const porFormacao = new Map<string, { formacao: { id: string; titulo: string }; etapas: number }>();
      for (const e of etapas) {
        const atual = porFormacao.get(e.formacao.id) ?? { formacao: e.formacao, etapas: 0 };
        atual.etapas += 1;
        porFormacao.set(e.formacao.id, atual);
      }
      curadoria = [...porFormacao.values()];
    }

    return { hoje, proximos, chamadasPendentes, entregas, curadoria };
  }
}

@Controller('painel')
export class PainelController {
  constructor(private readonly svc: PainelService) {}

  @Get('conducao')
  conducao(@CurrentUser() user: AuthUser) {
    return this.svc.conducao(user);
  }
}

@Module({
  controllers: [PainelController],
  providers: [PainelService],
})
export class PainelModule {}
