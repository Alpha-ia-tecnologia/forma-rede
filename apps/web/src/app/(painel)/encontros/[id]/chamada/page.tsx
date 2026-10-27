'use client';
// Chamada do encontro (RF-069/070): diz de qual encontro se trata, lista a turma em ordem
// alfabetica, marca todos de uma vez, Presente/Faltou anunciam o estado (icone + cor +
// aria-pressed), a escola de cada pessoa ajuda a reconhecer quem e quem, e a barra de
// salvar fica sempre a mao.
// Nada se perde: cada toque fica num rascunho deste aparelho (recuperado ao voltar).
// Ninguem fica sem presenca em silencio: salvar com gente sem marca pergunta, na barra,
// "marcar os N como presentes e salvar / salvar so as marcadas / continuar"; a chamada
// salva assim fica "incompleta" e continua nas pendencias. Sair por um link do app com
// marcacoes nao salvas abre, na mesma barra, "Salvar e sair / Sair sem salvar / Continuar";
// fechar a aba pede confirmacao do navegador. Depois de salvar, a barra confirma o que
// foi registrado e oferece a proxima chamada pendente.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Check, CheckCheck, CircleCheck, TriangleAlert, X } from 'lucide-react';
import { chamadaPendente, type PainelConducao } from '@formarede/contracts';
import { api } from '../../../../../lib/api';
import { fmtDia, fmtHora, quando } from '../../../../../lib/datas';
import { plural } from '../../../../../lib/texto';
import { PageHeader, Note, ListSkeleton } from '../../../ui';

interface LinhaChamada {
  inscricaoId: string;
  participante: { id: string; nome: string; email: string };
  escola?: string | null;
  presente: boolean | null;
  justificativa: string | null;
  /** Inscricao feita depois do encontro: aparece, mas nao precisa de marca (nao conta como "sem marca"). */
  inscritoDepois?: boolean;
}
interface Encontro {
  id: string; titulo: string; inicio: string; local?: string | null;
  turma: { id: string; nome: string; formacao: { id: string; titulo: string } };
}
type Rascunho = Record<string, { presente: boolean | null; justificativa: string | null }>;
type Proxima = { id: string; titulo: string; inicio: string } | null;
/** O que a ultima gravacao registrou (a barra confirma com isso). */
type Salvo = { presentes: number; faltas: number; semMarca: number };

const porNome = (a: LinhaChamada, b: LinhaChamada) => a.participante.nome.localeCompare(b.participante.nome, 'pt-BR');

