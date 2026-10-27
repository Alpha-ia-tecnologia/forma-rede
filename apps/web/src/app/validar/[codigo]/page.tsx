'use client';
// Certificado com validacao publica (RF-122): qualquer pessoa com o codigo confere a
// autenticidade sem entrar no sistema. A mesma pagina e o documento: o cursista
// imprime ou salva em PDF daqui, e quem recebe confere pelo mesmo endereco.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CircleAlert, CircleCheck, Copy, GraduationCap, Printer, Share2 } from 'lucide-react';
import { api, getToken, getUser } from '../../../lib/api';

type Resultado =
  | { valido: false }
  | { valido: true; participante: string; formacao: string; instituicao: string; cargaHoraria: number; emitidoEm: string };

export default function ValidarCertificadoPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [endereco, setEndereco] = useState('');
  // Quem esta logado volta para o app; quem e a propria pessoa certificada ganha os parabens.
  const [logado, setLogado] = useState(false);
  const [nomeUsuario, setNomeUsuario] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Certificado · Formarede';
    setLogado(!!getToken());
    setNomeUsuario(getUser()?.nome ?? null);
    setEndereco(window.location.href.split('#')[0] ?? '');
    api.get<Resultado>(`/certificados/validar/${encodeURIComponent(codigo)}`).then(setResultado)
      .catch(() => setErro('Não foi possível consultar o certificado agora. Tente de novo em instantes.'));
  }, [codigo]);

  async function compartilhar() {
    if (!resultado?.valido) return;
    const texto = `Concluí a formação ${resultado.formacao} (${resultado.cargaHoraria} h). Confira o certificado:`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Certificado de participação', text: texto, url: endereco }); return; } catch { return; }
    }
    // Sem o compartilhamento do aparelho: abre o WhatsApp com a mensagem pronta.
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${endereco}`)}`, '_blank', 'noopener,noreferrer');
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <main className="cert-pagina">
      <header className="cert-topo">
        <span className="cert-marca"><span className="brand-mark" aria-hidden="true"><GraduationCap size={18} /></span> Formarede</span>
        {logado
          ? <Link className="shell-voltar" href="/minhas-formacoes"><ArrowLeft size={18} aria-hidden="true" /> Voltar para Minhas formações</Link>
          : <span className="cert-topo-texto">Validação de certificado</span>}
      </header>

      {erro && <p className="note note-danger" role="alert"><CircleAlert size={18} aria-hidden="true" /> {erro}</p>}
      {!resultado && !erro && <p className="cert-consulta" role="status">Consultando o código {codigo}...</p>}

      {resultado && !resultado.valido && (
        <section className="cert-invalido" role="alert">
          <CircleAlert size={22} aria-hidden="true" />
          <div>
            <h1>Não encontramos um certificado com este código</h1>
            <p>Confira se o código <strong>{codigo}</strong> foi digitado igual ao do documento. Se o problema continuar, fale com a secretaria que emitiu.</p>
          </div>
        </section>
      )}

      {resultado && resultado.valido && (
        <>
          <section className="cert-status" aria-live="polite">
            <CircleCheck size={22} aria-hidden="true" />
            {nomeUsuario && nomeUsuario === resultado.participante ? (
              <p><strong>Parabéns, {nomeUsuario.split(/\s+/)[0]}!</strong> Você concluiu {resultado.formacao}. Imprima, salve em PDF ou compartilhe com a sua escola.</p>
            ) : (
              <p><strong>Certificado válido.</strong> Emitido pela {resultado.instituicao} e registrado no Formarede.</p>
            )}
          </section>

          <article className="cert-documento" aria-labelledby="cert-titulo">
            <div className="cert-cabeca">
              <span className="brand-mark" aria-hidden="true"><GraduationCap size={22} /></span>
              <span>{resultado.instituicao}</span>
            </div>
            <h1 id="cert-titulo" className="cert-titulo">Certificado de participação</h1>
            <p className="cert-texto">
              Certificamos que <strong>{resultado.participante}</strong> concluiu a formação continuada <strong>{resultado.formacao}</strong>,
              com carga horária de <strong>{resultado.cargaHoraria} horas</strong>, cumprindo a frequência mínima e as atividades avaliadas.
            </p>
            <dl className="cert-dados">
              <div><dt>Emitido em</dt><dd>{new Date(resultado.emitidoEm).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
              <div><dt>Código</dt><dd className="cert-codigo">{codigo}</dd></div>
              <div><dt>Confira em</dt><dd className="cert-url">{endereco}</dd></div>
            </dl>
          </article>

          <div className="cert-acoes">
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={18} aria-hidden="true" /> Imprimir ou salvar em PDF
            </button>
            <button type="button" className="btn btn-secondary" onClick={compartilhar}>
              <Share2 size={18} aria-hidden="true" /> Compartilhar
            </button>
            <button type="button" className="btn btn-ghost" onClick={copiar}>
              <Copy size={18} aria-hidden="true" /> {copiado ? 'Link copiado' : 'Copiar o link de validação'}
            </button>
            <span className="sr-only" role="status">{copiado ? 'Link de validação copiado.' : ''}</span>
          </div>
        </>
      )}
    </main>
  );
}
