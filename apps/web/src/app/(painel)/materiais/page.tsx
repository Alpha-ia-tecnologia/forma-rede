'use client';
// Materiais: o acervo da rede. Quem cadastra registra autoria, licenca e link; quem
// aprova ve primeiro a fila "Aguardando sua revisao". So o que esta aprovado chega
// as formacoes (trilha, colecao) e a IA, por isso decidir pede confirmacao em linha:
// aprovar diz o que muda (e avisa se falta link ou licenca), recusar pede o motivo que
// quem cadastrou vai ler. O resultado fica no lugar do item, com o foco nele.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CircleCheck, ExternalLink, Library, Plus, TriangleAlert } from 'lucide-react';
import { MATERIAL_STATUS_LABELS, MATERIAL_TIPOS, MATERIAL_TIPO_LABELS, type MaterialTipo } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { linkWeb, plural } from '../../../lib/texto';
import { PageHeader, StatusBadge, Note, EmptyState, ListSkeleton, ErroCarga, type Tom } from '../ui';

interface MaterialRow {
  id: string; titulo: string; tipo: string; url?: string | null; autoria?: string | null; licenca?: string | null;
  tags: string[]; status: string; formacoes: { formacao: { id: string; titulo: string } }[];
  motivoRecusa?: string | null;
}

