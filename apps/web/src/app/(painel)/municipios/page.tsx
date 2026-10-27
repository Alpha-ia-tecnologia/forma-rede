'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { PageHeader, Note, ListSkeleton, ErroCarga } from '../ui';

interface TenantRow {
  id: string; nome: string; uf: string; slug: string;
  config?: { corPrimaria: string } | null; _count: { escolas: number; formacoes: number };
}

export default function MunicipiosPage() {
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    api.get<TenantRow[]>('/tenants').then(setRows)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os municípios.'));
  }, [tentativa]);

  const totalEscolas = (rows ?? []).reduce((s, t) => s + t._count.escolas, 0);
  const totalFormacoes = (rows ?? []).reduce((s, t) => s + t._count.formacoes, 0);

  return (
    <div>
      <PageHeader titulo="Municípios da plataforma"
        descricao="Cada município tem o próprio ambiente: dados, pessoas e regras separados dos outros." />

      {erro && <ErroCarga mensagem={erro} aoTentar={() => { setErro(null); setTentativa((t) => t + 1); }} />}

      {rows && (
        <div className="card" style={{ marginBottom: 16, padding: '13px 20px', display: 'flex', flexWrap: 'wrap', gap: '8px 36px' }}>
          {[[rows.length, 'Municípios'], [totalEscolas, 'Escolas na plataforma'], [totalFormacoes, 'Formações na plataforma']].map(([v, l]) => (
            <div key={l as string} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="display" style={{ fontSize: 21, fontVariantNumeric: 'tabular-nums' }}>{v as number}</span>
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{l as string}</span>
            </div>
          ))}
        </div>
      )}

      {rows === null ? (
        <ListSkeleton linhas={1} altura={220} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Município</th><th>UF</th><th className="num">Escolas</th><th className="num">Formações</th><th>Identidade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.nome}<div className="muted" style={{ fontSize: 'var(--text-xs)', fontWeight: 400 }}>{t.slug}</div></td>
                    <td>{t.uf}</td>
                    <td className="num">{t._count.escolas}</td>
                    <td className="num">{t._count.formacoes}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 5, background: t.config?.corPrimaria ?? 'var(--accent)', border: '1px solid var(--line)' }} />
                        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{t.config?.corPrimaria ?? 'padrão'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 20, textAlign: 'center' }}>Nenhum município cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
