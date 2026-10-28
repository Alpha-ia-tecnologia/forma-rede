'use client';
// Formadores do municipio (curadoria: formador:alocar e formador:convidar). Tres partes:
// - turmas sem formador (ninguem conduz a chamada e as entregas delas), com a alocacao ali;
// - os formadores e as turmas de cada um, com "Alocar em turmas";
// - os links de cadastro: a pessoa cria a conta pelo link e entra como formador (ja nas
//   turmas do link, se houver). O link vale ate a data escolhida e pode ser desativado.
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Copy, Link2, UserPlus } from 'lucide-react';
import { VALIDADES_CONVITE } from '@formarede/contracts';
import type { ConviteFormador, FormadorRede, TurmaAlocacao, TurmaRef } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { fmtData, quando } from '../../../lib/datas';
import { plural } from '../../../lib/texto';
import { ErroCarga, ListSkeleton, Note, PageHeader, StatusBadge, type Tom } from '../ui';
import { AlocarTurma, EscolhaTurmas } from './alocacao';

const msg = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);
const SITUACAO: Record<ConviteFormador['situacao'], { texto: string; tom: Tom }> = {
  ATIVO: { texto: 'Ativo', tom: 'good' }, EXPIRADO: { texto: 'Expirado', tom: 'neutral' }, DESATIVADO: { texto: 'Desativado', tom: 'neutral' },
};
const nomeTurma = (t: TurmaRef) => `${t.nome} (${t.formacao.titulo})`;
const linkDe = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/cadastro/formador/${token}`;

export default function FormadoresPage() {
  const user = getUser();
  const pode = (p: string) => !!user && (user.permissions.includes('*') || user.permissions.includes(p));
  const [formadores, setFormadores] = useState<FormadorRede[] | null>(null);
  const [turmas, setTurmas] = useState<TurmaAlocacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(() => {
    setErro(null);
    return Promise.all([api.get<FormadorRede[]>('/formadores'), api.get<TurmaAlocacao[]>('/turmas')])
      .then(([f, t]) => { setFormadores(f); setTurmas(t); })
      .catch((e) => setErro(msg(e, 'Não foi possível carregar os formadores.')));
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  // A turma alocada sai da lista de pendentes: o foco vai para os formadores, onde ela aparece.
  const focarFormadores = () => requestAnimationFrame(() => document.getElementById('formadores-titulo')?.focus());

  const abertas = (turmas ?? []).filter((t) => !t.encerrada);
  const semFormador = abertas.filter((t) => !t.formadores.length);

  function gerarLink() {
    setGerando(true);
    requestAnimationFrame(() => document.getElementById('links')?.scrollIntoView({ block: 'start' }));
  }

  return (
    <div>
      <PageHeader titulo="Formadores" descricao="Quem conduz as turmas do município. Cada formador vê e conduz só as turmas em que você o alocar.">
        {pode('formador:convidar') && (
          <button type="button" className="btn btn-primary" onClick={gerarLink}>
            <UserPlus size={18} aria-hidden="true" /> Gerar link de cadastro
          </button>
        )}
      </PageHeader>
      <p className="sr-only" role="status">{aviso}</p>

      {erro ? <ErroCarga mensagem={erro} aoTentar={() => void carregar()} />
        : !formadores || !turmas ? <ListSkeleton linhas={3} altura={96} />
          : (
            <>
              {semFormador.length > 0 && (
                <section id="sem-formador" className="fsec" aria-labelledby="sem-formador-titulo">
                  <div className="fsec-head">
                    <div>
                      <h2 id="sem-formador-titulo" className="section-title">{plural(semFormador.length, 'turma sem formador', 'turmas sem formador')}</h2>
                      <p className="fsec-lead">Ninguém faz a chamada nem dá devolutiva {semFormador.length === 1 ? 'nela' : 'nelas'} até alguém ser alocado.</p>
                    </div>
                  </div>
                  <ul className="fsec-lista">
                    {semFormador.map((t) => (
                      <TurmaSemFormador key={t.id} turma={t} aoAlocar={(nomes) => { setAviso(`${nomes} agora conduz ${t.nome}.`); void carregar().then(focarFormadores); }} />
                    ))}
                  </ul>
                </section>
              )}

              <section id="formadores" className="fsec" aria-labelledby="formadores-titulo">
                <div className="fsec-head">
                  <div>
                    <h2 id="formadores-titulo" className="section-title" tabIndex={-1}>Formadores da rede</h2>
                    <p className="fsec-lead">{formadores.length ? plural(formadores.length, 'formador', 'formadores') : 'Ninguém com o perfil de formador ainda.'}</p>
                  </div>
                </div>
                {!formadores.length ? (
                  <p className="fsec-vazio">
                    Gere um link de cadastro e envie a quem vai conduzir: a pessoa cria a conta com o próprio e-mail e aparece aqui.
                  </p>
                ) : (
                  <ul className="fsec-lista">
                    {formadores.map((f) => (
                      <ItemFormador key={f.id} formador={f} abertas={abertas}
                        aoMudar={(texto) => { setAviso(texto); void carregar(); }} />
                    ))}
                  </ul>
                )}
              </section>

              {pode('formador:convidar') && (
                <LinksCadastro turmas={abertas} gerando={gerando} setGerando={setGerando} aoAvisar={setAviso} />
              )}
            </>
          )}
    </div>
  );
}

function TurmaSemFormador({ turma, aoAlocar }: { turma: TurmaAlocacao; aoAlocar: (nomes: string) => void }) {
  const [alocando, setAlocando] = useState(false);
  return (
    <li className="fitem">
      <div className="fitem-topo">
        <h3 className="fitem-titulo">{turma.nome}</h3>
        <StatusBadge tom="warn">Sem formador</StatusBadge>
      </div>
      <p className="fitem-meta">
        <span>{turma.formacao.titulo}</span>
        <span>{plural(turma.inscritos, 'cursista inscrito', 'cursistas inscritos')}</span>
      </p>
      {alocando ? (
        <AlocarTurma turma={turma} atuais={[]} aoFechar={(alocados) => {
          setAlocando(false);
          if (alocados?.length) aoAlocar(alocados.map((a) => a.nome).join(', '));
        }} />
      ) : (
        <div className="fitem-acoes">
          <button type="button" className="btn btn-primary" onClick={() => setAlocando(true)}>Alocar formador</button>
        </div>
      )}
    </li>
  );
}

function ItemFormador({ formador, abertas, aoMudar }: {
  formador: FormadorRede;
  abertas: TurmaAlocacao[];
  aoMudar: (aviso: string) => void;
}) {
  const id = useId();
  const [editando, setEditando] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const aberto = useRef(false);
  useEffect(() => {
    if (editando) { aberto.current = true; titulo.current?.focus(); }
    else if (aberto.current) botao.current?.focus();
  }, [editando]);
  // As turmas em andamento e as que ele ja conduz (mesmo de formacao encerrada).
  const opcoes: TurmaRef[] = [...abertas, ...formador.turmas.filter((t) => !abertas.some((a) => a.id === t.id))];

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      const f = await api.put<FormadorRede>(`/formadores/${formador.id}/turmas`, { turmaIds: marcadas });
      setEditando(false);
      aoMudar(f.turmas.length ? `${formador.nome} conduz ${plural(f.turmas.length, 'turma', 'turmas')}.` : `${formador.nome} ficou sem turma.`);
    } catch (e) {
      setErro(msg(e, 'Não foi possível salvar as turmas.'));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li className="fitem">
      <div className="fitem-topo">
        <h3 className="fitem-titulo">{formador.nome}</h3>
        {!formador.turmas.length && <StatusBadge tom="warn">Sem turma</StatusBadge>}
      </div>
      <p className="fitem-meta">
        <span>{formador.email}</span>
        <span>Na rede desde {fmtData(formador.desde)}</span>
      </p>
      <p className="fitem-texto">
        {formador.turmas.length
          ? <>Conduz {formador.turmas.map(nomeTurma).join('; ')}.</>
          : 'Ainda não vê nenhuma formação: aloque em uma turma para começar.'}
      </p>
      {editando ? (
        <form className="fform" onSubmit={salvar} aria-labelledby={`${id}-t`}>
          <h4 ref={titulo} id={`${id}-t`} className="trilha-form-titulo" tabIndex={-1}>Turmas de {formador.nome}</h4>
          <EscolhaTurmas turmas={opcoes} marcadas={marcadas} aoMudar={setMarcadas} legenda="Marque as turmas que conduz" />
          {erro && <Note tom="danger">{erro}</Note>}
          <div className="fform-acoes">
            <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Salvando...' : 'Salvar'}</button>
            <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => { setEditando(false); setErro(null); }}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="fitem-acoes">
          <button ref={botao} type="button" className="btn btn-secondary"
            onClick={() => { setMarcadas(formador.turmas.map((t) => t.id)); setEditando(true); }}>
            Alocar em turmas
          </button>
        </div>
      )}
    </li>
  );
}

// ---------- Links de cadastro ----------

function LinksCadastro({ turmas, gerando, setGerando, aoAvisar }: {
  turmas: TurmaRef[];
  gerando: boolean;
  setGerando: (v: boolean) => void;
  aoAvisar: (texto: string) => void;
}) {
  const [lista, setLista] = useState<ConviteFormador[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState<string | null>(null);

  useEffect(() => {
    api.get<ConviteFormador[]>('/convites').then(setLista).catch((e) => setErro(msg(e, 'Não foi possível carregar os links.')));
  }, []);
  // O link recem-gerado ganha o foco no botao de copiar.
  useEffect(() => {
    if (novo) document.querySelector<HTMLButtonElement>(`#link-${novo} .link-copiar`)?.focus();
  }, [novo]);

  const ativos = (lista ?? []).filter((c) => c.situacao === 'ATIVO');
  const outros = (lista ?? []).filter((c) => c.situacao !== 'ATIVO');

  return (
    <section id="links" className="fsec" aria-labelledby="links-titulo">
      <div className="fsec-head">
        <div>
          <h2 id="links-titulo" className="section-title" tabIndex={-1}>Links de cadastro</h2>
          <p className="fsec-lead">
            Envie o link a quem vai conduzir: a pessoa cria a conta com o próprio e-mail e entra como formador.
            O link vale até a data escolhida e pode ser desativado a qualquer momento.
          </p>
        </div>
        {!gerando && (
          <button type="button" className="btn btn-secondary" onClick={() => setGerando(true)}>
            <Link2 size={18} aria-hidden="true" /> Gerar link
          </button>
        )}
      </div>

      {gerando && (
        <NovoLink turmas={turmas} aoFechar={(c) => {
          setGerando(false);
          if (c) {
            setLista((l) => [c, ...(l ?? [])]);
            setNovo(c.id);
            aoAvisar('Link gerado. Copie e envie a quem vai conduzir.');
          }
        }} />
      )}

      {erro ? <Note tom="danger">{erro}</Note>
        : !lista ? <ListSkeleton linhas={1} altura={120} />
          : (
            <>
              {ativos.length > 0 ? (
                <ul className="fsec-lista">
                  {ativos.map((c) => (
                    <ItemLink key={c.id} c={c} novo={novo === c.id}
                      aoDesativar={(l) => {
                        setLista(l);
                        aoAvisar('Link desativado.');
                        // O item vai para os desativados (recolhidos): o foco volta ao titulo da secao.
                        requestAnimationFrame(() => document.getElementById('links-titulo')?.focus());
                      }} />
                  ))}
                </ul>
              ) : !gerando && <p className="fsec-vazio">Nenhum link ativo. Gere um e envie a quem vai conduzir.</p>}
              {outros.length > 0 && (
                <details className="devol-resolvidas">
                  <summary>{plural(outros.length, 'link expirado ou desativado', 'links expirados ou desativados')}</summary>
                  <ul className="fsec-lista">
                    {outros.map((c) => <ItemLink key={c.id} c={c} novo={false} aoDesativar={setLista} />)}
                  </ul>
                </details>
              )}
            </>
          )}
    </section>
  );
}

