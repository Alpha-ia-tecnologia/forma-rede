'use client';
// Responder uma pesquisa. A escala e um grupo de opcoes de verdade (radio), cada
// pergunta aberta tem rotulo, o rascunho fica salvo nesta aba ate enviar e quem ja
// respondeu e avisado antes de preencher de novo.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import type { PerguntaAvaliacao } from '@formarede/contracts';
import { api } from '../../../../../lib/api';
import { plural } from '../../../../../lib/texto';
import { PageHeader, Note, ListSkeleton } from '../../../ui';

interface AvaliacaoDetalhe {
  id: string;
  titulo: string;
  anonima: boolean;
  perguntas: PerguntaAvaliacao[];
  formacao: { id: string; titulo: string };
}
interface Rascunho { valores: Record<string, number>; textos: Record<string, string> }

const ESCALA = [
  { v: 1, rotulo: 'Discordo totalmente' }, { v: 2, rotulo: 'Discordo' }, { v: 3, rotulo: 'Neutro' },
  { v: 4, rotulo: 'Concordo' }, { v: 5, rotulo: 'Concordo totalmente' },
];

export default function ResponderAvaliacaoPage() {
  const { id } = useParams<{ id: string }>();
  const uid = useId();
  const chave = `formarede.rascunho-avaliacao.${id}`;
  const [av, setAv] = useState<AvaliacaoDetalhe | null>(null);
  const [jaRespondida, setJaRespondida] = useState(false);
  const [r, setR] = useState<Rascunho>({ valores: {}, textos: {} });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  // Enviada a resposta, o formulario some: o foco vai para o titulo da tela final.
  const fim = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (ok) fim.current?.focus(); }, [ok]);

  useEffect(() => {
    api.get<AvaliacaoDetalhe>(`/avaliacoes/${id}`)
      .then((a) => {
        setAv(a);
        // Para o cursista, a lista diz se ja respondeu (inclusive nas anonimas).
        api.get<{ id: string; respondida: boolean | null }[]>(`/avaliacoes?formacaoId=${a.formacao.id}`)
          .then((l) => setJaRespondida(!!l.find((x) => x.id === a.id)?.respondida))
          .catch(() => undefined);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível abrir a pesquisa.'));
    try {
      const salvo = sessionStorage.getItem(chave);
      if (salvo) setR(JSON.parse(salvo) as Rascunho);
    } catch { /* sem rascunho */ }
  }, [id, chave]);

  function mudar(novo: Rascunho) {
    setR(novo);
    try { sessionStorage.setItem(chave, JSON.stringify(novo)); } catch { /* segue sem rascunho */ }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!av) return;
    setErro(null);
    setEnviando(true);
    try {
      const respostas = av.perguntas.map((p) => (p.tipo === 'ESCALA'
        ? { perguntaId: p.id, valor: r.valores[p.id] }
        : { perguntaId: p.id, texto: r.textos[p.id] ?? '' }));
      await api.post(`/avaliacoes/${id}/respostas`, { respostas });
      try { sessionStorage.removeItem(chave); } catch { /* nada a limpar */ }
      setOk(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar. Suas respostas continuam aqui.');
    } finally {
      setEnviando(false);
    }
  }

  if (!av) return erro ? <Note tom="danger">{erro}</Note> : <ListSkeleton linhas={3} altura={120} />;

  if (ok || jaRespondida) {
    return (
      <section className="fsec resp-fim" aria-labelledby="resp-fim">
        <CircleCheck size={28} aria-hidden="true" />
        <h1 id="resp-fim" className="section-title" tabIndex={-1} ref={fim}>{ok ? 'Resposta registrada. Obrigado!' : 'Você já respondeu esta pesquisa'}</h1>
        <p className="fsec-lead">
          {ok ? 'Sua resposta ajuda a equipe a planejar os próximos encontros.' : 'Cada pessoa responde uma vez. Obrigado pela participação.'}
        </p>
        <div className="fform-acoes">
          {/* O Inicio lista o que ainda falta fazer; a formacao fica como segunda opcao. */}
          <Link className="btn btn-primary" href="/dashboard">Ver o que falta no Início</Link>
          <Link className="btn btn-ghost" href={`/formacoes/${av.formacao.id}`}>Voltar para a formação</Link>
        </div>
      </section>
    );
  }

  const faltam = av.perguntas.filter((p) => p.tipo === 'ESCALA' && !r.valores[p.id]).length;

  return (
    <div className="resp">
      <PageHeader titulo={av.titulo}
        meta={[av.formacao.titulo, av.anonima ? 'Anônima: ninguém vê quem respondeu' : 'Identificada: a equipe vê quem respondeu']} />

      <form onSubmit={enviar} className="resp-form">
        {av.perguntas.map((p, idx) => (
          p.tipo === 'ESCALA' ? (
            <fieldset key={p.id} className="fitem resp-pergunta" aria-describedby={`${uid}-escala`}>
              <legend className="resp-texto">{idx + 1}. {p.texto}</legend>
              <div className="escala">
                {ESCALA.map((o) => (
                  <label key={o.v} className="escala-op" title={o.rotulo}>
                    <input type="radio" name={`${uid}-${p.id}`} value={o.v} checked={r.valores[p.id] === o.v}
                      onChange={() => mudar({ ...r, valores: { ...r.valores, [p.id]: o.v } })} />
                    <span aria-hidden="true">{o.v}</span>
                    <span className="sr-only">{o.v}: {o.rotulo}</span>
                  </label>
                ))}
              </div>
              <p className="hint resp-legenda" id={idx === 0 ? `${uid}-escala` : undefined}>1 = discordo totalmente · 5 = concordo totalmente</p>
            </fieldset>
          ) : (
            <div key={p.id} className="fitem resp-pergunta">
              <label className="resp-texto" htmlFor={`${uid}-${p.id}`}>{idx + 1}. {p.texto} <span className="muted">(opcional)</span></label>
              <textarea id={`${uid}-${p.id}`} className="input" rows={3} value={r.textos[p.id] ?? ''}
                onChange={(e) => mudar({ ...r, textos: { ...r.textos, [p.id]: e.target.value } })} />
            </div>
          )
        ))}
        {erro && <Note tom="danger">{erro}</Note>}
        <div className="resp-enviar">
          <button className="btn btn-primary" type="submit" disabled={faltam > 0 || enviando}>
            {enviando ? 'Enviando...' : faltam > 0 ? `Marque ${plural(faltam, 'resposta de 1 a 5', 'respostas de 1 a 5')} para enviar` : 'Enviar respostas'}
          </button>
          <span className="hint">O que você marcou fica guardado nesta aba até enviar.</span>
        </div>
      </form>
    </div>
  );
}