export default function ChamadaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Destino que a pessoa tentou abrir com a chamada sem salvar (a barra pergunta o que fazer).
  const [saindoPara, setSaindoPara] = useState<string | null>(null);
  const [encontro, setEncontro] = useState<Encontro | null>(null);
  const [linhas, setLinhas] = useState<LinhaChamada[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<Salvo | null>(null);
  // Salvar com gente sem marca: a barra pergunta antes de gravar.
  const [confirmandoParcial, setConfirmandoParcial] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const [recuperado, setRecuperado] = useState(false);
  // Depois de salvar: undefined = nao salvou ainda; null = nenhuma pendente.
  const [proxima, setProxima] = useState<Proxima | undefined>(undefined);
  const chave = `formarede.rascunho-chamada.${id}`;
  const barra = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    api.get<Encontro>(`/encontros/${id}`).then(setEncontro).catch(() => undefined);
    api.get<LinhaChamada[]>(`/encontros/${id}/chamada`)
      .then((ls) => {
        // Um rascunho deste aparelho (marcacoes ainda nao salvas) volta por cima do que
        // esta salvo; ele so some quando a chamada e salva.
        try {
          const r = JSON.parse(sessionStorage.getItem(chave) ?? 'null') as Rascunho | null;
          if (r && Object.keys(r).length) {
            setLinhas(ls.map((l) => (r[l.inscricaoId] ? { ...l, ...r[l.inscricaoId] } : l)).sort(porNome));
            setMudou(true);
            setRecuperado(true);
            return;
          }
        } catch { /* sem rascunho */ }
        setLinhas([...ls].sort(porNome));
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar a turma.'));
  }, [id, chave]);
  useEffect(carregar, [carregar]);

  // Marcacoes nao salvas: o navegador pergunta antes de fechar ou recarregar, e os links
  // do proprio app (menu, Voltar) pedem confirmacao antes de sair da chamada.
  useEffect(() => {
    if (!mudou) return;
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const noLink = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const destino = new URL(a.href, window.location.href);
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setSaindoPara(destino.pathname + destino.search + destino.hash);
    };
    window.addEventListener('beforeunload', segurar);
    document.addEventListener('click', noLink, true);
    return () => {
      window.removeEventListener('beforeunload', segurar);
      document.removeEventListener('click', noLink, true);
    };
  }, [mudou]);

  // Quando a barra pergunta algo ou confirma o salvo, o foco vai para a primeira acao dela
  // (o botao clicado sumiu ou ficou longe, no fim da pagina).
  const estadoBarra = saindoPara ? 'saindo' : confirmandoParcial ? 'parcial' : salvo && !mudou ? 'salvo' : null;
  useEffect(() => {
    if (estadoBarra) barra.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
  }, [estadoBarra]);

  function alterar(fn: (ls: LinhaChamada[]) => LinhaChamada[]) {
    setLinhas((ls) => {
      if (!ls) return ls;
      const novas = fn(ls);
      try {
        const r: Rascunho = {};
        for (const l of novas) if (l.presente !== null || l.justificativa) r[l.inscricaoId] = { presente: l.presente, justificativa: l.justificativa };
        sessionStorage.setItem(chave, JSON.stringify(r));
      } catch { /* segue sem rascunho */ }
      return novas;
    });
    setMudou(true);
    setSalvo(null);
    setConfirmandoParcial(false);
    setProxima(undefined);
  }
  const marcar = (inscricaoId: string, presente: boolean) =>
    alterar((ls) => ls.map((l) => (l.inscricaoId === inscricaoId ? { ...l, presente } : l)));
  const justificar = (inscricaoId: string, justificativa: string) =>
    alterar((ls) => ls.map((l) => (l.inscricaoId === inscricaoId ? { ...l, justificativa } : l)));
  const precisaMarca = (l: LinhaChamada) => l.presente === null && !l.inscritoDepois;
  const todosPresentes = () => alterar((ls) => ls.map((l) => (precisaMarca(l) ? { ...l, presente: true } : l)));

  /** Grava a chamada. `restoPresente` marca antes os sem marca como presentes. */
  async function salvar(opcoes: { depois?: string; restoPresente?: boolean } = {}) {
    if (!linhas) return;
    const finais = opcoes.restoPresente ? linhas.map((l) => (precisaMarca(l) ? { ...l, presente: true } : l)) : linhas;
    setErro(null); setSalvo(null); setConfirmandoParcial(false); setSalvando(true);
    try {
      const registros = finais.filter((l) => l.presente !== null).map((l) => ({
        inscricaoId: l.inscricaoId, presente: l.presente as boolean, justificativa: l.justificativa || undefined,
      }));
      await api.post(`/encontros/${id}/frequencia`, { registros });
      try { sessionStorage.removeItem(chave); } catch { /* nada a limpar */ }
      const p = registros.filter((r) => r.presente).length;
      setSalvo({ presentes: p, faltas: registros.length - p, semMarca: finais.filter(precisaMarca).length });
      setMudou(false);
      setRecuperado(false);
      if (opcoes.depois) { setSaindoPara(null); router.push(opcoes.depois); return; }
      carregar();
      // A proxima chamada pendente (de hoje ou atrasada), para seguir sem voltar ao Inicio.
      const agora = new Date();
      api.get<PainelConducao>('/painel/conducao')
        .then((pc) => {
          const fila = [...(pc.hoje ?? []).filter((e) => chamadaPendente(e, agora)), ...(pc.chamadasPendentes ?? [])].filter((e) => e.id !== id);
          setProxima(fila[0] ? { id: fila[0].id, titulo: fila[0].titulo, inicio: fila[0].inicio } : null);
        })
        .catch(() => setProxima(null));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar. As marcações continuam na tela.');
    } finally {
      setSalvando(false);
    }
  }

  const presentes = linhas?.filter((l) => l.presente === true).length ?? 0;
  const faltas = linhas?.filter((l) => l.presente === false).length ?? 0;
  const semMarcar = linhas?.filter(precisaMarca).length ?? 0;
  const futuro = encontro && new Date(encontro.inicio).toDateString() !== new Date().toDateString() && new Date(encontro.inicio) > new Date();

  return (
    <div className="chamada">
      <PageHeader titulo={encontro ? `Chamada: ${encontro.titulo}` : 'Chamada do encontro'}
        meta={encontro ? [`${fmtDia(encontro.inicio)}, ${fmtHora(encontro.inicio)}`, encontro.turma.nome, encontro.turma.formacao.titulo] : undefined} />

      {futuro && encontro && (
        <Note tom="info">Este encontro ainda não aconteceu ({quando(encontro.inicio)}). Dá para adiantar a chamada, mas o normal é fazê-la no dia.</Note>
      )}
      {recuperado && <Note tom="info">Recuperamos as marcações que você fez e ainda não tinha salvado. Confira e salve a chamada.</Note>}
      {erro && <Note tom="danger">{erro}</Note>}
      {linhas === null ? (
        <ListSkeleton linhas={4} altura={64} />
      ) : linhas.length === 0 ? (
        <p className="fsec-vazio">Nenhum cursista confirmado nesta turma ainda.</p>
      ) : (
        <section className="fsec" aria-labelledby="lista-chamada">
          <div className="fsec-head">
            <div>
              <h2 id="lista-chamada" className="section-title">{plural(linhas.length, 'cursista', 'cursistas')}</h2>
              <p className="fsec-lead">Marque quem faltou; depois, um toque marca o resto da turma como presente.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={todosPresentes} disabled={semMarcar === 0}>
              <CheckCheck size={18} aria-hidden="true" /> Marcar {semMarcar === linhas.filter((l) => !l.inscritoDepois).length ? 'todos' : 'os sem marca'} como presentes
            </button>
          </div>
          <ul className="chamada-lista">
            {linhas.map((l) => (
              <li key={l.inscricaoId} className="chamada-linha" data-marca={l.presente === null ? 'nenhuma' : l.presente ? 'presente' : 'falta'} data-depois={l.inscritoDepois || undefined}>
                <div className="chamada-quem">
                  <p className="chamada-nome">{l.participante.nome}</p>
                  <p className="chamada-escola">
                    {l.escola ?? l.participante.email}
                    {l.inscritoDepois && l.presente === null && <> · <span className="chamada-depois">inscrição feita depois deste encontro; não precisa de marca</span></>}
                  </p>
                </div>
                <div className="chamada-opcoes" role="group" aria-label={`Presença de ${l.participante.nome}`}>
                  <button type="button" className="chamada-op" data-op="presente" aria-pressed={l.presente === true} onClick={() => marcar(l.inscricaoId, true)}>
                    <Check size={16} aria-hidden="true" /> Presente
                  </button>
                  <button type="button" className="chamada-op" data-op="falta" aria-pressed={l.presente === false} onClick={() => marcar(l.inscricaoId, false)}>
                    <X size={16} aria-hidden="true" /> Faltou
                  </button>
                </div>
                {l.presente === false && (
                  <div className="chamada-motivo">
                    <label className="sr-only" htmlFor={`motivo-${l.inscricaoId}`}>Motivo da falta de {l.participante.nome}</label>
                    <input id={`motivo-${l.inscricaoId}`} className="input" placeholder="Motivo da falta, se houver (ex.: atestado)"
                      value={l.justificativa ?? ''} onChange={(e) => justificar(l.inscricaoId, e.target.value)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {linhas && linhas.length > 0 && (
        <div ref={barra} className="chamada-barra" data-estado={saindoPara || confirmandoParcial ? 'pergunta' : salvo && !mudou ? (salvo.semMarca ? 'incompleta' : 'salva') : 'marcando'}>
          {saindoPara ? (
            <>
              <p role="alert" className="chamada-resumo">
                <span>
                  <strong>A chamada ainda não foi salva.</strong>{' '}
                  {semMarcar > 0
                    ? <>Se salvar agora, ela fica incompleta ({plural(semMarcar, 'cursista sem marca', 'cursistas sem marca')}). </>
                    : null}
                  As marcações ficam guardadas neste aparelho se você sair sem salvar.
                </span>
              </p>
              <div className="fform-acoes">
                <button type="button" className="btn btn-primary" onClick={() => salvar({ depois: saindoPara })} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar e sair'}</button>
                <button type="button" className="btn btn-ghost" onClick={() => { const d = saindoPara; setSaindoPara(null); setMudou(false); router.push(d); }}>Sair sem salvar</button>
                <button type="button" className="btn btn-ghost" onClick={() => setSaindoPara(null)}>Continuar a chamada</button>
              </div>
            </>
          ) : confirmandoParcial ? (
            <>
              <p role="alert" className="chamada-resumo">
                <span>
                  <strong>{plural(semMarcar, 'cursista está sem marca', 'cursistas estão sem marca')}.</strong> Quem fica sem marca não ganha presença nem falta, e a chamada continua pendente.
                </span>
              </p>
              <div className="fform-acoes">
                <button type="button" className="btn btn-primary" onClick={() => salvar({ restoPresente: true })} disabled={salvando}>
                  {salvando ? 'Salvando...' : semMarcar === 1 ? 'Marcar presente e salvar' : `Marcar os ${semMarcar} como presentes e salvar`}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => salvar()} disabled={salvando}>Salvar só as marcadas</button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmandoParcial(false)}>Continuar a chamada</button>
              </div>
            </>
          ) : salvo && !mudou ? (
            <>
              <p role="status" className="chamada-resumo">
                {salvo.semMarca ? <TriangleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}
                <span>
                  <strong>{salvo.semMarca ? 'Chamada salva, mas incompleta.' : 'Chamada salva.'}</strong>{' '}
                  {plural(salvo.presentes, 'presente', 'presentes')} e {plural(salvo.faltas, 'falta', 'faltas')}
                  {salvo.semMarca ? <>; {plural(salvo.semMarca, 'cursista continua', 'cursistas continuam')} sem marca.</> : '.'}
                  {proxima && <> Próxima pendente: {proxima.titulo} ({fmtDia(proxima.inicio)}).</>}
                </span>
              </p>
              <div className="fform-acoes">
                {salvo.semMarca > 0 && (
                  <button type="button" className="btn btn-primary" onClick={() => document.querySelector<HTMLElement>('.chamada-linha[data-marca="nenhuma"]:not([data-depois]) .chamada-op')?.focus()}>
                    Completar agora
                  </button>
                )}
                {proxima && <Link className={salvo.semMarca ? 'btn btn-ghost' : 'btn btn-primary'} href={`/encontros/${proxima.id}/chamada`}>Fazer a próxima chamada</Link>}
                <Link className={proxima || salvo.semMarca ? 'btn btn-ghost' : 'btn btn-primary'} href="/dashboard">Voltar para o Início</Link>
              </div>
            </>
          ) : (
            <>
              <p role="status" className="chamada-resumo">
                <span>
                  {plural(presentes, 'presente', 'presentes')} · {plural(faltas, 'falta', 'faltas')}
                  {semMarcar > 0 && <> · <strong>{semMarcar} sem marca</strong></>}{mudou && ' · não salva'}
                </span>
              </p>
              <button type="button" className="btn btn-primary" disabled={salvando || !mudou}
                onClick={() => (semMarcar > 0 ? setConfirmandoParcial(true) : salvar())}>
                {salvando ? 'Salvando...' : 'Salvar chamada'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
