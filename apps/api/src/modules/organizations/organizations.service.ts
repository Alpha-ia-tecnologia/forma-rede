import { Injectable } from '@nestjs/common';
import { forTenant, runAsSystem } from '@formarede/db';
import { CreateEscolaDto, CreateRegionalDto } from '@formarede/contracts';

/**
 * Todas as leituras/escritas escopadas passam por forTenant(tenantId), que fixa
 * app.tenant_id e deixa o Postgres (RLS) impor o isolamento por municipio.
 * Operacoes de superadmin (listar todos os municipios) usam runAsSystem (bypass).
 */
@Injectable()
export class OrganizationsService {
  listTenants() {
    return runAsSystem((tx) =>
      tx.tenant.findMany({
        orderBy: { nome: 'asc' },
        include: { config: true, _count: { select: { escolas: true, formacoes: true } } },
      }),
    );
  }

  currentTenant(tenantId: string) {
    return forTenant(tenantId).tenant.findFirstOrThrow({ include: { config: true } });
  }

  async dashboard(tenantId: string) {
    const db = forTenant(tenantId);
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date();
    fimDia.setHours(23, 59, 59, 999);

    const [
      escolas,
      regionais,
      formacoes,
      turmas,
      formacoesAvaliacao,
      entregasAvaliar,
      encontrosHoje,
      planosIa,
      certificadosEmitidos,
      freqTotal,
      freqPresentes,
    ] = await Promise.all([
      db.escola.count(),
      db.regional.count(),
      db.formacao.count(),
      db.turma.count(),
      db.formacao.count({ where: { etapaFluxo: 'AVALIACAO' } }),
      db.entrega.count({ where: { status: 'ENVIADA' } }),
      db.encontro.count({ where: { status: 'AGENDADO', inicio: { gte: inicioDia, lte: fimDia } } }),
      db.planoFormativo.count({ where: { status: 'RASCUNHO' } }),
      db.certificado.count(),
      db.frequencia.count(),
      db.frequencia.count({ where: { presente: true } }),
    ]);

    return {
      escolas,
      regionais,
      formacoes,
      turmas,
      // Itens acionaveis do dia; o cliente filtra a exibicao por permissao (RBAC).
      pendencias: { formacoesAvaliacao, entregasAvaliar, encontrosHoje, planosIa },
      // Indicadores de desfecho da rede (RF de acompanhamento).
      resultados: {
        frequenciaMedia: freqTotal > 0 ? Math.round((freqPresentes / freqTotal) * 100) : null,
        certificadosEmitidos,
      },
      analytics: await this.analytics(db),
    };
  }

