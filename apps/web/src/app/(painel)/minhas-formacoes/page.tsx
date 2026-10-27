'use client';
// Minhas formacoes: cada turma da pessoa com o que falta para o certificado, contado
// como na pagina da formacao (presencas sobre os encontros previstos e atividades
// avaliadas). O certificado so aparece como acao quando esta liberado.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, BookOpen } from 'lucide-react';
import type { MinhaFormacao } from '@formarede/contracts';
import { api } from '../../../lib/api';
import { fmtData, fmtDia, fmtHora } from '../../../lib/datas';
import { etapaParaCursista, plural } from '../../../lib/texto';
import { PageHeader, Note, EmptyState, ListSkeleton } from '../ui';
import { Requisito } from '../comum';

export default function MinhasFormacoesPage() {
  const [lista, setLista] = useState<MinhaFormacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [emitindo, setEmitindo] = useState<string | null>(null);
  const [parabens, setParabens] = useState<string | null>(null);

  function carregar() {
    api.get<MinhaFormacao[]>('/participante/minhas-formacoes').then(setLista)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar suas formações.'));
  }
  useEffect(carregar, []);
  useEffect(() => {
    if (!lista) return;
    const alvo = window.location.hash.slice(1);
    if (alvo) requestAnimationFrame(() => document.getElementById(alvo)?.scrollIntoView({ block: 'start' }));
  }, [lista]);

  async function emitir(m: MinhaFormacao) {
    setEmitindo(m.inscricaoId);
    setErro(null);
    try {
      await api.post(`/inscricoes/${m.inscricaoId}/certificado`, {});
      setParabens(`Parabéns! Você concluiu ${m.formacao.titulo} e o certificado já está em Concluídas.`);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível emitir o certificado.');
    } finally {
      setEmitindo(null);
    }
  }

  const andamento = lista?.filter((m) => !m.certificado && m.formacao.etapaFluxo !== 'CONCLUIDA' && m.formacao.etapaFluxo !== 'CANCELADA') ?? [];
  const concluidas = lista?.filter((m) => !andamento.includes(m)) ?? [];

  return (
    <div>
      <PageHeader titulo="Minhas formações" descricao="Suas turmas, o que falta para o certificado e os certificados que você já tem." />

      {parabens && <Note tom="ok">{parabens}</Note>}
      {erro && <Note tom="danger">{erro}</Note>}

      {lista === null ? (
        <ListSkeleton linhas={2} altura={180} />
      ) : lista.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} />} titulo="Você ainda não está em nenhuma turma"
          descricao="Quando entrar numa turma, seus encontros, atividades e certificado aparecem aqui."
          acao={<Link className="btn btn-primary" href="/formacoes">Ver formações da rede</Link>} />
      ) : (
        <>
          {andamento.length > 0 && (
            <section className="fsec" aria-labelledby="em-andamento">
              <div className="fsec-head">
                <div>
                  <h2 id="em-andamento" className="section-title">Em andamento</h2>
                  <p className="fsec-lead">{plural(andamento.length, 'formação', 'formações')}</p>
                </div>
              </div>
              <ul className="fsec-lista">
                {andamento.map((m) => <CartaoFormacao key={m.inscricaoId} m={m} emitindo={emitindo === m.inscricaoId} aoEmitir={() => emitir(m)} />)}
              </ul>
            </section>
          )}
          {concluidas.length > 0 && (
            <section className="fsec" aria-labelledby="concluidas">
              <div className="fsec-head">
                <div>
                  <h2 id="concluidas" className="section-title">Concluídas</h2>
                  <p className="fsec-lead">Seus certificados ficam aqui; qualquer pessoa confere a autenticidade pelo código.</p>
                </div>
              </div>
              <ul className="fsec-lista">
                {concluidas.map((m) => <CartaoFormacao key={m.inscricaoId} m={m} emitindo={false} aoEmitir={() => undefined} />)}
              </ul>
            </section>
          )}
          <p className="mf-rodape">
            Quer participar de outra? <Link className="link-acao" href="/formacoes">Ver formações da rede</Link>
          </p>
        </>
      )}
    </div>
  );
}

