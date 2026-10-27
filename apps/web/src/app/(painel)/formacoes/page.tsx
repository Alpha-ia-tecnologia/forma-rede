'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ETAPA_FLUXO_LABELS } from '@formarede/contracts';
import type { EtapaFluxo } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { etapaParaCursista, plural } from '../../../lib/texto';
import { PageHeader, Note, EmptyState, ListSkeleton, Icon, EtapaPill, FormacaoCard, ETAPA_TOM, ErroCarga } from '../ui';

interface FormacaoRow {
  id: string; titulo: string; tema?: string | null; cargaHoraria: number; modalidade: string;
  etapaFluxo: EtapaFluxo; _count: { turmas: number; modulos: number; atividades: number };
}

export default function FormacoesPage() {
  const [rows, setRows] = useState<FormacaoRow[] | null>(null);
  const [q, setQ] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const user = getUser();
  const podeCriar = !!user && (user.permissions.includes('*') || user.permissions.includes('formacao:create'));
  // O cursista chega aqui para conhecer outras formacoes da rede (nao para gerir).
  const cursista = !!user && user.permissions.includes('participante:area') && !user.permissions.includes('formacao:update') && !user.permissions.includes('trilha:editar');

  function carregar() {
    api.get<FormacaoRow[]>('/formacoes').then(setRows)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar as formações.'));
  }
  useEffect(carregar, []);
  // Para o cursista: em quais ele ja participa.
  const [minhas, setMinhas] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!cursista) return;
    api.get<{ formacao: { id: string } }[]>('/participante/minhas-formacoes')
      .then((l) => setMinhas(new Set(l.map((m) => m.formacao.id)))).catch(() => undefined);
  }, [cursista]);

  // Vindo do "Salvar formacao": a confirmacao fica no topo e a nova em destaque na lista.
  const [salva, setSalva] = useState<{ id: string; pendente: string | null } | null>(null);
  useEffect(() => {
    const s = new URLSearchParams(window.location.search);
    const id = s.get('salva');
    if (!id) return;
    setSalva({ id, pendente: s.get('pendente') });
    window.history.replaceState(null, '', '/formacoes');
  }, []);
  const tituloSalva = rows?.find((f) => f.id === salva?.id)?.titulo;

  const filtradas = (rows ?? []).filter((f) => f.titulo.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div>
      <PageHeader titulo={cursista ? 'Formações da rede' : 'Formações'}
        descricao={cursista ? 'Conheça o que a rede oferece; abra uma formação para ver a trilha e as turmas.' : 'Abra uma formação para preparar, conduzir ou acompanhar.'}>
        {podeCriar && (
          <Link href="/formacoes/nova" className="btn btn-primary">
            <Icon size={17}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>
            Nova formação
          </Link>
        )}
      </PageHeader>

      {erro && <ErroCarga mensagem={erro} aoTentar={() => { setErro(null); carregar(); }} />}
      {salva && (
        <Note tom={salva.pendente ? 'warn' : 'ok'}>
          Formação{tituloSalva ? ` “${tituloSalva}”` : ''} salva.
          {salva.pendente
            ? ` Não foi possível criar: ${salva.pendente}. Adicione na página da formação.`
            : ' Abra-a para abrir a turma, agendar os encontros e montar a trilha.'}
        </Note>
      )}

      {rows && rows.length > 0 && (
        <div className="toolbar">
          <label className="sr-only" htmlFor="busca-formacao">Buscar formação pelo nome</label>
          <input id="busca-formacao" type="search" className="input toolbar-grow" placeholder="Buscar pelo nome" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }} role="status">{filtradas.length} de {rows.length}</span>
        </div>
      )}

      {rows === null ? (
        <ListSkeleton linhas={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<><path d="M6 4h12v16H8a2 2 0 0 1-2-2V4Z" /><path d="M10 8h5" /></>}
          titulo="Nenhuma formação criada ainda"
          descricao="Crie a primeira: depois você abre a turma, agenda os encontros e monta a trilha."
          acao={podeCriar && <Link href="/formacoes/nova" className="btn btn-primary">Criar formação</Link>}
        />
      ) : (
        <>
          <h2 className="sr-only">Lista de formações</h2>
          <div className="course-grid">
            {filtradas.map((f) => (
              <Link key={f.id} href={`/formacoes/${f.id}`} className={f.id === salva?.id ? 'formacao-nova' : undefined}>
                <FormacaoCard
                  titulo={f.titulo} modalidade={f.modalidade} cargaHoraria={f.cargaHoraria}
                  rodape={cursista
                    ? (minhas.has(f.id) ? 'Você participa' : f._count.turmas ? 'Com turma aberta' : 'Ainda sem turma')
                    : `${plural(f._count.turmas, 'turma', 'turmas')} · ${plural(f._count.modulos, 'módulo', 'módulos')} · ${plural(f._count.atividades, 'atividade', 'atividades')}`}
                  status={<EtapaPill tom={ETAPA_TOM[f.etapaFluxo] ?? 'neutral'}>{cursista ? etapaParaCursista(f.etapaFluxo) : ETAPA_FLUXO_LABELS[f.etapaFluxo]}</EtapaPill>}
                />
              </Link>
            ))}
          </div>
          {filtradas.length === 0 && <p className="muted" style={{ padding: '8px 4px' }}>Nenhuma formação corresponde a “{q}”.</p>}
        </>
      )}
    </div>
  );
}
