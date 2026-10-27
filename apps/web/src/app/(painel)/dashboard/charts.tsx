'use client';
// Graficos do painel no padrao do design system: cartao de dados branco (dentro
// do quadro cinza), trilho `signal-track`, preenchimento com a textura listrada a
// 120 graus e o valor sempre tambem em texto. HTML e SVG, sem biblioteca.
import { useId, type ReactNode } from 'react';

export interface Segmento {
  label: string;
  value: number;
  color: string;
}

/** Cartao de dados (DataCard): titulo, dica com o recorte e o grafico. */
export function ChartCard({
  dica, titulo, aside, children, style,
}: {
  dica?: string; titulo: string; aside?: ReactNode; children: ReactNode; style?: React.CSSProperties;
}) {
  return (
    <section className="dash-card" style={{ display: 'flex', flexDirection: 'column', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h3 className="dash-card-title">{titulo}</h3>
          {dica && <p className="dash-card-hint">{dica}</p>}
        </div>
        {aside != null && <span className="muted" style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const HATCH = 'repeating-linear-gradient(120deg, rgb(0 0 0 / 0.1) 0 1.5px, transparent 1.5px 5px)';

/** Rosca: fatias com a textura por cima e o total no centro. */
export function Donut({
  segmentos, centroValor, centroLabel, size = 148, espessura = 18,
}: {
  segmentos: Segmento[]; centroValor?: ReactNode; centroLabel?: string; size?: number; espessura?: number;
}) {
  const id = useId().replace(/:/g, '');
  const total = segmentos.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - espessura / 2 - 1;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  const arcos = total > 0 ? segmentos.filter((s) => s.value > 0).map((s) => {
    const frac = s.value / total;
    const dash = Math.max(0, frac * circ - 3); // fresta entre fatias
    const offset = -acc * circ;
    acc += frac;
    return { ...s, dash, offset };
  }) : [];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} role="img" aria-label={`Total ${total}: ${segmentos.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
          <defs>
            <pattern id={`h${id}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
              <rect width="1.5" height="5" fill="rgb(0 0 0 / 0.1)" />
            </pattern>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--signal-track)" strokeWidth={espessura} />
          {arcos.map((s) => (
            <g key={s.label} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={espessura}
                strokeDasharray={`${s.dash} ${circ - s.dash}`} strokeDashoffset={s.offset} />
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#h${id})`} strokeWidth={espessura}
                strokeDasharray={`${s.dash} ${circ - s.dash}`} strokeDashoffset={s.offset} />
            </g>
          ))}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div className="display" style={{ fontSize: 'var(--text-xl)', lineHeight: 1 }}>{centroValor ?? total}</div>
            {centroLabel && <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{centroLabel}</div>}
          </div>
        </div>
      </div>
      <Legenda segmentos={segmentos} total={total} />
    </div>
  );
}

function Amostra({ cor }: { cor: string }) {
  return <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 'var(--radius-mark)', background: cor, backgroundImage: HATCH, flexShrink: 0 }} />;
}

export function Legenda({ segmentos, total }: { segmentos: Segmento[]; total: number }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, flex: 1, minWidth: 140 }}>
      {segmentos.map((s) => (
        <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 'var(--text-xs)' }}>
          <Amostra cor={s.color} />
          <span style={{ flex: 1 }}>{s.label}</span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</strong>
          <span className="muted" style={{ width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Barras horizontais: valor zero nao desenha barra. */
export function BarList({
  linhas, max, formatValue,
}: {
  linhas: { label: string; value: number; color?: string }[]; max?: number; formatValue?: (v: number) => string;
}) {
  const teto = Math.max(1, max ?? Math.max(...linhas.map((l) => l.value), 0));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {linhas.map((l) => (
        <div key={l.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 150px) 1fr 40px', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--text-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</div>
          <div style={{ height: 12, background: 'var(--signal-track)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            {l.value > 0 && (
              <div style={{
                height: 12, width: '100%', borderRadius: 'var(--radius-full)',
                background: l.color ?? 'var(--brand)', backgroundImage: HATCH,
                transform: `scaleX(${Math.max(0.03, l.value / teto)})`, transformOrigin: 'left', transition: 'transform 520ms var(--ease-alpha)',
              }} />
            )}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: l.value ? 'var(--ink)' : 'var(--ink-soft)' }}>
            {formatValue ? formatValue(l.value) : l.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Barra unica empilhada (proporcao) com a legenda embaixo: status e funis. */
export function StackedBar({ segmentos }: { segmentos: Segmento[] }) {
  const total = segmentos.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div style={{ display: 'flex', gap: 3, height: 16, borderRadius: 'var(--radius-full)', overflow: 'hidden', background: 'var(--signal-track)' }}
        role="img" aria-label={segmentos.map((s) => `${s.label}: ${s.value}`).join(', ')}>
        {total > 0 && segmentos.filter((s) => s.value > 0).map((s) => (
          <div key={s.label} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color, backgroundImage: HATCH }} />
        ))}
      </div>
      {total === 0 && <p className="muted" style={{ margin: '10px 0 0', fontSize: 'var(--text-xs)' }}>Sem registros no período.</p>}
      <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
        {segmentos.map((s) => (
          <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs)' }}>
            <Amostra cor={s.color} />
            <span>{s.label}</span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