const TOM: Record<string, Tom> = { APROVADO: 'good', EM_REVISAO: 'warn', REJEITADO: 'danger', RASCUNHO: 'neutral' };
const FILTROS = ['TODOS', 'APROVADO', 'EM_REVISAO', 'REJEITADO'] as const;
const linkSeguro = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export default function MateriaisPage() {
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const [filtro, setFiltro] = useState<string>('TODOS');
  const [criando, setCriando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Decididos nesta visita continuam na fila (nada pula de lugar), com o resultado.
  const [decididos, setDecididos] = useState<Record<string, 'APROVADO' | 'REJEITADO'>>({});
  const user = getUser();
  const pode = (p: string) => !!user && (user.permissions.includes('*') || user.permissions.includes(p));

  function carregar() {
    setErroCarga(null);
    api.get<MaterialRow[]>('/materiais').then(setRows)
      .catch((e) => setErroCarga(e instanceof Error ? e.message : 'Não foi possível carregar o acervo.'));
  }
  useEffect(carregar, []);

  const fila = (rows ?? []).filter((m) => m.status === 'EM_REVISAO' || decididos[m.id]);
  const aRevisar = fila.filter((m) => !decididos[m.id]).length;
  const filtradas = (rows ?? []).filter((m) => filtro === 'TODOS' || m.status === filtro);
  const aprova = pode('material:aprovar');

  return (
    <div>
      <PageHeader titulo="Materiais" descricao="O acervo da rede. Só os materiais aprovados chegam às formações e à IA.">
        {pode('material:create') && !criando && (
          <button type="button" className="btn btn-primary" onClick={() => { setCriando(true); setAviso(null); }}>
            <Plus size={18} aria-hidden="true" /> Cadastrar material
          </button>
        )}
      </PageHeader>

      {criando && <NovoMaterial aoFechar={(titulo) => { setCriando(false); if (titulo) { setAviso(`“${titulo}” cadastrado e enviado para revisão.`); carregar(); } }} />}
      {aviso && <Note tom="ok">{aviso}</Note>}
      {erroCarga && <ErroCarga mensagem={erroCarga} aoTentar={carregar} />}

      {rows === null ? (
        !erroCarga && <ListSkeleton linhas={3} altura={72} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Library size={26} />} titulo="O acervo ainda está vazio"
          descricao="Cadastre materiais com autoria, licença e link; depois da revisão eles podem entrar nas trilhas das formações."
          acao={pode('material:create') && <button type="button" className="btn btn-primary" onClick={() => setCriando(true)}>Cadastrar material</button>} />
      ) : (
        <>
          {aprova && fila.length > 0 && (
            <section className="fsec" aria-labelledby="fila-revisao">
              <div className="fsec-head">
                <div>
                  <h2 id="fila-revisao" className="section-title">Aguardando sua revisão</h2>
                  <p className="fsec-lead">
                    {aRevisar
                      ? `${plural(aRevisar, 'material espera', 'materiais esperam')} a curadoria. Confira autoria, licença e o link antes de aprovar.`
                      : 'Nada mais esperando a sua revisão.'}
                  </p>
                </div>
              </div>
              <ul className="fsec-lista">
                {fila.map((m) => (
                  <ItemRevisao key={m.id} m={m} principal={m.id === fila.find((x) => !decididos[x.id])?.id}
                    decidido={decididos[m.id]}
                    aoDecidir={(r) => { setDecididos((d) => ({ ...d, [m.id]: r })); carregar(); }} />
                ))}
              </ul>
            </section>
          )}

          <section className="fsec" aria-labelledby="acervo">
            <div className="fsec-head">
              <div>
                <h2 id="acervo" className="section-title">Acervo</h2>
                <p className="fsec-lead">{plural(rows.length, 'material', 'materiais')}</p>
              </div>
              <div className="seg" role="group" aria-label="Filtrar por situação">
                {FILTROS.map((f) => (
                  <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                    {f === 'TODOS' ? 'Todos' : MATERIAL_STATUS_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
            {filtradas.length === 0 ? (
              <p className="fsec-vazio">Nenhum material nesta situação.</p>
            ) : (
              <ul className="fsec-lista">
                {filtradas.map((m) => (
                  <li key={m.id} className="fitem fitem-linha">
                    <div>
                      <ItemMaterial m={m} />
                      {m.status === 'REJEITADO' && m.motivoRecusa && <p className="fitem-texto">Motivo da recusa: {m.motivoRecusa}</p>}
                    </div>
                    <StatusBadge tom={TOM[m.status] ?? 'neutral'}>{MATERIAL_STATUS_LABELS[m.status] ?? m.status}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Um material da fila de curadoria. Aprovar e recusar abrem a confirmacao no proprio item:
 * aprovar diz o que muda e avisa o que falta conferir; recusar pede o motivo.
 */
function ItemRevisao({ m, principal, decidido, aoDecidir }: {
  m: MaterialRow; principal: boolean;
  decidido?: 'APROVADO' | 'REJEITADO';
  aoDecidir: (r: 'APROVADO' | 'REJEITADO') => void;
}) {
  const id = useId();
  const [acao, setAcao] = useState<'aprovar' | 'recusar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const resultado = useRef<HTMLParagraphElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (decidido) resultado.current?.focus(); }, [decidido]);
  useEffect(() => { if (acao) painel.current?.querySelector<HTMLElement>('textarea, button')?.focus(); }, [acao]);

  const semLink = !linkSeguro(m.url);
  const semLicenca = !m.licenca;
  const formacoes = m.formacoes.length;

  async function decidir() {
    if (acao === 'recusar' && motivo.trim().length < 3) {
      setErro('Diga em poucas palavras por que está recusando; quem cadastrou vai ler.');
      return;
    }
    setErro(null);
    setOcupado(true);
    try {
      await api.post(`/materiais/${m.id}/decisao`, acao === 'aprovar' ? { aprovar: true } : { aprovar: false, motivo: motivo.trim() });
      aoDecidir(acao === 'aprovar' ? 'APROVADO' : 'REJEITADO');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a decisão. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li className="fitem" data-decisao={decidido ?? acao ?? undefined}>
      <div className="fitem-linha cur-linha">
        <ItemMaterial m={m} />
        {!decidido && !acao && (
          <div className="fitem-acoes" style={{ marginTop: 0 }}>
            <button type="button" className={principal ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setAcao('aprovar')}>
              Aprovar<span className="sr-only">: {m.titulo}</span>
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAcao('recusar')}>
              Recusar<span className="sr-only">: {m.titulo}</span>
            </button>
          </div>
        )}
      </div>

      {decidido ? (
        <p ref={resultado} tabIndex={-1} className="cur-resultado" data-tom={decidido === 'APROVADO' ? 'ok' : 'recusa'}>
          <CircleCheck size={18} aria-hidden="true" />
          {decidido === 'APROVADO'
            ? 'Aprovado. Já pode entrar nas trilhas e nas coleções, e a IA passa a usá-lo como fonte.'
            : 'Recusado. O motivo aparece para quem cadastrou, no acervo.'}
        </p>
      ) : acao && (
        <div ref={painel} className="cur-confirma" data-acao={acao}>
          {acao === 'aprovar' ? (
            <>
              <p className="sobre-texto">
                Ao aprovar, <strong>{m.titulo}</strong> passa a poder entrar nas trilhas e nas coleções, e a IA passa a usá-lo como fonte
                {formacoes > 0 ? `; ${plural(formacoes, 'formação já o tem na coleção e passa', 'formações já o têm na coleção e passam')} a mostrá-lo` : ''}.
              </p>
              {(semLink || semLicenca) && (
                <p className="cur-falta">
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span>
                    {semLink && semLicenca ? 'Sem link e sem licença: não dá para conferir o conteúdo nem se a rede pode usá-lo.'
                      : semLink ? 'Sem link: não dá para conferir o conteúdo antes de aprovar.'
                        : 'Sem licença informada: confirme se a rede pode usar este material.'}
                  </span>
                </p>
              )}
            </>
          ) : (
            <div>
              <label className="label" htmlFor={`${id}-motivo`}>Por que recusar? <span className="muted">(quem cadastrou vai ler)</span></label>
              <textarea id={`${id}-motivo`} className="input" rows={2} maxLength={500} value={motivo}
                aria-invalid={!!erro || undefined} aria-describedby={erro ? `${id}-erro` : undefined}
                onChange={(e) => { setMotivo(e.target.value); setErro(null); }}
                placeholder="Ex.: o link não abre; falta a licença de uso" />
            </div>
          )}
          {erro && <p className="campo-erro" id={`${id}-erro`} role="alert">{erro}</p>}
          <div className="fform-acoes">
            <button type="button" className={acao === 'aprovar' ? 'btn btn-primary' : 'btn btn-danger'} disabled={ocupado} onClick={decidir}>
              {ocupado ? 'Registrando...' : acao === 'aprovar' ? (semLink || semLicenca ? 'Aprovar mesmo assim' : 'Sim, aprovar') : 'Recusar com este motivo'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => { setAcao(null); setErro(null); }}>Voltar</button>
          </div>
        </div>
      )}
    </li>
  );
}

function ItemMaterial({ m }: { m: MaterialRow }) {
  const link = linkSeguro(m.url);
  return (
    <div>
      <h3 className="fitem-titulo">
        {link ? (
          <a className="mf-titulo-grande" href={link} target="_blank" rel="noopener noreferrer">
            {m.titulo} <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span>
          </a>
        ) : m.titulo}
      </h3>
      <p className="fitem-meta">
        <span>{MATERIAL_TIPO_LABELS[m.tipo as MaterialTipo] ?? m.tipo}</span>
        {m.autoria && <span>{m.autoria}</span>}
        <span>{m.licenca ?? 'sem licença informada'}</span>
        {m.formacoes.length > 0 && <span>em {plural(m.formacoes.length, 'formação', 'formações')}</span>}
        {!link && <span>sem link para conferir</span>}
      </p>
    </div>
  );
}

function NovoMaterial({ aoFechar }: { aoFechar: (titulo: string | null) => void }) {
  const id = useId();
  const [v, setV] = useState({ titulo: '', tipo: 'DOCUMENTO', url: '', autoria: '', licenca: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (v.titulo.trim().length < 2) {
      setErro('Dê um título ao material (ao menos duas letras).');
      return;
    }
    const url = linkWeb(v.url);
    if (url === null) {
      setErro('Este link não parece um endereço da internet. Confira se copiou o link inteiro.');
      return;
    }
    setErro(null);
    setOcupado(true);
    try {
      await api.post('/materiais', {
        titulo: v.titulo.trim(), tipo: v.tipo, url: url || undefined,
        autoria: v.autoria.trim() || undefined, licenca: v.licenca.trim() || undefined, tags: [],
      });
      aoFechar(v.titulo.trim());
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível cadastrar.');
      setOcupado(false);
    }
  }

  return (
    <form className="fform fform-destaque" onSubmit={criar} aria-labelledby={`${id}-t`} noValidate>
      <h2 id={`${id}-t`} className="trilha-form-titulo">Cadastrar material</h2>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-tit`}>Título</label>
          <input id={`${id}-tit`} className="input" required minLength={2} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-tipo`}>Tipo</label>
          <select id={`${id}-tipo`} className="input" value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value })}>
            {MATERIAL_TIPOS.map((t) => <option key={t} value={t}>{MATERIAL_TIPO_LABELS[t]}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${id}-url`}>Link <span className="muted">(opcional)</span></label>
        <span className="hint" id={`${id}-url-dica`}>Vídeo, PDF, podcast ou página; cole o endereço como está.</span>
        <input id={`${id}-url`} className="input" type="url" inputMode="url" aria-describedby={`${id}-url-dica`} value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" />
      </div>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-aut`}>Autoria</label>
          <input id={`${id}-aut`} className="input" value={v.autoria} onChange={(e) => setV({ ...v, autoria: e.target.value })} placeholder="Quem produziu" />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-lic`}>Licença</label>
          <input id={`${id}-lic`} className="input" value={v.licenca} onChange={(e) => setV({ ...v, licenca: e.target.value })} placeholder="Ex.: CC BY 4.0" />
        </div>
      </div>
      <Note tom="info">O material entra no acervo em revisão; depois de aprovado, pode ir para as trilhas e a coleção das formações.</Note>
      {erro && <Note tom="danger">{erro}</Note>}
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Cadastrando...' : 'Cadastrar'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => aoFechar(null)}>Cancelar</button>
      </div>
    </form>
  );
}
