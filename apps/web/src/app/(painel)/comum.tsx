'use client';
// Pecas que a visao do cursista e a de quem conduz compartilham na pagina da formacao.
import type { ReactNode } from 'react';
import { Check, ExternalLink, MapPin } from 'lucide-react';
import { ENTREGA_STATUS_LABELS } from '@formarede/contracts';
import type { EncontroResumo, EntregaStatus } from '@formarede/contracts';
import { fmtDia, fmtHora, partesData, quando } from '../../lib/datas';
import { StatusBadge, type Tom } from './ui';

/** A mesma situacao de entrega, com o mesmo texto e a mesma cor, para quem envia e quem avalia. */
/** A mesma cor para a mesma situacao da entrega, na fila de quem avalia e na pagina do cursista. */
export const TOM_ENTREGA: Record<EntregaStatus, Tom> = { ENVIADA: 'accent', EM_AJUSTE: 'warn', AVALIADA: 'good' };

export function SituacaoEntrega({ status, nota, pontuacao }: { status: EntregaStatus; nota?: number | null; pontuacao: number }) {
  const texto = status === 'AVALIADA' && nota != null ? `${ENTREGA_STATUS_LABELS.AVALIADA} · ${nota} de ${pontuacao}` : ENTREGA_STATUS_LABELS[status];
  return <StatusBadge tom={TOM_ENTREGA[status]}>{texto}</StatusBadge>;
}

/** Selo de calendario (dia grande + mes). Decorativo: a data vai por extenso ao lado. */
export function SeloData({ iso, destaque = false }: { iso: string; destaque?: boolean }) {
  const { dia, mes } = partesData(iso);
  return (
    <span className="selo-data" data-destaque={destaque} aria-hidden="true">
      <b>{dia}</b>
      <small>{mes}</small>
    </span>
  );
}

const linkSeguro = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export function ProximoEncontro({ encontro, vazio, children }: {
  encontro: EncontroResumo | null;
  /** Texto quando nao ha encontro agendado. */
  vazio: string;
  children?: ReactNode;
}) {
  const sala = linkSeguro(encontro?.linkVirtual ?? null);
  return (
    <div className="fcell">
      <h3 className="fcell-rotulo">Próximo encontro</h3>
      {encontro ? (
        <div className="prox">
          <SeloData iso={encontro.inicio} destaque />
          <div className="prox-texto">
            <p className="prox-quando">
              <strong>{fmtDia(encontro.inicio)}</strong>, {fmtHora(encontro.inicio)}
              <span className="prox-rel"> · {quando(encontro.inicio)}</span>
            </p>
            <p className="prox-titulo">{encontro.titulo}</p>
            {encontro.local && <p className="prox-local"><MapPin size={16} aria-hidden="true" /> {encontro.local}</p>}
            {sala && (
              <a className="link-acao" href={sala} target="_blank" rel="noopener noreferrer">
                Entrar na sala virtual <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span>
              </a>
            )}
          </div>
        </div>
      ) : (
        <p className="fcell-vazio">{vazio}</p>
      )}
      {children}
    </div>
  );
}

/** Item de uma lista de conferencia: a marca diz feito/pendente pela forma, nao so pela cor. */
export function Requisito({ ok, titulo, valor, children }: {
  ok: boolean; titulo: string; valor: ReactNode; children?: ReactNode;
}) {
  return (
    <li className="req" data-ok={ok}>
      <span className="req-marca" aria-hidden="true">{ok && <Check size={14} strokeWidth={3} />}</span>
      <div className="req-texto">
        <p className="req-linha">
          <span className="sr-only">{ok ? 'Completo: ' : 'Pendente: '}</span>
          <strong>{titulo}</strong> <span className="req-valor">{valor}</span>
        </p>
        {children}
      </div>
    </li>
  );
}
