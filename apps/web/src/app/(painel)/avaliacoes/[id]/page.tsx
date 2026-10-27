'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ResultadoPergunta } from '@formarede/contracts';
import { api } from '../../../../lib/api';
import { decimal, plural } from '../../../../lib/texto';
import { PageHeader, Note, ListSkeleton, ErroCarga } from '../../ui';

interface Resultados {
  avaliacao: { id: string; titulo: string; tipo: string; anonima: boolean };
  formacao?: { id: string; titulo: string };
  /** Cursistas da formacao (para a taxa de resposta). */
  cursistas?: number;
  totalRespostas: number;
  resultados: ResultadoPergunta[];
}

export default function ResultadosAvaliacaoPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Resultados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    api.get<Resultados>(`/avaliacoes/${id}/resultados`).then(setR)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os resultados.'));
  }, [id, tentativa]);

  if (erro && !r) return <ErroCarga mensagem={erro} aoTentar={() => { setErro(null); setTentativa((t) => t + 1); }} />;
  if (!r) return <ListSkeleton linhas={3} altura={90} />;

  return (
    <div className="resp">
      <PageHeader titulo={r.avaliacao.titulo}
        meta={[r.formacao?.titulo, r.cursistas ? `${r.totalRespostas} de ${plural(r.cursistas, 'cursista respondeu', 'cursistas responderam')}` : plural(r.totalRespostas, 'resposta', 'respostas'),
          r.avaliacao.anonima ? 'Respostas anônimas' : 'Respostas identificadas']} />

      <ul className="fsec-lista resp-form">
        {r.resultados.map((res, idx) => (
          <li key={res.pergunta.id} className="fitem resp-pergunta">
            <h2 className="resp-texto">{idx + 1}. {res.pergunta.texto}</h2>
            {res.pergunta.tipo === 'ESCALA' ? (
              <div className="resp-media">
                <strong>{res.media == null ? '—' : decimal(res.media)}</strong>
                <div className="resp-media-barra">
                  <div className="meter-track" role="img" aria-label={res.media == null ? 'Sem respostas ainda' : `Média ${decimal(res.media)} de 5`}>
                    {/* Escala de 1 a 5: 1 desenha vazio, 5 cheio; a cor segue os sinais de dado. */}
                    <div className="meter-fill" style={{
                      background: res.media == null ? 'transparent' : res.media >= 4 ? 'var(--signal-lime)' : res.media >= 3 ? 'var(--signal-yellow)' : 'var(--signal-orange)',
                      transform: `scaleX(${res.media == null ? 0 : Math.max(0.02, (res.media - 1) / 4)})`,
                    }} />
                  </div>
                  <p className="hint">Média de 1 a 5 · {plural(res.n, 'resposta', 'respostas')}</p>
                </div>
              </div>
            ) : res.respostas?.length ? (
              <ul className="resp-abertas">
                {res.respostas.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            ) : <p className="fcell-vazio">Ninguém escreveu nesta pergunta ainda.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
