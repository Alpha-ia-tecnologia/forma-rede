'use client';
// Trilha formativa da formacao: etapas em ordem com videos, documentos, podcasts e
// materiais do acervo. Quem edita (formador, curadoria, gestao) monta a trilha; o
// cursista estuda e marca o que concluiu. Recurso novo so chega aos cursistas
// depois da curadoria (a API filtra).
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown, ArrowUp, AudioLines, Check, Clapperboard, ExternalLink, FileText, Hourglass, Image, Library,
  Link2, Pencil, Plus, Podcast, Presentation, Route, Sheet, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { MATERIAL_TIPO_LABELS, TIPOS_RECURSO_TRILHA } from '@formarede/contracts';
import type { EtapaTrilha, MaterialTipo, TrilhaFormacao } from '@formarede/contracts';
import { api, getUser } from '../../../../lib/api';
import { descreverMidia, reconhecerMidia, type Midia } from '../../../../lib/midia';
import { EmptyState, ListSkeleton, Note, StatusBadge } from '../../ui';

type TipoRecurso = (typeof TIPOS_RECURSO_TRILHA)[number];
interface Modulo { id: string; titulo: string; ordem: number }
interface MaterialAcervo { id: string; titulo: string; tipo: MaterialTipo; status: string }

const ICONE: Record<MaterialTipo, typeof FileText> = {
  VIDEO: Clapperboard, DOCUMENTO: FileText, PODCAST: Podcast, LINK: Link2, AUDIO: AudioLines,
  APRESENTACAO: Presentation, PLANILHA: Sheet, IMAGEM: Image,
};

const DICA_URL: Record<TipoRecurso, string> = {
  VIDEO: 'YouTube, Vimeo ou um arquivo .mp4.',
  DOCUMENTO: 'Um PDF ou uma página on-line (site da rede, Google Drive...).',
  PODCAST: 'Um episódio ou programa do Spotify, ou um arquivo .mp3.',
  LINK: 'Qualquer página que comece com https://.',
};

function fmtDuracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

const msg = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);

