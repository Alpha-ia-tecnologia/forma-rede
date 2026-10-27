'use client';
// Governanca de IA por municipio (RIA-004/005/013): habilitar modulos,
// escolher provider e auditar todas as interacoes.
import { useEffect, useState } from 'react';
import { IA_PROVIDERS } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { PageHeader, StatusBadge, Note, EmptyState, ListSkeleton, Icon, type Tom } from '../ui';

interface IaConfig { iaHabilitada: boolean; iaProvider: string; }
interface InteracaoRow {
  id: string; assistente: string; provider: string; modelo: string; promptVersao: string;
  status: string; sinalizada: boolean; tokensEntrada: number; tokensSaida: number;
  createdAt: string; decididoEm?: string | null;
}

const STATUS: Record<string, { label: string; tom: Tom }> = {
  APROVADA: { label: 'Aprovada', tom: 'good' },
  EDITADA: { label: 'Editada', tom: 'diff' },
  REJEITADA: { label: 'Rejeitada', tom: 'danger' },
  GERADA: { label: 'Gerada', tom: 'neutral' },
};

export default function IaGovernadaPage() {
  const [config, setConfig] = useState<IaConfig | null>(null);
  const [rows, setRows] = useState<InteracaoRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const user = getUser();
  const pode = (p: string) => !!user && (user.permissions.includes('*') || user.permissions.includes(p));

  useEffect(() => {
    api.get<IaConfig>('/ia/config').then(setConfig).catch(() => undefined);
    if (pode('ia:auditar')) {
      api.get<InteracaoRow[]>('/ia/interacoes').then(setRows)
        .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'));
    } else {
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvar(novo: IaConfig) {
    setErro(null); setMsg(null);
    try {
      await api.put<IaConfig>('/ia/config', novo);
      setConfig(novo);
      setMsg('Configuração de IA atualizada.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar.');
    }
  }

  return (
    <div>
      <PageHeader titulo="IA governada"
        descricao="Controle os recursos de IA do município e audite todas as interações. Todo plano gerado passa por revisão humana." />

      {msg && <Note tom="ok">{msg}</Note>}
      {erro && <Note tom="danger">{erro}</Note>}

      {config && pode('ia:config') && (
        <div className="card" style={{ padding: 18, marginBottom: 18, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
            <input type="checkbox" checked={config.iaHabilitada} onChange={(e) => salvar({ ...config, iaHabilitada: e.target.checked })} />
            Recursos de IA habilitados
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="label" style={{ margin: 0 }}>Provider</span>
            <select className="input" style={{ width: 160 }} value={config.iaProvider} onChange={(e) => salvar({ ...config, iaProvider: e.target.value })}>
              {IA_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <span className="muted" style={{ fontSize: 'var(--text-xs)', flex: '1 1 200px' }}>
            O provider <b>anthropic</b> requer ANTHROPIC_API_KEY configurada no servidor.
          </span>
        </div>
      )}

      {pode('ia:auditar') && <div className="label" style={{ marginBottom: 8 }}>Trilha de auditoria</div>}

      {rows === null ? (
        <ListSkeleton linhas={4} altura={56} />
      ) : !pode('ia:auditar') ? null : rows.length === 0 ? (
        <EmptyState
          icon={<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />}
          titulo="Nenhuma interação de IA registrada"
          descricao="Cada geração feita pelo copiloto é registrada aqui com provider, modelo, tokens e decisão humana."
        />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => {
            const s = STATUS[r.status] ?? { label: r.status, tom: 'neutral' as Tom };
            return (
              <div key={r.id} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)' }}>{r.assistente} <span className="muted" style={{ fontWeight: 400 }}>({r.promptVersao})</span></div>
                  <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                    {r.provider}/{r.modelo} · {r.tokensEntrada + r.tokensSaida} tokens · {new Date(r.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {r.sinalizada && <StatusBadge tom="warn">Sinalizada</StatusBadge>}
                  <StatusBadge tom={s.tom}>{s.label}</StatusBadge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
