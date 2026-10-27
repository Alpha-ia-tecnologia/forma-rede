'use client';
// Inicio: a proxima acao de cada papel.
// - Cursista: "Para fazer agora" (ajuste pedido, entrega, pesquisa, trilha, certificado),
//   o proximo encontro e as proprias formacoes, com a mesma conta da pagina da formacao.
// - Quem conduz: "O que precisa de voce" (chamada de hoje e pendentes, entregas por
//   atividade, curadoria) e os proximos encontros. Cada item leva ao ponto exato.
// - Quem acompanha a rede (report:read): "O que depende de voce" (curadoria, formacoes
//   esperando a decisao de encerrar, professores em risco, chamadas incompletas) e depois
//   "Como esta a rede", com os numeros da mesma fonte da tela de Frequencia.
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Award, Check, ClipboardCheck, ClipboardList, Flag, Hourglass, Layers, Library, MessageSquareText, PenLine, Route, Send, UserRoundX } from 'lucide-react';
import type { AcompanhamentoFrequencia, AuthUser, EtapaFluxo, FormacaoRef, MinhaFormacao, PainelConducao, PlanoAprovado, TrilhaFormacao } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { fmtData, fmtDia, fmtHora, prazoEncerrado, quando } from '../../../lib/datas';
import { plural } from '../../../lib/texto';
import { ListSkeleton, Note, useTituloDaAba } from '../ui';
import { ProximoEncontro, SeloData } from '../comum';
import { PainelRede } from './rede';

/** Quem conduz ou acompanha formacoes (mesma regra da API). */
const CONDUZ = ['trilha:editar', 'frequencia:registrar', 'entrega:read', 'inscricao:read', 'formacao:update'];
const pode = (u: AuthUser | null, p: string) => !!u && (u.permissions.includes('*') || u.permissions.includes(p));

function saudacao(d: Date): string {
  const h = d.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

interface TenantInfo { nome: string }

export default function InicioPage() {
  const user = getUser();
  const [agora, setAgora] = useState<Date | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  useEffect(() => {
    setAgora(new Date());
    api.get<TenantInfo>('/tenants/current').then(setTenant).catch(() => undefined);
  }, []);

  // Um Inicio por papel: a gestao decide e acompanha a rede (as tarefas de turma ficam
  // com quem conduz); quem conduz cuida das turmas; o cursista, das proprias formacoes.
  const gestao = pode(user, 'report:read');
  const conduz = !gestao && CONDUZ.some((p) => pode(user, p));
  const cursista = !gestao && !conduz && pode(user, 'participante:area');
  const nome = user?.nome.split(/\s+/)[0] ?? '';
  const hoje = agora?.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  useTituloDaAba('Início');

  return (
    <div className="inicio">
      <header className="page-head">
        <div>
          <h1 className="page-title">{agora ? `${saudacao(agora)}, ${nome}.` : `Olá, ${nome}.`}</h1>
          {hoje && <p className="page-lead">Hoje é {hoje}.</p>}
        </div>
      </header>

      {cursista && <InicioCursista />}
      {conduz && <InicioConducao />}
      {gestao && user && <InicioGestao user={user} tenantNome={tenant?.nome ?? null} />}
    </div>
  );
}

// ---------- Plano aprovado esperando os modulos ----------

const PREPARACAO: EtapaFluxo[] = ['PLANEJAMENTO', 'CURADORIA', 'DESENHO'];
interface FormacaoResumo { id: string; titulo: string; etapaFluxo: EtapaFluxo; _count?: { modulos: number } }

/**
 * Formacoes em preparacao com plano aprovado (Copiloto) e ainda sem modulos: o passo
 * seguinte e de quem cria modulos (curadoria, gestao), entao vira tarefa no Inicio dela.
 */
function usePlanosSemModulos(user: AuthUser | null): FormacaoRef[] {
  const ativo = pode(user, 'modulo:create') && pode(user, 'ia:usar');
  const [lista, setLista] = useState<FormacaoRef[]>([]);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    api.get<FormacaoResumo[]>('/formacoes')
      .then(async (fs) => {
        const candidatas = fs.filter((f) => PREPARACAO.includes(f.etapaFluxo) && (f._count?.modulos ?? 0) === 0);
        const comPlano = await Promise.all(candidatas.map((f) =>
          api.get<PlanoAprovado[]>(`/ia/formacoes/${f.id}/planos`).then((ps) => (ps.length ? { id: f.id, titulo: f.titulo } : null)).catch(() => null)));
        if (vivo) setLista(comPlano.filter((f): f is FormacaoRef => !!f));
      })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [ativo]);
  return lista;
}

