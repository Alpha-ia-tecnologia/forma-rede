// Relatorios gerenciais (RF-110..116): frequencia por participante e taxa de
// conclusao por formacao, com exportacao CSV. Resultados respeitam o tenant
// (RLS) e nao expoem dados alem do necessario (RF-119).
import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { forTenant } from '@formarede/db';
import {
  AuthUser,
  ETAPA_FLUXO_LABELS,
  LinhaRelatorioConclusao,
  LinhaRelatorioFrequencia,
  resumirAcompanhamento,
  resumirFrequencia,
  SITUACAO_FREQUENCIA_LABELS,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';

function csv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n');
}

// Frequencia pela mesma regra da tela de Frequencia (resumirFrequencia): presencas sobre
// chamadas registradas, situacao em relacao ao minimo de cada formacao.
const ENCONTROS = { where: { status: { not: 'CANCELADO' as const } }, select: { id: true, titulo: true, inicio: true, status: true } };
const FREQUENCIAS = { select: { encontroId: true, presente: true, justificativa: true } };

function resumo(
  encontros: { id: string; titulo: string; inicio: Date; status: string }[],
  frequencias: { encontroId: string; presente: boolean; justificativa: string | null }[],
  minimo: number,
  agora: Date,
) {
  return resumirFrequencia(
    encontros.map((e) => ({ id: e.id, titulo: e.titulo, inicio: e.inicio, cancelado: e.status === 'CANCELADO' })),
    frequencias, minimo, agora,
  );
}

@Injectable()
export class RelatoriosService {
  async frequencia(tenantId: string, formacaoId?: string): Promise<LinhaRelatorioFrequencia[]> {
    const agora = new Date();
    const inscricoes = await forTenant(tenantId).inscricao.findMany({
      where: {
        status: { in: ['CONFIRMADA', 'CONCLUIDA'] },
        ...(formacaoId ? { turma: { formacaoId } } : {}),
      },
      include: {
        user: { select: { nome: true, email: true } },
        turma: { include: { formacao: { select: { titulo: true, freqMinimaPct: true } }, encontros: ENCONTROS } },
        frequencias: FREQUENCIAS,
      },
      orderBy: { createdAt: 'asc' },
    });

    return inscricoes.map((i) => {
      const r = resumo(i.turma.encontros, i.frequencias, i.turma.formacao.freqMinimaPct, agora);
      return {
        participante: i.user.nome,
        email: i.user.email,
        formacao: i.turma.formacao.titulo,
        turma: i.turma.nome,
        presencas: r.presencas,
        chamadasRegistradas: r.chamadasRegistradas,
        encontrosPrevistos: r.encontrosPrevistos,
        frequenciaPct: r.frequenciaPct,
        minimoPct: i.turma.formacao.freqMinimaPct,
        situacao: r.situacao,
      };
    });
  }

  async conclusao(tenantId: string): Promise<LinhaRelatorioConclusao[]> {
    const agora = new Date();
    const formacoes = await forTenant(tenantId).formacao.findMany({
      include: {
        turmas: {
          include: {
            encontros: ENCONTROS,
            inscricoes: {
              where: { status: { in: ['CONFIRMADA', 'CONCLUIDA'] } },
              include: { certificado: { select: { id: true } }, frequencias: FREQUENCIAS },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return formacoes.map((f) => {
      const inscricoes = f.turmas.flatMap((t) => t.inscricoes.map((i) => ({ ...i, encontros: t.encontros })));
      const certificados = inscricoes.filter((i) => i.certificado).length;
      const indicadores = resumirAcompanhamento(inscricoes.map((i) => resumo(i.encontros, i.frequencias, f.freqMinimaPct, agora)));
      return {
        formacao: f.titulo,
        etapaFluxo: f.etapaFluxo,
        inscritos: inscricoes.length,
        certificados,
        taxaConclusaoPct: inscricoes.length ? Math.round((certificados / inscricoes.length) * 100) : null,
        frequenciaMediaPct: indicadores.frequenciaMediaPct,
        minimoPct: f.freqMinimaPct,
        abaixoDoMinimo: indicadores.abaixoDoMinimo,
      };
    });
  }

  async frequenciaCsv(tenantId: string, formacaoId?: string) {
    const rows = await this.frequencia(tenantId, formacaoId);
    return {
      filename: 'relatorio-frequencia.csv',
      csv: csv(
        ['Participante', 'E-mail', 'Formacao', 'Turma', 'Presencas', 'Chamadas registradas', 'Encontros previstos', 'Frequencia %', 'Minimo %', 'Situacao'],
        rows.map((r) => [r.participante, r.email, r.formacao, r.turma, r.presencas, r.chamadasRegistradas, r.encontrosPrevistos,
          r.frequenciaPct ?? '', r.minimoPct, SITUACAO_FREQUENCIA_LABELS[r.situacao]]),
      ),
    };
  }

  async conclusaoCsv(tenantId: string) {
    const rows = await this.conclusao(tenantId);
    return {
      filename: 'relatorio-conclusao.csv',
      csv: csv(
        ['Formacao', 'Etapa', 'Inscritos', 'Certificados', 'Taxa de conclusao %', 'Frequencia media %', 'Minimo %', 'Abaixo do minimo'],
        rows.map((r) => [r.formacao, ETAPA_FLUXO_LABELS[r.etapaFluxo], r.inscritos, r.certificados, r.taxaConclusaoPct ?? '',
          r.frequenciaMediaPct ?? '', r.minimoPct, r.abaixoDoMinimo]),
      ),
    };
  }
}

@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly svc: RelatoriosService) {}

  @Get('frequencia')
  @RequirePermissions('report:read')
  frequencia(@CurrentUser() user: AuthUser, @Query('formacaoId') formacaoId?: string) {
    return this.svc.frequencia(user.tenantId, formacaoId);
  }

  @Get('conclusao')
  @RequirePermissions('report:read')
  conclusao(@CurrentUser() user: AuthUser) {
    return this.svc.conclusao(user.tenantId);
  }

  @Get('frequencia/csv')
  @RequirePermissions('report:export')
  frequenciaCsv(@CurrentUser() user: AuthUser, @Query('formacaoId') formacaoId?: string) {
    return this.svc.frequenciaCsv(user.tenantId, formacaoId);
  }

  @Get('conclusao/csv')
  @RequirePermissions('report:export')
  conclusaoCsv(@CurrentUser() user: AuthUser) {
    return this.svc.conclusaoCsv(user.tenantId);
  }
}

@Module({
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
})
export class RelatoriosModule {}
