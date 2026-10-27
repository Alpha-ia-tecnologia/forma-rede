'use client';
// Conversa com o Assistente, compartilhada pelo painel flutuante e pela pagina
// /assistente: estado do turno em streaming, envio, parada e sinalizacao, e as
// pecas visuais (conversa, faixa de espera e campo), no modelo do AssistantChat.
import { useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BookMarked, Check, Flag, Lightbulb, LoaderCircle, SendHorizontal, Sparkles, Square, TriangleAlert } from 'lucide-react';
import type { ConversaDetalhe, ConversaResumo, EventoAssistenteStream, Planejamento, Role, TurnoAssistente } from '@formarede/contracts';
import { api, streamPost } from '../../../lib/api';
import { Markdown } from './markdown';
import { PlanejamentoCard } from './planejamento';

/** Estado mostrado no botao flutuante com o painel fechado. */
export type Atividade = 'ocupado' | 'pronto' | 'aviso' | null;

interface Passo { nome: string; rotulo: string; estado: 'inicio' | 'fim' | 'erro' }
interface EmCurso { pergunta: string; texto: string; progresso: string; passos: Passo[]; planejamentos: Planejamento[]; inicio: string }

// O servidor manda o gerundio ("Buscando..."); feito, o passo vai para o passado.
const FEITO: Record<string, string> = {
  listar_formacoes: 'Consultou as formações',
  consultar_formacao: 'Leu a formação',
  buscar_materiais_aprovados: 'Buscou materiais aprovados',
  apresentar_planejamento: 'Montou o planejamento',
};

const SUGESTOES_PROFESSOR = [
  'Planeje uma aula de leitura compartilhada para o 2º ano, 25 estudantes, 50 minutos',
  'Como aplicar o que vimos na formação numa turma com 35 estudantes?',
  'Adapte uma atividade de escrita para um estudante com baixa visão',
  'Que formas de avaliar a aprendizagem posso usar sem prova?',
];
const SUGESTOES_FORMADOR = [
  'Monte o roteiro do próximo encontro formativo, com 2 horas',
  'Como conduzir a devolutiva das entregas dos professores?',
  'Sugira uma sequência didática para aplicarem entre os encontros',
  'Que perguntas usar para os professores refletirem sobre a prática?',
];

