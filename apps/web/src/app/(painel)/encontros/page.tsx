'use client';
// Encontros de quem conduz, agrupados pelo que pedem: chamadas a fazer (hoje, sem
// chamada ou incompletas), proximos (agenda) e ja realizados (recolhidos). A situacao
// segue a mesma regra do Inicio e da formacao. "Agendar encontro" cria o encontro da turma.
import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { situacaoEncontro, SITUACAO_ENCONTRO_LABELS, type SituacaoEncontro } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { fmtDia, fmtHora, quando } from '../../../lib/datas';
import { plural } from '../../../lib/texto';
import { PageHeader, Note, EmptyState, ListSkeleton } from '../ui';
import { SeloData } from '../comum';

interface EncontroRow {
  id: string; titulo: string; inicio: string; local?: string | null; status: string;
  turma: { nome: string; formacaoId?: string; formacao: { titulo: string } };
  modulo?: { titulo: string } | null; _count: { frequencias: number };
  /** Cursistas confirmados ainda sem marca neste encontro. */
  semMarca?: number;
}
interface Linha extends EncontroRow { situacao: SituacaoEncontro }

const TOM: Record<SituacaoEncontro, 'good' | 'alert' | 'mid' | 'neutral'> = {
  CHAMADA_FEITA: 'good', CHAMADA_INCOMPLETA: 'alert', SEM_CHAMADA: 'alert', HOJE: 'mid', PREVISTO: 'neutral', CANCELADO: 'neutral',
};
const PEDE_CHAMADA: SituacaoEncontro[] = ['SEM_CHAMADA', 'CHAMADA_INCOMPLETA', 'HOJE'];

