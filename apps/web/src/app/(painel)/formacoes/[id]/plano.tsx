'use client';
// Plano formativo da formacao: o que o Copiloto propos e alguem aprovou. A origem fica
// sempre visivel (selo da IA, fontes, modelo, quem aprovou e quando); o rascunho tem borda
// tracejada, o plano aprovado borda cheia. O conteudo e o mesmo nas duas telas
// (Copiloto e formacao), por isso mora aqui, junto do editor que o Copiloto usa para a
// pessoa ajustar o rascunho bloco a bloco antes de aprovar (a API grava a versao editada).
import { useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Sparkles, X } from 'lucide-react';
import type { PlanoAprovado, PlanoFormativoConteudo } from '@formarede/contracts';
import { api } from '../../../../lib/api';
import { fmtData } from '../../../../lib/datas';
import { plural } from '../../../../lib/texto';
import { Note, SeloIA } from '../../ui';

/** O plano em quatro blocos: o que se quer, os modulos, as atividades e como avaliar. */
export function ConteudoPlano({ p, fontes, rascunho = false }: {
  p: PlanoFormativoConteudo; fontes: { id: string; titulo: string }[]; rascunho?: boolean;
}) {
  return (
    <div className="plano-grid" data-rascunho={rascunho}>
      <div className="fcell">
        <h3 className="fcell-rotulo">Objetivos</h3>
        <ul className="copiloto-lista">{p.objetivos.map((o, i) => <li key={i}>{o}</li>)}</ul>
        <h3 className="fcell-rotulo">Resultados esperados</h3>
        <ul className="copiloto-lista">{p.resultadosEsperados.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </div>
      <div className="fcell">
        <h3 className="fcell-rotulo">Módulos propostos</h3>
        <ol className="copiloto-lista">
          {p.modulos.map((m, i) => (
            <li key={i}><strong>{m.titulo}</strong> <span className="muted">({m.cargaHoraria} h)</span><br /><span className="muted">{m.descricao}</span></li>
          ))}
        </ol>
      </div>
      <div className="fcell">
        <h3 className="fcell-rotulo">Atividades sugeridas</h3>
        <ul className="copiloto-lista">
          {p.atividadesSugeridas.map((a, i) => <li key={i}><strong>{a.titulo}:</strong> {a.descricao}</li>)}
        </ul>
        <h3 className="fcell-rotulo">Metodologias</h3>
        <p className="sobre-texto">{p.metodologias.join(' · ')}</p>
      </div>
      <div className="fcell">
        <h3 className="fcell-rotulo">Como avaliar</h3>
        <p className="sobre-texto">{p.avaliacao}</p>
        {fontes.length > 0 && (
          <>
            <h3 className="fcell-rotulo">Materiais usados</h3>
            <ul className="copiloto-lista">{fontes.map((f) => <li key={f.id}>{f.titulo}</li>)}</ul>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Editor do rascunho (Copiloto) ----------

type Modulo = PlanoFormativoConteudo['modulos'][number];
type Atividade = PlanoFormativoConteudo['atividadesSugeridas'][number];
type Bloco = 'objetivos' | 'modulos' | 'atividades' | 'avaliacao';

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Limpa o que a pessoa editou (espacos, itens vazios) e diz o que falta, se faltar. */
export function validarPlano(p: PlanoFormativoConteudo): { plano: PlanoFormativoConteudo; erro: string | null } {
  const textos = (l: string[]) => l.map((t) => t.trim()).filter(Boolean);
  const plano: PlanoFormativoConteudo = {
    ...p,
    objetivos: textos(p.objetivos),
    resultadosEsperados: textos(p.resultadosEsperados),
    metodologias: textos(p.metodologias),
    modulos: p.modulos.map((m) => ({ ...m, titulo: m.titulo.trim(), descricao: m.descricao.trim() })).filter((m) => m.titulo),
    atividadesSugeridas: p.atividadesSugeridas.map((a) => ({ titulo: a.titulo.trim(), descricao: a.descricao.trim() })).filter((a) => a.titulo),
    avaliacao: p.avaliacao.trim(),
  };
  const erro = !plano.objetivos.length ? 'O plano precisa de ao menos um objetivo.'
    : !plano.modulos.length ? 'O plano precisa de ao menos um módulo com título.'
      : plano.modulos.some((m) => !Number.isFinite(m.cargaHoraria) || m.cargaHoraria < 0) ? 'Confira a carga horária dos módulos: use horas inteiras.'
        : !plano.avaliacao ? 'Diga como a formação vai avaliar.'
          : null;
  return { plano, erro };
}

/**
 * O rascunho do Copiloto, editavel bloco a bloco: cada bloco mostra o texto e um "Editar";
 * editando, cada item vira campo, com remover e adicionar. Bloco mexido ganha "Editado".
 */
export function PlanoEditavel({ p, original, fontes, cargaFormacao, aoMudar }: {
  p: PlanoFormativoConteudo; original: PlanoFormativoConteudo;
  fontes: { id: string; titulo: string }[];
  /** Carga horaria da formacao, para conferir a soma dos modulos. */
  cargaFormacao: number | null;
  aoMudar: (p: PlanoFormativoConteudo) => void;
}) {
  const [editando, setEditando] = useState<Bloco | null>(null);
  const muda = (parte: Partial<PlanoFormativoConteudo>) => aoMudar({ ...p, ...parte });
  const soma = p.modulos.reduce((s, m) => s + (Number.isFinite(m.cargaHoraria) ? m.cargaHoraria : 0), 0);
  const editado: Record<Bloco, boolean> = {
    objetivos: !igual([p.objetivos, p.resultadosEsperados], [original.objetivos, original.resultadosEsperados]),
    modulos: !igual(p.modulos, original.modulos),
    atividades: !igual([p.atividadesSugeridas, p.metodologias], [original.atividadesSugeridas, original.metodologias]),
    avaliacao: p.avaliacao !== original.avaliacao,
  };

  // Funcao (nao componente): o botao nao remonta a cada tecla e o foco fica onde esta.
  const cabeca = (bloco: Bloco, titulo: string) => {
    const aberto = editando === bloco;
    return (
      <div className="plano-cabeca">
        <h3 className="fcell-rotulo">{titulo}{editado[bloco] && <span className="plano-editado">Editado</span>}</h3>
        <button type="button" className="btn btn-ghost btn-compacto" aria-expanded={aberto} onClick={() => setEditando(aberto ? null : bloco)}>
          {aberto ? 'Concluir' : <><Pencil size={14} aria-hidden="true" /> Editar<span className="sr-only">: {titulo}</span></>}
        </button>
      </div>
    );
  };

  return (
    <div className="plano-grid" data-rascunho="true">
      <div className="fcell" data-editando={editando === 'objetivos'}>
        {cabeca('objetivos', 'Objetivos e resultados')}
        {editando === 'objetivos' ? (
          <>
            <ListaTexto titulo="Objetivos" rotulo="Objetivo" novo="objetivo" itens={p.objetivos} aoMudar={(objetivos) => muda({ objetivos })} />
            <ListaTexto titulo="Resultados esperados" rotulo="Resultado esperado" novo="resultado esperado" itens={p.resultadosEsperados} aoMudar={(resultadosEsperados) => muda({ resultadosEsperados })} />
          </>
        ) : (
          <>
            <ul className="copiloto-lista">{p.objetivos.map((o, i) => <li key={i}>{o}</li>)}</ul>
            <h4 className="plano-sub">Resultados esperados</h4>
            <ul className="copiloto-lista">{p.resultadosEsperados.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </>
        )}
      </div>

      <div className="fcell" data-editando={editando === 'modulos'}>
        {cabeca('modulos', 'Módulos propostos')}
        {editando === 'modulos' ? (
          <ModulosEditaveis modulos={p.modulos} aoMudar={(modulos) => muda({ modulos })} />
        ) : (
          <ol className="copiloto-lista">
            {p.modulos.map((m, i) => (
              <li key={i}><strong>{m.titulo}</strong> <span className="muted">({m.cargaHoraria} h)</span><br /><span className="muted">{m.descricao}</span></li>
            ))}
          </ol>
        )}
        <p className="hint" role="status">
          Total: {soma} h{cargaFormacao ? ` de ${cargaFormacao} h da formação` : ''}
          {cargaFormacao && soma !== cargaFormacao ? (soma > cargaFormacao ? '; passa da carga da formação.' : '; sobra carga para distribuir.') : '.'}
        </p>
      </div>

      <div className="fcell" data-editando={editando === 'atividades'}>
        {cabeca('atividades', 'Atividades e metodologias')}
        {editando === 'atividades' ? (
          <>
            <AtividadesEditaveis atividades={p.atividadesSugeridas} aoMudar={(atividadesSugeridas) => muda({ atividadesSugeridas })} />
            <ListaTexto titulo="Metodologias" rotulo="Metodologia" novo="metodologia" curto itens={p.metodologias} aoMudar={(metodologias) => muda({ metodologias })} />
          </>
        ) : (
          <>
            <ul className="copiloto-lista">
              {p.atividadesSugeridas.map((a, i) => <li key={i}><strong>{a.titulo}:</strong> {a.descricao}</li>)}
            </ul>
            <h4 className="plano-sub">Metodologias</h4>
            <p className="sobre-texto">{p.metodologias.join(' · ')}</p>
          </>
        )}
      </div>

      <div className="fcell" data-editando={editando === 'avaliacao'}>
        {cabeca('avaliacao', 'Como avaliar')}
        {editando === 'avaliacao' ? (
          <Campo rotulo="Como a formação avalia">
            {(id) => <textarea id={id} className="input" rows={4} value={p.avaliacao} onChange={(e) => muda({ avaliacao: e.target.value })} />}
          </Campo>
        ) : <p className="sobre-texto">{p.avaliacao}</p>}
        {fontes.length > 0 && (
          <>
            <h4 className="plano-sub">Materiais usados</h4>
            <ul className="copiloto-lista">{fontes.map((f) => <li key={f.id}>{f.titulo}</li>)}</ul>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({ rotulo, oculto = false, children }: { rotulo: string; oculto?: boolean; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="plano-campo">
      <label className={oculto ? 'sr-only' : 'label'} htmlFor={id}>{rotulo}</label>
      {children(id)}
    </div>
  );
}

function Remover({ rotulo, aoClicar }: { rotulo: string; aoClicar: () => void }) {
  return (
    <button type="button" className="plano-remover" aria-label={`Remover ${rotulo}`} onClick={aoClicar}>
      <X size={16} aria-hidden="true" />
    </button>
  );
}

function ListaTexto({ titulo, rotulo, novo, itens, curto = false, aoMudar }: {
  titulo: string; rotulo: string; novo: string; itens: string[]; curto?: boolean; aoMudar: (l: string[]) => void;
}) {
  return (
    <fieldset className="plano-lista">
      <legend className="plano-sub">{titulo}</legend>
      {itens.map((t, i) => (
        <div key={i} className="plano-item">
          <Campo rotulo={`${rotulo} ${i + 1}`} oculto>
            {(id) => curto
              ? <input id={id} className="input" value={t} onChange={(e) => aoMudar(itens.map((x, j) => (j === i ? e.target.value : x)))} />
              : <textarea id={id} className="input" rows={2} value={t} onChange={(e) => aoMudar(itens.map((x, j) => (j === i ? e.target.value : x)))} />}
          </Campo>
          <Remover rotulo={`${rotulo.toLowerCase()} ${i + 1}`} aoClicar={() => aoMudar(itens.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-compacto plano-adicionar" onClick={() => aoMudar([...itens, ''])}>
        <Plus size={14} aria-hidden="true" /> Adicionar {novo}
      </button>
    </fieldset>
  );
}

function ModulosEditaveis({ modulos, aoMudar }: { modulos: Modulo[]; aoMudar: (m: Modulo[]) => void }) {
  const troca = (i: number, parte: Partial<Modulo>) => aoMudar(modulos.map((m, j) => (j === i ? { ...m, ...parte } : m)));
  return (
    <fieldset className="plano-lista">
      <legend className="sr-only">Módulos</legend>
      {modulos.map((m, i) => (
        <div key={i} className="plano-item plano-item-bloco">
          <div className="plano-item-linha">
            <Campo rotulo={`Módulo ${i + 1}`}>
              {(id) => <input id={id} className="input" value={m.titulo} onChange={(e) => troca(i, { titulo: e.target.value })} />}
            </Campo>
            <Campo rotulo="Horas">
              {(id) => (
                <input id={id} className="input plano-horas" inputMode="numeric" value={Number.isFinite(m.cargaHoraria) ? String(m.cargaHoraria) : ''}
                  onChange={(e) => troca(i, { cargaHoraria: e.target.value.trim() === '' ? Number.NaN : Number(e.target.value) })} />
              )}
            </Campo>
            <Remover rotulo={`módulo ${i + 1}`} aoClicar={() => aoMudar(modulos.filter((_, j) => j !== i))} />
          </div>
          <Campo rotulo={`Descrição do módulo ${i + 1}`} oculto>
            {(id) => <textarea id={id} className="input" rows={2} value={m.descricao} placeholder="Do que o módulo trata" onChange={(e) => troca(i, { descricao: e.target.value })} />}
          </Campo>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-compacto plano-adicionar" onClick={() => aoMudar([...modulos, { titulo: '', descricao: '', cargaHoraria: 0 }])}>
        <Plus size={14} aria-hidden="true" /> Adicionar módulo
      </button>
    </fieldset>
  );
}

function AtividadesEditaveis({ atividades, aoMudar }: { atividades: Atividade[]; aoMudar: (a: Atividade[]) => void }) {
  const troca = (i: number, parte: Partial<Atividade>) => aoMudar(atividades.map((a, j) => (j === i ? { ...a, ...parte } : a)));
  return (
    <fieldset className="plano-lista">
      <legend className="plano-sub">Atividades sugeridas</legend>
      {atividades.map((a, i) => (
        <div key={i} className="plano-item plano-item-bloco">
          <div className="plano-item-linha">
            <Campo rotulo={`Atividade ${i + 1}`}>
              {(id) => <input id={id} className="input" value={a.titulo} onChange={(e) => troca(i, { titulo: e.target.value })} />}
            </Campo>
            <Remover rotulo={`atividade ${i + 1}`} aoClicar={() => aoMudar(atividades.filter((_, j) => j !== i))} />
          </div>
          <Campo rotulo={`O que pedir na atividade ${i + 1}`} oculto>
            {(id) => <textarea id={id} className="input" rows={2} value={a.descricao} placeholder="O que o cursista faz" onChange={(e) => troca(i, { descricao: e.target.value })} />}
          </Campo>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-compacto plano-adicionar" onClick={() => aoMudar([...atividades, { titulo: '', descricao: '' }])}>
        <Plus size={14} aria-hidden="true" /> Adicionar atividade
      </button>
    </fieldset>
  );
}

/**
 * Secao "Plano formativo" da pagina da formacao (para quem usa o Copiloto). Sem plano,
 * convida a gerar; com plano, mostra o vigente com a origem, o proximo passo e o historico.
 */
export function PlanoFormativo({ formacaoId, modulos, podeCriarModulos, aoCriarModulos, ocultarVazio = false }: {
  formacaoId: string;
  modulos: number;
  podeCriarModulos: boolean;
  aoCriarModulos: () => void;
  /** Na preparacao, a lista de passos ja leva ao Copiloto: sem plano, a secao nao aparece. */
  ocultarVazio?: boolean;
}) {
  const uid = useId();
  // undefined: carregando; null: falhou.
  const [planos, setPlanos] = useState<PlanoAprovado[] | null | undefined>(undefined);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.get<PlanoAprovado[]>(`/ia/formacoes/${formacaoId}/planos`).then(setPlanos).catch(() => setPlanos(null));
  }, [formacaoId]);

  async function criarModulos(plano: PlanoAprovado) {
    setErro(null);
    setCriando(true);
    try {
      for (const [i, m] of plano.conteudo.modulos.entries()) {
        await api.post(`/formacoes/${formacaoId}/modulos`, { titulo: m.titulo, descricao: m.descricao, ordem: i + 1 });
      }
      aoCriarModulos();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar os módulos. Os que já foram criados aparecem em "Sobre a formação".');
    } finally {
      setCriando(false);
    }
  }

  if (planos === undefined) return null;
  const vigente = planos?.[0];
  if (!vigente && ocultarVazio) return null;
  const anteriores = planos?.slice(1) ?? [];
  const copiloto = `/formacoes/${formacaoId}/copiloto`;

  return (
    <section id="plano" className="fsec" aria-labelledby={`${uid}-t`}>
      <div className="fsec-head">
        <div>
          <h2 id={`${uid}-t`} className="section-title">Plano formativo</h2>
          <p className="fsec-lead">
            {vigente
              ? `Aprovado em ${fmtData(vigente.aprovadoEm)}${vigente.aprovadoPor ? ` por ${vigente.aprovadoPor}` : ''}.`
              : planos === null
                ? 'Não foi possível carregar o plano agora.'
                : 'Nenhum plano aprovado ainda. O Copiloto escreve um rascunho a partir do diagnóstico e dos materiais aprovados; nada vale sem a sua revisão.'}
          </p>
        </div>
        {vigente ? <SeloIA>{vigente.editado ? 'Proposto pela IA · editado e aprovado' : 'Proposto pela IA · aprovado'}</SeloIA> : (
          <Link href={copiloto} className="btn btn-secondary"><Sparkles size={18} aria-hidden="true" /> Gerar plano com o Copiloto</Link>
        )}
      </div>

      {vigente && (
        <>
          <div className="fcell plano-resumo">
            <p className="sobre-texto">
              {plural(vigente.conteudo.modulos.length, 'módulo', 'módulos')} ({vigente.conteudo.modulos.reduce((s, m) => s + m.cargaHoraria, 0)} h)
              {' · '}{plural(vigente.conteudo.atividadesSugeridas.length, 'atividade sugerida', 'atividades sugeridas')}
              {vigente.fontes.length > 0 && <> · a partir de {plural(vigente.fontes.length, 'material aprovado', 'materiais aprovados')}</>}
            </p>
            <ol className="plano-modulos">
              {vigente.conteudo.modulos.map((m, i) => <li key={i}>{m.titulo}</li>)}
            </ol>
            {modulos === 0 && (
              <div className="fform-acoes">
                {podeCriarModulos ? (
                  <button type="button" className="btn btn-primary" disabled={criando} onClick={() => criarModulos(vigente)}>
                    {criando ? 'Criando os módulos...' : `Criar ${vigente.conteudo.modulos.length === 1 ? 'o módulo' : `os ${vigente.conteudo.modulos.length} módulos`} do plano`}
                  </button>
                ) : (
                  <p className="hint">Próximo passo: a curadoria cria os módulos a partir deste plano; o pedido aparece no Início de quem cuida disso.</p>
                )}
              </div>
            )}
            {erro && <Note tom="danger">{erro}</Note>}
          </div>

          <details className="copiloto-detalhes">
            <summary>Ver o plano completo</summary>
            <div style={{ marginTop: 12 }}><ConteudoPlano p={vigente.conteudo} fontes={vigente.fontes} /></div>
          </details>
          {anteriores.length > 0 && (
            <details className="copiloto-detalhes">
              <summary>Planos aprovados antes ({anteriores.length})</summary>
              <ul className="copiloto-lista" style={{ marginTop: 10 }}>
                {anteriores.map((a) => (
                  <li key={a.id}>Aprovado em {fmtData(a.aprovadoEm)}{a.aprovadoPor ? ` por ${a.aprovadoPor}` : ''} · {plural(a.conteudo.modulos.length, 'módulo', 'módulos')}</li>
                ))}
              </ul>
            </details>
          )}
          <details className="copiloto-detalhes">
            <summary>Origem e auditoria</summary>
            <p className="sobre-texto" style={{ marginTop: 10 }}>
              Serviço {vigente.provider} · modelo {vigente.modelo} · versão do prompt {vigente.promptVersao} · registro {vigente.interacaoId}.{' '}
              <Link className="link-acao" href={copiloto}>Gerar uma nova versão com o Copiloto</Link>
            </p>
          </details>
        </>
      )}
    </section>
  );
}
