'use client';
// Relatorios: os numeros para prestar contas. Conclusao por formacao (etapa, inscritos,
// certificados, conclusao, frequencia media contra o minimo de cada formacao) e a
// exportacao em CSV. A frequencia segue a mesma conta da tela de Frequencia (onde fica a
// lista de cada professor, com filtros); valor sempre em texto, "—" quando nao ha base.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { ETAPA_FLUXO_LABELS, type LinhaRelatorioConclusao } from '@formarede/contracts';
import { api, getUser } from '../../../lib/api';
import { plural } from '../../../lib/texto';
import { PageHeader, ListSkeleton, ErroCarga } from '../ui';

/** Etapas em que a conclusao ja diz algo (antes disso a formacao esta em andamento). */
const FECHANDO = ['AVALIACAO', 'CONCLUIDA'];

function baixarCsv(filename: string, conteudo: string) {
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function RelatoriosPage() {
  const [conc, setConc] = useState<LinhaRelatorioConclusao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const user = getUser();
  const pode = (p: string) => !!user && (user.permissions.includes('*') || user.permissions.includes(p));

  useEffect(() => {
    api.get<LinhaRelatorioConclusao[]>('/relatorios/conclusao').then(setConc)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os relatórios.'));
  }, [tentativa]);

  const inscritos = (conc ?? []).reduce((s, l) => s + l.inscritos, 0);
  const certificados = (conc ?? []).reduce((s, l) => s + l.certificados, 0);
  // Quem ainda pode mudar o resultado: so as formacoes que nao terminaram.
  const abaixo = (conc ?? []).filter((l) => l.etapaFluxo !== 'CONCLUIDA' && l.etapaFluxo !== 'CANCELADA').reduce((s, l) => s + l.abaixoDoMinimo, 0);

  return (
    <div>
      <PageHeader titulo="Relatórios" descricao="Os números para prestar contas: conclusão por formação e frequência de cada professor, prontos para exportar." />

      {erro && <ErroCarga mensagem={erro} aoTentar={() => { setErro(null); setTentativa((t) => t + 1); }} />}

      <section className="fsec" aria-labelledby="conclusao">
        <div className="fsec-head">
          <div>
            <h2 id="conclusao" className="section-title">Conclusão por formação</h2>
            <p className="fsec-lead">
              {conc
                ? `${plural(inscritos, 'inscrito', 'inscritos')} e ${plural(certificados, 'certificado emitido', 'certificados emitidos')} na rede${abaixo ? `; ${plural(abaixo, 'professor abaixo', 'professores abaixo')} do mínimo de frequência nas formações em andamento` : ''}.`
                : 'Carregando os números da rede...'}
            </p>
          </div>
        </div>
        {conc === null ? (!erro && <ListSkeleton linhas={2} altura={84} />) : conc.length === 0 ? (
          <p className="fsec-vazio">Nenhuma formação cadastrada ainda. Os números aparecem aqui quando houver turmas.</p>
        ) : (
          <ul className="fsec-lista">
            {conc.map((l) => <LinhaConclusao key={l.formacao} l={l} />)}
          </ul>
        )}
      </section>

      <section className="fsec" aria-labelledby="exportar">
        <div className="fsec-head">
          <div>
            <h2 id="exportar" className="section-title">Exportar para prestação de contas</h2>
            <p className="fsec-lead">
              Arquivos CSV (abrem no Excel e no LibreOffice), com a mesma conta desta tela e da Frequência.
              {pode('frequencia:acompanhar') && <> Para ver cada professor e filtrar por escola, use <Link className="link-acao" href="/frequencia">Frequência</Link>.</>}
            </p>
          </div>
        </div>
        <ul className="fsec-lista">
          <Exportacao titulo="Conclusão por formação" rota="/relatorios/conclusao/csv" pode={pode('report:export')}
            descricao="Uma linha por formação: etapa, inscritos, certificados, conclusão, frequência média, mínimo e quantos ficaram abaixo." />
          <Exportacao titulo="Frequência por professor" rota="/relatorios/frequencia/csv" pode={pode('report:export')}
            descricao="Uma linha por professor: presenças, chamadas registradas, encontros previstos, frequência, mínimo e situação." />
        </ul>
      </section>
    </div>
  );
}

function LinhaConclusao({ l }: { l: LinhaRelatorioConclusao }) {
  const fechando = FECHANDO.includes(l.etapaFluxo);
  const abaixoDoMinimo = l.frequenciaMediaPct !== null && l.frequenciaMediaPct < l.minimoPct;
  return (
    <li className="fitem rel-linha">
      <div>
        <h3 className="fitem-titulo">{l.formacao}</h3>
        <p className="fitem-meta">
          <span>{ETAPA_FLUXO_LABELS[l.etapaFluxo]}</span>
          <span>{plural(l.inscritos, 'inscrito', 'inscritos')}</span>
          <span>{plural(l.certificados, 'certificado', 'certificados')}</span>
        </p>
      </div>
      <dl className="rel-numeros">
        <div>
          <dt>Conclusão</dt>
          <dd>
            {l.taxaConclusaoPct === null ? '—' : fechando ? `${l.taxaConclusaoPct}%` : '—'}
            <small>{l.taxaConclusaoPct === null ? 'sem inscritos' : fechando ? `${l.certificados} de ${l.inscritos}` : 'em andamento'}</small>
          </dd>
        </div>
        <div>
          <dt>Frequência média</dt>
          <dd data-alerta={abaixoDoMinimo || undefined}>
            {l.frequenciaMediaPct === null ? '—' : `${l.frequenciaMediaPct}%`}
            <small>{l.frequenciaMediaPct === null ? 'sem chamada registrada' : `${abaixoDoMinimo ? 'abaixo do' : ''} mínimo ${l.minimoPct}%`.trim()}</small>
          </dd>
        </div>
        <div>
          <dt>Abaixo do mínimo</dt>
          <dd data-alerta={l.abaixoDoMinimo > 0 || undefined}>
            {l.inscritos ? l.abaixoDoMinimo : '—'}
            <small>{l.inscritos ? (l.abaixoDoMinimo === 1 ? 'professor' : 'professores') : 'sem inscritos'}</small>
          </dd>
        </div>
      </dl>
    </li>
  );
}

function Exportacao({ titulo, descricao, rota, pode }: { titulo: string; descricao: string; rota: string; pode: boolean }) {
  const [estado, setEstado] = useState<'pronto' | 'baixando' | 'feito' | string>('pronto');

  async function exportar() {
    setEstado('baixando');
    try {
      const { filename, csv } = await api.get<{ filename: string; csv: string }>(rota);
      baixarCsv(filename, csv);
      setEstado('feito');
    } catch (e) {
      setEstado(e instanceof Error ? `Não foi possível gerar o arquivo: ${e.message}` : 'Não foi possível gerar o arquivo. Tente de novo.');
    }
  }

  const erro = !['pronto', 'baixando', 'feito'].includes(estado) ? estado : null;
  return (
    <li className="fitem fitem-linha">
      <div>
        <h3 className="fitem-titulo">{titulo}</h3>
        <p className="fitem-texto">{descricao}</p>
        {estado === 'feito' && <p className="hint" role="status">Arquivo gerado; confira a pasta de downloads.</p>}
        {erro && <p className="campo-erro" role="alert">{erro}</p>}
        {!pode && <p className="hint">Exportar pede a permissão de relatórios; fale com a gestão da rede.</p>}
      </div>
      {pode && (
        <button type="button" className="btn btn-secondary" disabled={estado === 'baixando'} onClick={exportar}>
          <Download size={16} aria-hidden="true" /> {estado === 'baixando' ? 'Gerando...' : 'Exportar CSV'}<span className="sr-only">: {titulo}</span>
        </button>
      )}
    </li>
  );
}
