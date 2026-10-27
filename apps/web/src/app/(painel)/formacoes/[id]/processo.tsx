'use client';
// Etapa do processo formativo, para quem decide (formacao:transicao): onde a formacao
// esta, o que muda ao avancar, devolver ou cancelar, e o historico com quem decidiu.
import { useId, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Undo2, X } from 'lucide-react';
import { ETAPAS_FLUXO, ETAPA_FLUXO_LABELS, type EtapaFluxo } from '@formarede/contracts';
import { api } from '../../../../lib/api';
import { fmtData, fmtHora } from '../../../../lib/datas';
import { Note } from '../../ui';

const FLUXO: readonly EtapaFluxo[] = ETAPAS_FLUXO.filter((e) => e !== 'CANCELADA');
const rotulo = (e: string) => ETAPA_FLUXO_LABELS[e as EtapaFluxo] ?? e;
const DECISAO: Record<string, string> = { APROVADA: 'Avançou', DEVOLVIDA: 'Devolvida', CANCELADA: 'Cancelada' };

export interface Transicao {
  id: string; deEtapa: string; paraEtapa: string; decisao: string;
  justificativa?: string | null; createdAt: string; decididoPor?: string | null;
}

export function ProcessoFormacao({ formacaoId, etapa, transicoes, podeDecidir, aoMudar }: {
  formacaoId: string;
  etapa: EtapaFluxo;
  transicoes: Transicao[];
  podeDecidir: boolean;
  aoMudar: () => void;
}) {
  const id = useId();
  const [modo, setModo] = useState<'devolver' | 'cancelar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const atual = FLUXO.indexOf(etapa);
  const encerrada = etapa === 'CONCLUIDA' || etapa === 'CANCELADA';
  const proxima = FLUXO[atual + 1];
  const anterior = atual > 0 ? FLUXO[atual - 1] : undefined;

  async function decidir(decisao: 'APROVADA' | 'DEVOLVIDA' | 'CANCELADA') {
    setOcupado(true);
    setErro(null);
    try {
      await api.post(`/formacoes/${formacaoId}/transicao`, { decisao, justificativa: motivo.trim() || undefined });
      setModo(null);
      setMotivo('');
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a decisão.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="fsec" aria-labelledby="etapa-processo">
      <div className="fsec-head">
        <div>
          <h2 id="etapa-processo" className="section-title">Etapa do processo</h2>
          <p className="fsec-lead">
            {etapa === 'CANCELADA' ? 'Esta formação foi cancelada.'
              : etapa === 'CONCLUIDA' ? 'Formação concluída. O histórico das decisões fica abaixo.'
                : `A formação está em ${rotulo(etapa)}. Cada decisão fica registrada com autor e data.`}
          </p>
        </div>
      </div>

      <div className="fcell">
        <ol className="proc" aria-label="Etapas do processo formativo">
          {FLUXO.map((e, i) => {
            const estado = etapa === 'CANCELADA' ? 'futura' : i < atual ? 'feita' : i === atual ? 'atual' : 'futura';
            return (
              <li key={e} className="proc-etapa" data-estado={estado} aria-current={estado === 'atual' ? 'step' : undefined}>
                <span className="proc-marca" aria-hidden="true">{estado === 'feita' ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                <span className="proc-nome">{rotulo(e)}</span>
                <span className="sr-only">{estado === 'feita' ? ' (concluída)' : estado === 'atual' ? ' (etapa atual)' : ''}</span>
              </li>
            );
          })}
        </ol>

        {podeDecidir && !encerrada && (
          modo ? (
            <form className="fform proc-decisao" data-perigo={modo === 'cancelar'}
              onSubmit={(ev: FormEvent) => { ev.preventDefault(); void decidir(modo === 'cancelar' ? 'CANCELADA' : 'DEVOLVIDA'); }}>
              <p className="proc-aviso">
                {modo === 'cancelar'
                  ? 'Cancelar encerra a formação para todas as turmas. Isso não pode ser desfeito por esta tela.'
                  : `A formação volta para ${rotulo(anterior ?? '')} para ajustes.`}
              </p>
              <div>
                <label className="label" htmlFor={`${id}-motivo`}>{modo === 'cancelar' ? 'Motivo do cancelamento' : 'O que precisa ser ajustado'}</label>
                <textarea id={`${id}-motivo`} className="input" required autoFocus rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
              {erro && <Note tom="danger">{erro}</Note>}
              <div className="fform-acoes">
                <button type="submit" className={modo === 'cancelar' ? 'btn btn-danger btn-perigo' : 'btn btn-primary'} disabled={ocupado || !motivo.trim()}>
                  {ocupado ? 'Registrando...' : modo === 'cancelar' ? 'Cancelar a formação' : `Devolver para ${rotulo(anterior ?? '')}`}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { setModo(null); setErro(null); }}>Voltar</button>
              </div>
            </form>
          ) : (
            <div className="proc-acoes">
              {proxima && (
                <button type="button" className="btn btn-primary" onClick={() => decidir('APROVADA')} disabled={ocupado}>
                  {ocupado ? 'Registrando...' : <>Avançar para {rotulo(proxima)} <ArrowRight size={18} aria-hidden="true" /></>}
                </button>
              )}
              {anterior && (
                <button type="button" className="btn btn-ghost" onClick={() => setModo('devolver')}>
                  <Undo2 size={18} aria-hidden="true" /> Devolver para ajustes
                </button>
              )}
              <button type="button" className="btn btn-danger" onClick={() => setModo('cancelar')}>
                <X size={18} aria-hidden="true" /> Cancelar a formação
              </button>
              {erro && <Note tom="danger">{erro}</Note>}
            </div>
          )
        )}

        <details className="proc-historico">
          <summary>Histórico de decisões ({transicoes.length})</summary>
          {transicoes.length === 0 ? (
            <p className="fcell-vazio">Nenhuma decisão registrada ainda.</p>
          ) : (
            <ol className="proc-hist">
              {transicoes.map((t) => (
                <li key={t.id}>
                  <p>
                    <strong>{DECISAO[t.decisao] ?? t.decisao}</strong>: {rotulo(t.deEtapa)} → {rotulo(t.paraEtapa)}
                  </p>
                  <p className="proc-hist-meta">
                    {fmtData(t.createdAt)}, {fmtHora(t.createdAt)}{t.decididoPor && ` · ${t.decididoPor}`}
                  </p>
                  {t.justificativa && <p className="proc-hist-motivo">“{t.justificativa}”</p>}
                </li>
              ))}
            </ol>
          )}
        </details>
      </div>
    </section>
  );
}
