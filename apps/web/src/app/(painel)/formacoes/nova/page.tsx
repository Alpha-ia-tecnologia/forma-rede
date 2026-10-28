'use client';
// Assistente de criacao de formacao em 4 etapas: identificacao, estrutura
// (modalidade, cargas e modulos), turmas e revisao. A barra presa ao fim da tela oferece
// "Salvar formacao" em qualquer passo assim que o obrigatorio (o titulo) esta preenchido;
// salvo, volta para a lista de formacoes com a confirmacao. Cria a formacao e, em seguida,
// modulos e turmas; falhas parciais sao reportadas com honestidade. Quem aloca formadores
// (curadoria) ja escolhe quem conduz cada turma: o formador ve so as turmas em que esta.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MODALIDADES } from '@formarede/contracts';
import { api, getUser } from '../../../../lib/api';
import { useSaidaProtegida } from '../../../../lib/saida';
import { PageHeader, Note, Field, Icon } from '../../ui';
import { EscolhaFormadores, useFormadoresRede } from '../../formadores/alocacao';

interface ModuloDraft { titulo: string; }
interface TurmaDraft { nome: string; vagas: number; formadorIds: string[]; }

const PASSOS = ['Identificação', 'Estrutura', 'Turmas', 'Revisão'] as const;

const MODALIDADE_INFO: Record<string, { label: string; desc: string; icon: React.ReactNode }> = {
  PRESENCIAL: { label: 'Presencial', desc: 'Encontros em polo ou escola', icon: (<><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /></>) },
  HIBRIDA: { label: 'Híbrida', desc: 'Encontros presenciais + atividades remotas', icon: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /></>) },
  VIRTUAL: { label: 'Virtual', desc: 'Totalmente a distância', icon: (<><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M8 21h8" /></>) },
};

export default function NovaFormacaoPage() {
  const router = useRouter();
  const user = getUser();
  const podeCriar = !!user && (user.permissions.includes('*') || user.permissions.includes('formacao:create'));

  const [passo, setPasso] = useState(0);
  // Etapa 1 - identificacao
  const [titulo, setTitulo] = useState('');
  const [tema, setTema] = useState('');
  const [subtema, setSubtema] = useState('');
  const [publicoAlvo, setPublicoAlvo] = useState('');
  const [objetivos, setObjetivos] = useState('');
  // Etapa 2 - estrutura
  const [modalidade, setModalidade] = useState('PRESENCIAL');
  const [cargaHoraria, setCargaHoraria] = useState(40);
  const [freqMinimaPct, setFreqMinimaPct] = useState(75);
  const [modulos, setModulos] = useState<ModuloDraft[]>([]);
  const [novoModulo, setNovoModulo] = useState('');
  // Etapa 3 - turmas
  const [turmas, setTurmas] = useState<TurmaDraft[]>([]);
  const [novaTurma, setNovaTurma] = useState('');
  const [novasVagas, setNovasVagas] = useState(30);
  const [novosFormadores, setNovosFormadores] = useState<string[]>([]);
  const alocar = !!user && (user.permissions.includes('*') || user.permissions.includes('formador:alocar'));
  const { formadores } = useFormadoresRede(alocar);
  const nomesDe = (ids: string[]) => ids.map((id) => formadores?.find((f) => f.id === id)?.nome).filter(Boolean).join(', ');
  // Submissao
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  // Algo preenchido e ainda nao salvo: sair pela navegacao pergunta antes.
  const preenchido = [titulo, tema, subtema, publicoAlvo, objetivos].some((v) => v.trim() !== '') || modulos.length > 0 || turmas.length > 0;
  const saida = useSaidaProtegida(preenchido && !criando);

  if (!podeCriar) {
    return (
      <div>
        <PageHeader titulo="Nova formação" />
        <Note tom="danger">Você não tem permissão para criar formações nesta rede.</Note>
        <Link href="/formacoes" className="btn btn-ghost">Voltar para formações</Link>
      </div>
    );
  }

  const tituloOk = titulo.trim().length >= 3;
  const podeAvancar = passo !== 0 || tituloOk;

  function addModulo() {
    const t = novoModulo.trim();
    if (t.length < 2) return;
    setModulos((m) => [...m, { titulo: t }]);
    setNovoModulo('');
  }
  function addTurma() {
    const n = novaTurma.trim();
    if (n.length < 2) return;
    setTurmas((t) => [...t, { nome: n, vagas: novasVagas, formadorIds: novosFormadores }]);
    setNovaTurma('');
    setNovosFormadores([]);
  }

  async function criar() {
    setErro(null);
    setCriando(true);
    try {
      const f = await api.post<{ id: string }>('/formacoes', {
        titulo: titulo.trim(),
        tema: tema.trim() || undefined,
        subtema: subtema.trim() || undefined,
        objetivos: objetivos.trim() || undefined,
        publicoAlvo: publicoAlvo.trim() || undefined,
        cargaHoraria,
        modalidade,
        freqMinimaPct,
      });
      const falhas: string[] = [];
      for (const [i, m] of modulos.entries()) {
        try { await api.post(`/formacoes/${f.id}/modulos`, { titulo: m.titulo, ordem: i + 1 }); }
        catch { falhas.push(`módulo "${m.titulo}"`); }
      }
      for (const t of turmas) {
        try { await api.post(`/formacoes/${f.id}/turmas`, { nome: t.nome, vagas: t.vagas, formadorIds: t.formadorIds }); }
        catch { falhas.push(`turma "${t.nome}"`); }
      }
      // A lista mostra "Formacao salva" (e o que nao entrou, se algo falhou) com a nova em destaque.
      router.push(`/formacoes?salva=${f.id}${falhas.length ? `&pendente=${encodeURIComponent(falhas.join(', '))}` : ''}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar a formação.');
      setCriando(false);
    }
  }

  const chipRemovivel: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 8px 7px 13px',
    background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', fontSize: 'var(--text-xs)', fontWeight: 600,
  };
  const btnX: React.CSSProperties = {
    border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--ink-faint)',
    display: 'grid', placeItems: 'center', padding: 2, borderRadius: 6,
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader titulo="Nova formação"
        descricao="A formação nasce em andamento: depois de criada, você abre a turma, agenda os encontros e monta a trilha na página dela.">
        <Link href="/formacoes" className="btn btn-ghost">Cancelar</Link>
      </PageHeader>

      {/* Stepper: sequencia real de criacao */}
      <ol style={{ listStyle: 'none', display: 'flex', gap: 4, padding: 0, margin: '0 0 22px', flexWrap: 'wrap' }}>
        {PASSOS.map((p, i) => {
          const atual = i === passo;
          const feito = i < passo;
          return (
            <li key={p} aria-current={atual ? 'step' : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 13px', borderRadius: 'var(--pill)', fontSize: 'var(--text-xs)', fontWeight: 600, background: atual ? 'var(--accent-wash)' : 'transparent', color: atual ? 'var(--accent-deep)' : feito ? 'var(--ink-soft)' : 'var(--ink-faint)' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 'var(--text-xs)', background: feito ? 'var(--good-wash)' : atual ? 'var(--brand)' : 'var(--surface-2)', color: feito ? 'var(--good)' : atual ? 'var(--c-text-on-fill)' : 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums' }}>
                {feito ? <Icon size={12}><path d="M4.5 12.5l5 5L20 7" /></Icon> : i + 1}
              </span>
              {p}
            </li>
          );
        })}
      </ol>

      {/* Passo 1 - Identificacao */}
      {passo === 0 && (
        <section className="card" style={{ padding: 24, display: 'grid', gap: 16 }}>
          <Field label="Título da formação *">
            <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Alfabetização na Idade Certa" autoFocus />
            {!tituloOk && titulo.length > 0 && <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>Mínimo de 3 caracteres.</span>}
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <Field label="Tema">
              <input className="input" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: Práticas de leitura e escrita" />
            </Field>
            <Field label="Subtema">
              <input className="input" value={subtema} onChange={(e) => setSubtema(e.target.value)} placeholder="Ex.: Fluência leitora" />
            </Field>
          </div>
          <Field label="Público-alvo">
            <input className="input" value={publicoAlvo} onChange={(e) => setPublicoAlvo(e.target.value)} placeholder="Ex.: Professores dos anos iniciais do ensino fundamental" />
          </Field>
          <Field label="Objetivos">
            <textarea className="input" rows={4} value={objetivos} onChange={(e) => setObjetivos(e.target.value)} placeholder="O que os professores devem ser capazes de fazer ao concluir esta formação?" />
          </Field>
        </section>
      )}

      {/* Passo 2 - Estrutura */}
      {passo === 1 && (
        <section className="card" style={{ padding: 24, display: 'grid', gap: 20 }}>
          <div>
            <span className="label">Modalidade</span>
            <div role="radiogroup" aria-label="Modalidade" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {MODALIDADES.map((m) => {
                const info = MODALIDADE_INFO[m]!;
                const ativa = modalidade === m;
                return (
                  <button key={m} type="button" role="radio" aria-checked={ativa} onClick={() => setModalidade(m)}
                    style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', padding: '13px 15px', borderRadius: 'var(--r-sm)', border: `1.5px solid ${ativa ? 'var(--accent)' : 'var(--line)'}`, background: ativa ? 'var(--accent-wash)' : 'var(--surface)', transition: 'border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: ativa ? 'var(--accent-deep)' : 'var(--ink)' }}>
                      <Icon size={17}>{info.icon}</Icon>{info.label}
                    </span>
                    <span className="muted" style={{ fontSize: 'var(--text-xs)', display: 'block', marginTop: 3 }}>{info.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <Field label="Carga horária (horas)">
              <input className="input" type="number" min={0} value={cargaHoraria} onChange={(e) => setCargaHoraria(Number(e.target.value))} />
            </Field>
            <Field label="Frequência mínima para certificação (%)">
              <input className="input" type="number" min={0} max={100} value={freqMinimaPct} onChange={(e) => setFreqMinimaPct(Number(e.target.value))} />
            </Field>
          </div>

          <div>
            <span className="label">Módulos (opcional)</span>
            <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: '0 0 10px' }}>Organize o percurso em módulos; a ordem segue a lista.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1 }} value={novoModulo} onChange={(e) => setNovoModulo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addModulo(); } }}
                placeholder="Ex.: Módulo 1 - Fundamentos" />
              <button type="button" className="btn btn-subtle" onClick={addModulo} disabled={novoModulo.trim().length < 2}>Adicionar</button>
            </div>
            {modulos.length > 0 && (
              <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 6 }}>
                {modulos.map((m, i) => (
                  <li key={i} style={{ ...chipRemovivel, justifyContent: 'space-between' }}>
                    <span><span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span> {m.titulo}</span>
                    <button type="button" style={btnX} aria-label={`Remover ${m.titulo}`} onClick={() => setModulos((arr) => arr.filter((_, j) => j !== i))}>
                      <Icon size={14}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></Icon>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {/* Passo 3 - Turmas */}
      {passo === 2 && (
        <section className="card" style={{ padding: 24, display: 'grid', gap: 14 }}>
          <div>
            <span className="label">Turmas (opcional)</span>
            <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: '0 0 10px' }}>
              Crie a primeira turma agora ou depois, na página da formação. Encontros e inscrições acontecem por turma.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="input" style={{ flex: '1 1 200px' }} value={novaTurma} onChange={(e) => setNovaTurma(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTurma(); } }}
                placeholder="Ex.: Turma 2026.2" />
              <Field label="" style={{ width: 110 }}>
                <input className="input" type="number" min={0} value={novasVagas} onChange={(e) => setNovasVagas(Number(e.target.value))} aria-label="Vagas" title="Vagas" />
              </Field>
              <button type="button" className="btn btn-subtle" onClick={addTurma} disabled={novaTurma.trim().length < 2}>Adicionar</button>
            </div>
            {alocar && (
              <div style={{ marginTop: 12 }}>
                <EscolhaFormadores formadores={formadores} marcados={novosFormadores} aoMudar={setNovosFormadores}
                  legenda="Quem conduz esta turma (opcional)" />
              </div>
            )}
            {turmas.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 6 }}>
                {turmas.map((t, i) => (
                  <li key={i} style={{ ...chipRemovivel, justifyContent: 'space-between' }}>
                    <span>{t.nome} <span className="muted">· {t.vagas} vagas{t.formadorIds.length ? ` · ${nomesDe(t.formadorIds)}` : alocar ? ' · sem formador' : ''}</span></span>
                    <button type="button" style={btnX} aria-label={`Remover ${t.nome}`} onClick={() => setTurmas((arr) => arr.filter((_, j) => j !== i))}>
                      <Icon size={14}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></Icon>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Passo 4 - Revisao */}
      {passo === 3 && (
        <section className="card" style={{ padding: 24 }}>
          <h2 className="display" style={{ fontSize: 18, margin: '0 0 4px' }}>{titulo}</h2>
          {(tema || subtema) && <p className="muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>{[tema, subtema].filter(Boolean).join(' · ')}</p>}
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, margin: '18px 0 0' }}>
            {[
              ['Modalidade', MODALIDADE_INFO[modalidade]?.label ?? modalidade],
              ['Carga horária', `${cargaHoraria}h`],
              ['Frequência mínima', `${freqMinimaPct}%`],
              ['Módulos', modulos.length ? `${modulos.length}` : 'nenhum'],
              ['Turmas', turmas.length ? `${turmas.length}` : 'nenhuma'],
            ].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
                <dt className="muted" style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{k}</dt>
                <dd style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{v}</dd>
              </div>
            ))}
          </dl>
          {publicoAlvo && <p style={{ fontSize: 'var(--text-xs)', margin: '16px 0 0' }}><b>Público-alvo:</b> {publicoAlvo}</p>}
          {objetivos && <p style={{ fontSize: 'var(--text-xs)', margin: '8px 0 0', whiteSpace: 'pre-wrap' }}><b>Objetivos:</b> {objetivos}</p>}
          {modulos.length > 0 && (
            <p style={{ fontSize: 'var(--text-xs)', margin: '8px 0 0' }}><b>Módulos:</b> {modulos.map((m, i) => `${i + 1}. ${m.titulo}`).join(' · ')}</p>
          )}
          {turmas.length > 0 && (
            <p style={{ fontSize: 'var(--text-xs)', margin: '8px 0 0' }}><b>Turmas:</b> {turmas.map((t) => `${t.nome} (${t.vagas} vagas${t.formadorIds.length ? `, com ${nomesDe(t.formadorIds)}` : ''})`).join(' · ')}</p>
          )}
          <Note tom="info">Materiais, atividades e pesquisas são vinculados depois, na página da formação.</Note>
        </section>
      )}

      {/* Navegacao: presa ao fim da tela, com o salvar sempre a vista quando o obrigatorio esta preenchido */}
      {saida.destino ? (
        <div className="trilha-barra form-barra" data-estado="saindo" role="alertdialog" aria-label="Sair sem salvar?">
          <p className="trilha-barra-resumo">
            <strong>Sair sem salvar?</strong>
            <span>A formação ainda não foi salva e o que você preencheu se perde.</span>
          </p>
          <div className="trilha-barra-acoes">
            <button type="button" className="btn btn-primary" autoFocus onClick={saida.ficar}>Continuar preenchendo</button>
            <button type="button" className="btn btn-ghost" onClick={saida.sair}>Sair sem salvar</button>
          </div>
        </div>
      ) : (
        <div className="trilha-barra form-barra">
          <p className="trilha-barra-resumo">
            {tituloOk
              ? <><strong>Pronto para salvar</strong><span>{passo < PASSOS.length - 1 ? 'Os outros passos são opcionais: dá para completar depois, na página da formação.' : 'Confira a revisão e salve.'}</span></>
              : <><strong>Falta o obrigatório</strong><span>Informe o título da formação (ao menos 3 caracteres) para salvar.</span></>}
          </p>
          <div className="trilha-barra-acoes">
            {passo > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setPasso((p) => p - 1)} disabled={criando}>Voltar</button>
            )}
            {passo < PASSOS.length - 1 && (
              <button type="button" className={tituloOk ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => setPasso((p) => p + 1)} disabled={!podeAvancar || criando}>
                Continuar
                <Icon size={16}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></Icon>
              </button>
            )}
            {tituloOk && (
              <button type="button" className="btn btn-primary" onClick={criar} disabled={criando}>
                {criando ? 'Salvando...' : 'Salvar formação'}
              </button>
            )}
          </div>
          {erro && <p className="campo-erro" role="alert">{erro}</p>}
        </div>
      )}
    </div>
  );
}
