'use client';
// Avaliacoes (pesquisas). O cursista ve as das proprias formacoes, separadas entre
// "Para responder" e "Ja respondidas". Quem conduz cria e acompanha os resultados.
import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Check, ClipboardList, Plus } from 'lucide-react';
import { AVALIACAO_TIPOS, AVALIACAO_TIPO_LABELS } from '@formarede/contracts';
import type { AvaliacaoTipo } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { plural } from '../../../lib/texto';
import { PageHeader, StatusBadge, Note, EmptyState, ListSkeleton, type Tom } from '../ui';

interface AvaliacaoRow {
  id: string; titulo: string; tipo: AvaliacaoTipo; anonima: boolean;
  formacao: { id: string; titulo: string }; _count: { entradas: number };
  /** So para o cursista: se ja respondeu. */
  respondida: boolean | null;
}
interface FormacaoOpt { id: string; titulo: string }

const TIPO_TOM: Record<string, Tom> = { SATISFACAO: 'accent', DIAGNOSTICA: 'neutral', FINAL: 'good' };

export default function AvaliacoesPage() {
  const [rows, setRows] = useState<AvaliacaoRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const user = getUser();
  const pode = (p: string) => !!user && (user.permissions.includes('*') || user.permissions.includes(p));
  const conduz = pode('avaliacao:read');

  function carregar() {
    api.get<AvaliacaoRow[]>('/avaliacoes').then(setRows)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar as pesquisas.'));
  }
  useEffect(carregar, []);

  return (
    <div>
      <PageHeader titulo="Pesquisas"
        descricao={conduz ? 'Diagnósticos, pesquisas de satisfação e pesquisas finais das formações.' : 'Pesquisas das suas formações. Sua resposta ajuda a melhorar os próximos encontros.'}>
        {pode('avaliacao:create') && !criando && (
          <button type="button" className="btn btn-primary" onClick={() => setCriando(true)}>
            <Plus size={18} aria-hidden="true" /> Nova pesquisa
          </button>
        )}
      </PageHeader>

      {criando && <NovaAvaliacao aoFechar={(criou) => { setCriando(false); if (criou) carregar(); }} />}
      {erro && <Note tom="danger">{erro}</Note>}

      {rows === null ? (
        <ListSkeleton linhas={3} altura={72} />
      ) : conduz ? (
        <ListaConducao rows={rows} podeCriar={pode('avaliacao:create')} aoCriar={() => setCriando(true)} />
      ) : (
        <ListaCursista rows={rows} />
      )}
    </div>
  );
}