function CartaoFormacao({ m, emitindo, aoEmitir }: { m: MinhaFormacao; emitindo: boolean; aoEmitir: () => void }) {
  const fr = m.frequencia;
  const avaliadas = m.atividades.filter((a) => a.entrega?.status === 'AVALIADA').length;
  const presencaOk = fr.encontrosPrevistos > 0 && fr.presencas >= fr.presencasNecessarias;
  const faltam = Math.max(0, fr.presencasNecessarias - fr.presencas);
  const pendentes = m.avaliacoes.filter((a) => !a.respondida).length;

  return (
    <li className="fitem mf-cartao">
      <div className="fitem-topo">
        <h3 className="fitem-titulo"><Link className="mf-titulo-grande" href={`/formacoes/${m.formacao.id}`}>{m.formacao.titulo}</Link></h3>
      </div>
      <p className="fitem-meta">
        <span>{m.turma.nome}</span>
        <span>{m.formacao.cargaHoraria} h</span>
        <span>{etapaParaCursista(m.formacao.etapaFluxo)}</span>
      </p>

      {m.certificado ? (
        <div className="mf-certificado">
          <p className="cert-ok"><Award size={18} aria-hidden="true" /> Certificado emitido em {fmtData(m.certificado.emitidoEm)} · código <strong>{m.certificado.codigo}</strong></p>
          <div className="fitem-acoes">
            <Link className="btn btn-primary" href={`/validar/${m.certificado.codigo}`}>
              <Award size={18} aria-hidden="true" /> Ver o certificado
            </Link>
            <Link className="btn btn-ghost" href={`/formacoes/${m.formacao.id}`}>Abrir a formação<span className="sr-only">: {m.formacao.titulo}</span></Link>
          </div>
        </div>
      ) : (
        <>
          {m.proximoEncontro && (
            <p className="mf-proximo">Próximo encontro: <strong>{fmtDia(m.proximoEncontro.inicio)}, {fmtHora(m.proximoEncontro.inicio)}</strong> · {m.proximoEncontro.titulo}</p>
          )}
          <ul className="req-lista mf-req">
            <Requisito ok={presencaOk} titulo="Presenças" valor={fr.encontrosPrevistos ? `${fr.presencas} de ${fr.presencasNecessarias} exigidas` : '—'}>
              {!presencaOk && fr.encontrosPrevistos > 0 && (
                <p className="req-detalhe">{faltam <= fr.emAberto ? `Faltam ${faltam}; ainda há ${plural(fr.emAberto, 'encontro', 'encontros')} a contar.` : `Faltam ${faltam}, mais do que os encontros que restam. Converse com a equipe de formação.`}</p>
              )}
            </Requisito>
            <Requisito ok={avaliadas === m.atividades.length} titulo="Atividades avaliadas" valor={m.atividades.length ? `${avaliadas} de ${m.atividades.length}` : '—'} />
          </ul>
          {pendentes > 0 && <p className="mf-aviso">{plural(pendentes, 'pesquisa espera', 'pesquisas esperam')} sua resposta.</p>}
          <div className="fitem-acoes">
            {m.podeEmitirCertificado ? (
              <button type="button" className="btn btn-primary" onClick={aoEmitir} disabled={emitindo}>
                <Award size={18} aria-hidden="true" /> {emitindo ? 'Emitindo...' : 'Emitir meu certificado'}
              </button>
            ) : null}
            <Link className={m.podeEmitirCertificado ? 'btn btn-ghost' : 'btn btn-primary'} href={`/formacoes/${m.formacao.id}`}>Abrir a formação<span className="sr-only">: {m.formacao.titulo}</span></Link>
          </div>
        </>
      )}
    </li>
  );
}
