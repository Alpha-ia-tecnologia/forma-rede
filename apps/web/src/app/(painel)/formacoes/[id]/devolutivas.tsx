'use client';
// Devolutivas da curadoria para quem conduz. A curadoria escreve sobre o plano, a trilha,
// as atividades ou os encontros; quem conduz responde aqui e marca como resolvida. A vez
// de responder e de quem nao escreveu a ultima mensagem, e o Inicio de cada um cobra a sua.
// As resolvidas ficam recolhidas no fim, com a conversa inteira.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CheckCheck, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { TEMA_DEVOLUTIVA_LABELS, TEMAS_DEVOLUTIVA } from '@formarede/contracts';
import type { DevolutivaFormacao, TemaDevolutiva } from '@formarede/contracts';
import { api } from '../../../../lib/api';
import { fmtData, fmtHora } from '../../../../lib/datas';
import { plural } from '../../../../lib/texto';
import { ListSkeleton, Note, StatusBadge, type Tom } from '../../ui';

const msg = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);
const quandoFoi = (iso: string) => `${fmtData(iso)}, ${fmtHora(iso)}`;
const SOBRE: Record<TemaDevolutiva, string> = {
  GERAL: 'Sobre a formação', PLANO: 'Sobre o plano formativo', TRILHA: 'Sobre a trilha',
  ATIVIDADES: 'Sobre as atividades', ENCONTROS: 'Sobre os encontros',
};

export function DevolutivasFormacao({ formacaoId, daCuradoria }: {
  formacaoId: string;
  /** devolutiva:criar: escreve devolutivas; sem ela, a pessoa responde as que recebeu. */
  daCuradoria: boolean;
}) {
  const [lista, setLista] = useState<DevolutivaFormacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  // O item resolvido ou reaberto muda de lista: o foco volta ao titulo da secao e o aviso
  // diz o que aconteceu; ao fechar o formulario, o foco volta ao botao que o abriu.
  const [aviso, setAviso] = useState('');
  const titulo = useRef<HTMLHeadingElement>(null);
  const botaoNova = useRef<HTMLButtonElement>(null);
  const formAberto = useRef(false);
  useEffect(() => {
    if (criando) formAberto.current = true;
    else if (formAberto.current) botaoNova.current?.focus();
  }, [criando]);
  function mudou(nova: DevolutivaFormacao[], texto: string, focarTitulo = false) {
    setLista(nova);
    setAviso(texto);
    if (focarTitulo) titulo.current?.focus();
  }

  useEffect(() => {
    api.get<DevolutivaFormacao[]>(`/formacoes/${formacaoId}/devolutivas`).then(setLista)
      .catch((e) => setErro(msg(e, 'Não foi possível carregar as devolutivas.')));
  }, [formacaoId]);

  const vez = daCuradoria ? 'CURADORIA' : 'CONDUCAO';
  // Abertas primeiro, as que esperam por voce no topo; dentro de cada grupo, a mais recente.
  const abertas = (lista ?? []).filter((d) => d.aguarda).sort((a, b) => Number(b.aguarda === vez) - Number(a.aguarda === vez));
  const resolvidas = (lista ?? []).filter((d) => !d.aguarda);
  const suaVez = abertas.filter((d) => d.aguarda === vez).length;

  return (
    <section id="devolutivas" className="fsec" aria-labelledby="devolutivas-titulo">
      <div className="fsec-head">
        <div>
          <h2 ref={titulo} id="devolutivas-titulo" className="section-title" tabIndex={-1}>Devolutivas da curadoria</h2>
          <p className="fsec-lead">
            {!lista ? 'Orientações da curadoria para quem conduz esta formação.'
              : suaVez ? `${plural(suaVez, 'devolutiva espera', 'devolutivas esperam')} a sua resposta.`
                : daCuradoria ? 'Oriente quem conduz sobre o plano, a trilha, as atividades e os encontros. A resposta chega aqui.'
                  : 'O que a curadoria orientou sobre esta formação. Responda e marque como resolvida quando tiver ajustado.'}
          </p>
        </div>
        {daCuradoria && !criando && (
          <button ref={botaoNova} type="button" className="btn btn-secondary" onClick={() => setCriando(true)}>
            <MessageSquarePlus size={18} aria-hidden="true" /> Nova devolutiva
          </button>
        )}
      </div>

      {criando && (
        <NovaDevolutiva formacaoId={formacaoId} aoFechar={(nova) => { setCriando(false); if (nova) mudou(nova, 'Devolutiva enviada.'); }} />
      )}

      {erro ? <Note tom="danger">{erro}</Note>
        : !lista ? <ListSkeleton linhas={1} altura={120} />
          : !lista.length ? (
            !criando && (
              <p className="fsec-vazio">
                {daCuradoria
                  ? 'Nenhuma devolutiva ainda. A que você escrever aparece no Início de quem conduz, até ser respondida.'
                  : 'Nenhuma devolutiva da curadoria nesta formação.'}
              </p>
            )
          ) : (
            <>
              {abertas.length > 0 && (
                <ul className="fsec-lista">
                  {abertas.map((d) => <ItemDevolutiva key={d.id} d={d} vez={vez} aoMudar={mudou} />)}
                </ul>
              )}
              {abertas.length === 0 && <p className="fsec-vazio">Nenhuma devolutiva em aberto: tudo resolvido.</p>}
              {resolvidas.length > 0 && (
                <details className="devol-resolvidas">
                  <summary>{plural(resolvidas.length, 'devolutiva resolvida', 'devolutivas resolvidas')}</summary>
                  <ul className="fsec-lista">
                    {resolvidas.map((d) => <ItemDevolutiva key={d.id} d={d} vez={vez} aoMudar={mudou} />)}
                  </ul>
                </details>
              )}
            </>
          )}
      <p className="sr-only" role="status">{aviso}</p>
    </section>
  );
}

