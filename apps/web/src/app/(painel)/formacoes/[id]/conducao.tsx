'use client';
// Visao de quem conduz a formacao: o que precisa de atencao agora, as atividades
// com a fila de entregas (e a avaliacao ali mesmo) e os encontros com a chamada.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CalendarClock, CalendarDays, Check, ClipboardCheck, ExternalLink, Hourglass, MessageSquareText, Plus } from 'lucide-react';
import type { AcompanhamentoFormacao, EntregaParaAvaliar } from '@formarede/contracts';
import { api } from '../../../../lib/api';
import { fimDoDia, fmtData, fmtDia, fmtHora, paraCampoData, prazoEncerrado, quando } from '../../../../lib/datas';
import { plural } from '../../../../lib/texto';
import { ListSkeleton, Note, StatusBadge } from '../../ui';
import { ProximoEncontro, SeloData, SituacaoEntrega, TOM_ENTREGA } from '../../comum';

const msg = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);

type AtividadeConducao = NonNullable<AcompanhamentoFormacao['atividades']>[number];

// ---------- O que precisa de voce ----------

export function AtencaoConducao({ a, pendentesCuradoria, podeRegistrar, aoAvaliar, encerrada = false }: {
  a: AcompanhamentoFormacao;
  /** Formacao concluida ou cancelada: nada a agendar nem a cobrar. */
  encerrada?: boolean;
  /** Etapas da trilha cujo material aguarda curadoria (vem da trilha). */
  pendentesCuradoria: number;
  podeRegistrar: boolean;
  /** Leva a fila de entregas da primeira atividade com envio aguardando. */
  aoAvaliar: (atividadeId: string) => void;
}) {
  const chamadas = a.chamadasPendentes;
  const aguardando = a.atividades?.reduce((s, x) => s + x.aguardando, 0) ?? 0;
  const primeiraFila = a.atividades?.find((x) => x.aguardando > 0);
  const turmas = encerrada ? 'Formação encerrada' : a.turmas.length === 0 ? 'Nenhuma turma aberta ainda'
    : a.turmas.length === 1 ? `${a.turmas[0]!.nome} · ${plural(a.cursistas, 'cursista', 'cursistas')}${a.turmas[0]!.vagas ? ` (${a.turmas[0]!.vagas} vagas)` : ''}`
      : `${a.turmas.length} turmas · ${plural(a.cursistas, 'cursista', 'cursistas')}`;
  const hoje = a.proximoEncontro && quando(a.proximoEncontro.inicio) === 'hoje';
  const nada = !chamadas.length && !aguardando && !pendentesCuradoria;

  return (
    <section className="fsec" aria-labelledby="o-que-precisa">
      <div className="fsec-head">
        <div>
          <h2 id="o-que-precisa" className="section-title">O que precisa de você</h2>
          <p className="fsec-lead">{turmas}</p>
        </div>
      </div>
      <div className="fsec-grid">
        <ProximoEncontro encontro={a.proximoEncontro} vazio={encerrada ? 'A formação foi encerrada; não há encontros pela frente.' : 'Nenhum encontro agendado. Agende em Encontros.'}>
          {hoje && podeRegistrar && a.proximoEncontro && (
            <Link className="btn btn-primary" href={`/encontros/${a.proximoEncontro.id}/chamada`}>
              <ClipboardCheck size={18} aria-hidden="true" /> Abrir a chamada de hoje
            </Link>
          )}
        </ProximoEncontro>

        <div className="fcell">
          <h3 className="fcell-rotulo">Pendências</h3>
          {nada ? (
            encerrada ? (
              <p className="fcell-vazio">Formação encerrada: chamadas e devolutivas não estão mais pendentes.</p>
            ) : a.turmas.length === 0 && a.encontros.length === 0 ? (
              <p className="fcell-vazio">Sem turma e sem encontros ainda. Chamadas e entregas para avaliar aparecem aqui quando a formação começar.</p>
            ) : (
              <p className="pend-ok"><Check size={18} aria-hidden="true" /> Nada pendente. Tudo em dia para o próximo encontro.</p>
            )
          ) : (
            <ul className="pend-lista">
              {chamadas.length > 0 && (
                <li className="pend" data-tom="alerta">
                  <span className="pend-icone" aria-hidden="true"><ClipboardCheck size={18} /></span>
                  <p className="pend-texto">
                    {chamadas.length > 1
                      ? <><strong>{chamadas.length} encontros</strong> já aconteceram e pedem chamada.</>
                      : chamadas[0]!.chamadaRegistrada
                        ? <><strong>{chamadas[0]!.titulo}</strong> ({fmtDia(chamadas[0]!.inicio)}) está com a chamada incompleta: {plural(chamadas[0]!.semMarca, 'cursista sem marca', 'cursistas sem marca')}.</>
                        : <><strong>{chamadas[0]!.titulo}</strong> ({fmtDia(chamadas[0]!.inicio)}) está sem chamada.</>}
                  </p>
                  {podeRegistrar && (
                    <Link className="btn btn-primary" href={`/encontros/${chamadas[0]!.id}/chamada`}>
                      {chamadas[0]!.chamadaRegistrada ? 'Completar a chamada' : 'Registrar chamada'}<span className="sr-only">: {chamadas[0]!.titulo}</span>
                    </Link>
                  )}
                </li>
              )}
              {aguardando > 0 && primeiraFila && (
                <li className="pend" data-tom="alerta">
                  <span className="pend-icone" aria-hidden="true"><MessageSquareText size={18} /></span>
                  <p className="pend-texto"><strong>{plural(aguardando, 'entrega', 'entregas')}</strong> {aguardando === 1 ? 'aguarda' : 'aguardam'} devolutiva.</p>
                  <button type="button" className="btn btn-secondary" onClick={() => aoAvaliar(primeiraFila.id)}>Dar devolutivas</button>
                </li>
              )}
              {pendentesCuradoria > 0 && (
                <li className="pend">
                  <span className="pend-icone" aria-hidden="true"><Hourglass size={18} /></span>
                  <p className="pend-texto">
                    <strong>{plural(pendentesCuradoria, 'etapa da trilha', 'etapas da trilha')}</strong> {pendentesCuradoria === 1 ? 'aguarda' : 'aguardam'} curadoria; os cursistas ainda não {pendentesCuradoria === 1 ? 'a veem' : 'as veem'}.
                  </p>
                  <a className="btn btn-ghost" href="#trilha">Ver na trilha</a>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------- Atividades e entregas ----------

export function AtividadesConducao({ formacaoId, atividades, base, cursistas, podeCriar, podeAvaliar, podeAlterarPrazo, aberta, setAberta, aoMudar }: {
  formacaoId: string;
  /** Com contagem de entregas (null: a pessoa nao acompanha entregas). */
  atividades: AtividadeConducao[] | null;
  /** Atividades da formacao, para quem nao acompanha entregas. */
  base: { id: string; titulo: string; prazo?: string | null; pontuacao: number }[];
  cursistas: number;
  podeCriar: boolean;
  podeAvaliar: boolean;
  /** atividade:update: muda a data de entrega. */
  podeAlterarPrazo: boolean;
  aberta: string | null;
  setAberta: (id: string | null) => void;
  aoMudar: () => void;
}) {
  const [criando, setCriando] = useState(false);
  const [alterandoPrazo, setAlterandoPrazo] = useState<string | null>(null);
  // Confirmacao no lugar do item, com o foco nela (o formulario some ao salvar).
  const [prazoSalvo, setPrazoSalvo] = useState<{ id: string; texto: string } | null>(null);
  useEffect(() => {
    if (prazoSalvo) document.querySelector<HTMLElement>(`#atividade-${prazoSalvo.id} .prazo-salvo`)?.focus();
  }, [prazoSalvo]);
  const lista = atividades ?? base.map((x) => ({ ...x, prazo: x.prazo ?? null, descricao: null, criterios: null, enviadas: 0, aguardando: 0, emAjuste: 0, avaliadas: 0 }));

  return (
    <section id="atividades" className="fsec" aria-labelledby="atividades-entregas">
      <div className="fsec-head">
        <div>
          <h2 id="atividades-entregas" className="section-title">{atividades ? 'Atividades e entregas' : 'Atividades'}</h2>
          <p className="fsec-lead">{atividades ? 'Veja quem enviou e dê a devolutiva sem sair da formação.' : 'O que os cursistas entregam nesta formação.'}</p>
        </div>
        {podeCriar && !criando && (
          <button type="button" className="btn btn-secondary" onClick={() => setCriando(true)}>
            <Plus size={18} aria-hidden="true" /> Nova atividade
          </button>
        )}
      </div>

      {criando && <NovaAtividade formacaoId={formacaoId} aoFechar={(criou) => { setCriando(false); if (criou) aoMudar(); }} />}

      {lista.length === 0 && !criando ? (
        <p className="fsec-vazio">
          Nenhuma atividade ainda. {podeCriar ? 'Crie a primeira com “Nova atividade”: os cursistas enviam por esta página.' : 'Quando a equipe criar, ela aparece aqui.'}
        </p>
      ) : (
        <ul className="fsec-lista">
          {lista.map((x) => {
            const aberto = aberta === x.id;
            const pct = cursistas ? Math.min(100, (x.enviadas / cursistas) * 100) : 0;
            return (
              <li key={x.id} id={`atividade-${x.id}`} className="fitem">
                <div className="fitem-topo">
                  <h3 className="fitem-titulo">{x.titulo}</h3>
                  {atividades && (x.aguardando > 0
                    ? <StatusBadge tom={TOM_ENTREGA.ENVIADA}>{x.aguardando} aguardando devolutiva</StatusBadge>
                    : x.enviadas > 0 && <StatusBadge tom="good">Devolutivas em dia</StatusBadge>)}
                </div>
                <p className="fitem-meta">
                  {x.prazo
                    ? <span className={prazoEncerrado(x.prazo) ? 'fitem-alerta' : undefined}>{prazoEncerrado(x.prazo) ? `Prazo encerrado em ${fmtData(x.prazo)}` : `Prazo: ${fmtDia(x.prazo)} (${quando(x.prazo)})`}</span>
                    : <span>Sem prazo definido</span>}
                  <span>vale {x.pontuacao} pontos</span>
                </p>
                {atividades && (
                  <div className="fitem-progresso">
                    <span className="trilha-mini" aria-hidden="true"><span className="hatch" style={{ width: `${pct}%` }} /></span>
                    <span>{cursistas ? `${x.enviadas} de ${cursistas} enviaram` : `${x.enviadas} enviadas`}</span>
                    {(x.avaliadas > 0 || x.emAjuste > 0) && (
                      <span className="fitem-sub">{[x.avaliadas && plural(x.avaliadas, 'avaliada', 'avaliadas'), x.emAjuste && `${x.emAjuste} em ajuste`].filter(Boolean).join(' · ')}</span>
                    )}
                  </div>
                )}
                {prazoSalvo?.id === x.id && <p className="prazo-salvo foco-aviso" role="status" tabIndex={-1}><Check size={16} aria-hidden="true" /> {prazoSalvo.texto}</p>}
                {alterandoPrazo === x.id ? (
                  <PrazoAtividade atividade={x} aoFechar={(texto) => {
                    setAlterandoPrazo(null);
                    if (texto) { setPrazoSalvo({ id: x.id, texto }); aoMudar(); }
                  }} />
                ) : ((atividades && podeAvaliar && x.enviadas > 0) || podeAlterarPrazo) && (
                  <div className="fitem-acoes">
                    {atividades && podeAvaliar && x.enviadas > 0 && (
                      <button type="button" className={x.aguardando ? 'btn btn-secondary' : 'btn btn-ghost'} aria-expanded={aberto}
                        aria-controls={aberto ? `entregas-${x.id}` : undefined} onClick={() => setAberta(aberto ? null : x.id)}>
                        {aberto ? 'Recolher as entregas' : x.aguardando ? 'Dar devolutivas' : 'Ver entregas'}
                        <span className="sr-only">: {x.titulo}</span>
                      </button>
                    )}
                    {podeAlterarPrazo && (
                      <button type="button" className="btn btn-ghost" onClick={() => { setPrazoSalvo(null); setAlterandoPrazo(x.id); }}>
                        <CalendarClock size={16} aria-hidden="true" /> {x.prazo ? 'Alterar prazo' : 'Definir prazo'}<span className="sr-only">: {x.titulo}</span>
                      </button>
                    )}
                  </div>
                )}
                {aberto && <EntregasAtividade id={`entregas-${x.id}`} atividadeId={x.id} pontuacao={x.pontuacao} descricao={x.descricao} criterios={x.criterios} aoMudar={aoMudar} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}


function EntregasAtividade({ id, atividadeId, pontuacao, descricao, criterios, aoMudar }: {
  id: string; atividadeId: string; pontuacao: number;
  /** O que a atividade pede: fica no topo da fila, para avaliar sem lembrar de cabeca. */
  descricao: string | null; criterios: string | null;
  aoMudar: () => void;
}) {
  const [lista, setLista] = useState<EntregaParaAvaliar[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [revendo, setRevendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Avaliadas nesta visita continuam na fila (nada pula de lugar); as antigas ficam recolhidas.
  const [avaliadasAgora, setAvaliadasAgora] = useState<Set<string>>(new Set());
  // Um so botao principal na fila: o da entrega em que a pessoa esta (ou a primeira a avaliar).
  const [emFoco, setEmFoco] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<EntregaParaAvaliar[]>(`/atividades/${atividadeId}/entregas`).then(setLista)
      .catch((e) => setErro(msg(e, 'Não foi possível carregar as entregas.')));
  }, [atividadeId]);

  // Depois de avaliar, o foco segue para a proxima entrega da fila.
  const proximo = useRef(false);
  useEffect(() => {
    if (!proximo.current) return;
    proximo.current = false;
    raiz.current?.querySelector<HTMLElement>('[data-status="ENVIADA"] input, [data-status="ENVIADA"] textarea')?.focus();
  }, [lista]);

  if (erro) return <Note tom="danger">{erro}</Note>;
  if (!lista) return <ListSkeleton linhas={2} altura={90} />;

  const naFila = (e: EntregaParaAvaliar) => e.status !== 'AVALIADA' || avaliadasAgora.has(e.id) || revendo === e.id;
  const fila = lista.filter(naFila);
  const antigas = lista.filter((e) => !naFila(e));
  const aAvaliar = (e: EntregaParaAvaliar) => e.status === 'ENVIADA' || revendo === e.id;
  const principal = emFoco && lista.some((e) => e.id === emFoco && aAvaliar(e)) ? emFoco : fila.find(aAvaliar)?.id ?? null;

  function linha(e: EntregaParaAvaliar) {
    const avaliar = aAvaliar(e);
    return (
      <li key={e.id} className="entrega" data-status={e.status} onFocus={() => setEmFoco(e.id)}>
        <div className="fitem-topo">
          <p className="entrega-quem"><strong>{e.inscricao.user.nome}</strong> <span>enviou em {fmtData(e.enviadaEm)}</span></p>
          <SituacaoEntrega status={e.status} nota={e.nota} pontuacao={pontuacao} />
        </div>
        {e.conteudo && <p className="entrega-texto">{e.conteudo}</p>}
        {e.anexoUrl && /^https?:\/\//i.test(e.anexoUrl) && (
          <a className="link-acao" href={e.anexoUrl} target="_blank" rel="noopener noreferrer">
            Abrir o link enviado <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span>
          </a>
        )}
        {e.feedback && !avaliar && (
          <div className="devolutiva" data-ajuste={e.status === 'EM_AJUSTE'}>
            <p className="devolutiva-rotulo">{e.status === 'EM_AJUSTE' ? 'Ajuste pedido' : 'Sua devolutiva'}{e.avaliadaEm && ` · ${fmtData(e.avaliadaEm)}`}</p>
            <p>{e.feedback}</p>
          </div>
        )}
        {avaliar ? (
          <FormAvaliacao entrega={e} pontuacao={pontuacao} principal={principal === e.id}
            aoCancelar={revendo === e.id ? () => setRevendo(null) : undefined}
            aoSalvar={(nova, ajuste) => {
              proximo.current = true;
              setRevendo(null);
              setAvaliadasAgora((a) => new Set(a).add(e.id));
              setAviso(`${ajuste ? 'Ajuste pedido' : 'Devolutiva registrada'} para ${e.inscricao.user.nome}.`);
              setLista((l) => l?.map((x) => (x.id === e.id ? { ...x, ...nova } : x)) ?? l);
              aoMudar();
            }} />
        ) : e.status !== 'EM_AJUSTE' && (
          <div className="fitem-acoes">
            <button type="button" className="btn btn-ghost" onClick={() => setRevendo(e.id)}>
              Rever a devolutiva<span className="sr-only"> de {e.inscricao.user.nome}</span>
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div id={id} ref={raiz} className="entregas">
      <p className="sr-only" role="status">{aviso}</p>
      {(descricao || criterios) && (
        <div className="entregas-pede">
          {descricao && <p><strong>O que a atividade pede:</strong> {descricao}</p>}
          {criterios && <p><strong>Critérios:</strong> {criterios}</p>}
        </div>
      )}
      {lista.length === 0 && <p className="fsec-vazio">Ninguém enviou ainda.</p>}
      {fila.length > 0 && <ul className="entregas-lista">{fila.map(linha)}</ul>}
      {fila.length === 0 && antigas.length > 0 && <p className="pend-ok"><Check size={18} aria-hidden="true" /> Todas as entregas desta atividade já têm devolutiva.</p>}
      {antigas.length > 0 && (
        <details className="entregas-avaliadas">
          <summary>Já avaliadas ({antigas.length})</summary>
          <ul className="entregas-lista">{antigas.map(linha)}</ul>
        </details>
      )}
    </div>
  );
}

function FormAvaliacao({ entrega, pontuacao, principal, aoCancelar, aoSalvar }: {
  entrega: EntregaParaAvaliar; pontuacao: number;
  /** So uma entrega da fila tem o botao principal. */
  principal: boolean;
  aoCancelar?: () => void;
  aoSalvar: (nova: Partial<EntregaParaAvaliar>, ajuste: boolean) => void;
}) {
  const id = useId();
  const [nota, setNota] = useState(entrega.nota !== null ? String(entrega.nota) : '');
  const [feedback, setFeedback] = useState(entrega.feedback ?? '');
  const [ocupado, setOcupado] = useState<'avaliar' | 'ajuste' | null>(null);
  const [erro, setErro] = useState<{ campo: 'nota' | 'fb' | null; texto: string } | null>(null);

  async function enviar(ajuste: boolean) {
    const n = Number(nota.replace(',', '.'));
    if (!ajuste && nota.trim() !== '' && (!Number.isFinite(n) || n < 0 || n > pontuacao)) {
      setErro({ campo: 'nota', texto: `A nota vai de 0 a ${pontuacao}. Deixe em branco se não for dar nota.` });
      return;
    }
    if (!feedback.trim()) {
      setErro({ campo: 'fb', texto: ajuste ? 'Escreva o que precisa ser ajustado.' : 'Escreva a devolutiva.' });
      return;
    }
    setOcupado(ajuste ? 'ajuste' : 'avaliar');
    setErro(null);
    try {
      const r = await api.post<Partial<EntregaParaAvaliar>>(`/entregas/${entrega.id}/avaliacao`, {
        nota: !ajuste && nota.trim() !== '' ? n : undefined, feedback: feedback.trim(), solicitarAjuste: ajuste,
      });
      aoSalvar({ status: r.status, nota: r.nota ?? null, feedback: r.feedback ?? feedback.trim(), avaliadaEm: r.avaliadaEm ?? new Date().toISOString() }, ajuste);
    } catch (e) {
      setErro({ campo: null, texto: msg(e, 'Não foi possível salvar a devolutiva. O texto continua aqui; tente de novo.') });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <form className="fform fform-avaliacao" aria-label={`Devolutiva para a entrega de ${entrega.inscricao.user.nome}`}
      onSubmit={(ev: FormEvent) => { ev.preventDefault(); void enviar(false); }} noValidate>
      <div className="fform-linha">
        <div className="fform-nota">
          <label className="label" htmlFor={`${id}-nota`}>Nota <span className="muted">(0 a {pontuacao})</span></label>
          <input id={`${id}-nota`} className="input" type="text" inputMode="decimal" value={nota}
            aria-invalid={erro?.campo === 'nota' || undefined} aria-describedby={erro?.campo === 'nota' ? `${id}-erro` : undefined}
            onChange={(e) => { setNota(e.target.value); if (erro?.campo === 'nota') setErro(null); }} />
        </div>
        <div className="fform-cresce">
          <label className="label" htmlFor={`${id}-fb`}>Devolutiva</label>
          <textarea id={`${id}-fb`} className="input" rows={3} maxLength={3000} value={feedback}
            aria-invalid={erro?.campo === 'fb' || undefined} aria-describedby={erro?.campo === 'fb' ? `${id}-erro` : undefined}
            onChange={(e) => { setFeedback(e.target.value); if (erro?.campo === 'fb') setErro(null); }}
            placeholder="O que ficou bom e o que pode avançar." />
        </div>
      </div>
      {erro && (erro.campo ? <p className="campo-erro" id={`${id}-erro`} role="alert">{erro.texto}</p> : <Note tom="danger">{erro.texto}</Note>)}
      <div className="fform-acoes">
        <button type="submit" className={principal ? 'btn btn-primary' : 'btn btn-secondary'} disabled={!!ocupado}>{ocupado === 'avaliar' ? 'Salvando...' : 'Registrar devolutiva'}</button>
        <button type="button" className={principal ? 'btn btn-secondary' : 'btn btn-ghost'} disabled={!!ocupado} onClick={() => enviar(true)}>{ocupado === 'ajuste' ? 'Enviando...' : 'Pedir ajuste'}</button>
        {aoCancelar && <button type="button" className="btn btn-ghost" onClick={aoCancelar}>Voltar</button>}
      </div>
    </form>
  );
}

/** Data de entrega: escolher outra, ou tirar o prazo; quem ja enviou continua com a entrega. */
function PrazoAtividade({ atividade, aoFechar }: {
  atividade: { id: string; titulo: string; prazo: string | null };
  /** Texto da confirmacao quando salvou; null quando cancelou. */
  aoFechar: (texto: string | null) => void;
}) {
  const id = useId();
  const [data, setData] = useState(atividade.prazo ? paraCampoData(atividade.prazo) : '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { campo.current?.focus(); }, []);
  const hoje = paraCampoData(new Date().toISOString());

  async function salvar(prazo: string | null) {
    setOcupado(true);
    setErro(null);
    try {
      await api.put(`/atividades/${atividade.id}/prazo`, { prazo });
      aoFechar(prazo ? `Prazo alterado para ${fmtData(prazo)}. Os cursistas já veem a nova data.` : 'Prazo retirado: a atividade fica sem data de entrega.');
    } catch (e) {
      setErro(msg(e, 'Não foi possível alterar o prazo.'));
      setOcupado(false);
    }
  }

  return (
    <form className="prazo-form" noValidate aria-label={`Prazo de ${atividade.titulo}`} onSubmit={(ev) => {
      ev.preventDefault();
      if (!data) { setErro('Escolha a nova data de entrega.'); campo.current?.focus(); return; }
      void salvar(fimDoDia(data));
    }}>
      <div>
        <label className="label" htmlFor={`${id}-data`}>Nova data de entrega</label>
        <span className="hint" id={`${id}-dica`}>Vale até 23h59 do dia escolhido.{data && data < hoje ? ' Essa data já passou: a atividade fica com o prazo encerrado.' : ''}</span>
        <input ref={campo} id={`${id}-data`} className="input" type="date" value={data} aria-describedby={`${id}-dica${erro ? ` ${id}-erro` : ''}`}
          aria-invalid={!!erro || undefined} onChange={(e) => { setData(e.target.value); setErro(null); }} />
        {erro && <p id={`${id}-erro`} className="campo-erro">{erro}</p>}
      </div>
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Salvando...' : 'Salvar prazo'}</button>
        {atividade.prazo && (
          <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => void salvar(null)}>Tirar o prazo</button>
        )}
        <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => aoFechar(null)}>Cancelar</button>
      </div>
    </form>
  );
}

function NovaAtividade({ formacaoId, aoFechar }: { formacaoId: string; aoFechar: (criou: boolean) => void }) {
  const id = useId();
  const [v, setV] = useState({ titulo: '', descricao: '', criterios: '', prazo: '', pontuacao: '10' });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(ev: FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      await api.post(`/formacoes/${formacaoId}/atividades`, {
        titulo: v.titulo.trim(), descricao: v.descricao.trim() || undefined, criterios: v.criterios.trim() || undefined,
        prazo: v.prazo ? fimDoDia(v.prazo) : undefined, pontuacao: Number(v.pontuacao || 10),
      });
      aoFechar(true);
    } catch (e) {
      setErro(msg(e, 'Não foi possível criar a atividade.'));
      setOcupado(false);
    }
  }

  return (
    <form className="fform fform-destaque" onSubmit={criar} aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="trilha-form-titulo">Nova atividade</h3>
      <div>
        <label className="label" htmlFor={`${id}-tit`}>Título</label>
        <input id={`${id}-tit`} className="input" required minLength={2} autoFocus value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })}
          placeholder="Ex.: Registro da aplicação em sala" />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-desc`}>O que o cursista deve fazer</label>
        <textarea id={`${id}-desc`} className="input" value={v.descricao} onChange={(e) => setV({ ...v, descricao: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-crit`}>Critérios de avaliação <span className="muted">(opcional)</span></label>
        <input id={`${id}-crit`} className="input" value={v.criterios} onChange={(e) => setV({ ...v, criterios: e.target.value })} placeholder="Ex.: evidências da aplicação; reflexão sobre ajustes" />
      </div>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-prazo`}>Prazo <span className="muted">(opcional)</span></label>
          <input id={`${id}-prazo`} className="input" type="date" value={v.prazo} onChange={(e) => setV({ ...v, prazo: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-pts`}>Vale quantos pontos</label>
          <input id={`${id}-pts`} className="input" type="number" inputMode="numeric" min={0} max={100} value={v.pontuacao} onChange={(e) => setV({ ...v, pontuacao: e.target.value })} />
        </div>
      </div>
      {erro && <Note tom="danger">{erro}</Note>}
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Criando...' : 'Criar atividade'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => aoFechar(false)}>Cancelar</button>
      </div>
    </form>
  );
}

// ---------- Encontros ----------

export function EncontrosConducao({ a, podeRegistrar, podeAgendar }: { a: AcompanhamentoFormacao; podeRegistrar: boolean; podeAgendar: boolean }) {
  const agora = Date.now();
  const variasTurmas = a.turmas.length > 1;
  return (
    <section id="encontros" className="fsec" aria-labelledby="encontros-titulo">
      <div className="fsec-head">
        <div>
          <h2 id="encontros-titulo" className="section-title">Encontros</h2>
          <p className="fsec-lead">A chamada de cada encontro e quantos estiveram presentes.</p>
        </div>
        {podeAgendar && (
          <Link className="btn btn-ghost" href="/encontros"><CalendarDays size={18} aria-hidden="true" /> Agenda de encontros</Link>
        )}
      </div>
      {a.encontros.length === 0 ? (
        <p className="fsec-vazio">Nenhum encontro agendado ainda.</p>
      ) : (
        <ol className="enc-lista">
          {a.encontros.map((e) => {
            const passou = new Date(e.inicio).getTime() <= agora;
            const proximo = e.id === a.proximoEncontro?.id;
            const semChamada = passou && !e.cancelado && !e.chamadaRegistrada;
            const incompleta = !e.cancelado && e.chamadaRegistrada && e.semMarca > 0;
            return (
              <li key={e.id} className="enc" data-proximo={proximo}>
                <SeloData iso={e.inicio} destaque={proximo} />
                <div className="enc-texto">
                  <p className="enc-titulo">{e.titulo}</p>
                  <p className="enc-meta">{fmtDia(e.inicio)}, {fmtHora(e.inicio)}{variasTurmas && ` · ${e.turma.nome}`}{e.local && ` · ${e.local}`}</p>
                </div>
                <div className="enc-situacao">
                  {e.cancelado ? <span className="status-pill" data-tom="neutral">Cancelado</span>
                    : incompleta ? <span className="status-pill" data-tom="alert">Chamada incompleta · {e.semMarca} sem marca</span>
                    : e.chamadaRegistrada ? <span className="status-pill" data-tom="good">Chamada feita · {plural(e.presentes, 'presente', 'presentes')}</span>
                      : semChamada ? <span className="status-pill" data-tom="alert">Sem chamada</span>
                        : <span className="status-pill" data-tom={proximo ? 'mid' : 'neutral'}>{proximo ? 'Próximo encontro' : 'Previsto'}</span>}
                  {(semChamada || incompleta) && podeRegistrar && (
                    <Link className="btn btn-secondary btn-compacto" href={`/encontros/${e.id}/chamada`}>
                      {incompleta ? 'Completar a chamada' : 'Registrar chamada'}<span className="sr-only">: {e.titulo}</span>
                    </Link>
                  )}
                  {e.chamadaRegistrada && !incompleta && podeRegistrar && (
                    <Link className="btn btn-ghost btn-compacto" href={`/encontros/${e.id}/chamada`}>
                      Ver a chamada<span className="sr-only">: {e.titulo}</span>
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