export default function EncontrosPage() {
  const [rows, setRows] = useState<EncontroRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agendando, setAgendando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const user = getUser();
  const podeAgendar = !!user && (user.permissions.includes('*') || user.permissions.includes('encontro:create'));

  function carregar() {
    api.get<EncontroRow[]>('/encontros').then(setRows)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os encontros.'));
  }
  useEffect(carregar, []);

  const agora = new Date();
  const linhas: Linha[] = (rows ?? []).map((e) => ({
    ...e,
    situacao: situacaoEncontro({ inicio: e.inicio, cancelado: e.status === 'CANCELADO', chamadaRegistrada: e._count.frequencias > 0, semMarca: e.semMarca }, agora),
  }));
  const acao = linhas.filter((e) => PEDE_CHAMADA.includes(e.situacao));
  const proximos = linhas.filter((e) => e.situacao === 'PREVISTO');
  const realizados = linhas.filter((e) => e.situacao === 'CHAMADA_FEITA' || e.situacao === 'CANCELADO').reverse();

  return (
    <div>
      <PageHeader titulo="Encontros" descricao="A agenda das suas turmas e a chamada de cada encontro.">
        {podeAgendar && !agendando && (
          <button type="button" className="btn btn-secondary" onClick={() => { setAgendando(true); setAviso(null); }}>
            <CalendarPlus size={18} aria-hidden="true" /> Agendar encontro
          </button>
        )}
      </PageHeader>

      {agendando && <AgendarEncontro aoFechar={(criado) => { setAgendando(false); if (criado) { setAviso(`Encontro agendado: ${criado}.`); carregar(); } }} />}
      {aviso && <Note tom="ok">{aviso}</Note>}
      {erro && <Note tom="danger">{erro}</Note>}

      {rows === null ? (
        <ListSkeleton linhas={3} altura={76} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalendarPlus size={26} />} titulo="Nenhum encontro agendado"
          descricao="Agende os encontros das turmas; a chamada de cada um fica disponível aqui e no Início."
          acao={podeAgendar && <button type="button" className="btn btn-primary" onClick={() => setAgendando(true)}>Agendar o primeiro encontro</button>} />
      ) : (
        <>
          <Grupo id="acao" titulo="Chamadas a fazer" lead={acao.length ? plural(acao.length, 'encontro pede chamada', 'encontros pedem chamada') : 'Nenhuma chamada pendente. Tudo em dia.'}
            linhas={acao} acaoPrincipal />
          {proximos.length > 0 && <Grupo id="proximos" titulo="Próximos" lead={plural(proximos.length, 'encontro agendado', 'encontros agendados')} linhas={proximos} />}
          {realizados.length > 0 && (
            <details className="fsec sobre">
              <summary>
                <h2 className="section-title">Já realizados</h2>
                <span className="fsec-lead">{plural(realizados.length, 'encontro', 'encontros')} com chamada</span>
              </summary>
              <Lista linhas={realizados} />
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Grupo({ id, titulo, lead, linhas, acaoPrincipal = false }: { id: string; titulo: string; lead: string; linhas: Linha[]; acaoPrincipal?: boolean }) {
  return (
    <section className="fsec" aria-labelledby={`grupo-${id}`}>
      <div className="fsec-head">
        <div>
          <h2 id={`grupo-${id}`} className="section-title">{titulo}</h2>
          <p className="fsec-lead">{lead}</p>
        </div>
      </div>
      {linhas.length > 0 && <Lista linhas={linhas} acaoPrincipal={acaoPrincipal} />}
    </section>
  );
}

function Lista({ linhas, acaoPrincipal = false }: { linhas: Linha[]; acaoPrincipal?: boolean }) {
  return (
    <ol className="enc-lista">
      {linhas.map((e, i) => {
        const pede = PEDE_CHAMADA.includes(e.situacao);
        const incompleta = e.situacao === 'CHAMADA_INCOMPLETA';
        return (
          <li key={e.id} className="enc" data-proximo={e.situacao === 'HOJE'}>
            <SeloData iso={e.inicio} destaque={e.situacao === 'HOJE'} />
            <div className="enc-texto">
              <p className="enc-titulo">{e.titulo}</p>
              <p className="enc-meta">
                {fmtDia(e.inicio)}, {fmtHora(e.inicio)} ({quando(e.inicio)}) · {e.turma.nome} · {e.turma.formacao.titulo}{e.local ? ` · ${e.local}` : ''}
                {incompleta && <> · <strong>{plural(e.semMarca ?? 0, 'cursista sem marca', 'cursistas sem marca')}</strong></>}
              </p>
            </div>
            <div className="enc-situacao">
              <span className="status-pill" data-tom={TOM[e.situacao]}>{SITUACAO_ENCONTRO_LABELS[e.situacao]}</span>
              {pede && (
                <Link className={acaoPrincipal && i === 0 ? 'btn btn-primary' : 'btn btn-secondary'} href={`/encontros/${e.id}/chamada`}>
                  {incompleta ? 'Completar a chamada' : e.situacao === 'HOJE' ? 'Abrir a chamada' : 'Registrar chamada'}<span className="sr-only">: {e.titulo}</span>
                </Link>
              )}
              {e.situacao === 'CHAMADA_FEITA' && (
                <Link className="btn btn-ghost" href={`/encontros/${e.id}/chamada`}>Ver a chamada<span className="sr-only">: {e.titulo}</span></Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

interface FormacaoOpt { id: string; titulo: string; etapaFluxo: string }
interface TurmaOpt { id: string; nome: string }

function AgendarEncontro({ aoFechar }: { aoFechar: (criado: string | null) => void }) {
  const id = useId();
  const [formacoes, setFormacoes] = useState<FormacaoOpt[]>([]);
  const [turmas, setTurmas] = useState<TurmaOpt[] | null>(null);
  const [v, setV] = useState({ formacaoId: '', turmaId: '', titulo: '', data: '', hora: '18:30', local: '', link: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api.get<FormacaoOpt[]>('/formacoes')
      .then((l) => setFormacoes(l.filter((f) => f.etapaFluxo !== 'CONCLUIDA' && f.etapaFluxo !== 'CANCELADA')))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!v.formacaoId) { setTurmas(null); return; }
    api.get<{ turmas: TurmaOpt[] }>(`/formacoes/${v.formacaoId}`)
      .then((f) => {
        setTurmas(f.turmas);
        if (f.turmas.length === 1) setV((x) => ({ ...x, turmaId: f.turmas[0]!.id }));
      })
      .catch(() => setTurmas([]));
  }, [v.formacaoId]);

  async function agendar(e: FormEvent) {
    e.preventDefault();
    if (v.link.trim() && !/^https?:\/\//i.test(v.link.trim())) {
      setErro('O link da sala virtual precisa começar com https:// (ou http://).');
      return;
    }
    setErro(null);
    setOcupado(true);
    try {
      await api.post('/encontros', {
        turmaId: v.turmaId, titulo: v.titulo.trim(), inicio: `${v.data}T${v.hora}:00`,
        local: v.local.trim() || undefined, linkVirtual: v.link.trim() || undefined,
      });
      aoFechar(`${v.titulo.trim()}, ${new Date(`${v.data}T${v.hora}:00`).toLocaleDateString('pt-BR')}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível agendar.');
      setOcupado(false);
    }
  }

  return (
    <form className="fform fform-destaque" onSubmit={agendar} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="trilha-form-titulo">Agendar encontro</h2>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-f`}>Formação</label>
          <select id={`${id}-f`} className="input" required value={v.formacaoId} onChange={(e) => setV({ ...v, formacaoId: e.target.value, turmaId: '' })}>
            <option value="">Escolha a formação</option>
            {formacoes.map((f) => <option key={f.id} value={f.id}>{f.titulo}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-tu`}>Turma</label>
          <select id={`${id}-tu`} className="input" required disabled={!turmas?.length} value={v.turmaId} onChange={(e) => setV({ ...v, turmaId: e.target.value })}>
            <option value="">{!v.formacaoId ? 'Escolha a formação antes' : turmas?.length === 0 ? 'Esta formação não tem turma' : 'Escolha a turma'}</option>
            {turmas?.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${id}-tit`}>Título</label>
        <input id={`${id}-tit`} className="input" required minLength={2} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Ex.: Encontro 9 - Retomada" />
      </div>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-d`}>Data</label>
          <input id={`${id}-d`} className="input" type="date" required value={v.data} onChange={(e) => setV({ ...v, data: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-h`}>Horário</label>
          <input id={`${id}-h`} className="input" type="time" required value={v.hora} onChange={(e) => setV({ ...v, hora: e.target.value })} />
        </div>
      </div>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-l`}>Local <span className="muted">(opcional)</span></label>
          <input id={`${id}-l`} className="input" value={v.local} onChange={(e) => setV({ ...v, local: e.target.value })} placeholder="Ex.: CEU Polo Formativo Centro" />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-lk`}>Link da sala virtual <span className="muted">(opcional)</span></label>
          <input id={`${id}-lk`} className="input" type="url" inputMode="url" value={v.link} onChange={(e) => setV({ ...v, link: e.target.value })} placeholder="https://" />
        </div>
      </div>
      {erro && <Note tom="danger">{erro}</Note>}
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado || !v.turmaId}>{ocupado ? 'Agendando...' : 'Agendar encontro'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => aoFechar(null)}>Cancelar</button>
      </div>
    </form>
  );
}