function tarefasPlano(planos: FormacaoRef[]): Tarefa[] {
  return planos.map((f) => ({
    chave: `plano-${f.id}`, prioridade: 1, icone: Layers,
    texto: <><strong>{f.titulo}</strong> tem plano aprovado esperando os módulos.</>,
    acao: { href: `/formacoes/${f.id}#plano`, rotulo: 'Criar os módulos' },
  }));
}

// ---------- Lista de acoes (uma linha por tarefa, a acao a direita) ----------

interface Tarefa {
  chave: string;
  prioridade: number;
  icone: LucideIcon;
  alerta?: boolean;
  texto: ReactNode;
  contexto?: string;
  acao: { href: string; rotulo: string };
}

function ListaTarefas({ tarefas, max = 6, vazio }: { tarefas: Tarefa[]; max?: number; vazio: string }) {
  const [todas, setTodas] = useState(false);
  if (!tarefas.length) return <p className="pend-ok"><Check size={18} aria-hidden="true" /> {vazio}</p>;
  const visiveis = todas ? tarefas : tarefas.slice(0, max);
  return (
    <>
      <ul className="pend-lista">
        {visiveis.map((t, i) => {
          const Icone = t.icone;
          return (
            <li key={t.chave} className="pend" data-tom={t.alerta ? 'alerta' : undefined}>
              <span className="pend-icone" aria-hidden="true"><Icone size={18} /></span>
              <div className="pend-texto">
                <p id={`tarefa-${t.chave}`}>{t.texto}</p>
                {t.contexto && <p className="pend-contexto">{t.contexto}</p>}
              </div>
              {/* Um so botao principal: o da primeira tarefa, a mais urgente. O nome do
                  botao ganha o texto da tarefa (tres "Dar devolutiva" nao ficam iguais). */}
              <Link className={i === 0 ? 'btn btn-primary' : 'btn btn-secondary'} href={t.acao.href} aria-describedby={`tarefa-${t.chave}`}>{t.acao.rotulo}</Link>
            </li>
          );
        })}
      </ul>
      {tarefas.length > max && (
        <button type="button" className="btn btn-ghost pend-mais" aria-expanded={todas} onClick={() => setTodas(!todas)}>
          {todas ? 'Mostrar menos' : `Mostrar mais ${tarefas.length - max}`}
        </button>
      )}
    </>
  );
}

// ---------- Cursista ----------

