'use client';
// Acompanhamento da frequencia dos professores: retrato de agora (frequencia
// acumulada nas chamadas registradas), teto alcancavel ate o fim da turma e quem
// pede contato. Os numeros vem prontos da API (regra em @formarede/contracts).
import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock, Check, ChevronDown, Clock, Download, Users, X,
} from 'lucide-react';
import {
  SITUACAO_FREQUENCIA_LABELS, SITUACOES_FREQUENCIA,
  type AcompanhamentoFrequencia, type FrequenciaProfessor, type MarcaFrequencia, type SituacaoFrequencia,
} from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { plural } from '../../../lib/texto';
import { EmptyState, ListSkeleton, Note, PageHeader, StatusBadge, type Tom } from '../ui';

const SITUACAO_TOM: Record<SituacaoFrequencia, Tom> = {
  CRITICO: 'danger', EM_RISCO: 'danger', ATENCAO: 'warn', SEM_CHAMADA: 'neutral', REGULAR: 'good',
};

const MARCA: Record<MarcaFrequencia, { label: string; tom: Tom }> = {
  PRESENTE: { label: 'Presente', tom: 'good' },
  AUSENTE: { label: 'Falta', tom: 'danger' },
  JUSTIFICADA: { label: 'Falta justificada', tom: 'warn' },
  PENDENTE: { label: 'Sem chamada', tom: 'neutral' },
  PREVISTO: { label: 'Previsto', tom: 'info' },
};

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const dataLonga = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase();
}

/** Por que o professor esta nos alertas, em uma frase. */
function motivo(p: FrequenciaProfessor): string {
  const min = p.formacao.freqMinimaPct;
  const partes: string[] = [];
  if (p.situacao === 'CRITICO') partes.push(`Mesmo presente em todos os encontros restantes, chega a ${p.projecaoMaximaPct}% (mínimo ${min}%)`);
  else if (p.situacao === 'EM_RISCO') partes.push(`${p.frequenciaPct}% de frequência, abaixo dos ${min}% — ainda pode chegar a ${p.projecaoMaximaPct}%`);
  if (p.ausenciasSeguidas >= 2) partes.push(`${p.ausenciasSeguidas} ausências seguidas`);
  return partes.join(' · ');
}

const emAlerta = (p: FrequenciaProfessor) => p.situacao === 'CRITICO' || p.situacao === 'EM_RISCO' || p.ausenciasSeguidas >= 2;

function corDaFrequencia(p: FrequenciaProfessor): string {
  if (p.frequenciaPct === null) return 'var(--signal-neutral)';
  if (p.frequenciaPct < p.formacao.freqMinimaPct) return 'var(--signal-orange)';
  if (p.situacao === 'ATENCAO') return 'var(--signal-yellow)';
  return 'var(--signal-lime)';
}

