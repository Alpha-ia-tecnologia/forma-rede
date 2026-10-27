'use client';
// "Como esta a rede": como a rede vai, depois do que depende da gestao (report:read).
// Uma frase com o tamanho da rede, tres quadros que respondem "a rede vai bem?" e o
// resto recolhido em "Mais indicadores". Frequencia vem da mesma conta da tela de
// Frequencia (media por professor e situacoes), para os numeros baterem nas duas telas.
// Quadro cinza com cartoes brancos; valor sempre tambem em texto.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ETAPA_FLUXO_LABELS } from '@formarede/contracts';
import type { AcompanhamentoFrequencia, AuthUser, EtapaFluxo } from '@formarede/contracts';
import { api } from '../../../lib/api';
import { decimal, plural } from '../../../lib/texto';
import { ChartCard, Donut, BarList, StackedBar, type Segmento } from './charts';

interface CatCount { chave: string; n: number }
interface Analytics {
  kpis: { professoresAtivos: number; formacoesAtivas: number; horasOfertadas: number; taxaConclusao: number | null; satisfacaoMedia: number | null };
  formacoesPorModalidade: CatCount[];
  materiaisPorStatus: CatCount[];
  entregasPorStatus: CatCount[];
  inscritosPorStatus: CatCount[];
  frequenciaFaixas: CatCount[];
  ia: { total: number; aprovadas: number; rejeitadas: number; sinalizadas: number };
  satisfacaoPorPergunta: { pergunta: string; media: number; n: number }[];
}
interface Stats {
  formacoes: number;
  resultados?: { frequenciaMedia: number | null; certificadosEmitidos: number };
  analytics?: Analytics;
}
interface FormacaoRow { id: string; etapaFluxo: EtapaFluxo }

// Categorias (modalidade) nas cores de categoria; estados nos sinais do design
// system: lima = bom, amarelo = intermediario, laranja = atencao.
const MODALIDADE_DEFS = [
  { chave: 'PRESENCIAL', label: 'Presencial', color: 'var(--peach-fill)' },
  { chave: 'HIBRIDA', label: 'Híbrida', color: 'var(--teal-fill)' },
  { chave: 'VIRTUAL', label: 'Virtual', color: 'var(--sage-fill)' },
];
const MATERIAL_DEFS = [
  { chave: 'APROVADO', label: 'Aprovados', color: 'var(--signal-lime)' },
  { chave: 'EM_REVISAO', label: 'Em revisão', color: 'var(--signal-yellow)' },
  { chave: 'RASCUNHO', label: 'Rascunho', color: 'var(--signal-neutral)' },
  { chave: 'REJEITADO', label: 'Recusados', color: 'var(--signal-orange)' },
];
const ENTREGA_DEFS = [
  { chave: 'ENVIADA', label: 'Aguardando devolutiva', color: 'var(--signal-yellow)' },
  { chave: 'EM_AJUSTE', label: 'Ajuste pedido', color: 'var(--signal-orange)' },
  { chave: 'AVALIADA', label: 'Avaliadas', color: 'var(--signal-lime)' },
];
// Faixas de frequencia por professor nas mesmas situacoes da tela de Frequencia.
const SITUACAO_DEFS = [
  { chave: 'ABAIXO', label: 'Abaixo do mínimo', color: 'var(--signal-orange)' },
  { chave: 'ATENCAO', label: 'Em atenção', color: 'var(--signal-yellow)' },
  { chave: 'REGULAR', label: 'Regular', color: 'var(--signal-lime)' },
  { chave: 'SEM_CHAMADA', label: 'Sem chamada', color: 'var(--signal-neutral)' },
];
// Sem acesso a Frequencia: as faixas do painel analitico.
const FREQUENCIA_DEFS = [
  { chave: 'RISCO', label: 'Abaixo do mínimo (< 75%)', color: 'var(--signal-orange)' },
  { chave: 'MEDIO', label: 'De 75% a 89%', color: 'var(--signal-yellow)' },
  { chave: 'ALTO', label: '90% ou mais', color: 'var(--signal-lime)' },
];
/** O ciclo da formacao: em andamento e encerrada (os dados antigos das outras etapas nao aparecem). */
const FLUXO: EtapaFluxo[] = ['EXECUCAO', 'CONCLUIDA'];