function situacao(d: DevolutivaFormacao, vez: 'CURADORIA' | 'CONDUCAO'): { texto: string; tom: Tom } {
  if (!d.aguarda) return { texto: 'Resolvida', tom: 'good' };
  if (d.aguarda === vez) return { texto: 'Aguardando você', tom: 'warn' };
  return { texto: d.aguarda === 'CURADORIA' ? 'Aguardando a curadoria' : 'Aguardando quem conduz', tom: 'neutral' };
}

function ItemDevolutiva({ d, vez, aoMudar }: {
  d: DevolutivaFormacao;
  vez: 'CURADORIA' | 'CONDUCAO';
  aoMudar: (lista: DevolutivaFormacao[], aviso: string, focarTitulo?: boolean) => void;
}) {
  const id = useId();
  const [respondendo, setRespondendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState<'responder' | 'resolver' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const botaoResponder = useRef<HTMLButtonElement>(null);
  const formAberto = useRef(false);
  useEffect(() => {
    if (respondendo) { formAberto.current = true; campo.current?.focus(); }
    else if (formAberto.current) botaoResponder.current?.focus();
  }, [respondendo]);
  const s = situacao(d, vez);
  const resolvida = !d.aguarda;

  async function responder(ev: FormEvent) {
    ev.preventDefault();
    if (texto.trim().length < 2) { setErro('Escreva a resposta antes de enviar.'); campo.current?.focus(); return; }
    setOcupado('responder');
    setErro(null);
    try {
      aoMudar(await api.post<DevolutivaFormacao[]>(`/devolutivas/${d.id}/respostas`, { texto: texto.trim() }), 'Resposta enviada.');
      setTexto('');
      setRespondendo(false);
    } catch (e) {
      setErro(msg(e, 'Não foi possível enviar a resposta. O texto continua aqui; tente de novo.'));
    } finally {
      setOcupado(null);
    }
  }

  async function resolver(valor: boolean) {
    setOcupado('resolver');
    setErro(null);
    try {
      aoMudar(await api.post<DevolutivaFormacao[]>(`/devolutivas/${d.id}/resolucao`, { resolvida: valor }),
        valor ? 'Devolutiva marcada como resolvida.' : 'Devolutiva reaberta.', true);
    } catch (e) {
      setErro(msg(e, 'Não foi possível registrar.'));
      setOcupado(null);
    }
  }

  return (
    <li className="fitem" aria-labelledby={`${id}-t`}>
      <div className="fitem-topo">
        <h3 id={`${id}-t`} className="fitem-titulo">{SOBRE[d.tema]}</h3>
        <StatusBadge tom={s.tom}>{s.texto}</StatusBadge>
      </div>
      <p className="fitem-meta">
        <span>{d.autor ?? 'Curadoria'}</span>
        <span>{quandoFoi(d.criadaEm)}</span>
        {d.resolvidaEm && <span>Resolvida em {fmtData(d.resolvidaEm)}{d.resolvidaPor ? ` por ${d.resolvidaPor}` : ''}</span>}
      </p>
      <p className="fitem-texto devol-texto">{d.texto}</p>

      {d.respostas.length > 0 && (
        <ol className="devol-conversa" aria-label="Respostas">
          {d.respostas.map((r) => (
            <li key={r.id} className="devol-msg" data-lado={r.daCuradoria ? 'curadoria' : 'conducao'}>
              <p className="devol-msg-autor">
                <strong>{r.autor ?? (r.daCuradoria ? 'Curadoria' : 'Quem conduz')}</strong>
                {' · '}{r.daCuradoria ? 'curadoria' : 'condução'}{' · '}{quandoFoi(r.criadaEm)}
              </p>
              <p className="devol-texto">{r.texto}</p>
            </li>
          ))}
        </ol>
      )}

      {respondendo ? (
        <form className="fform" onSubmit={responder} noValidate aria-label={`Responder: ${SOBRE[d.tema].toLowerCase()}`}>
          <div>
            <label className="label" htmlFor={`${id}-r`}>Sua resposta</label>
            <textarea ref={campo} id={`${id}-r`} className="input" rows={3} maxLength={3000} value={texto}
              aria-invalid={!!erro || undefined} aria-describedby={erro ? `${id}-erro` : undefined}
              onChange={(e) => { setTexto(e.target.value); setErro(null); }}
              placeholder={vez === 'CURADORIA' ? 'Complete a orientação ou responda ao que quem conduz escreveu.' : 'O que você ajustou, ou o que precisa combinar com a curadoria.'} />
          </div>
          {erro && <p className="campo-erro" id={`${id}-erro`} role="alert">{erro}</p>}
          <div className="fform-acoes">
            <button type="submit" className="btn btn-primary" disabled={!!ocupado}>{ocupado === 'responder' ? 'Enviando...' : 'Enviar resposta'}</button>
            <button type="button" className="btn btn-ghost" disabled={!!ocupado} onClick={() => { setRespondendo(false); setErro(null); }}>Cancelar</button>
          </div>
        </form>
      ) : (
        <>
          <div className="fitem-acoes">
            {resolvida ? (
              <button type="button" className="btn btn-ghost" disabled={!!ocupado} onClick={() => void resolver(false)}>
                <RotateCcw size={18} aria-hidden="true" /> {ocupado === 'resolver' ? 'Reabrindo...' : 'Reabrir'}
              </button>
            ) : (
              <>
                <button ref={botaoResponder} type="button" className={d.aguarda === vez ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setRespondendo(true)}>Responder</button>
                <button type="button" className="btn btn-ghost" disabled={!!ocupado} onClick={() => void resolver(true)}>
                  <CheckCheck size={18} aria-hidden="true" /> {ocupado === 'resolver' ? 'Registrando...' : 'Marcar como resolvida'}
                </button>
              </>
            )}
          </div>
          {erro && <Note tom="danger">{erro}</Note>}
        </>
      )}
    </li>
  );
}

function NovaDevolutiva({ formacaoId, aoFechar }: {
  formacaoId: string;
  /** A lista atualizada quando enviou; null quando cancelou. */
  aoFechar: (lista: DevolutivaFormacao[] | null) => void;
}) {
  const id = useId();
  const [tema, setTema] = useState<TemaDevolutiva>('GERAL');
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { campo.current?.focus(); }, []);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (texto.trim().length < 5) { setErro('Escreva a devolutiva: o que quem conduz deve rever ou manter.'); campo.current?.focus(); return; }
    setOcupado(true);
    setErro(null);
    try {
      aoFechar(await api.post<DevolutivaFormacao[]>(`/formacoes/${formacaoId}/devolutivas`, { tema, texto: texto.trim() }));
    } catch (e) {
      setErro(msg(e, 'Não foi possível enviar a devolutiva. O texto continua aqui; tente de novo.'));
      setOcupado(false);
    }
  }

  return (
    <form className="fform fform-destaque" onSubmit={enviar} noValidate aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="trilha-form-titulo">Nova devolutiva</h3>
      <fieldset className="trilha-tipos">
        <legend className="label">Sobre o quê</legend>
        <div className="seg">
          {TEMAS_DEVOLUTIVA.map((t) => (
            <button key={t} type="button" aria-pressed={tema === t} onClick={() => setTema(t)}>{TEMA_DEVOLUTIVA_LABELS[t]}</button>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor={`${id}-txt`}>Devolutiva</label>
        <span className="hint" id={`${id}-dica`}>Quem conduz vê no Início e responde nesta página.</span>
        <textarea ref={campo} id={`${id}-txt`} className="input" rows={4} maxLength={3000} value={texto}
          aria-invalid={!!erro || undefined} aria-describedby={`${id}-dica${erro ? ` ${id}-erro` : ''}`}
          onChange={(e) => { setTexto(e.target.value); setErro(null); }}
          placeholder="Ex.: a etapa 3 da trilha pede um vídeo curto sobre leitura compartilhada; sugiro o do acervo antes do encontro 2." />
        {erro && <p className="campo-erro" id={`${id}-erro`} role="alert">{erro}</p>}
      </div>
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Enviando...' : 'Enviar devolutiva'}</button>
        <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => aoFechar(null)}>Cancelar</button>
      </div>
    </form>
  );
}
