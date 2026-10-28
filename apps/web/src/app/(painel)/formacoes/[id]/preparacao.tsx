'use client';
// Formacao em preparacao (ainda sem turma com encontros): no lugar de "O que precisa de
// voce" vazio, os passos para a formacao ficar pronta, na ordem em que acontecem, cada um
// com a marca de feito e a acao de quem pode fazer. So o proximo passo por fazer tem o
// botao principal; quem nao tem permissao ve quem faz aquele passo.
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import type { PlanoAprovado } from '@formarede/contracts';
import { api } from '../../../../lib/api';
import { plural } from '../../../../lib/texto';
import { Note } from '../../ui';
import { Requisito } from '../../comum';
import { EscolhaFormadores, useFormadoresRede } from '../../formadores/alocacao';

interface Passo {
  chave: string;
  titulo: string;
  ok: boolean;
  valor: string;
  dica?: string;
  /** Acao de quem pode fazer o passo (link ou botao); null quando e de outra pessoa. */
  acao: ((principal: boolean) => ReactNode) | null;
}

export function PreparacaoFormacao({ formacaoId, modulos, turmas, etapasTrilha, etapasADefinir = 0, pode, aoMudar }: {
  formacaoId: string;
  modulos: number;
  turmas: { id: string; nome: string; _count: { encontros: number }; formadores: { id: string; nome: string }[] }[];
  /** Etapas da trilha com recurso (null enquanto a trilha carrega). */
  etapasTrilha: number | null;
  /** Etapas de modelo ou da IA que ainda nao receberam recurso (os cursistas nao as veem). */
  etapasADefinir?: number;
  pode: (p: string) => boolean;
  aoMudar: () => void;
}) {
  const [planos, setPlanos] = useState<PlanoAprovado[] | null>(null);
  const [abrindoTurma, setAbrindoTurma] = useState(false);
  const usaIa = pode('ia:usar');
  useEffect(() => {
    if (!usaIa) { setPlanos([]); return; }
    api.get<PlanoAprovado[]>(`/ia/formacoes/${formacaoId}/planos`).then(setPlanos).catch(() => setPlanos([]));
  }, [formacaoId, usaIa]);

  const temPlano = !!planos?.length;
  const encontros = turmas.reduce((s, t) => s + t._count.encontros, 0);
  const botao = (principal: boolean) => (principal ? 'btn btn-primary' : 'btn btn-secondary');

  const passos: Passo[] = [
    {
      chave: 'plano', titulo: 'Plano formativo', ok: temPlano, valor: temPlano ? 'aprovado' : 'ainda sem plano',
      dica: temPlano ? undefined : 'O Copiloto escreve um rascunho a partir do diagnóstico; você revisa, ajusta e aprova.',
      acao: pode('ia:usar')
        ? (p) => <Link className={botao(p)} href={temPlano ? `/formacoes/${formacaoId}#plano` : `/formacoes/${formacaoId}/copiloto`}>{temPlano ? 'Ver o plano' : 'Gerar plano com o Copiloto'}</Link>
        : null,
    },
    {
      chave: 'modulos', titulo: 'Módulos', ok: modulos > 0, valor: modulos ? plural(modulos, 'módulo', 'módulos') : 'nenhum ainda',
      dica: modulos ? undefined : !pode('modulo:create') ? 'A curadoria cria os módulos; com o plano aprovado, o pedido aparece no Início dela.'
        : temPlano ? undefined : 'Saem do plano aprovado.',
      acao: !modulos && temPlano && pode('modulo:create')
        ? (p) => <Link className={botao(p)} href={`/formacoes/${formacaoId}#plano`}>Criar os módulos do plano</Link>
        : null,
    },
    {
      chave: 'trilha', titulo: 'Trilha formativa', ok: (etapasTrilha ?? 0) > 0 && etapasADefinir === 0,
      valor: [etapasTrilha ? plural(etapasTrilha, 'etapa', 'etapas') : '', etapasADefinir ? `${plural(etapasADefinir, 'etapa', 'etapas')} a definir` : '']
        .filter(Boolean).join(' · ') || 'vazia',
      dica: etapasADefinir ? 'Nas etapas a definir (de um modelo ou da IA), revise o texto e escolha o recurso; até lá, os cursistas não as veem.'
        : etapasTrilha ? undefined : 'Comece por um modelo pronto, gere com IA ou monte etapa por etapa: vídeos, documentos e podcasts em ordem.',
      acao: pode('trilha:editar')
        ? (p) => <a className={botao(p)} href="#trilha">{etapasADefinir ? 'Completar a trilha' : etapasTrilha ? 'Ver a trilha' : 'Montar a trilha'}</a>
        : null,
    },
    {
      chave: 'turma', titulo: 'Turma', ok: turmas.length > 0,
      valor: turmas.length ? turmas.map((t) => t.nome).join(', ') : 'nenhuma aberta',
      dica: turmas.length ? undefined : pode('turma:create') ? 'As inscrições dos professores entram na turma.' : 'A curadoria abre a turma para as inscrições.',
      acao: !turmas.length && pode('turma:create') && !abrindoTurma
        ? (p) => <button type="button" className={botao(p)} onClick={() => setAbrindoTurma(true)}>Abrir turma</button>
        : null,
    },
    {
      // O formador ve e conduz so as turmas em que esta: turma sem formador fica sem chamada.
      chave: 'formador', titulo: 'Formador', ok: turmas.length > 0 && turmas.every((t) => t.formadores.length > 0),
      valor: !turmas.length ? 'depois da turma'
        : [...new Set(turmas.flatMap((t) => t.formadores.map((f) => f.nome)))].join(', ') || 'nenhum alocado',
      dica: !turmas.length || turmas.every((t) => t.formadores.length) ? undefined
        : pode('formador:alocar') ? 'Quem conduz vê só as turmas em que está.' : 'A curadoria aloca quem conduz cada turma.',
      acao: turmas.length && pode('formador:alocar')
        ? (p) => <a className={botao(p)} href="#turmas">Alocar formador</a>
        : null,
    },
    {
      chave: 'encontros', titulo: 'Encontros', ok: encontros > 0, valor: encontros ? plural(encontros, 'agendado', 'agendados') : 'nenhum agendado',
      dica: encontros ? undefined : turmas.length ? 'A chamada de cada encontro fica no Início de quem conduz.' : 'Depois de abrir a turma.',
      acao: turmas.length && !encontros && pode('encontro:create') ? (p) => <Link className={botao(p)} href="/encontros">Agendar encontros</Link> : null,
    },
  ];
  const feitos = passos.filter((p) => p.ok).length;
  const proximo = passos.find((p) => !p.ok && p.acao)?.chave;

  return (
    <section className="fsec" aria-labelledby="preparar">
      <div className="fsec-head">
        <div>
          <h2 id="preparar" className="section-title">Preparar a formação</h2>
          <p className="fsec-lead">
            {feitos === passos.length
              ? 'Tudo pronto para começar.'
              : `${feitos} de ${passos.length} passos prontos. Siga na ordem: cada um aproveita o anterior.`}
          </p>
        </div>
      </div>
      <div className="fcell">
        <ul className="req-lista prep-lista">
          {passos.map((p) => (
            <Requisito key={p.chave} ok={p.ok} titulo={p.titulo} valor={p.valor}>
              {p.dica && <p className="req-detalhe">{p.dica}</p>}
              {p.acao && !p.ok && <div className="prep-acao">{p.acao(p.chave === proximo)}</div>}
              {p.chave === 'turma' && abrindoTurma && (
                <AbrirTurma formacaoId={formacaoId} alocar={pode('formador:alocar')}
                  aoFechar={(abriu) => { setAbrindoTurma(false); if (abriu) aoMudar(); }} />
              )}
            </Requisito>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AbrirTurma({ formacaoId, alocar, aoFechar }: {
  formacaoId: string;
  /** formador:alocar: escolhe ja quem conduz a turma. */
  alocar: boolean;
  aoFechar: (abriu: boolean) => void;
}) {
  const id = useId();
  const [nome, setNome] = useState(`Turma ${new Date().getFullYear()}.1`);
  const [vagas, setVagas] = useState('30');
  const [formadorIds, setFormadorIds] = useState<string[]>([]);
  const { formadores } = useFormadoresRede(alocar);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function abrir(e: FormEvent) {
    e.preventDefault();
    const n = Number(vagas);
    if (nome.trim().length < 2) { setErro('Dê um nome à turma.'); return; }
    if (!Number.isInteger(n) || n < 1) { setErro('Informe as vagas em número inteiro (ao menos 1).'); return; }
    setErro(null);
    setOcupado(true);
    try {
      await api.post(`/formacoes/${formacaoId}/turmas`, { nome: nome.trim(), vagas: n, formadorIds });
      aoFechar(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível abrir a turma.');
      setOcupado(false);
    }
  }

  return (
    <form className="fform prep-turma" onSubmit={abrir} noValidate aria-label="Abrir turma">
      <div className="trilha-form-linha">
        <div>
          <label className="label" htmlFor={`${id}-nome`}>Nome da turma</label>
          <input id={`${id}-nome`} className="input" autoFocus value={nome} onChange={(e) => { setNome(e.target.value); setErro(null); }} />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-vagas`}>Vagas</label>
          <input id={`${id}-vagas`} className="input" inputMode="numeric" value={vagas} onChange={(e) => { setVagas(e.target.value); setErro(null); }} />
        </div>
      </div>
      {alocar && <EscolhaFormadores formadores={formadores} marcados={formadorIds} aoMudar={setFormadorIds} legenda="Quem conduz a turma (opcional)" />}
      {erro && <Note tom="danger">{erro}</Note>}
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? 'Abrindo...' : 'Abrir a turma'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => aoFechar(false)}>Cancelar</button>
      </div>
    </form>
  );
}
