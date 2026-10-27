'use client';
// Pagina da formacao. Duas visoes sobre a mesma trilha:
// - cursista: o que falta para o certificado, a trilha, as proprias atividades e encontros;
// - quem conduz: o que precisa de atencao agora, o plano formativo (Copiloto), a trilha,
//   a fila de entregas e as chamadas.
// O resto (modulos, outros materiais) fica recolhido em "Sobre a formacao".
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { MessageCircleQuestion } from 'lucide-react';
import { ETAPA_FLUXO_LABELS } from '@formarede/contracts';
import type { AcompanhamentoFormacao, EtapaFluxo, ParticipacaoFormacao, TrilhaFormacao } from '@formarede/contracts';
import { api, getUser } from '../../../../lib/api';
import { abrirAssistente } from '../../../../lib/assistente';
import { etapaParaCursista, modalidade } from '../../../../lib/texto';
import { PageHeader, StatusBadge, Note, ListSkeleton, type Tom } from '../../ui';
import { TrilhaFormativa } from './trilha';
import { AtividadesCursista, EncontrosCursista, NaoInscrito, ResumoCursista } from './cursista';
import { AtencaoConducao, AtividadesConducao, EncontrosConducao } from './conducao';
import { ProcessoFormacao, type Transicao } from './processo';
import { PlanoFormativo } from './plano';
import { PreparacaoFormacao } from './preparacao';

interface Detalhe {
  id: string;
  titulo: string;
  tema?: string | null;
  objetivos?: string | null;
  publicoAlvo?: string | null;
  cargaHoraria: number;
  modalidade: string;
  etapaFluxo: EtapaFluxo;
  freqMinimaPct: number;
  modulos: { id: string; titulo: string; ordem: number }[];
  turmas: { id: string; nome: string; vagas: number; _count: { inscricoes: number; encontros: number } }[];
  materiais: { id: string; material: { id: string; titulo: string; tipo: string; status: string } }[];
  atividades: { id: string; titulo: string; prazo?: string | null; pontuacao: number }[];
  transicoes: Transicao[];
}

/** Quem conduz ou acompanha a formacao (mesma regra do painel na API). */
const CONDUZ = ['trilha:editar', 'frequencia:registrar', 'entrega:read', 'inscricao:read', 'formacao:update'];
/** Antes da execucao, a primeira secao de quem conduz e a lista de preparacao. */
const PREPARACAO: EtapaFluxo[] = ['PLANEJAMENTO', 'CURADORIA', 'DESENHO'];
const STATUS_MATERIAL: Record<string, { texto: string; tom: Tom }> = {
  APROVADO: { texto: 'Aprovado', tom: 'good' }, EM_REVISAO: { texto: 'Em revisão', tom: 'warn' },
  REJEITADO: { texto: 'Recusado', tom: 'danger' }, RASCUNHO: { texto: 'Rascunho', tom: 'neutral' },
};
const msg = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);

