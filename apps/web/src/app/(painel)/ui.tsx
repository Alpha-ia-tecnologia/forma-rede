'use client';
// Primitivos de UI compartilhados pelos ambientes do painel, no modelo do design
// system: cabecalho de pagina, selos, avisos, vazio com caminho, carregamento,
// campo e o cartao de formacao. A marca e amarela; texto da marca, em ocre.
import { Children, cloneElement, isValidElement, useEffect, useId, type ReactElement, type ReactNode } from 'react';
import type { EtapaFluxo } from '@formarede/contracts';
import { CircleAlert, CircleCheck, Clock, Info, Layers, MonitorPlay, Sparkles, TriangleAlert, Users } from 'lucide-react';

export type Tom = 'neutral' | 'accent' | 'good' | 'warn' | 'danger' | 'diff' | 'info';

// Pares do design system: fundo suave + texto escuro do mesmo nome.
const TOM: Record<Tom, { bg: string; fg: string }> = {
  neutral: { bg: 'color-mix(in srgb, var(--line) 60%, transparent)', fg: 'var(--ink-soft)' },
  accent: { bg: 'var(--brand-soft)', fg: 'var(--brand-strong)' },
  good: { bg: 'var(--green-soft)', fg: 'var(--green)' },
  warn: { bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  danger: { bg: 'var(--coral-soft)', fg: 'var(--coral)' },
  diff: { bg: 'var(--ia-soft)', fg: 'var(--ia-ink)' },
  info: { bg: 'var(--teal-soft)', fg: 'var(--teal-ink)' },
};

// Ponto do selo de etapa sobre os cartoes de categoria (sinais de dado).
const PONTO: Record<Tom, string> = {
  neutral: 'var(--signal-neutral)', accent: 'var(--brand)', good: 'var(--signal-lime)', warn: 'var(--signal-orange)',
  danger: 'var(--coral)', diff: 'var(--ia-line)', info: 'var(--teal-fill)',
};

export function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/**
 * Cabecalho da pagina: titulo (h1), uma linha de fatos logo abaixo (meta: modalidade,
 * carga, etapa...), a frase de apoio e as acoes a direita. Sem rotulo acima do titulo.
 */
/** Titulo da aba do navegador: cada tela se distingue no historico, nas abas e no leitor de tela. */
export function useTituloDaAba(titulo: string | null | undefined) {
  useEffect(() => {
    if (titulo) document.title = `${titulo} · Formarede`;
  }, [titulo]);
}

export function PageHeader({
  titulo, meta, descricao, children,
}: {
  titulo: string; meta?: ReactNode[]; descricao?: string; children?: ReactNode;
}) {
  useTituloDaAba(titulo);
  const fatos = meta?.filter(Boolean) ?? [];
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{titulo}</h1>
        {fatos.length > 0 && (
          <p className="page-meta">{fatos.map((m, i) => <span key={i}>{m}</span>)}</p>
        )}
        {descricao && <p className="page-lead">{descricao}</p>}
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </header>
  );
}

/** Selo (Badge) por tom. */
export function StatusBadge({ children, tom = 'neutral' }: { children: ReactNode; tom?: Tom }) {
  return <span className="badge" style={{ background: TOM[tom].bg, color: TOM[tom].fg }}>{children}</span>;
}

/** Selo de origem: tudo que a IA escreveu leva este selo, com o estado da revisao (cor propria da IA). */
export function SeloIA({ children }: { children: ReactNode }) {
  return <span className="ia-selo"><Sparkles size={14} aria-hidden="true" /> {children}</span>;
}

/** Selo com ponto colorido, para usar sobre os cartoes de categoria. */
export function EtapaPill({ children, tom = 'neutral' }: { children: ReactNode; tom?: Tom }) {
  return (
    <span className="course-pill">
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: PONTO[tom], boxShadow: '0 0 0 1px var(--ink)' }} />
      {children}
    </span>
  );
}

