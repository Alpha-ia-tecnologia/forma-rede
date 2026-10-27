'use client';
// IA-01 - Copiloto de planejamento formativo. Ciclo de validacao humana:
// pedido (diagnostico obrigatorio; a tela diz antes quantos materiais aprovados servem
// de fonte) -> rascunho (o pedido fica fixo em cima; cada bloco pode ser editado, com
// "Editado" no que mudou) -> publicar (APROVAR, ou EDITAR com a versao da pessoa) ou
// descartar, sempre com confirmacao em linha -> painel de sucesso com o proximo passo
// de acordo com quem esta decidindo. A IA propoe, a pessoa decide e assina; detalhes
// tecnicos ficam recolhidos para auditoria e qualquer resposta errada pode ser sinalizada.
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CircleCheck, Sparkles } from 'lucide-react';
import type { PlanoFormativoConteudo } from '@formarede/contracts';
import { api, getUser } from '../../../../../lib/api';
import { plural } from '../../../../../lib/texto';
import { PageHeader, Note, ListSkeleton, SeloIA } from '../../../ui';
import { PlanoEditavel, validarPlano } from '../plano';

interface RespostaCopiloto {
  geradoPorIA: true;
  interacaoId: string;
  provider: string;
  modelo: string;
  promptVersao: string;
  fontes: { id: string; titulo: string; tipo: string }[];
  plano: PlanoFormativoConteudo;
}
interface FormacaoCopiloto {
  titulo: string;
  cargaHoraria: number;
  materiais: { material: { status: string } }[];
}

type Decisao = 'APROVAR' | 'REJEITAR' | 'EDITAR';
type Confirmacao = 'PUBLICAR' | 'REJEITAR' | 'NOVA';
/** Diagnostico minimo: uma frase que diga o problema. */
const MINIMO_DIAGNOSTICO = 20;

