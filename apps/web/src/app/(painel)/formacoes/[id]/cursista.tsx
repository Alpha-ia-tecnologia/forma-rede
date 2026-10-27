'use client';
// Visao do cursista na pagina da formacao: o que falta para o certificado, as
// atividades com a propria entrega (e o envio) e os encontros com a propria presenca.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Award, ExternalLink, Send } from 'lucide-react';
import type { MarcaFrequencia, ParticipacaoFormacao } from '@formarede/contracts';
import { api } from '../../../../lib/api';
import { fmtData, fmtDia, fmtHora, prazoEncerrado, quando } from '../../../../lib/datas';
import { linkWeb, plural } from '../../../../lib/texto';
import { Note, StatusBadge } from '../../ui';
import { ProximoEncontro, Requisito, SeloData, SituacaoEntrega } from '../../comum';

const msg = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);

// ---------- Sua participacao ----------

export function ResumoCursista({ p, aoMudar }: { p: ParticipacaoFormacao; aoMudar: () => void }) {
  const [emitindo, setEmitindo] = useState(false);
  const [emitido, setEmitido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { frequencia: fr, atividades } = p;

  const presencaOk = fr.encontrosPrevistos > 0 && fr.presencas >= fr.presencasNecessarias;
  const faltam = Math.max(0, fr.presencasNecessarias - fr.presencas);
  const avaliadas = atividades.filter((a) => a.entrega?.status === 'AVALIADA').length;
  const paraEnviar = atividades.filter((a) => !a.entrega).length;
  const emAjuste = atividades.filter((a) => a.entrega?.status === 'EM_AJUSTE').length;
  const aguardando = atividades.filter((a) => a.entrega?.status === 'ENVIADA').length;
  const atividadesOk = avaliadas === atividades.length;
  const pesquisas = p.avaliacoes.filter((a) => !a.respondida);

  async function emitir() {
    setEmitindo(true);
    setErro(null);
    try {
      await api.post(`/inscricoes/${p.inscricaoId}/certificado`, {});
      setEmitido(true);
      aoMudar();
    } catch (e) {
      setErro(msg(e, 'Não foi possível emitir o certificado.'));
    } finally {
      setEmitindo(false);
    }
  }

  return (
    <section className="fsec" aria-labelledby="sua-participacao">
      <div className="fsec-head">
        <div>
          <h2 id="sua-participacao" className="section-title">Sua participação</h2>
          <p className="fsec-lead">{p.turma.nome}</p>
        </div>
      </div>
      <div className="fsec-grid">
        <ProximoEncontro encontro={p.proximoEncontro} vazio="Nenhum encontro agendado por enquanto. Quando a equipe marcar, a data aparece aqui." />

        <div className="fcell">
          <h3 className="fcell-rotulo">Para receber o certificado</h3>
          <ul className="req-lista">
            <Requisito ok={presencaOk} titulo="Presenças"
              valor={fr.encontrosPrevistos ? `${fr.presencas} de ${fr.presencasNecessarias} exigidas` : '—'}>
              <p className="req-detalhe">
                {!fr.encontrosPrevistos ? 'A presença começa a contar quando houver encontros agendados.'
                  : presencaOk ? `Você já tem a presença mínima (${fr.minimoPct}% dos ${fr.encontrosPrevistos} encontros).`
                    : faltam <= fr.emAberto ? `Faltam ${faltam}. Ainda há ${plural(fr.emAberto, 'encontro', 'encontros')} a contar.`
                      : `Faltam ${faltam}, mais do que os ${fr.emAberto} encontros que restam. Converse com a equipe de formação.`}
              </p>
            </Requisito>
            <Requisito ok={atividadesOk} titulo="Atividades avaliadas"
              valor={atividades.length ? `${avaliadas} de ${atividades.length}` : '—'}>
              {atividades.length === 0 ? (
                <p className="req-detalhe">Esta formação não tem atividades para entregar.</p>
              ) : !atividadesOk && (
                <p className="req-detalhe">
                  {[paraEnviar && plural(paraEnviar, 'para enviar', 'para enviar'), emAjuste && plural(emAjuste, 'com ajuste pedido', 'com ajuste pedido'),
                    aguardando && plural(aguardando, 'aguardando devolutiva', 'aguardando devolutiva')].filter(Boolean).join(' · ')}
                  {' '}<a className="link-acao" href="#atividades">Ver atividades</a>
                </p>
              )}
            </Requisito>
          </ul>
          <div className="cert">
            {p.certificado ? (
              <div className="mf-certificado">
                <p className="cert-ok"><Award size={18} aria-hidden="true" /> Certificado emitido em {fmtData(p.certificado.emitidoEm)} · código <strong>{p.certificado.codigo}</strong></p>
                <Link className="btn btn-primary" href={`/validar/${p.certificado.codigo}`}><Award size={18} aria-hidden="true" /> Ver o certificado</Link>
              </div>
            ) : p.podeEmitirCertificado ? (
              <button type="button" className="btn btn-primary" onClick={emitir} disabled={emitindo}>
                <Award size={18} aria-hidden="true" /> {emitindo ? 'Emitindo...' : 'Emitir meu certificado'}
              </button>
            ) : (
              <p className="fcell-vazio">O certificado fica disponível quando os dois itens estiverem completos.</p>
            )}
          </div>
          {emitido && <Note tom="ok">Parabéns! Você concluiu esta formação. Seu certificado está pronto para imprimir e compartilhar.</Note>}
          {erro && <Note tom="danger">{erro}</Note>}
        </div>
      </div>
      {pesquisas.length > 0 && (
        <div className="fcell pesquisas">
          <h3 className="fcell-rotulo">{plural(pesquisas.length, 'pesquisa espera sua resposta', 'pesquisas esperam sua resposta')}</h3>
          <ul className="pesquisas-lista">
            {pesquisas.map((a) => (
              <li key={a.id}>
                <span>{a.titulo}{a.anonima ? ' · anônima' : ''}</span>
                <Link className="btn btn-secondary" href={`/avaliacoes/${a.id}/responder`}>Responder<span className="sr-only">: {a.titulo}</span></Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------- Suas atividades ----------

type Atividade = ParticipacaoFormacao['atividades'][number];


export function AtividadesCursista({ p, aoMudar }: { p: ParticipacaoFormacao; aoMudar: () => void }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [enviada, setEnviada] = useState<string | null>(null);
  // Depois de enviar, o formulario some: o foco vai para a confirmacao (nao cai no inicio da pagina).
  const confirmacao = useRef<HTMLDivElement>(null);
  useEffect(() => { if (enviada) confirmacao.current?.focus(); }, [enviada]);

  return (
    <section id="atividades" className="fsec" aria-labelledby="suas-atividades">
      <div className="fsec-head">
        <div>
          <h2 id="suas-atividades" className="section-title">Suas atividades</h2>
          <p className="fsec-lead">Envie aqui o que você fez; a devolutiva da equipe de formação aparece no mesmo lugar.</p>
        </div>
      </div>
      {p.atividades.length === 0 ? (
        <p className="fsec-vazio">Esta formação ainda não tem atividades. Quando a equipe publicar, elas aparecem aqui com o prazo.</p>
      ) : (
        <ul className="fsec-lista">
          {p.atividades.map((a) => {
            const e = a.entrega;
            const podeEnviar = !e || e.status !== 'AVALIADA';
            const rotuloEnviar = !e ? 'Enviar entrega' : e.status === 'EM_AJUSTE' ? 'Reenviar com o ajuste' : 'Editar o envio';
            return (
              <li key={a.id} id={`atividade-${a.id}`} className="fitem" data-atividade={a.id}>
                <div className="fitem-topo">
                  <h3 className="fitem-titulo">{a.titulo}</h3>
                  {e ? <SituacaoEntrega status={e.status} nota={e.nota} pontuacao={a.pontuacao} />
                    : <StatusBadge tom={a.prazo && prazoEncerrado(a.prazo) ? 'warn' : 'neutral'}>Não enviada</StatusBadge>}
                </div>
                <p className="fitem-meta">
                  {a.prazo
                    ? prazoEncerrado(a.prazo)
                      ? <span className="fitem-alerta">Prazo encerrado em {fmtData(a.prazo)}{!e && '; envie assim que puder'}</span>
                      : <span>Entregar até {fmtDia(a.prazo)} ({quando(a.prazo)})</span>
                    : <span>Sem prazo definido</span>}
                  <span>vale {a.pontuacao} pontos</span>
                </p>
                {a.descricao && <p className="fitem-texto">{a.descricao}</p>}
                {a.criterios && <p className="fitem-criterios"><strong>Critérios:</strong> {a.criterios}</p>}

                {e?.feedback && (
                  <div className="devolutiva" data-ajuste={e.status === 'EM_AJUSTE'}>
                    <p className="devolutiva-rotulo">
                      {e.status === 'EM_AJUSTE' ? 'O que ajustar' : e.status === 'ENVIADA' ? 'Ajuste pedido antes do seu reenvio' : 'Devolutiva'}{e.avaliadaEm && ` · ${fmtData(e.avaliadaEm)}`}
                    </p>
                    <p>{e.feedback}</p>
                  </div>
                )}
                {e && (
                  <details className="fitem-envio">
                    <summary>Ver o que você enviou em {fmtData(e.enviadaEm)}</summary>
                    <p>{e.conteudo}</p>
                    {e.anexoUrl && /^https?:\/\//i.test(e.anexoUrl) && (
                      <a className="link-acao" href={e.anexoUrl} target="_blank" rel="noopener noreferrer">
                        Abrir o link enviado <ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span>
                      </a>
                    )}
                  </details>
                )}

                {enviada === a.id && (
                  <div ref={confirmacao} tabIndex={-1} className="foco-aviso">
                    <Note tom="ok">Entrega enviada. A devolutiva aparece aqui quando a equipe avaliar.</Note>
                  </div>
                )}

                {aberta === a.id ? (
                  <FormEntrega atividade={a} aoCancelar={() => setAberta(null)}
                    aoEnviar={() => { setAberta(null); setEnviada(a.id); aoMudar(); }} />
                ) : podeEnviar && (
                  <div className="fitem-acoes">
                    <button type="button" className={e?.status === 'ENVIADA' ? 'btn btn-ghost' : 'btn btn-secondary'}
                      onClick={() => { setAberta(a.id); setEnviada(null); }}>
                      <Send size={16} aria-hidden="true" /> {rotuloEnviar}
                      <span className="sr-only">: {a.titulo}</span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FormEntrega({ atividade, aoCancelar, aoEnviar }: { atividade: Atividade; aoCancelar: () => void; aoEnviar: () => void }) {
  const id = useId();
  const [conteudo, setConteudo] = useState(atividade.entrega?.conteudo ?? '');
  const [anexo, setAnexo] = useState(atividade.entrega?.anexoUrl ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [erroLink, setErroLink] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    // O "https://" que faltar a tela completa; so recusa o que nao parece endereco.
    const link = linkWeb(anexo);
    if (link === null) {
      setErroLink(true);
      return;
    }
    setAnexo(link);
    setOcupado(true);
    setErro(null);
    try {
      await api.post(`/atividades/${atividade.id}/entrega`, { conteudo: conteudo.trim(), anexoUrl: link || undefined });
      aoEnviar();
    } catch (e) {
      setErro(msg(e, 'Não foi possível enviar.'));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="fform" onSubmit={enviar} aria-label={`Entrega: ${atividade.titulo}`} noValidate>
      <div>
        <label className="label" htmlFor={`${id}-txt`}>O que você fez</label>
        <span className="hint" id={`${id}-txt-dica`}>Conte em poucas linhas. Fotos e arquivos podem ir por link.</span>
        <textarea id={`${id}-txt`} className="input" required maxLength={5000} autoFocus aria-describedby={`${id}-txt-dica`}
          value={conteudo} onChange={(e) => { setConteudo(e.target.value); setErro(null); }} />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-url`}>Link para fotos ou arquivos <span className="muted">(opcional)</span></label>
        <span className="hint" id={`${id}-url-dica`}>Cole o link de compartilhamento do Google Drive, do OneDrive ou de outro site.</span>
        <input id={`${id}-url`} className="input" type="url" inputMode="url" autoComplete="url" placeholder="drive.google.com/..."
          aria-describedby={erroLink ? `${id}-url-erro ${id}-url-dica` : `${id}-url-dica`} aria-invalid={erroLink || undefined}
          value={anexo} onChange={(e) => { setAnexo(e.target.value); setErroLink(false); }} />
        {erroLink && (
          <p className="campo-erro" id={`${id}-url-erro`}>
            Este link não parece um endereço da internet. Confira se copiou o link inteiro, como drive.google.com/…
          </p>
        )}
      </div>
      {erro && <Note tom="danger">{erro}</Note>}
      <div className="fform-acoes">
        <button type="submit" className="btn btn-primary" disabled={ocupado || !conteudo.trim()}>
          {ocupado ? 'Enviando...' : 'Enviar'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={aoCancelar}>Voltar sem enviar</button>
      </div>
    </form>
  );
}

// ---------- Encontros da turma ----------

const MARCA: Record<MarcaFrequencia, { tom: 'good' | 'alert' | 'mid' | 'neutral'; texto: string }> = {
  PRESENTE: { tom: 'good', texto: 'Presente' },
  AUSENTE: { tom: 'alert', texto: 'Falta' },
  JUSTIFICADA: { tom: 'mid', texto: 'Falta justificada' },
  PENDENTE: { tom: 'neutral', texto: 'Sem chamada' },
  PREVISTO: { tom: 'neutral', texto: 'Previsto' },
};

export function EncontrosCursista({ p }: { p: ParticipacaoFormacao }) {
  // O que vem pela frente fica a mostra; os que ja foram (com a presenca) ficam recolhidos.
  const hoje = new Date(new Date().toDateString()).getTime();
  const pelaFrente = p.encontros.filter((e) => e.id === p.proximoEncontro?.id || new Date(e.inicio).getTime() >= hoje);
  const jaForam = p.encontros.filter((e) => !pelaFrente.includes(e)).reverse();
  return (
    <section id="encontros" className="fsec" aria-labelledby="encontros-turma">
      <div className="fsec-head">
        <div>
          <h2 id="encontros-turma" className="section-title">Encontros da sua turma</h2>
          <p className="fsec-lead">
            {p.frequencia.encontrosPrevistos
              ? `Você esteve em ${plural(p.frequencia.presencas, 'encontro', 'encontros')}; o certificado pede ${p.frequencia.presencasNecessarias} dos ${p.frequencia.encontrosPrevistos} previstos.`
              : 'A presença conta a partir dos encontros agendados.'}
          </p>
        </div>
      </div>
      {p.encontros.length === 0 ? (
        <p className="fsec-vazio">Ainda não há encontros agendados para a sua turma.</p>
      ) : (
        <>
          {pelaFrente.length > 0 ? <ListaEncontros encontros={pelaFrente} p={p} /> : <p className="fsec-vazio">Nenhum encontro pela frente.</p>}
          {jaForam.length > 0 && (
            <details className="copiloto-detalhes">
              <summary>Encontros que já aconteceram ({jaForam.length}), com a sua presença</summary>
              <div style={{ marginTop: 12 }}><ListaEncontros encontros={jaForam} p={p} /></div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function ListaEncontros({ encontros, p }: { encontros: ParticipacaoFormacao['encontros']; p: ParticipacaoFormacao }) {
  return (
    <ol className="enc-lista">
      {encontros.map((e) => {
        const proximo = e.id === p.proximoEncontro?.id;
        const m = proximo ? { tom: 'mid' as const, texto: 'Próximo encontro' } : MARCA[e.marca];
        return (
          <li key={e.id} className="enc" data-proximo={proximo}>
            <SeloData iso={e.inicio} destaque={proximo} />
            <div className="enc-texto">
              <p className="enc-titulo">{e.titulo}</p>
              <p className="enc-meta">{fmtDia(e.inicio)}, {fmtHora(e.inicio)}{e.local && ` · ${e.local}`}</p>
            </div>
            <div className="enc-situacao"><span className="status-pill" data-tom={m.tom}>{m.texto}</span></div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Quem ainda nao participa de uma turma ----------

export function NaoInscrito({ turmas, aoInscrever }: {
  turmas: { id: string; nome: string; vagas: number; _count: { inscricoes: number } }[];
  aoInscrever: () => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const abertas = turmas.filter((t) => !t.vagas || t._count.inscricoes < t.vagas);

  async function inscrever(turmaId: string) {
    setOcupado(turmaId);
    setErro(null);
    try {
      await api.post('/inscricoes', { turmaId });
      aoInscrever();
    } catch (e) {
      setErro(msg(e, 'Não foi possível fazer a inscrição.'));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="fsec" aria-labelledby="participar">
      <div className="fsec-head">
        <div>
          <h2 id="participar" className="section-title">Participar desta formação</h2>
          <p className="fsec-lead">Você ainda não está numa turma desta formação. Pode estudar a trilha abaixo; frequência, atividades e certificado contam a partir da inscrição.</p>
        </div>
      </div>
      {abertas.length ? (
        <ul className="fsec-lista">
          {abertas.map((t) => (
            <li key={t.id} className="fitem fitem-linha">
              <div>
                <p className="fitem-titulo">{t.nome}</p>
                <p className="fitem-meta">{t.vagas ? `${t.vagas - t._count.inscricoes} de ${t.vagas} vagas livres` : 'Vagas sem limite'}</p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => inscrever(t.id)} disabled={!!ocupado}>
                {ocupado === t.id ? 'Inscrevendo...' : 'Inscrever-me'}<span className="sr-only"> na {t.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fsec-vazio">Nenhuma turma com vagas por enquanto. Quando a equipe abrir uma turma, a inscrição aparece aqui. Suas outras formações estão em <Link className="link-acao" href="/minhas-formacoes">Minhas formações</Link>.</p>
      )}
      {erro && <Note tom="danger">{erro}</Note>}
    </section>
  );
}