function ItemLink({ c, novo, aoDesativar }: {
  c: ConviteFormador;
  novo: boolean;
  aoDesativar: (lista: ConviteFormador[]) => void;
}) {
  const id = useId();
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const confirmar = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmando) confirmar.current?.focus(); }, [confirmando]);
  const s = SITUACAO[c.situacao];
  const ativo = c.situacao === 'ATIVO';
  const url = linkDe(c.token);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Sem acesso a area de transferencia: o link fica selecionado para copiar a mao.
      campo.current?.select();
      document.execCommand?.('copy');
    }
    setCopiado(true);
  }

  async function desativar() {
    setOcupado(true);
    setErro(null);
    try {
      aoDesativar(await api.post<ConviteFormador[]>(`/convites/${c.id}/desativar`, {}));
    } catch (e) {
      setErro(msg(e, 'Não foi possível desativar o link.'));
      setOcupado(false);
    }
  }

  return (
    <li id={`link-${c.id}`} className="fitem" data-novo={novo || undefined}>
      <div className="fitem-topo">
        <h3 className="fitem-titulo">{novo ? 'Link novo' : `Link de ${fmtData(c.criadoEm)}`}</h3>
        <StatusBadge tom={s.tom}>{s.texto}</StatusBadge>
      </div>
      <p className="fitem-meta">
        <span>{ativo ? `Vale até ${fmtData(c.expiraEm)} (${quando(c.expiraEm)})` : c.desativadoEm ? `Desativado em ${fmtData(c.desativadoEm)}` : `Expirou em ${fmtData(c.expiraEm)}`}</span>
        <span>{c.cadastros ? plural(c.cadastros, 'cadastro', 'cadastros') : 'Nenhum cadastro ainda'}</span>
        {c.criadoPor && <span>Gerado por {c.criadoPor}</span>}
      </p>
      <p className="fitem-texto">
        {c.turmas.length
          ? <>Quem se cadastrar já conduz {c.turmas.map(nomeTurma).join('; ')}.</>
          : 'Sem turma: você aloca a pessoa depois que ela se cadastrar.'}
      </p>
      {ativo && (
        <div className="link-copia">
          <label className="sr-only" htmlFor={`${id}-url`}>Link de cadastro</label>
          <input ref={campo} id={`${id}-url`} className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-secondary link-copiar" onClick={() => void copiar()}>
            <Copy size={18} aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      )}
      {copiado && <p className="sr-only" role="status">Link copiado.</p>}
      {ativo && (confirmando ? (
        <div className="encerrar-confirma" role="alert">
          <p>Desativar? Quem ainda não se cadastrou não consegue mais usar este link; quem já se cadastrou continua.</p>
          <div className="fform-acoes">
            <button ref={confirmar} type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void desativar()}>
              {ocupado ? 'Desativando...' : 'Desativar o link'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setConfirmando(false)}>Manter ativo</button>
          </div>
        </div>
      ) : (
        <div className="fitem-acoes">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmando(true)}>Desativar</button>
        </div>
      ))}
      {erro && <Note tom="danger">{erro}</Note>}
    </li>
  );
}