export default function CopilotoPage() {
  const { id } = useParams<{ id: string }>();
  const uid = useId();
  const user = getUser();
  const pode = (p: string) => !!user && (user.permissions.includes('*') || user.permissions.includes(p));
  const [formacao, setFormacao] = useState<FormacaoCopiloto | null>(null);
  const [diagnostico, setDiagnostico] = useState('');
  const [contextoExtra, setContextoExtra] = useState('');
  const [erroPedido, setErroPedido] = useState(false);
  const [resposta, setResposta] = useState<RespostaCopiloto | null>(null);
  // Copia editavel do rascunho; comparada ao original para saber se a pessoa mexeu.
  const [plano, setPlano] = useState<PlanoFormativoConteudo | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Confirmacao | null>(null);
  const [decidida, setDecidida] = useState<Decisao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [sinalizada, setSinalizada] = useState(false);
  const decisaoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<FormacaoCopiloto>(`/formacoes/${id}`).then(setFormacao).catch(() => undefined);
  }, [id]);
  // O resultado da decisao (ou a pergunta de confirmacao) recebe o foco: o botao clicado sumiu.
  useEffect(() => {
    if (decidida || confirmando) decisaoRef.current?.querySelector<HTMLElement>('[data-foco], button, a[href]')?.focus();
  }, [decidida, confirmando]);

  const aprovados = formacao?.materiais.filter((m) => m.material.status === 'APROVADO').length ?? null;
  const editado = !!resposta && !!plano && JSON.stringify(plano) !== JSON.stringify(resposta.plano);

  async function gerar() {
    if (diagnostico.trim().length < MINIMO_DIAGNOSTICO) {
      setErroPedido(true);
      return;
    }
    setErro(null); setDecidida(null); setConfirmando(null); setSinalizada(false); setGerando(true);
    try {
      const r = await api.post<RespostaCopiloto>(`/ia/formacoes/${id}/plano`, {
        diagnostico: diagnostico.trim(),
        contextoExtra: contextoExtra.trim() || undefined,
      });
      setResposta(r);
      setPlano(r.plano);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o rascunho. Tente de novo em instantes.');
    } finally {
      setGerando(false);
    }
  }

  function pedirPublicacao() {
    if (!plano) return;
    const { erro: falta } = validarPlano(plano);
    if (falta) { setErro(falta); return; }
    setErro(null);
    setConfirmando('PUBLICAR');
  }

  async function decidir(decisao: Decisao) {
    if (!resposta || !plano) return;
    setErro(null);
    setOcupado(true);
    try {
      const corpo = decisao === 'EDITAR'
        ? { decisao, saidaEditada: JSON.stringify(validarPlano(plano).plano) }
        : { decisao };
      await api.post(`/ia/interacoes/${resposta.interacaoId}/decisao`, corpo);
      setDecidida(decisao);
      setConfirmando(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a decisão.');
    } finally {
      setOcupado(false);
    }
  }

  function voltarAoPedido() {
    setResposta(null); setPlano(null); setConfirmando(null); setDecidida(null); setErro(null);
  }

  async function sinalizar() {
    if (!resposta || !motivo.trim()) return;
    setErro(null);
    try {
      await api.post(`/ia/interacoes/${resposta.interacaoId}/sinalizar`, { motivo: motivo.trim() });
      setSinalizada(true);
      setMotivo('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar o aviso.');
    }
  }

  const publicado = decidida === 'APROVAR' || decidida === 'EDITAR';

  return (
    <div className="copiloto">
      <PageHeader titulo="Plano da formação com IA" meta={[formacao?.titulo, formacao ? `${formacao.cargaHoraria} h` : null]}
        descricao="O Copiloto escreve um primeiro rascunho a partir do diagnóstico e dos materiais aprovados. Você revisa, ajusta o que quiser e decide; nada é publicado sem você." />

      {!resposta && (
        <section className="fsec" aria-labelledby={`${uid}-pedido`}>
          <div className="fsec-head">
            <div>
              <h2 id={`${uid}-pedido`} className="section-title">O que a formação precisa resolver</h2>
              <p className="fsec-lead">Quanto mais concreto, melhor o rascunho.</p>
            </div>
          </div>
          <div className="fcell">
            <div>
              <label className="label" htmlFor={`${uid}-diag`}>Diagnóstico da necessidade formativa</label>
              <span className="hint" id={`${uid}-diag-dica`}>O que os professores precisam desenvolver e o que motivou a formação. Uma ou duas frases bastam.</span>
              <textarea id={`${uid}-diag`} className="input" rows={4} value={diagnostico}
                aria-invalid={erroPedido || undefined} aria-describedby={erroPedido ? `${uid}-diag-erro ${uid}-diag-dica` : `${uid}-diag-dica`}
                onChange={(e) => { setDiagnostico(e.target.value); setErroPedido(false); }}
                placeholder="Ex.: os professores do 4º e 5º ano têm dificuldade em ensinar frações com situações-problema." />
              {erroPedido && <p className="campo-erro" id={`${uid}-diag-erro`} role="alert">Escreva o diagnóstico em ao menos uma frase: é dele que o rascunho parte.</p>}
            </div>
            <div>
              <label className="label" htmlFor={`${uid}-ctx`}>Contexto adicional <span className="muted">(opcional)</span></label>
              <textarea id={`${uid}-ctx`} className="input" rows={3} value={contextoExtra} onChange={(e) => setContextoExtra(e.target.value)}
                placeholder="Restrições, recursos disponíveis, experiências anteriores..." />
            </div>
            {aprovados !== null && (
              aprovados > 0
                ? <p className="hint">Fontes: {plural(aprovados, 'material aprovado', 'materiais aprovados')} na coleção desta formação.</p>
                : <Note tom="warn">Nenhum material aprovado na coleção desta formação: o rascunho sai só do que você escrever. Para o Copiloto usar materiais, adicione-os à trilha ou à coleção antes de gerar.</Note>
            )}
            <div className="fform-acoes">
              <button type="button" className="btn btn-primary" onClick={gerar} disabled={gerando}>
                <Sparkles size={18} aria-hidden="true" /> {gerando ? 'Escrevendo o rascunho...' : 'Gerar rascunho do plano'}
              </button>
              <Link className="btn btn-ghost" href={`/formacoes/${id}`}>Voltar para a formação</Link>
            </div>
          </div>
          {gerando && <div role="status" style={{ marginTop: 12 }}><span className="sr-only">Gerando o rascunho do plano.</span><ListSkeleton linhas={2} altura={90} /></div>}
        </section>
      )}

      {erro && !resposta && <Note tom="danger">{erro}</Note>}

      {resposta && plano && (
        <>
          <section className="fsec" aria-labelledby={`${uid}-rascunho`}>
            <div className="fsec-head">
              <div>
                <h2 id={`${uid}-rascunho`} className="section-title">
                  {publicado ? 'Plano aprovado' : decidida === 'REJEITAR' ? 'Rascunho descartado' : 'Rascunho do plano'}
                </h2>
                <p className="fsec-lead">
                  {publicado
                    ? `Aprovado agora, com o seu nome${decidida === 'EDITAR' ? ' e as suas edições' : ''}. Ele está na página da formação, em Plano formativo.`
                    : decidida === 'REJEITAR'
                      ? 'Nada foi publicado. Você pode gerar outra versão com outro diagnóstico.'
                      : resposta.fontes.length
                        ? `Escrito a partir de ${plural(resposta.fontes.length, 'material aprovado', 'materiais aprovados')} da rede. Revise e ajuste cada bloco antes de publicar.`
                        : 'Nenhum material aprovado serviu de fonte: o rascunho saiu só do seu pedido. Revise com atenção.'}
                </p>
              </div>
              {decidida !== 'REJEITAR' && (
                <SeloIA>{publicado ? (decidida === 'EDITAR' ? 'Proposto pela IA · editado e aprovado' : 'Proposto pela IA · aprovado') : editado ? 'Proposto pela IA · você editou' : 'Proposto pela IA · revise'}</SeloIA>
              )}
            </div>

            {!decidida && (
              <div className="fcell copiloto-pedido">
                <h3 className="fcell-rotulo">Seu pedido</h3>
                <p className="sobre-texto">{diagnostico.trim()}</p>
                {contextoExtra.trim() && <p className="sobre-texto muted">{contextoExtra.trim()}</p>}
              </div>
            )}
            {decidida !== 'REJEITAR' && (
              <PlanoEditavel p={plano} original={resposta.plano} fontes={resposta.fontes} cargaFormacao={formacao?.cargaHoraria ?? null}
                aoMudar={(novo) => { setPlano(novo); setConfirmando(null); }} />
            )}
            {plano.observacoes && !decidida && <Note tom="warn">O que a IA diz não saber: {plano.observacoes}</Note>}
          </section>

          <section className="fsec" aria-labelledby={`${uid}-decisao`}>
            <div className="fsec-head">
              <div>
                <h2 id={`${uid}-decisao`} className="section-title">Sua decisão</h2>
                <p className="fsec-lead">A decisão fica registrada com o seu nome na auditoria da IA{editado ? ', junto com o rascunho original e a versão que você editou' : ''}.</p>
              </div>
            </div>
            <div ref={decisaoRef} className="fcell" role="status" aria-live="polite">
              {publicado ? (
                <div className="copiloto-sucesso">
                  <p data-foco tabIndex={-1} className="copiloto-sucesso-texto">
                    <CircleCheck size={20} aria-hidden="true" />
                    <span>
                      <strong>Plano publicado na formação{decidida === 'EDITAR' ? ', com as suas edições' : ''}.</strong>{' '}
                      {pode('modulo:create')
                        ? 'Próximo passo: criar os módulos a partir dele, na seção Plano formativo.'
                        : 'Próximo passo: a curadoria cria os módulos a partir dele; o pedido aparece no Início de quem cuida disso.'}
                    </span>
                  </p>
                  <div className="fform-acoes">
                    <Link className="btn btn-primary" href={`/formacoes/${id}#plano`}>Ver o plano na formação</Link>
                  </div>
                </div>
              ) : decidida === 'REJEITAR' ? (
                <>
                  <p data-foco tabIndex={-1} className="sobre-texto">Rascunho descartado. Nada foi publicado.</p>
                  <div className="fform-acoes">
                    <button type="button" className="btn btn-primary" onClick={voltarAoPedido}>Gerar outra versão</button>
                    <Link className="btn btn-ghost" href={`/formacoes/${id}`}>Voltar para a formação</Link>
                  </div>
                </>
              ) : confirmando ? (
                <>
                  <p data-foco tabIndex={-1} className="sobre-texto">
                    {confirmando === 'PUBLICAR'
                      ? `Ao publicar, ${editado ? 'a sua versão deste plano' : 'este rascunho'} passa a ser um plano aprovado da formação, registrado com o seu nome. Planos aprovados antes continuam no histórico.`
                      : confirmando === 'NOVA'
                        ? `Gerar outra versão descarta este rascunho${editado ? ' e as suas edições' : ''}. O pedido continua preenchido para você ajustar.`
                        : 'Descartar este rascunho? Ele não será usado; você pode gerar outra versão.'}
                  </p>
                  <div className="fform-acoes">
                    {confirmando === 'PUBLICAR' && (
                      <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => decidir(editado ? 'EDITAR' : 'APROVAR')}>
                        {ocupado ? 'Registrando...' : 'Sim, publicar o plano'}
                      </button>
                    )}
                    {confirmando === 'NOVA' && <button type="button" className="btn btn-danger" onClick={voltarAoPedido}>Descartar e voltar ao pedido</button>}
                    {confirmando === 'REJEITAR' && (
                      <button type="button" className="btn btn-danger btn-perigo" disabled={ocupado} onClick={() => decidir('REJEITAR')}>
                        {ocupado ? 'Registrando...' : 'Sim, descartar'}
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmando(null)}>Continuar revisando</button>
                  </div>
                </>
              ) : (
                <div className="fform-acoes">
                  <button type="button" className="btn btn-primary" onClick={pedirPublicacao}>
                    {editado ? 'Publicar a minha versão' : 'Publicar como plano da formação'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmando('NOVA')}>Gerar outra versão</button>
                  <button type="button" className="btn btn-danger" onClick={() => setConfirmando('REJEITAR')}>Descartar o rascunho</button>
                </div>
              )}
              {erro && <p className="campo-erro" role="alert">{erro}</p>}
            </div>

            <details className="copiloto-detalhes">
              <summary>Algo errado no rascunho? Avise a equipe</summary>
              {sinalizada ? <Note tom="ok">Aviso enviado. Obrigado: ele ajuda a melhorar o Copiloto.</Note> : (
                <div className="fform-linha" style={{ marginTop: 10 }}>
                  <div className="fform-cresce">
                    <label className="label" htmlFor={`${uid}-motivo`}>O que está errado</label>
                    <input id={`${uid}-motivo`} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: o módulo 2 cita um material que não existe" />
                  </div>
                  <button type="button" className="btn btn-secondary" style={{ alignSelf: 'end' }} onClick={sinalizar} disabled={!motivo.trim()}>Enviar aviso</button>
                </div>
              )}
            </details>
            <details className="copiloto-detalhes">
              <summary>Detalhes técnicos (auditoria)</summary>
              <p className="sobre-texto">Serviço {resposta.provider} · modelo {resposta.modelo} · versão do prompt {resposta.promptVersao} · registro {resposta.interacaoId}</p>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