function InicioCursista() {
  const [minhas, setMinhas] = useState<MinhaFormacao[] | null>(null);
  const [trilhas, setTrilhas] = useState<Record<string, TrilhaFormacao>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.get<MinhaFormacao[]>('/participante/minhas-formacoes')
      .then((lista) => {
        setMinhas(lista);
        // A trilha diz qual e a proxima etapa de estudo de cada formacao em andamento.
        for (const m of lista.filter(emAndamento)) {
          api.get<TrilhaFormacao>(`/formacoes/${m.formacao.id}/trilha`)
            .then((t) => setTrilhas((atual) => ({ ...atual, [m.formacao.id]: t })))
            .catch(() => undefined);
        }
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar suas formações.'));
  }, []);

  if (erro) return <Note tom="danger">{erro}</Note>;
  if (!minhas) return <ListSkeleton linhas={2} altura={160} />;

  if (minhas.length === 0) {
    return (
      <section className="fsec" aria-labelledby="comecar">
        <div className="fsec-head">
          <div>
            <h2 id="comecar" className="section-title">Comece por uma formação</h2>
            <p className="fsec-lead">Você ainda não está em nenhuma turma. Quando entrar numa, seus encontros, atividades e certificado aparecem aqui.</p>
          </div>
          <Link className="btn btn-primary" href="/formacoes">Ver formações da rede</Link>
        </div>
      </section>
    );
  }

  const tarefas = minhas.filter(emAndamento).flatMap((m) => tarefasDoCursista(m, trilhas[m.formacao.id]))
    .sort((a, b) => a.prioridade - b.prioridade);
  const proximo = minhas.flatMap((m) => (m.proximoEncontro ? [m.proximoEncontro] : []))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))[0] ?? null;

  return (
    <section className="fsec" aria-labelledby="para-fazer">
      <div className="fsec-head">
        <div>
          <h2 id="para-fazer" className="section-title">Para fazer agora</h2>
          <p className="fsec-lead">{tarefas.length ? plural(tarefas.length, 'coisa esperando por você', 'coisas esperando por você') : 'Tudo em dia.'}</p>
        </div>
      </div>
      <div className="inicio-grid">
        <div className="fcell">
          <ListaTarefas tarefas={tarefas} vazio="Nada pendente agora. Quando houver entrega, pesquisa ou etapa nova, ela aparece aqui." />
        </div>
        <div className="inicio-lado">
          <ProximoEncontro encontro={proximo} vazio="Nenhum encontro agendado por enquanto." />
          <div className="fcell">
            <h3 className="fcell-rotulo">Suas formações</h3>
            <ul className="mf-lista">
              {minhas.map((m) => <ResumoFormacao key={m.inscricaoId} m={m} />)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function emAndamento(m: MinhaFormacao): boolean {
  return !m.certificado && m.formacao.etapaFluxo !== 'CONCLUIDA' && m.formacao.etapaFluxo !== 'CANCELADA';
}

/** As tarefas de uma formacao, da mais urgente para a menos. */
function tarefasDoCursista(m: MinhaFormacao, trilha?: TrilhaFormacao): Tarefa[] {
  const f = m.formacao;
  const lista: Tarefa[] = [];
  if (m.podeEmitirCertificado) {
    lista.push({ chave: `cert-${f.id}`, prioridade: 0, icone: Award, texto: <>Seu certificado de <strong>{f.titulo}</strong> já pode ser emitido.</>,
      acao: { href: `/formacoes/${f.id}#sua-participacao`, rotulo: 'Emitir certificado' } });
  }
  for (const a of m.atividades) {
    const e = a.entrega;
    if (e?.status === 'EM_AJUSTE') {
      lista.push({ chave: `ajuste-${a.id}`, prioridade: 1, icone: PenLine, alerta: true, texto: <>A equipe pediu um ajuste em <strong>{a.titulo}</strong>.</>,
        contexto: f.titulo, acao: { href: `/formacoes/${f.id}#atividade-${a.id}`, rotulo: 'Ver o que ajustar' } });
    } else if (!e) {
      const vencida = a.prazo ? prazoEncerrado(a.prazo) : false;
      lista.push({
        chave: `enviar-${a.id}`, prioridade: a.prazo ? 2 : 5, icone: Send, alerta: vencida,
        texto: <>Enviar <strong>{a.titulo}</strong>{a.prazo ? (vencida ? ` (prazo encerrado em ${fmtData(a.prazo)})` : `, até ${fmtDia(a.prazo)} (${quando(a.prazo)})`) : ''}.</>,
        contexto: f.titulo, acao: { href: `/formacoes/${f.id}#atividade-${a.id}`, rotulo: 'Enviar entrega' },
      });
    }
  }
  for (const av of m.avaliacoes.filter((x) => !x.respondida)) {
    lista.push({ chave: `aval-${av.id}`, prioridade: 3, icone: ClipboardList, texto: <>Responder a pesquisa <strong>{av.titulo}</strong>.</>,
      contexto: `${f.titulo} · leva poucos minutos`, acao: { href: `/avaliacoes/${av.id}/responder`, rotulo: 'Responder' } });
  }
  const etapa = trilha?.etapas.find((x) => !x.concluida);
  if (etapa) {
    lista.push({ chave: `trilha-${f.id}`, prioridade: 4, icone: Route, texto: <>Continuar a trilha: <strong>{etapa.titulo}</strong>.</>,
      contexto: f.titulo, acao: { href: `/formacoes/${f.id}#trilha`, rotulo: 'Continuar' } });
  }
  return lista;
}

function ResumoFormacao({ m }: { m: MinhaFormacao }) {
  const fr = m.frequencia;
  const avaliadas = m.atividades.filter((a) => a.entrega?.status === 'AVALIADA').length;
  return (
    <li className="mf-item">
      <Link className="mf-titulo" href={`/formacoes/${m.formacao.id}`}>{m.formacao.titulo}</Link>
      {m.certificado ? (
        <p className="mf-linha mf-ok">
          <Award size={16} aria-hidden="true" /> Concluída · <Link className="link-acao" href={`/validar/${m.certificado.codigo}`}>ver o certificado</Link>
        </p>
      ) : (
        <p className="mf-linha">
          <span>Presenças: {fr.encontrosPrevistos ? `${fr.presencas} de ${fr.presencasNecessarias} exigidas` : '—'}</span>
          <span>Atividades: {m.atividades.length ? `${avaliadas} de ${m.atividades.length} avaliadas` : '—'}</span>
        </p>
      )}
    </li>
  );
}

// ---------- Quem conduz ----------

function InicioConducao() {
  const planos = usePlanosSemModulos(getUser());
  const [p, setP] = useState<PainelConducao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    api.get<PainelConducao>('/painel/conducao').then(setP)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar o que precisa de você.'));
  }, []);

  if (erro) return <Note tom="danger">{erro}</Note>;
  if (!p) return <ListSkeleton linhas={2} altura={160} />;

  const tarefas: Tarefa[] = [];
  for (const e of p.hoje ?? []) {
    const incompleta = e.chamadaRegistrada && e.semMarca > 0;
    tarefas.push({
      chave: `hoje-${e.id}`, prioridade: 0, icone: ClipboardCheck, alerta: !e.chamadaRegistrada || incompleta,
      texto: <>Hoje, {fmtHora(e.inicio)}: <strong>{e.titulo}</strong>{incompleta ? ` (chamada incompleta: ${plural(e.semMarca, 'cursista sem marca', 'cursistas sem marca')})` : e.chamadaRegistrada ? ' (chamada feita)' : ''}.</>,
      contexto: `${e.turma.nome} · ${e.formacao.titulo}`,
      acao: { href: `/encontros/${e.id}/chamada`, rotulo: incompleta ? 'Completar a chamada' : e.chamadaRegistrada ? 'Ver a chamada' : 'Abrir a chamada' },
    });
  }
  for (const e of p.chamadasPendentes ?? []) {
    const incompleta = e.chamadaRegistrada;
    tarefas.push({
      chave: `chamada-${e.id}`, prioridade: 1, icone: ClipboardCheck, alerta: true,
      texto: incompleta
        ? <><strong>{e.titulo}</strong> ({fmtDia(e.inicio)}) está com a chamada incompleta: {plural(e.semMarca, 'cursista sem marca', 'cursistas sem marca')}.</>
        : <><strong>{e.titulo}</strong> ({fmtDia(e.inicio)}) está sem chamada.</>,
      contexto: `${e.turma.nome} · ${e.formacao.titulo}`,
      acao: { href: `/encontros/${e.id}/chamada`, rotulo: incompleta ? 'Completar a chamada' : 'Registrar chamada' },
    });
  }
  for (const x of p.entregas ?? []) {
    tarefas.push({
      chave: `entregas-${x.atividadeId}`, prioridade: 2, icone: MessageSquareText,
      texto: <><strong>{plural(x.aguardando, 'entrega aguarda', 'entregas aguardam')}</strong> devolutiva em {x.titulo}.</>,
      contexto: x.formacao.titulo,
      acao: { href: `/formacoes/${x.formacao.id}?avaliar=${x.atividadeId}#atividade-${x.atividadeId}`, rotulo: 'Dar devolutiva' },
    });
  }
  for (const c of p.curadoria ?? []) {
    tarefas.push({
      chave: `curadoria-${c.formacao.id}`, prioridade: 3, icone: Hourglass,
      texto: <><strong>{plural(c.etapas, 'etapa da trilha aguarda', 'etapas da trilha aguardam')}</strong> curadoria; os cursistas ainda não veem.</>,
      contexto: c.formacao.titulo,
      acao: { href: `/formacoes/${c.formacao.id}#trilha`, rotulo: 'Ver na trilha' },
    });
  }
  tarefas.push(...tarefasPlano(planos));
  tarefas.sort((a, b) => a.prioridade - b.prioridade);

  return (
    <section className="fsec" aria-labelledby="precisa-de-voce">
      <div className="fsec-head">
        <div>
          <h2 id="precisa-de-voce" className="section-title">O que precisa de você</h2>
          <p className="fsec-lead">{tarefas.length ? plural(tarefas.length, 'item', 'itens') + ' em todas as suas formações' : 'Tudo em dia.'}</p>
        </div>
      </div>
      <div className="inicio-grid">
        <div className="fcell">
          <ListaTarefas tarefas={tarefas} max={6} vazio="Nada pendente: chamadas em dia e nenhuma entrega esperando devolutiva." />
        </div>
        {p.proximos && (
          <div className="fcell">
            <h3 className="fcell-rotulo">Próximos encontros</h3>
            {p.proximos.length ? (
              <ol className="enc-mini">
                {p.proximos.map((e) => (
                  <li key={e.id}>
                    <SeloData iso={e.inicio} />
                    <div className="enc-texto">
                      <Link className="enc-titulo" href={`/formacoes/${e.formacao.id}`}>{e.titulo}</Link>
                      <p className="enc-meta">{fmtDia(e.inicio)}, {fmtHora(e.inicio)} · {e.turma.nome}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="fcell-vazio">Nenhum encontro agendado. Agende em Encontros.</p>}
            <Link className="link-acao" href="/encontros">Ver a agenda completa</Link>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- Gestao da rede ----------

interface MaterialStatus { id: string; status: string }
interface FormacaoEtapa { id: string; titulo: string; etapaFluxo: EtapaFluxo }

function InicioGestao({ user, tenantNome }: { user: AuthUser; tenantNome: string | null }) {
  const veFrequencia = pode(user, 'frequencia:acompanhar');
  const curadoria = pode(user, 'material:aprovar');
  const decideEtapa = pode(user, 'formacao:transicao');
  // undefined: carregando; null: sem permissao ou falhou (a tarefa nao aparece).
  const [freq, setFreq] = useState<AcompanhamentoFrequencia | null | undefined>(veFrequencia ? undefined : null);
  const [materiais, setMateriais] = useState<MaterialStatus[] | null | undefined>(curadoria ? undefined : null);
  const [formacoes, setFormacoes] = useState<FormacaoEtapa[] | null | undefined>(undefined);
  const planos = usePlanosSemModulos(user);

  useEffect(() => {
    if (veFrequencia) api.get<AcompanhamentoFrequencia>('/frequencia/professores').then(setFreq).catch(() => setFreq(null));
    if (curadoria) api.get<MaterialStatus[]>('/materiais').then(setMateriais).catch(() => setMateriais(null));
    api.get<FormacaoEtapa[]>('/formacoes').then(setFormacoes).catch(() => setFormacoes(null));
  }, [veFrequencia, curadoria]);

  const carregando = freq === undefined || materiais === undefined || formacoes === undefined;
  const tarefas: Tarefa[] = [];
  const emRevisao = materiais?.filter((m) => m.status === 'EM_REVISAO').length ?? 0;
  if (emRevisao) {
    tarefas.push({
      chave: 'curadoria', prioridade: 1, icone: Library,
      texto: <><strong>{plural(emRevisao, 'material espera', 'materiais esperam')}</strong> a sua revisão; só os aprovados chegam às formações e à IA.</>,
      acao: { href: '/materiais', rotulo: 'Revisar materiais' },
    });
  }
  for (const f of decideEtapa ? formacoes?.filter((x) => x.etapaFluxo === 'AVALIACAO') ?? [] : []) {
    tarefas.push({
      chave: `etapa-${f.id}`, prioridade: 0, icone: Flag,
      texto: <><strong>{f.titulo}</strong> está em avaliação e espera a decisão de encerrar.</>,
      acao: { href: `/formacoes/${f.id}`, rotulo: 'Decidir a etapa' },
    });
  }
  const r = freq?.resumo;
  if (r && r.abaixoDoMinimo > 0) {
    tarefas.push({
      chave: 'risco', prioridade: 2, icone: UserRoundX, alerta: true,
      texto: <><strong>{plural(r.abaixoDoMinimo, 'professor está', 'professores estão')} abaixo do mínimo</strong> de frequência{r.naoAlcancamMinimo ? `; ${plural(r.naoAlcancamMinimo, 'já não alcança', 'já não alcançam')} o certificado` : ''}.</>,
      contexto: 'Um contato agora ainda pode mudar o resultado de quem está em risco.',
      acao: { href: '/frequencia', rotulo: 'Ver quem são' },
    });
  }
  tarefas.push(...tarefasPlano(planos));
  const pendentes = freq?.chamadasPendentes.length ?? 0;
  if (pendentes) {
    tarefas.push({
      chave: 'chamadas', prioridade: 3, icone: ClipboardCheck,
      texto: <><strong>{plural(pendentes, 'encontro já realizado pede', 'encontros já realizados pedem')} chamada</strong>; até lá, a frequência da rede fica incompleta.</>,
      acao: { href: '/encontros', rotulo: 'Ver os encontros' },
    });
  }
  tarefas.sort((a, b) => a.prioridade - b.prioridade);

  return (
    <>
      <section className="fsec" aria-labelledby="depende-de-voce">
        <div className="fsec-head">
          <div>
            <h2 id="depende-de-voce" className="section-title">O que depende de você</h2>
            <p className="fsec-lead">{carregando ? 'Conferindo a rede...' : tarefas.length ? plural(tarefas.length, 'decisão ou risco', 'decisões e riscos') + ' na rede' : 'Nenhuma decisão esperando por você.'}</p>
          </div>
        </div>
        <div className="fcell">
          {carregando ? <ListSkeleton linhas={2} altura={56} />
            : <ListaTarefas tarefas={tarefas} max={5} vazio="Nada esperando a sua decisão: curadoria em dia, nenhuma formação para encerrar e ninguém abaixo do mínimo." />}
        </div>
      </section>
      <PainelRede user={user} tenantNome={tenantNome} frequencia={freq ?? null} formacoes={formacoes ?? []} />
    </>
  );
}