  /**
   * Agregacoes para o dashboard analitico: distribuicoes (modalidade, curadoria,
   * entregas, faixas de frequencia), indicadores de desfecho, governanca de IA e
   * ranking de formacoes. Retorna apenas categorias presentes; o cliente completa
   * a ordem/rotulos e as categorias zeradas.
   */
  private async analytics(db: ReturnType<typeof forTenant>) {
    const grupo = (rows: { _count: { _all: number } }[], chave: string) =>
      rows.map((r) => ({ chave: String((r as Record<string, unknown>)[chave]), n: r._count._all }));

    const [
      modalidadeRows,
      materialRows,
      entregaRows,
      inscricaoRows,
      professores,
      formacoesAtivas,
      horasAgg,
      iaTotal,
      iaAprovadas,
      iaRejeitadas,
      iaSinalizadas,
      freqTot,
      freqPres,
      formList,
    ] = await Promise.all([
      db.formacao.groupBy({ by: ['modalidade'], _count: { _all: true } }),
      db.material.groupBy({ by: ['status'], _count: { _all: true } }),
      db.entrega.groupBy({ by: ['status'], _count: { _all: true } }),
      db.inscricao.groupBy({ by: ['status'], _count: { _all: true } }),
      db.inscricao.groupBy({ by: ['userId'] }),
      db.formacao.count({ where: { etapaFluxo: 'EXECUCAO' } }),
      db.formacao.aggregate({ _sum: { cargaHoraria: true } }),
      db.aiInteracao.count(),
      db.aiInteracao.count({ where: { status: 'APROVADA' } }),
      db.aiInteracao.count({ where: { status: 'REJEITADA' } }),
      db.aiInteracao.count({ where: { sinalizada: true } }),
      db.frequencia.groupBy({ by: ['inscricaoId'], _count: { _all: true } }),
      db.frequencia.groupBy({ by: ['inscricaoId'], where: { presente: true }, _count: { _all: true } }),
      db.formacao.findMany({
        select: {
          id: true, titulo: true, etapaFluxo: true, modalidade: true, cargaHoraria: true,
          turmas: { select: { _count: { select: { inscricoes: true } } } },
        },
      }),
    ]);

    // Distribuicao de frequencia por inscricao em faixas (risco < minimo).
    const presMap = new Map(freqPres.map((r) => [r.inscricaoId, r._count._all]));
    let risco = 0, medio = 0, alto = 0;
    for (const r of freqTot) {
      const pct = r._count._all ? ((presMap.get(r.inscricaoId) ?? 0) / r._count._all) * 100 : 0;
      if (pct < 75) risco++;
      else if (pct < 90) medio++;
      else alto++;
    }

    const inscritosPorStatus = grupo(inscricaoRows, 'status');
    const totalInscricoes = inscritosPorStatus.reduce((s, x) => s + x.n, 0);
    const concluidas = inscritosPorStatus.find((x) => x.chave === 'CONCLUIDA')?.n ?? 0;

    const topFormacoes = formList
      .map((f) => ({
        id: f.id, titulo: f.titulo, etapaFluxo: f.etapaFluxo, modalidade: f.modalidade,
        cargaHoraria: f.cargaHoraria,
        inscritos: f.turmas.reduce((s, t) => s + t._count.inscricoes, 0),
      }))
      .sort((a, b) => b.inscritos - a.inscritos)
      .slice(0, 6);

    return {
      kpis: {
        professoresAtivos: professores.length,
        formacoesAtivas,
        horasOfertadas: horasAgg._sum.cargaHoraria ?? 0,
        taxaConclusao: totalInscricoes > 0 ? Math.round((concluidas / totalInscricoes) * 100) : null,
        satisfacaoMedia: await this.satisfacaoMedia(db),
      },
      formacoesPorModalidade: grupo(modalidadeRows, 'modalidade'),
      materiaisPorStatus: grupo(materialRows, 'status'),
      entregasPorStatus: grupo(entregaRows, 'status'),
      inscritosPorStatus,
      frequenciaFaixas: [
        { chave: 'RISCO', n: risco },
        { chave: 'MEDIO', n: medio },
        { chave: 'ALTO', n: alto },
      ],
      ia: { total: iaTotal, aprovadas: iaAprovadas, rejeitadas: iaRejeitadas, sinalizadas: iaSinalizadas },
      satisfacaoPorPergunta: [] as { pergunta: string; media: number; n: number }[],
      topFormacoes,
    };
  }

  /** Media das respostas numericas (escala 1-5) das avaliacoes de satisfacao. */
  private async satisfacaoMedia(db: ReturnType<typeof forTenant>): Promise<number | null> {
    try {
      const rows = await db.respostaAvaliacao.findMany({
        where: { avaliacao: { tipo: 'SATISFACAO' } },
        select: { respostas: true },
      });
      const vals: number[] = [];
      for (const r of rows) {
        const arr = Array.isArray(r.respostas) ? r.respostas : Object.values(r.respostas as object);
        for (const item of arr as unknown[]) {
          const rec = item as Record<string, unknown>;
          const v = typeof item === 'number' ? item : (rec?.valor ?? rec?.nota ?? rec?.escala);
          if (typeof v === 'number' && v >= 1 && v <= 5) vals.push(v);
        }
      }
      if (!vals.length) return null;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    } catch {
      return null;
    }
  }

  listRegionais(tenantId: string) {
    return forTenant(tenantId).regional.findMany({
      orderBy: { nome: 'asc' },
      include: { _count: { select: { escolas: true } } },
    });
  }

  createRegional(tenantId: string, dto: CreateRegionalDto) {
    return forTenant(tenantId).regional.create({ data: { ...dto, tenantId } });
  }

  listEscolas(tenantId: string) {
    return forTenant(tenantId).escola.findMany({
      orderBy: { nome: 'asc' },
      include: { regional: true },
    });
  }

  createEscola(tenantId: string, dto: CreateEscolaDto) {
    return forTenant(tenantId).escola.create({ data: { ...dto, tenantId } });
  }

  deactivateEscola(tenantId: string, id: string) {
    return forTenant(tenantId).escola.update({ where: { id }, data: { ativo: false } });
  }
}
