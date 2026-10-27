'use client';
// Escolas e unidades do municipio (cadastro da gestao da rede).
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Plus, School } from 'lucide-react';
import { UNIDADE_TIPOS } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { plural } from '../../../lib/texto';
import { PageHeader, StatusBadge, Note, EmptyState, ListSkeleton, ErroCarga } from '../ui';

interface Escola {
  id: string; nome: string; tipo: string; ativo: boolean; regional?: { nome: string } | null;
}

const nomeTipo = (t: string) => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');

export default function EscolasPage() {
  const [rows, setRows] = useState<Escola[] | null>(null);
  const [q, setQ] = useState('');
  const [criando, setCriando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const user = getUser();
  const podeCriar = !!user && (user.permissions.includes('*') || user.permissions.includes('escola:create'));

  function carregar() {
    setErroCarga(null);
    api.get<Escola[]>('/escolas').then(setRows)
      .catch((e) => setErroCarga(e instanceof Error ? e.message : 'Não foi possível carregar as unidades.'));
  }
  useEffect(carregar, []);

  const filtradas = (rows ?? []).filter((e) => e.nome.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div>
      <PageHeader titulo="Escolas e unidades" descricao="As unidades do município, para ligar turmas e professores às suas escolas.">
        {podeCriar && !criando && (
          <button type="button" className="btn btn-primary" onClick={() => { setCriando(true); setAviso(null); }}>
            <Plus size={18} aria-hidden="true" /> Nova unidade
          </button>
        )}
      </PageHeader>

      {criando && <NovaUnidade aoFechar={(nome) => { setCriando(false); if (nome) { setAviso(`“${nome}” adicionada.`); carregar(); } }} />}
      {aviso && <Note tom="ok">{aviso}</Note>}
      {erroCarga && <ErroCarga mensagem={erroCarga} aoTentar={carregar} />}

      {rows === null ? (
        !erroCarga && <ListSkeleton linhas={4} altura={64} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<School size={26} />} titulo="Nenhuma unidade cadastrada ainda"
          descricao="Cadastre escolas e polos formativos para ligar turmas e professores às suas unidades."
          acao={podeCriar && <button type="button" className="btn btn-primary" onClick={() => setCriando(true)}>Adicionar unidade</button>} />
      ) : (
        <section className="fsec" aria-labelledby="unidades">
          <div className="fsec-head">
            <div>
              <h2 id="unidades" className="section-title">Unidades</h2>
              <p className="fsec-lead" role="status">{q ? `${filtradas.length} de ${rows.length}` : plural(rows.length, 'unidade', 'unidades')}</p>
            </div>
            <div className="busca">
              <label className="sr-only" htmlFor="busca-escola">Buscar unidade pelo nome</label>
              <input id="busca-escola" type="search" className="input" placeholder="Buscar pelo nome" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {filtradas.length === 0 ? (
            <p className="fsec-vazio">Nenhuma unidade corresponde a “{q}”.</p>
          ) : (
            <ul className="fsec-lista">
              {filtradas.map((e) => (
                <li key={e.id} className="fitem fitem-linha">
                  <div>
                    <h3 className="fitem-titulo">{e.nome}</h3>
                    <p className="fitem-meta">
                      <span>{nomeTipo(e.tipo)}</span>
                      {e.regional && <span>{e.regional.nome}</span>}
                    </p>
                  </div>
                  <StatusBadge tom={e.ativo ? 'good' : 'neutral'}>{e.ativo ? 'Ativa' : 'Inativa'}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function NovaUnidade({ aoFechar }: { aoFechar: (nome: string | null) => void }) {
  const id = useId();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<string>('ESCOLA');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      await api.post('/escolas', { nome: nome.trim(), tipo, etapas: [] });
      aoFechar(nome.trim());
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível adicionar a unidade.');
      setOcupado(false);
    }
  }

  return (
    <form className="fform fform-destaque" onSubmit={criar} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="trilha-form-titulo">Nova unidade</h2>
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-nome`}>Nome da unidade</label>
          <input id={`${id}-nome`} className="input" required autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: EMEF Paulo Freire" />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-tipo`}>Tipo</label>
          <select id={`${id}-tipo`} className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {UNIDADE_TIPOS.map((t) => <option key={t} value={t}>{nomeTipo(t)}</option>)}
          </select>
        </div>
      </div>
      {erro && <Note tom="danger">{erro}</Note>}
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado || !nome.trim()}>{ocupado ? 'Adicionando...' : 'Adicionar'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => aoFechar(null)}>Cancelar</button>
      </div>
    </form>
  );
}