export function sugestoesPara(role: Role | undefined): string[] {
  return role === 'PROFESSOR' ? SUGESTOES_PROFESSOR : SUGESTOES_FORMADOR;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function useAssistente(opts: { aoMudarAtividade?: (a: Atividade) => void; aoConcluir?: () => void } = {}) {
  const [conversa, setConversa] = useState<ConversaDetalhe | null>(null);
  const [emCurso, setEmCurso] = useState<EmCurso | null>(null);
  const [erro, setErro] = useState<{ mensagem: string; pergunta?: string } | null>(null);
  const [texto, setTexto] = useState('');
  const [sinalizadas, setSinalizadas] = useState<Record<string, boolean>>({});
  // Passos de cada turno feito nesta sessao (o historico gravado guarda as fontes).
  const [passosDoTurno, setPassosDoTurno] = useState<Record<string, Passo[]>>({});
  const controle = useRef<AbortController | null>(null);

  async function abrir(id: string): Promise<boolean> {
    if (emCurso) return false;
    setErro(null);
    try {
      setConversa(await api.get<ConversaDetalhe>(`/assistente/conversas/${id}`));
      return true;
    } catch (e) {
      setErro({ mensagem: e instanceof Error ? e.message : 'Não foi possível abrir a conversa.' });
      return false;
    }
  }

  async function nova(formacaoId?: string): Promise<ConversaDetalhe | null> {
    try {
      const c = await api.post<ConversaResumo>('/assistente/conversas', formacaoId ? { formacaoId } : {});
      const detalhe: ConversaDetalhe = { id: c.id, titulo: c.titulo, formacao: c.formacao, atualizadaEm: c.atualizadaEm, turnos: [] };
      setConversa(detalhe);
      return detalhe;
    } catch (e) {
      setErro({ mensagem: e instanceof Error ? e.message : 'Não foi possível começar a conversa.' });
      return null;
    }
  }

  /** Volta para a conversa nova (a proxima pergunta cria outra conversa). */
  function limpar() {
    if (emCurso) return;
    setConversa(null);
    setErro(null);
  }

  async function enviar(pergunta = texto, formacaoId?: string): Promise<void> {
    const q = pergunta.trim();
    if (q.length < 2 || emCurso) return;
    setErro(null);
    setTexto('');
    const alvo = conversa ?? (await nova(formacaoId));
    if (!alvo) { setTexto(q); return; }

    setEmCurso({ pergunta: q, texto: '', progresso: '', passos: [], planejamentos: [], inicio: new Date().toISOString() });
    opts.aoMudarAtividade?.('ocupado');
    const ctrl = new AbortController();
    controle.current = ctrl;
    let concluido: TurnoAssistente | null = null;
    let passos: Passo[] = [];
    let falha: string | null = null;

    try {
      await streamPost<EventoAssistenteStream>(`/assistente/conversas/${alvo.id}/mensagens`, { texto: q }, (e) => {
        if (e.tipo === 'texto') setEmCurso((s) => s && { ...s, texto: s.texto + e.delta });
        else if (e.tipo === 'progresso') setEmCurso((s) => s && { ...s, progresso: (s.progresso + e.delta).slice(-200) });
        else if (e.tipo === 'ferramenta') {
          const passo: Passo = { nome: e.nome, rotulo: e.estado === 'inicio' ? e.rotulo : FEITO[e.nome] ?? e.rotulo, estado: e.estado };
          // O mesmo nome volta como "fim": troca o passo em andamento pelo feito.
          const i = passos.findIndex((p) => p.nome === e.nome && p.estado === 'inicio');
          passos = i >= 0 ? passos.map((p, j) => (j === i ? passo : p)) : [...passos, passo];
          setEmCurso((s) => s && { ...s, passos });
        } else if (e.tipo === 'planejamento') setEmCurso((s) => s && { ...s, planejamentos: [...s.planejamentos, e.planejamento] });
        else if (e.tipo === 'fim') concluido = e.turno;
        else if (e.tipo === 'erro') falha = e.mensagem;
      }, ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) falha = e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.';
    }

    const turno = concluido as TurnoAssistente | null;
    if (turno) {
      setPassosDoTurno((m) => ({ ...m, [turno.id]: passos }));
      // Recarrega para pegar o titulo que o servidor deu a conversa.
      const atualizada = await api.get<ConversaDetalhe>(`/assistente/conversas/${alvo.id}`).catch(() => null);
      setConversa(atualizada ?? { ...alvo, turnos: [...alvo.turnos, turno] });
      opts.aoMudarAtividade?.('pronto');
      opts.aoConcluir?.();
    } else if (ctrl.signal.aborted) {
      setTexto(q);
      opts.aoMudarAtividade?.(null);
    } else {
      setErro({ mensagem: falha ?? 'A resposta não veio. Nada foi salvo.', pergunta: q });
      opts.aoMudarAtividade?.('aviso');
    }
    setEmCurso(null);
    controle.current = null;
  }

  function parar() { controle.current?.abort(); }

  async function sinalizar(interacaoId: string) {
    const motivo = window.prompt('O que está errado ou inadequado nesta resposta?');
    if (!motivo || motivo.trim().length < 3) return;
    try {
      await api.post(`/ia/interacoes/${interacaoId}/sinalizar`, { motivo: motivo.trim() });
      setSinalizadas((s) => ({ ...s, [interacaoId]: true }));
    } catch (e) {
      setErro({ mensagem: e instanceof Error ? e.message : 'Não foi possível sinalizar a resposta.' });
    }
  }

  return { conversa, emCurso, erro, texto, setTexto, sinalizadas, passosDoTurno, abrir, nova, limpar, enviar, parar, sinalizar };
}

export type Assistente = ReturnType<typeof useAssistente>;

/** A conversa: boas-vindas com sugestoes, turnos, resposta chegando e erro. */
export function Conversa({ a, sugestoes, formacaoId, fimRef }: {
  a: Assistente; sugestoes: string[]; formacaoId?: string; fimRef?: RefObject<HTMLDivElement | null>;
}) {
  const vazia = !a.conversa?.turnos.length && !a.emCurso;
  return (
    <div className="ast-conversa" aria-live="polite" aria-busy={!!a.emCurso}>
      {vazia && (
        <div className="ast-ola">
          <span className="ast-ola-icone" aria-hidden="true"><Lightbulb size={30} /></span>
          <h2>Olá! Como posso ajudar?</h2>
          <p>Planejo aulas e encontros e tiro dúvidas sobre como aplicar as ideias da formação.</p>
          <div className="ast-sugestoes">
            {sugestoes.map((s) => (
              <button key={s} type="button" className="ast-sugestao" onClick={() => void a.enviar(s, formacaoId)} disabled={!!a.emCurso}>{s}</button>
            ))}
          </div>
          <p className="ast-nota-ola">Consulto só materiais aprovados da rede. E-mails, CPFs e telefones são mascarados antes do envio.</p>
        </div>
      )}

      {a.conversa?.turnos.map((t) => (
        <Turno key={t.id} pergunta={t.pergunta} horario={t.criadoEm} texto={t.resposta} planejamentos={t.planejamentos}
          passos={a.passosDoTurno[t.id] ?? []} fontes={t.fontes}
          rodape={t.interacaoId && (
            <div className="msg-rodape">
              <span>Gerado por IA · {hora(t.criadoEm)}</span>
              {a.sinalizadas[t.interacaoId]
                ? <span className="msg-sinalizada"><Flag size={13} aria-hidden="true" />Resposta sinalizada</span>
                : <button type="button" className="msg-sinalizar" onClick={() => void a.sinalizar(t.interacaoId as string)}><Flag size={13} aria-hidden="true" />Sinalizar resposta</button>}
            </div>
          )} />
      ))}

      {a.emCurso && (
        <Turno pergunta={a.emCurso.pergunta} horario={a.emCurso.inicio} texto={a.emCurso.texto}
          planejamentos={a.emCurso.planejamentos} passos={a.emCurso.passos} fontes={[]} />
      )}

      {a.erro && (
        <div className="ast-sistema" data-tom="erro" role="alert">
          {a.erro.mensagem}
          {a.erro.pergunta && (
            <> {' '}<button type="button" className="msg-sinalizar" style={{ marginLeft: 6 }}
              onClick={() => void a.enviar(a.erro?.pergunta, formacaoId)}>Usar a mesma mensagem</button></>
          )}
        </div>
      )}
      <div ref={fimRef} />
    </div>
  );
}

function Turno({ pergunta, horario, texto, planejamentos, passos, fontes, rodape }: {
  pergunta: string; horario: string; texto: string; planejamentos: Planejamento[]; passos: Passo[];
  fontes: { id: string; titulo: string }[]; rodape?: ReactNode;
}) {
  const temCorpo = texto || planejamentos.length > 0 || passos.length > 0;
  return (
    <div className="turno">
      <div className="msg-user">
        <span>{pergunta}</span>
        <span className="msg-hora">{hora(horario)}</span>
      </div>
      {temCorpo && (
        <div className="msg-ia">
          <span className="ast-marca" aria-hidden="true"><Sparkles size={16} /></span>
          <div className="msg-ia-corpo">
            {passos.length > 0 && (
              <div className="ast-passos">
                {passos.map((p, i) => (
                  <span key={i} className="ast-passo" data-estado={p.estado}>
                    {p.estado === 'inicio' ? <LoaderCircle size={12} className="gira" aria-hidden="true" />
                      : p.estado === 'erro' ? <TriangleAlert size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                    {p.estado === 'erro' ? `Falhou: ${p.rotulo}` : p.rotulo}
                  </span>
                ))}
              </div>
            )}
            {texto && <Markdown texto={texto} />}
            {planejamentos.map((p, i) => <PlanejamentoCard key={i} p={p} />)}
            {fontes.length > 0 && (
              <div className="msg-fontes">
                <BookMarked size={14} aria-hidden="true" />
                <span>Materiais consultados: {fontes.map((f) => f.titulo).join('; ')}</span>
              </div>
            )}
            {rodape}
          </div>
        </div>
      )}
    </div>
  );
}

/** Faixa de espera entre a conversa e o campo, ligada aos passos reais. */
export function Espera({ a }: { a: Assistente }) {
  if (!a.emCurso) return null;
  const emAndamento = [...a.emCurso.passos].reverse().find((p) => p.estado === 'inicio');
  const nota = a.emCurso.progresso.trim().split('\n').at(-1);
  return (
    <div className="ast-espera" role="status">
      <span className="barra" aria-hidden="true" />
      <span>{emAndamento?.rotulo ?? (nota || 'Preparando a resposta…')}</span>
    </div>
  );
}

/** Campo da mensagem: Enter envia, Shift+Enter quebra a linha; durante a resposta, so leitura. */
export function Compor({ a, formacaoId, caixaRef, rotulo = 'Escreva sua mensagem' }: {
  a: Assistente; formacaoId?: string; caixaRef?: RefObject<HTMLTextAreaElement | null>; rotulo?: string;
}) {
  const ocupado = !!a.emCurso;
  const id = useId();
  return (
    <>
      <form className="ast-compor" onSubmit={(e) => { e.preventDefault(); void a.enviar(a.texto, formacaoId); }}>
        <label htmlFor={id} className="sr-only">{rotulo}</label>
        <textarea
          id={id} ref={caixaRef} className="input" rows={1} maxLength={8000}
          value={a.texto} readOnly={ocupado}
          placeholder={ocupado ? 'Aguarde a resposta...' : rotulo}
          onChange={(e) => a.setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void a.enviar(a.texto, formacaoId); } }}
        />
        {ocupado ? (
          <button type="button" className="ast-enviar" data-parar="true" onClick={a.parar} aria-label="Parar a resposta">
            <Square size={16} aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className="ast-enviar" disabled={a.texto.trim().length < 2} aria-label="Enviar">
            <SendHorizontal size={18} aria-hidden="true" />
          </button>
        )}
      </form>
      <p className="ast-nota">O assistente propõe; você decide. Confira antes de usar com a turma.</p>
    </>
  );
}
