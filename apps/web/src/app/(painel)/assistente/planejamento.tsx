'use client';
// Cartao do planejamento proposto pelo assistente: rascunho estruturado para o
// professor revisar, adaptar e copiar. Nunca e publicado sem decisao humana.
import { useState } from 'react';
import { Accessibility, BookMarked, Check, Clock, Copy, ListChecks, Target, Users } from 'lucide-react';
import { TIPO_PLANEJAMENTO_LABELS, type Planejamento } from '@formarede/contracts';
import { SeloIA } from '../ui';

export function planejamentoComoTexto(p: Planejamento): string {
  const lista = (titulo: string, itens: string[]) => (itens.length ? [`${titulo}:`, ...itens.map((t) => `- ${t}`), ''] : []);
  return [
    `${TIPO_PLANEJAMENTO_LABELS[p.tipo]}: ${p.titulo}`,
    `Público: ${p.publico}`,
    `Duração: ${p.duracao}`,
    '',
    ...lista('Objetivos', p.objetivos),
    'Etapas:',
    ...p.etapas.map((e, i) => `${i + 1}. ${e.titulo} (${e.duracao}): ${e.descricao}`),
    '',
    ...lista('Recursos', p.recursos),
    `Avaliação: ${p.avaliacao}`,
    '',
    ...lista('Adaptações', p.adaptacoes),
    ...lista('Fontes (materiais aprovados)', p.fontes),
    ...(p.observacoes ? [`Observações: ${p.observacoes}`] : []),
  ].join('\n').trim();
}

export function PlanejamentoCard({ p }: { p: Planejamento }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(planejamentoComoTexto(p));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <article className="plan-card" aria-label={`${TIPO_PLANEJAMENTO_LABELS[p.tipo]}: ${p.titulo}`}>
      <header className="plan-head">
        <div className="plan-head-topo">
          <span className="plan-tipo">{TIPO_PLANEJAMENTO_LABELS[p.tipo]}</span>
          <SeloIA>Proposto pela IA · revise e adapte</SeloIA>
        </div>
        <h3>{p.titulo}</h3>
        <div className="plan-meta">
          <span><Users size={16} aria-hidden="true" />{p.publico}</span>
          <span><Clock size={16} aria-hidden="true" />{p.duracao}</span>
        </div>
      </header>

      <div className="plan-body">
        <section>
          <h4><Target size={16} aria-hidden="true" />Objetivos</h4>
          <ul>{p.objetivos.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </section>

        <section>
          <h4><ListChecks size={16} aria-hidden="true" />Etapas</h4>
          <ol className="plan-etapas">
            {p.etapas.map((e, i) => (
              <li key={i}>
                <div className="plan-etapa-head">
                  <strong>{e.titulo}</strong>
                  <span className="plan-tempo">{e.duracao}</span>
                </div>
                <p>{e.descricao}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="plan-grid">
          {p.recursos.length > 0 && (
            <section>
              <h4>Recursos</h4>
              <ul>{p.recursos.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </section>
          )}
          <section>
            <h4>Avaliação</h4>
            <p>{p.avaliacao}</p>
          </section>
        </div>

        {p.adaptacoes.length > 0 && (
          <section className="plan-adapt">
            <h4><Accessibility size={16} aria-hidden="true" />Adaptações e alternativas</h4>
            <ul>{p.adaptacoes.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </section>
        )}
        {p.observacoes && <p className="plan-obs"><strong>Para decidir:</strong> {p.observacoes}</p>}
      </div>

      <footer className="plan-foot">
        <span className="plan-fontes">
          <BookMarked size={16} aria-hidden="true" />
          {p.fontes.length ? `Base: ${p.fontes.join('; ')}` : 'Sem material aprovado como base'}
        </span>
        <button type="button" className="btn btn-ghost" onClick={copiar} style={{ minHeight: 40 }}>
          {copiado ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </footer>
    </article>
  );
}