function exportarCsv(linhas: FrequenciaProfessor[]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = ['Professor', 'E-mail', 'Escola', 'Formação', 'Turma', 'Presenças', 'Chamadas registradas', 'Faltas', 'Faltas justificadas',
    'Frequência %', 'Máximo possível %', 'Mínimo %', 'Ausências seguidas', 'Situação'];
  const rows = linhas.map((p) => [p.professor.nome, p.professor.email, p.escola?.nome ?? '', p.formacao.titulo, p.turma.nome,
    p.presencas, p.chamadasRegistradas, p.faltas, p.faltasJustificadas, p.frequenciaPct ?? '', p.projecaoMaximaPct ?? '',
    p.formacao.freqMinimaPct, p.ausenciasSeguidas, SITUACAO_FREQUENCIA_LABELS[p.situacao]]);
  // BOM: o Excel abre o CSV em UTF-8 com acentos corretos.
  const csv = '﻿' + [cab, ...rows].map((r) => r.map(esc).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `frequencia-professores-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FrequenciaPage() {
  const [dados, setDados] = useState<AcompanhamentoFrequencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [formacaoId, setFormacaoId] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [escolaId, setEscolaId] = useState('');
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<SituacaoFrequencia | 'TODAS'>('TODAS');
  const [aberto, setAberto] = useState<string | null>(null);
  const user = getUser();
  const podeRegistrar = !!user && (user.permissions.includes('*') || user.permissions.includes('frequencia:registrar'));

  useEffect(() => {
    const q = new URLSearchParams();
    if (formacaoId) q.set('formacaoId', formacaoId);
    if (turmaId) q.set('turmaId', turmaId);
    if (escolaId) q.set('escolaId', escolaId);
    setErro(null);
    const qs = q.toString();
    api.get<AcompanhamentoFrequencia>(`/frequencia/professores${qs ? `?${qs}` : ''}`)
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar a frequência.'));
  }, [formacaoId, turmaId, escolaId]);

  const professores = dados?.professores ?? [];
  const contagem = useMemo(() => {
    const c = Object.fromEntries(SITUACOES_FREQUENCIA.map((s) => [s, 0])) as Record<SituacaoFrequencia, number>;
    for (const p of professores) c[p.situacao] += 1;
    return c;
  }, [professores]);
  const visiveis = professores.filter((p) =>
    (situacao === 'TODAS' || p.situacao === situacao)
    && `${p.professor.nome} ${p.escola?.nome ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const alertas = professores.filter(emAlerta);
  const turmas = (dados?.opcoes.turmas ?? []).filter((t) => !formacaoId || t.formacaoId === formacaoId);
  const temRecorte = !!(formacaoId || turmaId || escolaId);
  const r = dados?.resumo;

  function abrir(id: string) {
    setSituacao('TODAS');
    setBusca('');
    setAberto(id);
    requestAnimationFrame(() => document.getElementById(`prof-${id}`)?.scrollIntoView({ block: 'center' }));
  }

  return (
    <div>
      <PageHeader
        titulo="Frequência dos professores"
        descricao="Presença nos encontros, risco de não certificação e quem precisa de contato agora."
      >
        {professores.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => exportarCsv(visiveis)}>
            <Download size={18} aria-hidden="true" />
            Exportar CSV
          </button>
        )}
      </PageHeader>

      {/* Recorte: os indicadores, alertas e a lista seguem os filtros */}
      <section className="fsec freq-recorte" aria-label="Recorte do acompanhamento">
        <div className="fcell freq-scope">
        <div className="freq-scope-field">
          <label className="label" htmlFor="f-formacao">Formação</label>
          <select id="f-formacao" className="input" value={formacaoId} onChange={(e) => { setFormacaoId(e.target.value); setTurmaId(''); }}>
            <option value="">Todas</option>
            {dados?.opcoes.formacoes.map((f) => <option key={f.id} value={f.id}>{f.titulo}</option>)}
          </select>
        </div>
        <div className="freq-scope-field">
          <label className="label" htmlFor="f-turma">Turma</label>
          <select id="f-turma" className="input" value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
            <option value="">Todas</option>
            {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        <div className="freq-scope-field">
          <label className="label" htmlFor="f-escola">Escola do professor</label>
          <select id="f-escola" className="input" value={escolaId} onChange={(e) => setEscolaId(e.target.value)}>
            <option value="">Todas</option>
            {dados?.opcoes.escolas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        <div className="freq-scope-result">
          <strong>{r?.professores ?? '–'}</strong>
          <span>professores</span>
        </div>
        {temRecorte && (
          <button type="button" className="btn btn-ghost" onClick={() => { setFormacaoId(''); setTurmaId(''); setEscolaId(''); }}>
            <X size={17} aria-hidden="true" />
            Limpar
          </button>
        )}
        </div>
      </section>

      {erro && <Note tom="danger">{erro}</Note>}

      {!dados && !erro ? (
        <div style={{ marginTop: 16 }}><ListSkeleton linhas={4} altura={88} /></div>
      ) : dados && r && r.professores === 0 ? (
        <div style={{ marginTop: 16 }}>
          <EmptyState
            icon={<><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 11l2 2 4-4" /></>}
            titulo={temRecorte ? 'Nenhum professor neste recorte' : 'Ainda não há professores inscritos'}
            descricao={temRecorte ? 'Ajuste ou limpe os filtros para ver outros professores.' : 'Quando houver inscrições em turmas, a frequência de cada professor aparece aqui.'}
          />
        </div>
      ) : dados && r ? (
        <>
          {/* Como esta o recorte: os numeros em texto, a mesma conta do Inicio e de Relatorios */}
          <section className="fsec" aria-labelledby="resumo-recorte">
            <div className="fsec-head">
              <div>
                <h2 id="resumo-recorte" className="section-title">Como está o recorte</h2>
                <p className="fsec-lead">
                  {plural(r.professores, 'professor', 'professores')}, {plural(r.comChamada, 'com chamada registrada', 'com chamada registrada')}, em {plural(r.encontrosRealizados, 'encontro realizado', 'encontros realizados')}.
                </p>
              </div>
            </div>
            <div className="fcell">
              <dl className="rel-numeros freq-resumo">
                <div>
                  <dt>Frequência média por professor</dt>
                  <dd>{r.frequenciaMediaPct === null ? '—' : `${r.frequenciaMediaPct}%`}<small>{r.frequenciaMediaPct === null ? 'sem chamada registrada' : 'presenças sobre chamadas'}</small></dd>
                </div>
                <div>
                  <dt>Abaixo do mínimo</dt>
                  <dd data-alerta={r.abaixoDoMinimo > 0 || undefined}>{r.abaixoDoMinimo}<small>{r.naoAlcancamMinimo > 0 ? `${plural(r.naoAlcancamMinimo, 'já não alcança', 'já não alcançam')} o mínimo` : 'todos ainda podem certificar'}</small></dd>
                </div>
                <div>
                  <dt>Em atenção</dt>
                  <dd>{r.atencao}<small>perto do mínimo ou faltando seguido</small></dd>
                </div>
                <div>
                  <dt>Faltas sem justificativa</dt>
                  <dd>{r.faltasSemJustificativa}<small>no recorte</small></dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="freq-split">
            {/* Alertas prioritarios: levam a linha do professor na lista */}
            <section className="fsec freq-panel" aria-labelledby="alertas">
              <div className="fsec-head">
                <div>
                  <h2 id="alertas" className="section-title">Precisam de contato</h2>
                  <p className="fsec-lead">{alertas.length ? `${plural(alertas.length, 'professor', 'professores')} abaixo do mínimo ou com ausências seguidas.` : 'Abaixo do mínimo ou com ausências seguidas.'}</p>
                </div>
              </div>
              {alertas.length ? (
                <ul className="freq-alerts">
                  {alertas.map((p) => (
                    <li key={p.inscricaoId}>
                      <button type="button" className="freq-alert" onClick={() => abrir(p.inscricaoId)}
                        aria-label={`Ver encontros de ${p.professor.nome}: ${motivo(p)}`}>
                        <span className="avatar" aria-hidden="true">{initials(p.professor.nome)}</span>
                        <span style={{ minWidth: 0 }}>
                          <strong>{p.professor.nome}</strong>
                          <small>{motivo(p)}</small>
                        </span>
                        <em style={{ color: p.situacao === 'ATENCAO' ? 'var(--amber)' : 'var(--coral)' }}>
                          {p.frequenciaPct === null ? '—' : `${p.frequenciaPct}%`}
                        </em>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="freq-all-good"><Check size={18} aria-hidden="true" />Nenhum professor abaixo do mínimo ou faltando seguido.</p>
              )}
            </section>

            {/* Encontros que ja aconteceram sem chamada: distorcem o acompanhamento */}
            <section className="fsec freq-panel" aria-labelledby="pendentes">
              <div className="fsec-head">
                <div>
                  <h2 id="pendentes" className="section-title">Chamadas pendentes</h2>
                  <p className="fsec-lead">{dados.chamadasPendentes.length ? `${plural(dados.chamadasPendentes.length, 'encontro realizado', 'encontros realizados')} sem chamada ou com alguém sem marca.` : 'Encontros já realizados sem chamada ou com alguém sem marca.'}</p>
                </div>
              </div>
              {dados.chamadasPendentes.length ? (
                <ul className="freq-pending">
                  {dados.chamadasPendentes.map((e) => (
                    <li key={e.encontroId}>
                      <span className="freq-date" aria-hidden="true"><CalendarClock size={18} /></span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <strong>{e.titulo}</strong>
                        <small>{dataLonga(e.inicio)} · {e.turma} · {e.formacao}{e.semMarca !== null && ` · chamada incompleta, ${plural(e.semMarca, 'cursista sem marca', 'cursistas sem marca')}`}</small>
                      </span>
                      {podeRegistrar && <Link href={`/encontros/${e.encontroId}/chamada`} className="btn btn-secondary">{e.semMarca !== null ? 'Completar a chamada' : 'Registrar chamada'}<span className="sr-only">: {e.titulo}</span></Link>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="freq-all-good"><Check size={18} aria-hidden="true" />Todas as chamadas dos encontros realizados estão completas.</p>
              )}
            </section>
          </div>

          {/* Acompanhamento individual */}
          <section className="fsec freq-list" aria-labelledby="individual">
            <div className="fsec-head freq-list-head">
              <div>
                <h2 id="individual" className="section-title">Acompanhamento individual</h2>
                <p className="fsec-lead">Ordenado por prioridade. Abra a linha para ver encontro a encontro e o e-mail para contato.</p>
              </div>
              <input className="input" type="search" placeholder="Buscar professor ou escola" aria-label="Buscar professor ou escola"
                value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 300 }} />
            </div>
            <div className="seg freq-seg" role="group" aria-label="Filtrar por situação">
              <button type="button" aria-pressed={situacao === 'TODAS'} onClick={() => setSituacao('TODAS')}>Todos · {professores.length}</button>
              {SITUACOES_FREQUENCIA.filter((s) => contagem[s] > 0).map((s) => (
                <button key={s} type="button" aria-pressed={situacao === s} onClick={() => setSituacao(s)}>
                  {SITUACAO_FREQUENCIA_LABELS[s]} · {contagem[s]}
                </button>
              ))}
            </div>

            <div className="fcell freq-tabela">
            <table className="freq-table">
              <caption className="sr-only">Frequência acumulada, faltas, ausências seguidas e situação de cada professor</caption>
              <thead>
                <tr>
                  <th scope="col">Professor</th>
                  <th scope="col">Formação e turma</th>
                  <th scope="col">Frequência acumulada</th>
                  <th scope="col" className="num">Faltas</th>
                  <th scope="col">Situação</th>
                  <th scope="col"><span className="sr-only">Detalhes</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => {
                  const expandido = aberto === p.inscricaoId;
                  const min = p.formacao.freqMinimaPct;
                  return (
                    <Fragment key={p.inscricaoId}>
                      <tr id={`prof-${p.inscricaoId}`} className={expandido ? 'is-open' : undefined}>
                        <th scope="row">
                          <span className="freq-person">
                            <span className="avatar" aria-hidden="true">{initials(p.professor.nome)}</span>
                            <span style={{ minWidth: 0 }}>
                              <strong>{p.professor.nome}</strong>
                              <small>{p.escola?.nome ?? 'Sem escola vinculada'}</small>
                            </span>
                          </span>
                        </th>
                        <td data-label="Formação e turma">
                          <span className="freq-stack"><span>{p.formacao.titulo}</span><small>{p.turma.nome}</small></span>
                        </td>
                        <td data-label="Frequência acumulada">
                          <div className="freq-meter">
                            <div className="freq-meter-head">
                              <strong>{p.frequenciaPct === null ? '—' : `${p.frequenciaPct}%`}</strong>
                              <small>{p.chamadasRegistradas ? `${p.presencas} de ${plural(p.chamadasRegistradas, 'chamada', 'chamadas')}` : 'sem chamada registrada'}</small>
                            </div>
                            <div className="freq-meter-track" role="img"
                              aria-label={`Frequência ${p.frequenciaPct === null ? 'sem dados' : `${p.frequenciaPct}%`}, mínimo ${min}%`}>
                              <div className="meter-fill" style={{ background: corDaFrequencia(p), transform: `scaleX(${(p.frequenciaPct ?? 0) / 100})` }} />
                              <span className="freq-meter-min" style={{ left: `${min}%` }} aria-hidden="true" />
                            </div>
                          </div>
                        </td>
                        <td data-label="Faltas" className="num">
                          <span className="freq-stack" style={{ alignItems: 'flex-end' }}>
                            <span>{p.faltas}<span className="freq-unit"> {p.faltas === 1 ? 'falta' : 'faltas'}</span></span>
                            {p.faltasJustificadas > 0 && <small>{plural(p.faltasJustificadas, 'justificada', 'justificadas')}</small>}
                            {p.ausenciasSeguidas >= 2 && <small style={{ color: 'var(--coral)' }}>{p.ausenciasSeguidas} seguidas</small>}
                          </span>
                        </td>
                        <td data-label="Situação">
                          <StatusBadge tom={SITUACAO_TOM[p.situacao]}>{SITUACAO_FREQUENCIA_LABELS[p.situacao]}</StatusBadge>
                        </td>
                        <td className="freq-toggle-cell">
                          <button type="button" className="freq-toggle" aria-expanded={expandido} aria-controls={`enc-${p.inscricaoId}`}
                            onClick={() => setAberto(expandido ? null : p.inscricaoId)}>
                            <span className="freq-toggle-text">{expandido ? 'Ocultar' : 'Encontros'}</span>
                            <span className="sr-only"> de {p.professor.nome}</span>
                            <ChevronDown size={18} aria-hidden="true" style={{ transform: expandido ? 'rotate(180deg)' : undefined }} />
                          </button>
                        </td>
                      </tr>
                      {expandido && (
                        <tr className="freq-detail-row">
                          <td colSpan={6} id={`enc-${p.inscricaoId}`}>
                            <div className="freq-detail">
                              <p className="freq-detail-summary">
                                <Clock size={17} aria-hidden="true" />
                                <span>
                                  Até o fim da turma pode chegar a <strong>{p.projecaoMaximaPct ?? '—'}%</strong> (mínimo {min}%) ·{' '}
                                  {p.ultimaPresenca ? `última presença em ${dataCurta(p.ultimaPresenca)}` : 'nenhuma presença registrada'} ·{' '}
                                  {plural(p.encontrosPrevistos, 'encontro previsto', 'encontros previstos')} ·{' '}
                                  <a className="link-acao" href={`mailto:${p.professor.email}`}>Escrever para {p.professor.email}</a>
                                </span>
                              </p>
                              <ol className="freq-timeline">
                                {p.historico.map((h) => (
                                  <li key={h.encontroId} data-marca={h.marca}>
                                    <span className="freq-timeline-date">{dataCurta(h.inicio)}</span>
                                    <span className="freq-timeline-title">{h.titulo}</span>
                                    <StatusBadge tom={MARCA[h.marca].tom}>{MARCA[h.marca].label}</StatusBadge>
                                    {h.justificativa && <small className="muted">{h.justificativa}</small>}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {visiveis.length === 0 && (
              <p className="fsec-vazio freq-vazio">Nenhum professor corresponde à busca ou à situação escolhida.</p>
            )}
            </div>
          </section>

          <p className="freq-foot">
            <Users size={17} aria-hidden="true" />
            A frequência acumulada considera só as chamadas registradas. A certificação usa todos os encontros previstos da turma
            e o mínimo definido na formação; faltas justificadas continuam contando como falta.
          </p>
        </>
      ) : null}
    </div>
  );
}