/** Aviso no fluxo, com icone (estado nunca so por cor). */
export function Note({ tom, children }: { tom: 'danger' | 'ok' | 'info' | 'diff' | 'warn'; children: ReactNode }) {
  const Icone = { danger: CircleAlert, ok: CircleCheck, info: Info, diff: Sparkles, warn: TriangleAlert }[tom];
  return (
    <div className={`note note-${tom}`} role={tom === 'danger' ? 'alert' : 'status'}>
      <Icone size={18} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Falha ao carregar: diz o que aconteceu e oferece tentar de novo (sem recarregar a pagina). */
export function ErroCarga({ mensagem, aoTentar }: { mensagem: string; aoTentar: () => void }) {
  return (
    <div className="note note-danger erro-carga" role="alert">
      <CircleAlert size={18} aria-hidden="true" />
      <span>{mensagem}</span>
      <button type="button" className="btn btn-ghost" onClick={aoTentar}>Tentar de novo</button>
    </div>
  );
}

/** Vazio com caminho: o que falta, por que importa e a acao que resolve. */
export function EmptyState({
  icon, titulo, descricao, acao,
}: {
  icon: ReactNode; titulo: string; descricao?: string; acao?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon size={24}>{icon}</Icon></span>
      <h3>{titulo}</h3>
      {descricao && <p>{descricao}</p>}
      {acao && <div style={{ marginTop: 10 }}>{acao}</div>}
    </div>
  );
}

/** Carregamento: blocos com pulso lento. */
export function ListSkeleton({ linhas = 3, altura = 64 }: { linhas?: number; altura?: number }) {
  return (
    <div style={{ display: 'grid', gap: 10 }} aria-hidden="true">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: altura, borderRadius: 'var(--radius-2xl)' }} />
      ))}
    </div>
  );
}

const CONTROLES = new Set(['input', 'select', 'textarea']);

/** Rotulo + controle, para formularios. O rotulo e ligado ao primeiro controle (htmlFor/id). */
export function Field({ label, children, style }: { label: string; children: ReactNode; style?: React.CSSProperties }) {
  const gerado = useId();
  const itens = Children.toArray(children);
  const alvo = itens.find((c): c is ReactElement<{ id?: string }> => isValidElement(c) && typeof c.type === 'string' && CONTROLES.has(c.type));
  const id = alvo?.props.id ?? gerado;
  return (
    <div style={style}>
      <label className="label" htmlFor={alvo ? id : undefined}>{label}</label>
      {alvo ? itens.map((c) => (c === alvo ? cloneElement(alvo, { id }) : c)) : children}
    </div>
  );
}

/** Tom do selo por etapa do fluxo formativo. */
export const ETAPA_TOM: Partial<Record<EtapaFluxo, Tom>> = {
  EXECUCAO: 'accent', AVALIACAO: 'warn', CONCLUIDA: 'good', CANCELADA: 'danger',
};

// Categoria da formacao = modalidade, com as cores de categoria do design system.
const MODALIDADE: Record<string, { label: string; pastel: string; icon: typeof Users }> = {
  PRESENCIAL: { label: 'Presencial', pastel: 'peach', icon: Users },
  HIBRIDA: { label: 'Híbrida', pastel: 'teal', icon: Layers },
  VIRTUAL: { label: 'Virtual', pastel: 'sage', icon: MonitorPlay },
};

/** Cartao de formacao no tom da modalidade: categoria, carga horaria, titulo e rodape. */
export function FormacaoCard({
  titulo, modalidade, cargaHoraria, rodape, status, compact = false,
}: {
  titulo: string; modalidade: string; cargaHoraria: number; rodape?: ReactNode; status?: ReactNode; compact?: boolean;
}) {
  const m = MODALIDADE[modalidade] ?? { label: modalidade.charAt(0) + modalidade.slice(1).toLowerCase(), pastel: 'rose', icon: Layers };
  const Icone = m.icon;
  return (
    <div className={`course-card${compact ? ' compact' : ''}`} data-pastel={m.pastel}>
      <div className="course-card-top">
        <span className="course-cat">
          <span className="course-icon"><Icone size={18} aria-hidden="true" /></span>
          {m.label}
        </span>
        <span className="course-pill"><Clock size={14} aria-hidden="true" />{cargaHoraria}h</span>
      </div>
      <h3 className="course-title">{titulo}</h3>
      {(rodape || status) && (
        <div className="course-meta">
          <span>{rodape}</span>
          {status}
        </div>
      )}
    </div>
  );
}
