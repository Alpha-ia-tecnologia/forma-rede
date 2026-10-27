'use client';
// Botao flutuante do Assistente + painel de conversa (AssistantFab/AssistantPopup do
// design system). O painel e um dialogo nao modal; depois da primeira abertura fica
// montado (escondido), para uma resposta em preparo nao se perder ao fechar ou
// trocar de pagina. Com o painel fechado, o botao mostra o estado pela forma.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Maximize2, MessageSquarePlus, Sparkles, X } from 'lucide-react';
import type { ConversaResumo, Role } from '@formarede/contracts';
import { api } from '../../../lib/api';
import { Compor, Conversa, Espera, sugestoesPara, useAssistente, type Atividade } from './chat';

const ANUNCIO: Record<Exclude<Atividade, null>, string> = {
  ocupado: 'O assistente está preparando a resposta.',
  pronto: 'A resposta do assistente está pronta.',
  aviso: 'A resposta do assistente não veio.',
};
const NOME_DO_ESTADO: Record<Exclude<Atividade, null>, string> = {
  ocupado: ' (resposta em preparo)', pronto: ' (resposta pronta)', aviso: ' (a resposta não veio)',
};

export function AssistentePopup({ aberto, setAberto, role, formacaoId }: {
  aberto: boolean; setAberto: (v: boolean) => void; role?: Role; formacaoId?: string;
}) {
  const [montado, setMontado] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [atividade, setAtividade] = useState<Atividade>(null);
  const [compacto, setCompacto] = useState(false);
  const a = useAssistente({ aoMudarAtividade: setAtividade });
  const fab = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  // Primeira abertura: monta o painel e retoma a ultima conversa.
  useEffect(() => {
    if (!aberto) return;
    if (!montado) {
      setMontado(true);
      setAbrindo(true);
      api.get<ConversaResumo[]>('/assistente/conversas')
        .then(async (lista) => { if (lista[0]) await a.abrir(lista[0].id); })
        .catch(() => undefined)
        .finally(() => setAbrindo(false));
    }
    // Aberto, a pessoa ja ve a resposta: so o "em preparo" continua marcado.
    setAtividade((x) => (x === 'ocupado' ? x : null));
    requestAnimationFrame(() => caixa.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // Esc fecha e devolve o foco ao botao.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAberto(false); fab.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto, setAberto]);

  // Pagina rolada: o botao vira so o icone.
  useEffect(() => {
    const onScroll = () => setCompacto(window.scrollY > 240);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (aberto) fim.current?.scrollIntoView({ block: 'end' });
  }, [aberto, a.conversa?.turnos.length, a.emCurso?.texto, a.emCurso?.planejamentos.length, a.emCurso?.passos.length]);

  const marca = !aberto && atividade ? atividade : null;
  const paginaInteira = a.conversa ? `/assistente?conversa=${a.conversa.id}` : '/assistente';

  function fechar() {
    setAberto(false);
    fab.current?.focus();
  }

  return (
    <>
      <button
        ref={fab} type="button" className="assistant-fab"
        data-compact={compacto && !aberto ? 'true' : undefined}
        aria-expanded={aberto} aria-controls="painel-assistente"
        aria-label={aberto ? 'Fechar o assistente' : `Abrir o assistente${marca ? NOME_DO_ESTADO[marca] : ''}`}
        onClick={() => setAberto(!aberto)}
      >
        {aberto ? <X size={22} aria-hidden="true" /> : <Sparkles size={22} aria-hidden="true" />}
        <span className="assistant-fab-label">{aberto ? 'Fechar' : 'Assistente'}</span>
        {marca && <span className="assistant-fab-mark" data-activity={marca} aria-hidden="true" />}
      </button>
      <span className="sr-only" role="status">{marca ? ANUNCIO[marca] : ''}</span>

      {montado && (
        <div id="painel-assistente" className="assistant-panel" role="dialog" aria-modal="false" aria-label="Assistente IA" hidden={!aberto}>
          <header className="ast-topo">
            <span className="ast-marca" aria-hidden="true"><Sparkles size={16} /></span>
            <div className="ast-topo-texto">
              <strong>Assistente IA</strong>
              <small>{abrindo ? 'Abrindo o assistente...' : a.conversa?.titulo ?? 'Nova conversa'}</small>
            </div>
            <button type="button" className="ast-redondo" onClick={a.limpar} disabled={!!a.emCurso} aria-label="Nova conversa" title="Nova conversa">
              <MessageSquarePlus size={17} aria-hidden="true" />
            </button>
            <Link
              href={paginaInteira} className="ast-redondo" title="Abrir em página inteira" aria-label="Abrir em página inteira"
              aria-disabled={a.emCurso ? 'true' : undefined} tabIndex={a.emCurso ? -1 : undefined}
              onClick={() => setAberto(false)}
            >
              <Maximize2 size={16} aria-hidden="true" />
            </Link>
            <button type="button" className="ast-redondo" onClick={fechar} aria-label="Fechar o assistente" title="Fechar">
              <X size={17} aria-hidden="true" />
            </button>
          </header>
          <Conversa a={a} sugestoes={sugestoesPara(role)} formacaoId={formacaoId} fimRef={fim} />
          <Espera a={a} />
          <Compor a={a} formacaoId={formacaoId} caixaRef={caixa} />
        </div>
      )}
    </>
  );
}
