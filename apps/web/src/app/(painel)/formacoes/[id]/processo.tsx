'use client';
// Encerramento da formacao. Quem cria a formacao e quem a valida: nao ha aprovacao por
// etapas. A formacao nasce em andamento e quem decide (formacao:transicao) a encerra no fim,
// ou reabre se encerrou por engano; cada vez fica no historico, com quem e quando.
import { useEffect, useRef, useState } from 'react';
import { Flag, RotateCcw } from 'lucide-react';
import { formacaoEncerrada, type EtapaFluxo } from '@formarede/contracts';
import { api } from '../../../../lib/api';
import { fmtData, fmtHora } from '../../../../lib/datas';
import { Note } from '../../ui';

export interface Transicao {
  id: string; deEtapa: string; paraEtapa: string; decisao: string;
  justificativa?: string | null; createdAt: string; decididoPor?: string | null;
}

export function EncerramentoFormacao({ formacaoId, etapa, transicoes, podeDecidir, aoMudar }: {
  formacaoId: string;
  etapa: EtapaFluxo;
  /** Do mais recente ao mais antigo. */
  transicoes: Transicao[];
  podeDecidir: boolean;
  aoMudar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = useRef<HTMLButtonElement>(null);
  const encerrada = formacaoEncerrada(etapa);
  // Quem encerrou e quando: o registro mais recente que levou a formacao a esse estado.
  const registro = transicoes.find((t) => t.paraEtapa === etapa);

  useEffect(() => { if (confirmando) confirmar.current?.focus(); }, [confirmando]);

  if (!encerrada && !podeDecidir) return null;

  async function decidir() {
    setOcupado(true);
    setErro(null);
    try {
      await api.post(`/formacoes/${formacaoId}/${encerrada ? 'reabrir' : 'encerrar'}`, {});
      setConfirmando(false);
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="fsec" aria-labelledby="encerramento">
      <div className="fsec-head">
        <div>
          <h2 id="encerramento" className="section-title">{encerrada ? 'Formação encerrada' : 'Encerrar a formação'}</h2>
          <p className="fsec-lead">
            {encerrada
              ? <>
                  {registro ? `Encerrada em ${fmtData(registro.createdAt)}, ${fmtHora(registro.createdAt)}${registro.decididoPor ? `, por ${registro.decididoPor}` : ''}. ` : ''}
                  Não aparece mais entre as formações em andamento, e os relatórios mostram a conclusão.
                </>
              : 'Quando os encontros e as entregas terminarem. A formação sai das formações em andamento, o Início deixa de cobrar chamadas e devolutivas dela e os relatórios passam a mostrar a conclusão. Dá para reabrir depois.'}
          </p>
        </div>
      </div>
      {podeDecidir && (
        <div className="fcell">
          {confirmando ? (
            <div className="encerrar-confirma" role="alert">
              <p>
                {encerrada
                  ? 'Reabrir? A formação volta para as formações em andamento e para as tarefas do Início.'
                  : 'Encerrar agora? O Início deixa de cobrar chamadas e devolutivas desta formação; o que ficou em aberto continua nesta página.'}
              </p>
              <div className="fform-acoes">
                <button ref={confirmar} type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void decidir()}>
                  {ocupado ? 'Registrando...' : encerrada ? 'Reabrir a formação' : 'Encerrar a formação'}
                </button>
                <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => { setConfirmando(false); setErro(null); }}>Manter como está</button>
              </div>
            </div>
          ) : (
            <div className="fform-acoes">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmando(true)}>
                {encerrada ? <><RotateCcw size={18} aria-hidden="true" /> Reabrir a formação</> : <><Flag size={18} aria-hidden="true" /> Encerrar a formação</>}
              </button>
            </div>
          )}
          {erro && <Note tom="danger">{erro}</Note>}
        </div>
      )}
    </section>
  );
}