function NovoLink({ turmas, aoFechar }: { turmas: TurmaRef[]; aoFechar: (c: ConviteFormador | null) => void }) {
  const id = useId();
  const [validade, setValidade] = useState<number>(7);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, []);

  async function gerar(ev: FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      aoFechar(await api.post<ConviteFormador>('/convites', { validadeDias: validade, turmaIds: marcadas }));
    } catch (e) {
      setErro(msg(e, 'Não foi possível gerar o link.'));
      setOcupado(false);
    }
  }

  return (
    <form className="fform fform-destaque" onSubmit={gerar} aria-labelledby={`${id}-t`}>
      <h3 ref={titulo} id={`${id}-t`} className="trilha-form-titulo" tabIndex={-1}>Novo link de cadastro</h3>
      <fieldset className="trilha-tipos">
        <legend className="label">Vale por</legend>
        <div className="seg">
          {VALIDADES_CONVITE.map((d) => (
            <button key={d} type="button" aria-pressed={validade === d} onClick={() => setValidade(d)}>{plural(d, 'dia', 'dias')}</button>
          ))}
        </div>
      </fieldset>
      <EscolhaTurmas turmas={turmas} marcadas={marcadas} aoMudar={setMarcadas}
        legenda="Já alocar quem se cadastrar em (opcional)" />
      {erro && <Note tom="danger">{erro}</Note>}
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Gerando...' : 'Gerar link'}</button>
        <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => aoFechar(null)}>Cancelar</button>
      </div>
    </form>
  );
}