export default function FormacaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const user = getUser();
  const pode = (p: string) => !!user && (user.permissions.includes('*') || user.permissions.includes(p));
  const conduz = CONDUZ.some(pode);
  const cursista = !conduz && pode('participante:area');

  const [f, setF] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // undefined: carregando; null: nao participa de turma desta formacao.
  const [part, setPart] = useState<ParticipacaoFormacao | null | undefined>(undefined);
  const [acomp, setAcomp] = useState<AcompanhamentoFormacao | null>(null);
  const [erroAcomp, setErroAcomp] = useState<string | null>(null);
  const [trilha, setTrilha] = useState<TrilhaFormacao | null>(null);
  const [atividadeAberta, setAtividadeAberta] = useState<string | null>(null);

  const carregarDetalhe = useCallback(() => {
    api.get<Detalhe>(`/formacoes/${id}`).then(setF).catch((e) => setErro(msg(e, 'Não foi possível carregar a formação.')));
  }, [id]);
  const carregarParticipacao = useCallback(() => {
    if (!cursista) return;
    api.get<ParticipacaoFormacao | null>(`/formacoes/${id}/minha-participacao`).then(setPart).catch(() => setPart(null));
  }, [id, cursista]);
  const carregarAcompanhamento = useCallback(() => {
    if (!conduz) return;
    api.get<AcompanhamentoFormacao>(`/formacoes/${id}/acompanhamento`).then(setAcomp)
      .catch((e) => setErroAcomp(msg(e, 'Não foi possível carregar o acompanhamento.')));
  }, [id, conduz]);

  useEffect(carregarDetalhe, [carregarDetalhe]);
  useEffect(carregarParticipacao, [carregarParticipacao]);
  useEffect(carregarAcompanhamento, [carregarAcompanhamento]);

  // Links diretos (vindos do Inicio): ?avaliar=<atividade> abre a fila de entregas e
  // #<secao> rola ate ela quando os dados chegam (a trilha cuida do proprio #trilha).
  const linkTratado = useRef(false);
  const pronto = !!f && (cursista ? part !== undefined : conduz ? !!acomp : true);
  useEffect(() => {
    if (!pronto || linkTratado.current) return;
    linkTratado.current = true;
    const avaliar = new URLSearchParams(window.location.search).get('avaliar');
    if (avaliar) setAtividadeAberta(avaliar);
    const alvo = window.location.hash.slice(1);
    if (alvo && alvo !== 'trilha') {
      // Algumas secoes (ex.: #plano) carregam depois: tenta por alguns instantes.
      const rolar = (tentativa: number) => {
        const el = document.getElementById(decodeURIComponent(alvo));
        if (el) el.scrollIntoView({ block: 'start' });
        else if (tentativa < 20) setTimeout(() => rolar(tentativa + 1), 100);
      };
      requestAnimationFrame(() => requestAnimationFrame(() => rolar(0)));
    }
  }, [pronto]);

  if (erro && !f) return <Note tom="danger">{erro}</Note>;
  if (!f) return <ListSkeleton linhas={3} altura={110} />;

  const mod = modalidade(f.modalidade);
  // O cursista ve a etapa no idioma de quem estuda; quem conduz, o fluxo do processo.
  const etapa = cursista ? etapaParaCursista(f.etapaFluxo) : ETAPA_FLUXO_LABELS[f.etapaFluxo];
  const naTrilha = new Set(trilha?.etapas.flatMap((e) => (e.material ? [e.material.id] : [])) ?? []);
  const pendentesCuradoria = trilha?.etapas.filter((e) => e.material?.status === 'EM_REVISAO').length ?? 0;
  const outrosMateriais = f.materiais.filter((m) => !naTrilha.has(m.material.id) && (conduz || m.material.status === 'APROVADO'));

  const trilhaFormativa = (
    <TrilhaFormativa formacaoId={id} modulos={f.modulos} aoMudarColecao={carregarDetalhe} aoCarregar={setTrilha} />
  );

  function avaliar(atividadeId: string) {
    setAtividadeAberta(atividadeId);
    requestAnimationFrame(() => document.getElementById(`atividade-${atividadeId}`)?.scrollIntoView({ block: 'start' }));
  }

  return (
    <div className="formacao">
      <PageHeader titulo={f.titulo} meta={[mod, `${f.cargaHoraria} h`, etapa]} descricao={f.objetivos ?? undefined}>
        {pode('ia:assistente') && (
          <button type="button" className="btn btn-ghost" onClick={abrirAssistente}>
            <MessageCircleQuestion size={18} aria-hidden="true" /> {cursista ? 'Tirar uma dúvida com o assistente' : 'Conversar com o assistente'}
          </button>
        )}
      </PageHeader>

      {cursista ? (
        <>
          {part === undefined ? <ListSkeleton linhas={1} altura={200} />
            : part ? <ResumoCursista p={part} aoMudar={carregarParticipacao} />
              : <NaoInscrito turmas={f.turmas} aoInscrever={() => { carregarParticipacao(); carregarDetalhe(); }} />}
          {trilhaFormativa}
          {part && <AtividadesCursista p={part} aoMudar={carregarParticipacao} />}
          {part && <EncontrosCursista p={part} />}
        </>
      ) : conduz ? (
        <>
          {PREPARACAO.includes(f.etapaFluxo) ? (
            <PreparacaoFormacao formacaoId={id} modulos={f.modulos.length} turmas={f.turmas} etapasTrilha={trilha ? trilha.etapas.filter((e) => e.material).length : null}
              etapasADefinir={trilha ? trilha.etapas.filter((e) => !e.material).length : 0}
              pode={pode} aoMudar={() => { carregarDetalhe(); carregarAcompanhamento(); }} />
          ) : acomp ? (
            <AtencaoConducao a={acomp} pendentesCuradoria={pendentesCuradoria} podeRegistrar={pode('frequencia:registrar')} aoAvaliar={avaliar}
              encerrada={f.etapaFluxo === 'CONCLUIDA' || f.etapaFluxo === 'CANCELADA'} />
          ) : erroAcomp ? <Note tom="danger">{erroAcomp}</Note> : <ListSkeleton linhas={1} altura={200} />}
          {pode('formacao:transicao') && (
            <ProcessoFormacao formacaoId={id} etapa={f.etapaFluxo} transicoes={f.transicoes} podeDecidir aoMudar={carregarDetalhe} />
          )}
          {pode('ia:usar') && (
            <PlanoFormativo formacaoId={id} modulos={f.modulos.length} podeCriarModulos={pode('modulo:create')} aoCriarModulos={carregarDetalhe}
              ocultarVazio={PREPARACAO.includes(f.etapaFluxo)} />
          )}
          {trilhaFormativa}
          {acomp && (
            <AtividadesConducao formacaoId={id} atividades={acomp.atividades} base={f.atividades} cursistas={acomp.cursistas}
              podeCriar={pode('atividade:create')} podeAvaliar={pode('entrega:avaliar')} podeAlterarPrazo={pode('atividade:update')}
              aberta={atividadeAberta} setAberta={setAtividadeAberta}
              aoMudar={() => { carregarAcompanhamento(); carregarDetalhe(); }} />
          )}
          {acomp && <EncontrosConducao a={acomp} podeRegistrar={pode('frequencia:registrar')} podeAgendar={pode('encontro:create')} />}
        </>
      ) : (
        <>
          <ProcessoFormacao formacaoId={id} etapa={f.etapaFluxo} transicoes={f.transicoes} podeDecidir={false} aoMudar={carregarDetalhe} />
          {trilhaFormativa}
        </>
      )}

      <details className="fsec sobre">
        <summary>
          <h2 className="section-title">Sobre a formação</h2>
          <span className="fsec-lead">{conduz ? 'Tema, módulos e outros materiais da coleção' : 'Tema, módulos e materiais de apoio'}</span>
        </summary>
        <div className="sobre-grid">
          <div className="fcell">
            {f.tema && <><h3 className="fcell-rotulo">Tema</h3><p className="sobre-texto">{f.tema}</p></>}
            {f.publicoAlvo && <><h3 className="fcell-rotulo">Para quem é</h3><p className="sobre-texto">{f.publicoAlvo}</p></>}
            <h3 className="fcell-rotulo">Frequência mínima</h3>
            <p className="sobre-texto">{f.freqMinimaPct}% dos encontros, para receber o certificado</p>
          </div>
          <div className="fcell">
            <h3 className="fcell-rotulo">Módulos</h3>
            {f.modulos.length ? (
              <ol className="sobre-lista">{f.modulos.map((m) => <li key={m.id}>{m.titulo}</li>)}</ol>
            ) : <p className="fcell-vazio">Nenhum módulo cadastrado.</p>}
          </div>
          <div className="fcell">
            <h3 className="fcell-rotulo">Outros materiais da coleção</h3>
            {outrosMateriais.length ? (
              <ul className="sobre-lista sobre-materiais">
                {outrosMateriais.map((m) => {
                  const s = STATUS_MATERIAL[m.material.status] ?? { texto: m.material.status, tom: 'neutral' as Tom };
                  return (
                    <li key={m.id}>
                      <span>{m.material.titulo}</span>
                      {conduz && <StatusBadge tom={s.tom}>{s.texto}</StatusBadge>}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="fcell-vazio">{f.materiais.length ? 'Os materiais da coleção estão todos na trilha.' : 'Nenhum material na coleção ainda.'}</p>}
          </div>
        </div>
      </details>
    </div>
  );
}