function ListaCursista({ rows }: { rows: AvaliacaoRow[] }) {
  const pendentes = rows.filter((a) => !a.respondida);
  const feitas = rows.filter((a) => a.respondida);
  if (!rows.length) {
    return <EmptyState icon={<ClipboardList size={26} />} titulo="Nenhuma pesquisa por enquanto"
      descricao="Quando a equipe de formação abrir uma pesquisa para a sua turma, ela aparece aqui e no Início." />;
  }
  return (
    <>
      <section className="fsec" aria-labelledby="para-responder">
        <div className="fsec-head">
          <div>
            <h2 id="para-responder" className="section-title">Para responder</h2>
            <p className="fsec-lead">{pendentes.length ? plural(pendentes.length, 'pesquisa espera sua resposta', 'pesquisas esperam sua resposta') : 'Você respondeu todas. Obrigado!'}</p>
          </div>
        </div>
        {pendentes.length > 0 && (
          <ul className="fsec-lista">
            {pendentes.map((a, i) => (
              <li key={a.id} className="fitem fitem-linha">
                <div>
                  <h3 className="fitem-titulo">{a.titulo}</h3>
                  <p className="fitem-meta">
                    <span>{a.formacao.titulo}</span>
                    <span>{a.anonima ? 'Anônima' : 'Identificada'}</span>
                  </p>
                </div>
                <Link className={i === 0 ? 'btn btn-primary' : 'btn btn-secondary'} href={`/avaliacoes/${a.id}/responder`}>
                  Responder<span className="sr-only">: {a.titulo}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {feitas.length > 0 && (
        <section className="fsec" aria-labelledby="respondidas">
          <div className="fsec-head">
            <div><h2 id="respondidas" className="section-title">Já respondidas</h2></div>
          </div>
          <ul className="fsec-lista">
            {feitas.map((a) => (
              <li key={a.id} className="fitem fitem-linha">
                <div>
                  <h3 className="fitem-titulo">{a.titulo}</h3>
                  <p className="fitem-meta"><span>{a.formacao.titulo}</span></p>
                </div>
                <StatusBadge tom="good"><Check size={14} aria-hidden="true" /> Respondida</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ListaConducao({ rows, podeCriar, aoCriar }: { rows: AvaliacaoRow[]; podeCriar: boolean; aoCriar: () => void }) {
  if (!rows.length) {
    return <EmptyState icon={<ClipboardList size={26} />} titulo="Nenhuma pesquisa criada"
      descricao="Crie um diagnóstico, uma pesquisa de satisfação ou uma pesquisa final; os cursistas respondem pelo Início e pela formação."
      acao={podeCriar && <button type="button" className="btn btn-primary" onClick={aoCriar}>Criar pesquisa</button>} />;
  }
  return (
    <section className="fsec" aria-labelledby="todas-avaliacoes">
      <div className="fsec-head">
        <div>
          <h2 id="todas-avaliacoes" className="section-title">Pesquisas das formações</h2>
          <p className="fsec-lead">{plural(rows.length, 'pesquisa', 'pesquisas')}</p>
        </div>
      </div>
      <ul className="fsec-lista">
        {rows.map((a) => (
          <li key={a.id} className="fitem fitem-linha">
            <div>
              <div className="fitem-topo" style={{ justifyContent: 'flex-start' }}>
                <h3 className="fitem-titulo">{a.titulo}</h3>
                <StatusBadge tom={TIPO_TOM[a.tipo] ?? 'neutral'}>{AVALIACAO_TIPO_LABELS[a.tipo]}</StatusBadge>
              </div>
              <p className="fitem-meta">
                <span>{a.formacao.titulo}</span>
                <span>{a.anonima ? 'Anônima' : 'Identificada'}</span>
                <span>{plural(a._count.entradas, 'resposta', 'respostas')}</span>
              </p>
            </div>
            <Link className="btn btn-ghost" href={`/avaliacoes/${a.id}`}>Ver resultados<span className="sr-only">: {a.titulo}</span></Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NovaAvaliacao({ aoFechar }: { aoFechar: (criou: boolean) => void }) {
  const id = useId();
  const [formacoes, setFormacoes] = useState<FormacaoOpt[]>([]);
  const [v, setV] = useState({ formacaoId: '', titulo: '', tipo: 'SATISFACAO', anonima: true, escalas: '', abertas: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { api.get<FormacaoOpt[]>('/formacoes').then(setFormacoes).catch(() => undefined); }, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const linhas = (s: string) => s.split('\n').map((l) => l.trim()).filter((l) => l.length >= 2);
      await api.post(`/formacoes/${v.formacaoId}/avaliacoes`, { titulo: v.titulo, tipo: v.tipo, anonima: v.anonima, escalas: linhas(v.escalas), abertas: linhas(v.abertas) });
      aoFechar(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar a pesquisa.');
      setOcupado(false);
    }
  }

  return (
    <form className="fform fform-destaque" onSubmit={criar} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="trilha-form-titulo">Nova pesquisa</h2>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-f`}>Formação</label>
          <select id={`${id}-f`} className="input" required value={v.formacaoId} onChange={(e) => setV({ ...v, formacaoId: e.target.value })}>
            <option value="">Escolha a formação</option>
            {formacoes.map((f) => <option key={f.id} value={f.id}>{f.titulo}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-tit`}>Título</label>
          <input id={`${id}-tit`} className="input" required minLength={2} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Ex.: Satisfação - Encontro 6" />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-tipo`}>Tipo</label>
          <select id={`${id}-tipo`} className="input" value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value })}>
            {AVALIACAO_TIPOS.map((t) => <option key={t} value={t}>{AVALIACAO_TIPO_LABELS[t]}</option>)}
          </select>
        </div>
      </div>
      <label className="trilha-check trilha-check-form" data-marcado={v.anonima}>
        <input type="checkbox" checked={v.anonima} onChange={(e) => setV({ ...v, anonima: e.target.checked })} />
        <span className="trilha-check-caixa" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
        Resposta anônima (ninguém vê quem respondeu)
      </label>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-esc`}>Perguntas de 1 a 5 (uma por linha)</label>
          <textarea id={`${id}-esc`} className="input" rows={3} value={v.escalas} onChange={(e) => setV({ ...v, escalas: e.target.value })} placeholder="O conteúdo atendeu às suas expectativas?" />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-ab`}>Perguntas abertas (uma por linha)</label>
          <textarea id={`${id}-ab`} className="input" rows={3} value={v.abertas} onChange={(e) => setV({ ...v, abertas: e.target.value })} placeholder="O que pode melhorar no próximo encontro?" />
        </div>
      </div>
      {erro && <Note tom="danger">{erro}</Note>}
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Criando...' : 'Criar pesquisa'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => aoFechar(false)}>Cancelar</button>
      </div>
    </form>
  );
}