function segmentos(rows: CatCount[] | undefined, defs: { chave: string; label: string; color: string }[]): Segmento[] {
  const map = new Map((rows ?? []).map((r) => [r.chave, r.n]));
  return defs.map((d) => ({ label: d.label, value: map.get(d.chave) ?? 0, color: d.color }));
}

export function PainelRede({ user, tenantNome, frequencia, formacoes }: {
  user: AuthUser;
  tenantNome: string | null;
  /** A conta da tela de Frequencia (null sem acesso a ela). */
  frequencia: AcompanhamentoFrequencia | null;
  formacoes: FormacaoRow[];
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const can = (p: string) => user.permissions.includes('*') || user.permissions.includes(p);

  useEffect(() => {
    api.get<Stats>('/dashboard').then(setStats).catch(() => undefined);
  }, []);

  const a = stats?.analytics;
  const res = stats?.resultados;
  const r = frequencia?.resumo;
  // Frequencia media por professor (cada um pesa igual), a mesma da tela de Frequencia.
  const freq = r ? r.frequenciaMediaPct : res?.frequenciaMedia ?? null;
  const conclusao = a?.kpis.taxaConclusao ?? null;
  const satisfacao = a?.kpis.satisfacaoMedia ?? null;
  const porEtapa = FLUXO.map((e) => ({ label: ETAPA_FLUXO_LABELS[e], value: formacoes.filter((f) => f.etapaFluxo === e).length, color: 'var(--signal-neutral)' }));
  const situacoes = frequencia
    ? (() => {
      const conta = (...s: string[]) => frequencia.professores.filter((p) => s.includes(p.situacao)).length;
      return SITUACAO_DEFS.map((d) => ({
        label: d.label, color: d.color,
        value: d.chave === 'ABAIXO' ? conta('EM_RISCO', 'CRITICO') : conta(d.chave),
      }));
    })()
    : segmentos(a?.frequenciaFaixas, FREQUENCIA_DEFS);
  const tamanho = a
    ? `${plural(a.kpis.professoresAtivos, 'professor', 'professores')} em formação, ${plural(a.kpis.formacoesAtivas, 'formação', 'formações')} em andamento, ${plural(res?.certificadosEmitidos ?? 0, 'certificado emitido', 'certificados emitidos')} e ${a.kpis.horasOfertadas} h ofertadas.`
    : 'Carregando os números da rede...';

  return (
    <section className="fsec" aria-labelledby="rede">
      <div className="fsec-head">
        <div>
          <h2 id="rede" className="section-title">Como está a rede</h2>
          <p className="fsec-lead">{tenantNome ? `${tenantNome}: ${tamanho}` : tamanho}</p>
        </div>
        <Link className="btn btn-ghost" href="/relatorios">Relatórios e exportação</Link>
      </div>

      <div className="dash-board rede-quadro">
        <ChartCard titulo="Desempenho" dica="Frequência, conclusão e satisfação das formações.">
          <div style={{ display: 'grid', gap: 16 }}>
            <Meter label={r ? 'Frequência média por professor' : 'Frequência média'} valor={freq == null ? '—' : `${freq}%`} pct={freq}
              cor={freq != null && freq < 75 ? 'var(--signal-orange)' : 'var(--signal-lime)'} />
            <Meter label="Taxa de conclusão" valor={conclusao == null ? '—' : `${conclusao}%`} pct={conclusao}
              cor={conclusao == null || conclusao >= 70 ? 'var(--signal-lime)' : conclusao >= 50 ? 'var(--signal-yellow)' : 'var(--signal-orange)'} />
            <Meter label="Satisfação média" valor={satisfacao == null ? '—' : `${decimal(satisfacao)} de 5`} pct={satisfacao == null ? null : ((satisfacao - 1) / 4) * 100}
              cor={satisfacao == null || satisfacao >= 4 ? 'var(--signal-lime)' : satisfacao >= 3 ? 'var(--signal-yellow)' : 'var(--signal-orange)'} />
          </div>
        </ChartCard>

        <ChartCard titulo={frequencia ? 'Frequência dos professores' : 'Frequência dos cursistas'}
          dica={frequencia ? 'Pela situação de cada um em relação ao mínimo da formação.' : 'Cursistas por faixa de frequência.'}
          aside={can('frequencia:acompanhar') ? <Link href="/frequencia" className="link-more">Acompanhar</Link> : undefined}>
          <BarList linhas={situacoes.map((s) => ({ label: s.label, value: s.value, color: s.color }))} />
        </ChartCard>

        <ChartCard titulo="Entregas de atividades" dica="Da entrega à devolutiva.">
          <StackedBar segmentos={segmentos(a?.entregasPorStatus, ENTREGA_DEFS)} />
        </ChartCard>
      </div>

      <details className="copiloto-detalhes rede-mais">
        <summary>Mais indicadores: etapas, modalidades, materiais, satisfação por pergunta e decisões da IA</summary>
        <div className="dash-board rede-quadro">
          <ChartCard titulo="Formações por etapa" dica="Onde cada formação está no processo." aside={plural(formacoes.length, 'formação', 'formações')}>
            <BarList linhas={porEtapa} />
          </ChartCard>

          <ChartCard titulo="Formações por modalidade" dica="Oferta atual da rede.">
            <Donut segmentos={segmentos(a?.formacoesPorModalidade, MODALIDADE_DEFS)} centroLabel="formações" />
          </ChartCard>

          <ChartCard titulo="Materiais por situação" dica="Só os aprovados chegam às formações e à IA.">
            <StackedBar segmentos={segmentos(a?.materiaisPorStatus, MATERIAL_DEFS)} />
          </ChartCard>

          {a && a.satisfacaoPorPergunta.length > 0 && (
            <ChartCard titulo="Satisfação por pergunta" dica="Média das respostas, de 1 a 5.">
              <BarList linhas={a.satisfacaoPorPergunta.map((q) => ({ label: q.pergunta, value: q.media, color: 'var(--signal-yellow)' }))}
                max={5} formatValue={(v) => decimal(v)} />
            </ChartCard>
          )}

          {(can('ia:auditar') || can('ia:config')) && (
            <ChartCard titulo="Decisões sobre planos de IA" dica="Todo plano gerado por IA passa por revisão humana."
              aside={a ? plural(a.ia.total, 'interação', 'interações') : undefined}>
              <StackedBar segmentos={[
                { label: 'Aprovadas', value: a?.ia.aprovadas ?? 0, color: 'var(--signal-lime)' },
                { label: 'Rejeitadas', value: a?.ia.rejeitadas ?? 0, color: 'var(--signal-orange)' },
                { label: 'Sinalizadas', value: a?.ia.sinalizadas ?? 0, color: 'var(--signal-yellow)' },
              ]} />
            </ChartCard>
          )}
        </div>
      </details>
    </section>
  );
}

/** Barra de progresso com rotulo e valor visiveis; sem base, nao desenha. */
function Meter({ label, valor, pct, cor }: { label: string; valor: string; pct: number | null; cor: string }) {
  return (
    <div className="meter">
      <div className="meter-head"><span>{label}</span><strong>{valor}</strong></div>
      <div className="meter-track" role="img" aria-label={`${label}: ${pct == null ? 'sem base para calcular' : valor}`}>
        {pct != null && pct > 0 && (
          <div className="meter-fill" style={{ background: cor, backgroundImage: 'repeating-linear-gradient(120deg, rgb(0 0 0 / 0.1) 0 1.5px, transparent 1.5px 5px)', transform: `scaleX(${Math.max(0.02, Math.min(100, pct) / 100)})` }} />
        )}
      </div>
    </div>
  );
}
