'use client';
// Pagina do Assistente: o historico de conversas ao lado da conversa aberta. A
// conversa usa as mesmas pecas do painel flutuante (chat.tsx). Aqui o painel fecha.
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, Sparkles, Trash2 } from 'lucide-react';
import type { ConversaResumo } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { Note, PageHeader } from '../ui';
import { Compor, Conversa, Espera, sugestoesPara, useAssistente } from './chat';

interface FormacaoOpcao { id: string; titulo: string }

const quando = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

export default function AssistentePage() {
  const user = getUser();
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [formacoes, setFormacoes] = useState<FormacaoOpcao[]>([]);
  const [formacaoNova, setFormacaoNova] = useState('');
  const [erroLista, setErroLista] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);

  const carregarLista = useCallback(() => {
    api.get<ConversaResumo[]>('/assistente/conversas').then(setConversas)
      .catch((e) => setErroLista(e instanceof Error ? e.message : 'Não foi possível carregar as conversas.'));
  }, []);
  const a = useAssistente({ aoConcluir: carregarLista });

  useEffect(() => {
    carregarLista();
    api.get<FormacaoOpcao[]>('/formacoes').then((fs) => setFormacoes(fs.map((f) => ({ id: f.id, titulo: f.titulo })))).catch(() => undefined);
    // ?formacao=ID (atalho da formacao) ja deixa a formacao em foco; ?conversa=ID vem do painel.
    const q = new URLSearchParams(window.location.search);
    if (q.get('formacao')) setFormacaoNova(q.get('formacao') as string);
    if (q.get('conversa')) void a.abrir(q.get('conversa') as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregarLista]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [a.conversa?.turnos.length, a.emCurso?.texto, a.emCurso?.planejamentos.length, a.emCurso?.passos.length]);

  async function nova() {
    if (a.emCurso) return;
    a.limpar();
    const c = await a.nova(formacaoNova || undefined);
    if (c) {
      carregarLista();
      caixa.current?.focus();
    }
  }

  async function excluir(id: string) {
    if (!window.confirm('Excluir esta conversa? O histórico dela será apagado.')) return;
    try {
      await api.del(`/assistente/conversas/${id}`);
      if (a.conversa?.id === id) a.limpar();
      carregarLista();
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : 'Não foi possível excluir a conversa.');
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Assistente IA"
        descricao="Planeje aulas e encontros e tire dúvidas sobre como aplicar as ideias da formação. O assistente propõe; você decide."
      />

      <div className="chat-layout">
        <aside className="card chat-lista" aria-label="Conversas">
          <div className="chat-nova">
            <label className="label" htmlFor="formacao-foco">Formação em foco</label>
            <select id="formacao-foco" className="input" value={formacaoNova} onChange={(e) => setFormacaoNova(e.target.value)}>
              <option value="">Nenhuma</option>
              {formacoes.map((f) => <option key={f.id} value={f.id}>{f.titulo}</option>)}
            </select>
            <button type="button" className="btn btn-primary" onClick={() => void nova()} disabled={!!a.emCurso} style={{ width: '100%' }}>
              <MessageSquarePlus size={16} aria-hidden="true" />
              Começar uma conversa
            </button>
          </div>
          {erroLista && <div style={{ padding: '0 12px' }}><Note tom="danger">{erroLista}</Note></div>}
          <div className="chat-lista-itens">
            {conversas === null ? (
              <p className="muted chat-lista-vazia">Carregando...</p>
            ) : conversas.length === 0 ? (
              <p className="muted chat-lista-vazia">Suas conversas aparecem aqui.</p>
            ) : conversas.map((c) => (
              <div key={c.id} className={`chat-item${a.conversa?.id === c.id ? ' is-atual' : ''}`}>
                <button type="button" className="chat-item-abrir" onClick={() => void a.abrir(c.id)} aria-current={a.conversa?.id === c.id ? 'true' : undefined} disabled={!!a.emCurso}>
                  <strong>{c.titulo}</strong>
                  <small>{c.formacao ? `${c.formacao.titulo} · ` : ''}{quando(c.atualizadaEm)}</small>
                </button>
                <button type="button" className="chat-item-excluir" onClick={() => void excluir(c.id)} aria-label={`Excluir a conversa ${c.titulo}`} disabled={!!a.emCurso}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="card chat-painel" aria-label="Conversa com o assistente">
          <header className="ast-topo">
            <span className="ast-marca" aria-hidden="true"><Sparkles size={16} /></span>
            <div className="ast-topo-texto">
              <strong>{a.conversa?.titulo ?? 'Nova conversa'}</strong>
              <small>{a.conversa?.formacao ? `Formação em foco: ${a.conversa.formacao.titulo}` : 'Responde com base nos materiais aprovados da rede'}</small>
            </div>
          </header>
          <Conversa a={a} sugestoes={sugestoesPara(user?.role)} formacaoId={formacaoNova || undefined} fimRef={fim} />
          <Espera a={a} />
          <Compor a={a} formacaoId={formacaoNova || undefined} caixaRef={caixa} />
        </section>
      </div>
    </div>
  );
}
