'use client';
// Alocacao de formadores nas turmas (formador:alocar). A escolha e por pilulas marcaveis:
// pela turma (quem conduz esta turma) ou pelo formador (que turmas ele conduz). O formador
// ve e conduz so as turmas em que esta, entao turma sem formador e pendencia da curadoria.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { FormadorRede, TurmaRef } from '@formarede/contracts';
import { api } from '../../../lib/api';
import { Note } from '../ui';

const msg = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);
const alternar = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

/** Formadores do municipio (null enquanto carrega; [] tambem quando falhou, com o erro). */
export function useFormadoresRede(ativo = true) {
  const [lista, setLista] = useState<FormadorRede[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    api.get<FormadorRede[]>('/formadores')
      .then((l) => { if (vivo) setLista(l); })
      .catch((e) => { if (vivo) { setErro(msg(e, 'Não foi possível carregar os formadores.')); setLista([]); } });
    return () => { vivo = false; };
  }, [ativo]);
  return { formadores: lista, erro };
}

function Pilula({ marcado, aoMudar, children }: { marcado: boolean; aoMudar: () => void; children: ReactNode }) {
  return (
    <label className="trilha-check" data-marcado={marcado}>
      <input type="checkbox" checked={marcado} onChange={aoMudar} />
      <span className="trilha-check-caixa" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
      {children}
    </label>
  );
}

export function EscolhaFormadores({ formadores, marcados, aoMudar, legenda = 'Quem conduz' }: {
  formadores: { id: string; nome: string }[] | null;
  marcados: string[];
  aoMudar: (ids: string[]) => void;
  legenda?: string;
}) {
  return (
    <fieldset className="trilha-tipos">
      <legend className="label">{legenda}</legend>
      {formadores === null ? <p className="hint">Carregando os formadores...</p>
        : !formadores.length ? (
          <p className="hint aloca-vazio">
            Nenhum formador na rede ainda. <Link className="link-acao" href="/formadores#links">Gere um link de cadastro</Link> e
            envie a quem vai conduzir.
          </p>
        ) : (
          <div className="aloca-opcoes">
            {formadores.map((f) => (
              <Pilula key={f.id} marcado={marcados.includes(f.id)} aoMudar={() => aoMudar(alternar(marcados, f.id))}>{f.nome}</Pilula>
            ))}
          </div>
        )}
    </fieldset>
  );
}

/** Turmas agrupadas pela formacao. */
export function EscolhaTurmas({ turmas, marcadas, aoMudar, legenda = 'Turmas' }: {
  turmas: TurmaRef[];
  marcadas: string[];
  aoMudar: (ids: string[]) => void;
  legenda?: string;
}) {
  const grupos = new Map<string, { titulo: string; turmas: TurmaRef[] }>();
  for (const t of turmas) {
    const g = grupos.get(t.formacao.id) ?? { titulo: t.formacao.titulo, turmas: [] };
    g.turmas.push(t);
    grupos.set(t.formacao.id, g);
  }
  return (
    <fieldset className="trilha-tipos">
      <legend className="label">{legenda}</legend>
      {!turmas.length ? <p className="hint">Nenhuma turma aberta nas formações em andamento.</p> : (
        <div className="aloca-grupos">
          {[...grupos.entries()].map(([id, g]) => (
            <div key={id} className="aloca-grupo">
              <p className="aloca-grupo-titulo">{g.titulo}</p>
              <div className="aloca-opcoes">
                {g.turmas.map((t) => (
                  <Pilula key={t.id} marcado={marcadas.includes(t.id)} aoMudar={() => aoMudar(alternar(marcadas, t.id))}>{t.nome}</Pilula>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** Quem conduz uma turma: escolhe e salva ali mesmo. */
export function AlocarTurma({ turma, atuais, aoFechar }: {
  turma: { id: string; nome: string };
  atuais: string[];
  /** Quem ficou alocado quando salvou; null quando cancelou. */
  aoFechar: (formadores: { id: string; nome: string }[] | null) => void;
}) {
  const id = useId();
  const { formadores, erro: erroLista } = useFormadoresRede();
  const [marcados, setMarcados] = useState(atuais);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, []);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      aoFechar(await api.put<{ id: string; nome: string }[]>(`/turmas/${turma.id}/formadores`, { formadorIds: marcados }));
    } catch (e) {
      setErro(msg(e, 'Não foi possível salvar quem conduz a turma.'));
      setOcupado(false);
    }
  }

  return (
    <form className="fform" onSubmit={salvar} aria-labelledby={`${id}-t`}>
      <h4 ref={titulo} id={`${id}-t`} className="trilha-form-titulo" tabIndex={-1}>Quem conduz {turma.nome}</h4>
      {erroLista ? <Note tom="danger">{erroLista}</Note> : (
        <EscolhaFormadores formadores={formadores} marcados={marcados} aoMudar={setMarcados} legenda="Marque um ou mais formadores" />
      )}
      {erro && <Note tom="danger">{erro}</Note>}
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado || !formadores}>{ocupado ? 'Salvando...' : 'Salvar'}</button>
        <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => aoFechar(null)}>Cancelar</button>
      </div>
    </form>
  );
}