export function TrilhaFormativa({ formacaoId, modulos, aoMudarColecao, aoCarregar }: {
  formacaoId: string;
  modulos: Modulo[];
  /** A trilha mexe na colecao de materiais da formacao (a pagina recarrega o detalhe). */
  aoMudarColecao: () => void;
  /** A pagina usa a trilha no painel (etapas aguardando curadoria, materiais ja na trilha). */
  aoCarregar?: (t: TrilhaFormacao) => void;
}) {
  const [trilha, setTrilha] = useState<TrilhaFormacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  // Etapas concluidas ficam recolhidas para o cursista; "Rever" abre de novo.
  const [revendo, setRevendo] = useState<Set<string>>(new Set());
  const foco = useRef<string | null>(null);
  const avisar = useRef(aoCarregar);
  avisar.current = aoCarregar;
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const user = getUser();
  const podeAprovar = !!user && (user.permissions.includes('*') || user.permissions.includes('material:aprovar'));

  useEffect(() => {
    api.get<TrilhaFormacao>(`/formacoes/${formacaoId}/trilha`)
      .then((t) => {
        setTrilha(t);
        // Quem chega por /formacoes/:id#trilha: a secao so existe depois do carregamento.
        if (window.location.hash === '#trilha') requestAnimationFrame(() => document.getElementById('trilha')?.scrollIntoView());
      })
      .catch((e) => setErro(msg(e, 'Não foi possível carregar a trilha.')));
  }, [formacaoId]);

  useEffect(() => { if (trilha) avisar.current?.(trilha); }, [trilha]);

  // Depois de mover, adicionar, remover ou continuar, o foco vai para um lugar previsivel.
  useEffect(() => {
    const alvo = foco.current;
    if (!alvo) return;
    foco.current = null;
    const el = alvo === 'titulo' ? tituloRef.current : document.querySelector<HTMLElement>(alvo);
    el?.focus();
  }, [trilha, editando, adicionando, removendo, abertas, revendo]);

  const executar = useCallback(async (chave: string, fn: () => Promise<TrilhaFormacao>, colecao = false) => {
    setOcupado(chave);
    setErro(null);
    try {
      setTrilha(await fn());
      if (colecao) aoMudarColecao();
      return true;
    } catch (e) {
      setErro(msg(e, 'Não foi possível salvar.'));
      return false;
    } finally {
      setOcupado(null);
    }
  }, [aoMudarColecao]);

  if (!trilha) {
    return (
      <section id="trilha" className="fsec trilha" aria-labelledby="trilha-titulo">
        <h2 id="trilha-titulo" className="section-title">Trilha formativa</h2>
        {erro ? <Note tom="danger">{erro}</Note> : <ListSkeleton linhas={2} altura={120} />}
      </section>
    );
  }

  const { etapas, podeEditar, progresso, totalCursistas } = trilha;
  const visiveis = etapas.filter((e) => e.material.status === 'APROVADO');
  const aguardando = etapas.length - visiveis.length;
  const minutos = etapas.reduce((s, e) => s + (e.duracaoMin ?? 0), 0);
  const proximaEtapa = progresso ? etapas.find((e) => !e.concluida) : undefined;
  const proxima = proximaEtapa?.id;
  const temModulos = etapas.some((e) => e.modulo);

  /** Leva o cursista a proxima etapa: abre o player (se houver) e poe o foco no titulo. */
  function continuar(e: EtapaTrilha) {
    const m = reconhecerMidia(e.material.url);
    foco.current = `#titulo-${e.id}`;
    if (m && m.forma !== 'link') setAbertas((a) => new Set(a).add(e.id));
    else setRevendo((r) => new Set(r));
  }

  function alternarRevisao(id: string) {
    setRevendo((r) => {
      const n = new Set(r);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function alternarMidia(id: string) {
    setAbertas((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const mover = (e: EtapaTrilha, direcao: 'subir' | 'descer') => {
    foco.current = `[data-etapa="${e.id}"] [data-acao="${direcao}"]:not(:disabled), [data-etapa="${e.id}"] [data-acao]:not(:disabled)`;
    void executar(`mover-${e.id}`, () => api.post(`/trilha/etapas/${e.id}/mover`, { direcao }));
  };

  const remover = async (e: EtapaTrilha) => {
    foco.current = 'titulo';
    if (await executar(`remover-${e.id}`, () => api.del(`/trilha/etapas/${e.id}`))) setRemovendo(null);
  };

  const concluir = (e: EtapaTrilha, concluida: boolean) =>
    void executar(`concluir-${e.id}`, () => api.post(`/trilha/etapas/${e.id}/conclusao`, { concluida }));

  async function aprovar(e: EtapaTrilha) {
    setOcupado(`aprovar-${e.id}`);
    setErro(null);
    try {
      await api.post(`/materiais/${e.material.id}/decisao`, { aprovar: true });
      setTrilha(await api.get<TrilhaFormacao>(`/formacoes/${formacaoId}/trilha`));
      aoMudarColecao();
    } catch (err) {
      setErro(msg(err, 'Não foi possível aprovar o material.'));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section id="trilha" className="fsec trilha" aria-labelledby="trilha-titulo">
      <div className="trilha-head">
        <div style={{ minWidth: 0 }}>
          <h2 id="trilha-titulo" ref={tituloRef} tabIndex={-1} className="section-title" style={{ marginBottom: 4 }}>Trilha formativa</h2>
          <p className="muted trilha-lead">
            {podeEditar
              ? 'Vídeos, documentos e podcasts em ordem, com uma orientação para cada um, para estudar entre os encontros.'
              : 'Siga as etapas em ordem entre os encontros. Cada uma traz uma orientação da equipe de formação.'}
          </p>
        </div>
        {podeEditar && !adicionando && etapas.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => { setAdicionando(true); setEditando(null); }}>
            <Plus size={18} aria-hidden="true" /> Adicionar etapa
          </button>
        )}
      </div>

      {progresso && progresso.obrigatorias > 0 && (
        <div className="trilha-progresso">
          <div className="meter">
            <div className="meter-head">
              <span>Etapas obrigatórias</span>
              <strong>{progresso.concluidas} de {progresso.obrigatorias}</strong>
            </div>
            <div className="meter-track" role="progressbar" aria-label="Etapas obrigatórias concluídas"
              aria-valuemin={0} aria-valuemax={progresso.obrigatorias} aria-valuenow={progresso.concluidas}
              aria-valuetext={`${progresso.concluidas} de ${progresso.obrigatorias} etapas obrigatórias`}>
              <div className="meter-fill" style={{ background: progresso.concluidas === progresso.obrigatorias ? 'var(--signal-lime)' : 'var(--brand)', transform: `scaleX(${progresso.concluidas / progresso.obrigatorias})` }} />
            </div>
          </div>
          <p className="trilha-feito" role="status">
            {progresso.concluidas === progresso.obrigatorias && <><Check size={16} aria-hidden="true" /> Você concluiu todas as etapas obrigatórias.</>}
          </p>
          {proximaEtapa && (
            <div className="trilha-seguir">
              <p className="trilha-seguir-texto">
                <span className="trilha-seguir-rotulo">{proximaEtapa.obrigatoria ? 'Próxima etapa' : 'Etapa opcional'}</span>
                <strong>{proximaEtapa.titulo}</strong>
                <span className="trilha-seguir-meta">
                  {MATERIAL_TIPO_LABELS[proximaEtapa.material.tipo] ?? proximaEtapa.material.tipo}{proximaEtapa.duracaoMin ? ` · ${fmtDuracao(proximaEtapa.duracaoMin)}` : ''}
                </span>
              </p>
              <button type="button" className="btn btn-primary" onClick={() => continuar(proximaEtapa)}>
                {progresso.concluidas === 0 ? 'Começar a trilha' : 'Continuar a trilha'}
              </button>
            </div>
          )}
        </div>
      )}

      {podeEditar && etapas.length > 0 && (
        <p className="trilha-resumo">
          <span>{etapas.length} {etapas.length === 1 ? 'etapa' : 'etapas'}</span>
          {minutos > 0 && <span>cerca de {fmtDuracao(minutos)} de estudo</span>}
          {aguardando > 0 && <span className="trilha-resumo-alerta">{aguardando} aguardando curadoria</span>}
        </p>
      )}

      {erro && <Note tom="danger">{erro}</Note>}

      {adicionando && (
        <FormEtapa
          formacaoId={formacaoId} modulos={modulos} podeAprovar={podeAprovar} ocupado={ocupado === 'criar'}
          noAcervo={new Set(etapas.map((e) => e.material.id))}
          aoCancelar={() => { setAdicionando(false); setErro(null); }}
          aoEnviar={async (dados) => {
            const antes = new Set(etapas.map((e) => e.id));
            setOcupado('criar');
            setErro(null);
            try {
              const nova = await api.post<TrilhaFormacao>(`/formacoes/${formacaoId}/trilha/etapas`, dados);
              const criada = nova.etapas.find((e) => !antes.has(e.id));
              foco.current = criada ? `[data-etapa="${criada.id}"] .trilha-titulo` : 'titulo';
              setTrilha(nova);
              setAdicionando(false);
              aoMudarColecao();
              return null;
            } catch (e) {
              return msg(e, 'Não foi possível adicionar a etapa.');
            } finally {
              setOcupado(null);
            }
          }}
        />
      )}

      {etapas.length === 0 && !adicionando && (
        podeEditar ? (
          <EmptyState icon={<Route size={26} />} titulo="A trilha ainda está vazia"
            descricao="Monte o percurso de estudo entre os encontros: vídeos, documentos e podcasts em ordem, cada um com uma orientação para os cursistas."
            acao={<button type="button" className="btn btn-primary" onClick={() => setAdicionando(true)}><Plus size={18} aria-hidden="true" /> Adicionar a primeira etapa</button>} />
        ) : (
          <EmptyState icon={<Route size={26} />} titulo="A trilha ainda não tem etapas"
            descricao="Quando a equipe de formação publicar vídeos, documentos ou podcasts, eles aparecem aqui em ordem." />
        )
      )}

      {etapas.length > 0 && (
        <ol className="trilha-lista">
          {etapas.flatMap((e, i) => {
            const midia = reconhecerMidia(e.material.url);
            const pendente = e.material.status === 'EM_REVISAO';
            const recusado = e.material.status === 'REJEITADO';
            const estado = e.concluida ? 'concluida' : pendente || recusado ? 'pendente' : e.id === proxima ? 'proxima' : 'aberta';
            const Icone = ICONE[e.material.tipo] ?? FileText;
            const aberta = abertas.has(e.id);
            const fonte = [e.material.autoria, e.material.licenca].filter(Boolean).join(' · ');
            const recolhida = !!progresso && e.concluida && !revendo.has(e.id);
            // Divisor quando o modulo muda (o modulo tambem vai, oculto, na linha de cada etapa).
            const anterior = etapas[i - 1];
            const divisor = temModulos && (i === 0 || anterior?.modulo?.id !== e.modulo?.id) ? (
              <li key={`modulo-${e.id}`} className="trilha-modulo" aria-hidden="true">
                <span>{e.modulo?.titulo ?? 'Sem módulo'}</span>
              </li>
            ) : null;
            return [divisor, (
              <li key={e.id} className="trilha-etapa" data-etapa={e.id} data-estado={estado}>
                <span className="trilha-marca" aria-hidden="true">
                  {e.concluida ? <Check size={18} strokeWidth={2.5} /> : pendente ? <Hourglass size={16} /> : i + 1}
                </span>
                <article className="trilha-card">
                  {editando === e.id ? (
                    <FormEdicao etapa={e} modulos={modulos} ocupado={ocupado === `editar-${e.id}`}
                      aoCancelar={() => { foco.current = `[data-etapa="${e.id}"] [data-acao="editar"]`; setEditando(null); }}
                      aoSalvar={async (dados) => {
                        foco.current = `[data-etapa="${e.id}"] [data-acao="editar"]`;
                        if (await executar(`editar-${e.id}`, () => api.put(`/trilha/etapas/${e.id}`, dados))) setEditando(null);
                      }} />
                  ) : recolhida ? (
                    <div className="trilha-topo trilha-recolhida">
                      <span className="trilha-tipo" data-tipo={e.material.tipo}><Icone size={20} aria-hidden="true" /></span>
                      <div className="trilha-titulos">
                        <h3 id={`titulo-${e.id}`} className="trilha-titulo" tabIndex={-1}>
                          <span className="sr-only">Etapa {i + 1}: </span>{e.titulo}
                        </h3>
                        <p className="trilha-meta"><span>Concluída</span><span>{MATERIAL_TIPO_LABELS[e.material.tipo] ?? e.material.tipo}</span></p>
                      </div>
                      <button type="button" className="btn btn-ghost btn-compacto" aria-describedby={`titulo-${e.id}`}
                        onClick={() => { foco.current = `#titulo-${e.id}`; alternarRevisao(e.id); }}>Rever</button>
                    </div>
                  ) : (
                    <>
                      <div className="trilha-topo">
                        <span className="trilha-tipo" data-tipo={e.material.tipo}><Icone size={20} aria-hidden="true" /></span>
                        <div className="trilha-titulos">
                          <h3 id={`titulo-${e.id}`} className="trilha-titulo" tabIndex={-1}>
                            <span className="sr-only">Etapa {i + 1}: </span>{e.titulo}
                          </h3>
                          <p className="trilha-meta">
                            {e.modulo && <span className="sr-only">{e.modulo.titulo}</span>}
                            <span>{MATERIAL_TIPO_LABELS[e.material.tipo] ?? e.material.tipo}</span>
                            {e.duracaoMin && <span>{fmtDuracao(e.duracaoMin)}</span>}
                            {!temModulos && e.modulo && <span>{e.modulo.titulo}</span>}
                            <span>{e.obrigatoria ? 'Obrigatória' : 'Opcional'}</span>
                          </p>
                        </div>
                        {(pendente || recusado) && <div className="trilha-selos">
                          {pendente && <StatusBadge tom="warn">Aguardando curadoria</StatusBadge>}
                          {recusado && <StatusBadge tom="danger">Material recusado</StatusBadge>}
                        </div>}
                      </div>

                      {e.orientacao && <p className="trilha-orientacao">{e.orientacao}</p>}
                      {fonte && <p className="trilha-fonte">{fonte}</p>}

                      {aberta && midia && midia.forma !== 'link' && (
                        <div id={`midia-${e.id}`}>
                          <Player midia={midia} titulo={e.titulo} />
                          {midia.forma === 'embed' && e.material.url && (
                            <a className="trilha-fora" href={e.material.url} target="_blank" rel="noopener noreferrer">
                              Abrir no {midia.provedor} <ExternalLink size={14} aria-hidden="true" />
                              <span className="sr-only"> (abre em nova aba)</span>
                            </a>
                          )}
                        </div>
                      )}

                      {pendente && !podeAprovar && podeEditar && (
                        <p className="trilha-aviso">Os cursistas veem esta etapa depois que a curadoria aprovar o material.</p>
                      )}
                      {recusado && podeEditar && (
                        <p className="trilha-aviso">A curadoria recusou este material. Troque o recurso ou remova a etapa.</p>
                      )}

                      <div className="trilha-acoes">
                        <AcaoMidia midia={midia} tipo={e.material.tipo} aberta={aberta} controla={`midia-${e.id}`} editor={podeEditar}
                          descrito={`titulo-${e.id}`} aoAlternar={() => alternarMidia(e.id)} />

                        {progresso && !pendente && !recusado && (
                          <label className="trilha-check" data-marcado={e.concluida}>
                            <input type="checkbox" checked={e.concluida} disabled={ocupado === `concluir-${e.id}`}
                              onChange={(ev) => concluir(e, ev.target.checked)} />
                            <span className="trilha-check-caixa" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
                            Concluí esta etapa<span className="sr-only">: {e.titulo}</span>
                          </label>
                        )}
                        {progresso && e.concluida && (
                          <button type="button" className="btn btn-ghost btn-compacto" aria-describedby={`titulo-${e.id}`}
                            onClick={() => { foco.current = `#titulo-${e.id}`; alternarRevisao(e.id); }}>Recolher</button>
                        )}

                        {pendente && podeAprovar && (
                          <button type="button" className="btn btn-secondary" onClick={() => aprovar(e)} disabled={!!ocupado}>
                            <ShieldCheck size={18} aria-hidden="true" /> {ocupado === `aprovar-${e.id}` ? 'Aprovando...' : 'Aprovar material'}
                          </button>
                        )}

                        {podeEditar && e.concluintes !== null && !pendente && !recusado && (
                          <Concluintes n={e.concluintes} total={totalCursistas ?? 0} />
                        )}

                        {podeEditar && (
                          <div className="trilha-ferramentas" role="group" aria-label={`Organizar a etapa ${i + 1}`}>
                            <button type="button" className="trilha-icone" data-acao="subir" aria-label={`Subir a etapa ${i + 1}`} title="Subir"
                              disabled={i === 0 || !!ocupado} onClick={() => mover(e, 'subir')}><ArrowUp size={18} /></button>
                            <button type="button" className="trilha-icone" data-acao="descer" aria-label={`Descer a etapa ${i + 1}`} title="Descer"
                              disabled={i === etapas.length - 1 || !!ocupado} onClick={() => mover(e, 'descer')}><ArrowDown size={18} /></button>
                            <button type="button" className="trilha-icone" data-acao="editar" aria-label={`Editar a etapa ${i + 1}`} title="Editar"
                              disabled={!!ocupado} onClick={() => { setEditando(e.id); setRemovendo(null); setAdicionando(false); }}><Pencil size={18} /></button>
                            <button type="button" className="trilha-icone" data-acao="remover" data-perigo="true" aria-label={`Remover a etapa ${i + 1}`} title="Remover"
                              disabled={!!ocupado} onClick={() => setRemovendo(e.id)}><Trash2 size={18} /></button>
                          </div>
                        )}
                      </div>

                      {removendo === e.id && (
                        <div className="trilha-confirma" role="alert">
                          <span>Remover esta etapa da trilha? O material continua no acervo e na coleção da formação.</span>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-danger" onClick={() => remover(e)} disabled={!!ocupado}>
                              {ocupado === `remover-${e.id}` ? 'Removendo...' : 'Sim, remover'}
                            </button>
                            <button type="button" className="btn btn-ghost" autoFocus onClick={() => {
                              foco.current = `[data-etapa="${e.id}"] [data-acao="remover"]`;
                              setRemovendo(null);
                            }}>Manter</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </article>
              </li>
            )];
          })}
        </ol>
      )}
    </section>
  );
}

function AcaoMidia({ midia, tipo, aberta, controla, editor, descrito, aoAlternar }: {
  midia: Midia | null; tipo: MaterialTipo; aberta: boolean; controla: string; editor: boolean;
  /** id do titulo da etapa: o nome do botao ("Ouvir aqui") ganha o contexto. */
  descrito: string;
  aoAlternar: () => void;
}) {
  if (!midia) {
    return (
      <span className="trilha-sem-url">
        {editor ? 'Material do acervo sem link on-line: os cursistas recebem pelo encontro.' : 'Sem link on-line: peça o material à equipe de formação.'}
      </span>
    );
  }
  if (midia.forma === 'link') {
    const rotulo = tipo === 'DOCUMENTO' || tipo === 'APRESENTACAO' || tipo === 'PLANILHA' ? 'Abrir documento'
      : tipo === 'VIDEO' ? 'Assistir' : tipo === 'PODCAST' || tipo === 'AUDIO' ? 'Ouvir' : 'Abrir link';
    return (
      <a className="btn btn-secondary" href={midia.href} target="_blank" rel="noopener noreferrer" aria-describedby={descrito}>
        {rotulo} <ExternalLink size={16} aria-hidden="true" />
        <span className="sr-only"> em {midia.host} (abre em nova aba)</span>
      </a>
    );
  }
  const ouvir = midia.forma === 'audio' || (midia.forma === 'embed' && midia.proporcao !== 'video');
  return (
    <button type="button" className="btn btn-secondary" aria-expanded={aberta} aria-controls={aberta ? controla : undefined} aria-describedby={descrito} onClick={aoAlternar}>
      {aberta ? <><X size={18} aria-hidden="true" /> Fechar o player</> : ouvir ? <><Podcast size={18} aria-hidden="true" /> Ouvir aqui</> : <><Clapperboard size={18} aria-hidden="true" /> Assistir aqui</>}
    </button>
  );
}

/** O player so e montado quando a pessoa pede (nada de terceiros carrega antes). */
function Player({ midia, titulo }: { midia: Exclude<Midia, { forma: 'link' }>; titulo: string }) {
  if (midia.forma === 'video') return <video className="trilha-player" data-forma="video" src={midia.src} controls preload="metadata" />;
  if (midia.forma === 'audio') return <audio className="trilha-audio" src={midia.src} controls preload="metadata" />;
  return (
    <iframe className="trilha-player" data-forma={midia.proporcao} src={midia.src} title={`${midia.provedor}: ${titulo}`}
      loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation" />
  );
}

function Concluintes({ n, total }: { n: number; total: number }) {
  return (
    <span className="trilha-concluintes">
      <span className="trilha-mini" aria-hidden="true">
        <span className="hatch" style={{ width: `${total ? Math.min(100, (n / total) * 100) : 0}%` }} />
      </span>
      {total ? `${n} de ${total} cursistas concluíram` : 'Nenhum cursista inscrito ainda'}
    </span>
  );
}

// ---------- Formularios ----------

interface DadosEtapa {
  orientacao?: string; duracaoMin?: number | null; moduloId?: string | null; obrigatoria: boolean;
}

function CamposComuns({ valor, mudar, modulos }: {
  valor: { orientacao: string; duracao: string; moduloId: string; obrigatoria: boolean };
  mudar: (v: Partial<{ orientacao: string; duracao: string; moduloId: string; obrigatoria: boolean }>) => void;
  modulos: Modulo[];
}) {
  const id = useId();
  return (
    <>
      <div>
        <label className="label" htmlFor={`${id}-ori`}>Orientação para os cursistas <span className="muted">(opcional)</span></label>
        <span className="hint" id={`${id}-ori-dica`}>O que observar, o que trazer para o encontro.</span>
        <textarea id={`${id}-ori`} className="input" aria-describedby={`${id}-ori-dica`} maxLength={1000} value={valor.orientacao}
          onChange={(e) => mudar({ orientacao: e.target.value })} placeholder="Ex.: Assista e anote duas ideias para testar com a turma." />
      </div>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-dur`}>Tempo estimado (min)</label>
          <input id={`${id}-dur`} className="input" type="number" inputMode="numeric" min={1} max={600} value={valor.duracao}
            onChange={(e) => mudar({ duracao: e.target.value })} placeholder="20" />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-mod`}>Módulo</label>
          <select id={`${id}-mod`} className="input" value={valor.moduloId} onChange={(e) => mudar({ moduloId: e.target.value })}>
            <option value="">Sem módulo</option>
            {modulos.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
          </select>
        </div>
      </div>
      <label className="trilha-check trilha-check-form" data-marcado={valor.obrigatoria}>
        <input type="checkbox" checked={valor.obrigatoria} onChange={(e) => mudar({ obrigatoria: e.target.checked })} />
        <span className="trilha-check-caixa" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
        Etapa obrigatória (conta no progresso do cursista)
      </label>
    </>
  );
}

const comuns = (v: { orientacao: string; duracao: string; moduloId: string; obrigatoria: boolean }): DadosEtapa => ({
  orientacao: v.orientacao.trim() || undefined,
  duracaoMin: v.duracao ? Number(v.duracao) : undefined,
  moduloId: v.moduloId || null,
  obrigatoria: v.obrigatoria,
});

function FormEtapa({ formacaoId, modulos, podeAprovar, ocupado, noAcervo, aoCancelar, aoEnviar }: {
  formacaoId: string; modulos: Modulo[]; podeAprovar: boolean; ocupado: boolean; noAcervo: Set<string>;
  aoCancelar: () => void; aoEnviar: (dados: unknown) => Promise<string | null>;
}) {
  const id = useId();
  const [origem, setOrigem] = useState<'novo' | 'acervo'>('novo');
  const [tipo, setTipo] = useState<TipoRecurso>('VIDEO');
  const [recurso, setRecurso] = useState({ titulo: '', url: '', autoria: '', licenca: '' });
  const [materialId, setMaterialId] = useState('');
  const [acervo, setAcervo] = useState<MaterialAcervo[] | null>(null);
  const [c, setC] = useState({ orientacao: '', duracao: '', moduloId: '', obrigatoria: true });
  const [erro, setErro] = useState<string | null>(null);
  const primeiro = useRef<HTMLButtonElement>(null);

  useEffect(() => { primeiro.current?.focus(); }, []);
  useEffect(() => {
    if (origem !== 'acervo' || acervo) return;
    api.get<MaterialAcervo[]>('/materiais')
      .then((l) => setAcervo(l.filter((m) => m.status === 'APROVADO')))
      .catch(() => setAcervo([]));
  }, [origem, acervo]);

  const midia = recurso.url.trim() ? reconhecerMidia(recurso.url.trim()) : null;
  const retorno = recurso.url.trim() ? (midia ? descreverMidia(midia) : 'Use um endereço completo, começando com https://.') : null;
  const disponiveis = acervo?.filter((m) => !noAcervo.has(m.id)) ?? [];

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const base = comuns(c);
    const dados = origem === 'acervo'
      ? { ...base, materialId }
      : { ...base, recurso: { tipo, titulo: recurso.titulo.trim(), url: recurso.url.trim(), autoria: recurso.autoria.trim() || undefined, licenca: recurso.licenca.trim() || undefined } };
    setErro(await aoEnviar(dados));
  }

  return (
    <form className="trilha-form" onSubmit={enviar} aria-labelledby={`${id}-titulo`} data-formacao={formacaoId}>
      <div className="trilha-form-topo">
        <h3 id={`${id}-titulo`} className="trilha-form-titulo">Nova etapa da trilha</h3>
        <div className="seg" role="group" aria-label="De onde vem o recurso">
          <button ref={primeiro} type="button" aria-pressed={origem === 'novo'} onClick={() => setOrigem('novo')}>
            <Plus size={16} aria-hidden="true" /> Recurso novo
          </button>
          <button type="button" aria-pressed={origem === 'acervo'} onClick={() => setOrigem('acervo')}>
            <Library size={16} aria-hidden="true" /> Do acervo da rede
          </button>
        </div>
      </div>

      {origem === 'novo' ? (
        <>
          <fieldset className="trilha-tipos">
            <legend className="label">Tipo de recurso</legend>
            <div className="seg">
              {TIPOS_RECURSO_TRILHA.map((t) => {
                const I = ICONE[t];
                return (
                  <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
                    <I size={16} aria-hidden="true" /> {MATERIAL_TIPO_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor={`${id}-tit`}>Título</label>
            <input id={`${id}-tit`} className="input" required minLength={2} maxLength={160} value={recurso.titulo}
              onChange={(e) => setRecurso({ ...recurso, titulo: e.target.value })}
              placeholder={tipo === 'PODCAST' ? 'Ex.: Alfabetizar e letrar: um processo contínuo' : tipo === 'VIDEO' ? 'Ex.: Leitura compartilhada na prática' : 'Ex.: Orientações curriculares da rede'} />
          </div>
          <div>
            <label className="label" htmlFor={`${id}-url`}>Endereço (link)</label>
            <span className="hint" id={`${id}-url-dica`}>{DICA_URL[tipo]}</span>
            <input id={`${id}-url`} className="input" type="url" required inputMode="url" value={recurso.url}
              aria-describedby={`${id}-url-dica ${id}-url-retorno`}
              onChange={(e) => setRecurso({ ...recurso, url: e.target.value })} placeholder="https://" />
            <p id={`${id}-url-retorno`} className="trilha-retorno" data-ok={!!midia} aria-live="polite">{retorno}</p>
          </div>
          <div className="trilha-form-linha">
            <div>
              <label className="label" htmlFor={`${id}-aut`}>Autoria <span className="muted">(opcional)</span></label>
              <input id={`${id}-aut`} className="input" maxLength={160} value={recurso.autoria}
                onChange={(e) => setRecurso({ ...recurso, autoria: e.target.value })} placeholder="Quem produziu" />
            </div>
            <div>
              <label className="label" htmlFor={`${id}-lic`}>Licença <span className="muted">(opcional)</span></label>
              <input id={`${id}-lic`} className="input" maxLength={80} value={recurso.licenca}
                onChange={(e) => setRecurso({ ...recurso, licenca: e.target.value })} placeholder="Ex.: CC BY 4.0" />
            </div>
          </div>
          <Note tom="info">
            {podeAprovar
              ? 'Recurso novo entra no acervo em revisão. Você pode aprovar logo depois de adicionar; até lá, os cursistas não veem a etapa.'
              : 'Recurso novo entra no acervo em revisão. Os cursistas veem a etapa depois que a curadoria aprovar.'}
          </Note>
        </>
      ) : (
        <div>
          <label className="label" htmlFor={`${id}-mat`}>Material aprovado</label>
          {acervo === null ? (
            <div className="skeleton" style={{ height: 44, borderRadius: 'var(--radius-xl)' }} aria-hidden="true" />
          ) : disponiveis.length ? (
            <select id={`${id}-mat`} className="input" required value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              <option value="">Escolha um material</option>
              {disponiveis.map((m) => <option key={m.id} value={m.id}>{MATERIAL_TIPO_LABELS[m.tipo] ?? m.tipo} · {m.titulo}</option>)}
            </select>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              Todos os materiais aprovados já estão na trilha, ou o acervo ainda não tem materiais aprovados. Use um recurso novo.
            </p>
          )}
        </div>
      )}

      <CamposComuns valor={c} mudar={(v) => setC({ ...c, ...v })} modulos={modulos} />

      {erro && <Note tom="danger">{erro}</Note>}
      <div className="trilha-form-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado || (origem === 'acervo' && !materialId)}>
          {ocupado ? 'Adicionando...' : 'Adicionar à trilha'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={aoCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function FormEdicao({ etapa, modulos, ocupado, aoCancelar, aoSalvar }: {
  etapa: EtapaTrilha; modulos: Modulo[]; ocupado: boolean;
  aoCancelar: () => void; aoSalvar: (dados: DadosEtapa & { titulo: string }) => Promise<void>;
}) {
  const id = useId();
  const [titulo, setTitulo] = useState(etapa.titulo);
  const [c, setC] = useState({
    orientacao: etapa.orientacao ?? '', duracao: etapa.duracaoMin ? String(etapa.duracaoMin) : '',
    moduloId: etapa.modulo?.id ?? '', obrigatoria: etapa.obrigatoria,
  });
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { campo.current?.focus(); }, []);

  return (
    <form className="trilha-form trilha-form-edicao" aria-label={`Editar a etapa ${etapa.titulo}`}
      onSubmit={(ev) => {
        ev.preventDefault();
        // Na edicao, apagar o campo limpa o valor (null), em vez de manter o anterior.
        const base = comuns(c);
        void aoSalvar({ ...base, titulo: titulo.trim(), orientacao: c.orientacao.trim(), duracaoMin: base.duracaoMin ?? null });
      }}>
      <div>
        <label className="label" htmlFor={`${id}-tit`}>Título da etapa</label>
        <input ref={campo} id={`${id}-tit`} className="input" required minLength={2} maxLength={160} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <CamposComuns valor={c} mudar={(v) => setC({ ...c, ...v })} modulos={modulos} />
      <div className="trilha-form-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Salvando...' : 'Salvar etapa'}</button>
        <button type="button" className="btn btn-ghost" onClick={aoCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
