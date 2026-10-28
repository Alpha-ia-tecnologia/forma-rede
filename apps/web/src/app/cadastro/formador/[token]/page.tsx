'use client';
// Cadastro de formador pelo link da curadoria (publico). A pessoa cria a conta com o
// proprio e-mail e entra como formador do municipio do link; se o link tiver turmas, ja
// conduz essas turmas. Link expirado ou desativado mostra o motivo e o que fazer.
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, GraduationCap, LoaderCircle, LockKeyhole, Mail, UserRound } from 'lucide-react';
import type { ConvitePublico } from '@formarede/contracts';
import { api, cadastrarFormador } from '../../../../lib/api';
import { fmtData } from '../../../../lib/datas';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CadastroFormadorPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [convite, setConvite] = useState<ConvitePublico | null>(null);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { document.title = 'Cadastro de formador · Formarede'; }, []);
  useEffect(() => {
    api.get<ConvitePublico>(`/convites/publico/${encodeURIComponent(token)}`).then(setConvite)
      .catch((e) => setErroLink(e instanceof Error ? e.message : 'Não foi possível abrir este link.'));
  }, [token]);

  async function cadastrar(ev: FormEvent) {
    ev.preventDefault();
    if (nome.trim().length < 3) return setErro('Informe o nome completo.');
    if (!EMAIL.test(email.trim())) return setErro('Informe um e-mail válido.');
    if (senha.length < 8) return setErro('A senha deve ter ao menos 8 caracteres.');
    if (senha !== confirma) return setErro('As senhas não conferem: digite a mesma nas duas vezes.');
    setErro(null);
    setEnviando(true);
    try {
      await cadastrarFormador(token, { nome: nome.trim(), email: email.trim(), senha });
      router.push('/dashboard');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir o cadastro.');
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      <div className="login-frame">
        <div>
          <span className="login-marca">
            <span className="brand-mark" aria-hidden="true"><GraduationCap size={23} strokeWidth={1.7} /></span>
            <span>Formarede<span className="ponto">.</span></span>
          </span>

          {erroLink ? (
            <>
              <h1 className="login-title">Este link não abre mais.</h1>
              <p className="login-lede">{erroLink}</p>
              <Link className="btn btn-secondary" href="/login">Já tenho conta: entrar</Link>
            </>
          ) : (
            <>
              <h1 className="login-title">Crie sua conta de formador.</h1>
              <p className="login-lede">
                {convite ? `Você vai conduzir formações da ${convite.municipio}.` : 'Conferindo o link...'} Use o seu e-mail e uma senha só sua.
              </p>
              <form onSubmit={cadastrar} style={{ display: 'grid', gap: 14 }} noValidate aria-describedby={erro ? 'cadastro-erro' : undefined}>
                <div className="login-campo">
                  <label htmlFor="nome">Nome completo</label>
                  <input id="nome" className="input" autoComplete="name" value={nome} onChange={(e) => { setNome(e.target.value); setErro(null); }} />
                  <UserRound size={17} aria-hidden="true" />
                </div>
                <div className="login-campo">
                  <label htmlFor="email">E-mail</label>
                  <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErro(null); }} />
                  <Mail size={17} aria-hidden="true" />
                </div>
                <div className="login-campo">
                  <label htmlFor="senha">Senha <span className="muted">(ao menos 8 caracteres)</span></label>
                  <input id="senha" className="input" type="password" autoComplete="new-password" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(null); }} />
                  <LockKeyhole size={17} aria-hidden="true" />
                </div>
                <div className="login-campo">
                  <label htmlFor="confirma">Repita a senha</label>
                  <input id="confirma" className="input" type="password" autoComplete="new-password" value={confirma} onChange={(e) => { setConfirma(e.target.value); setErro(null); }} />
                  <LockKeyhole size={17} aria-hidden="true" />
                </div>
                {erro && <p id="cadastro-erro" className="note note-danger" role="alert" style={{ margin: 0 }}>{erro}</p>}
                <button className="btn btn-primary login-entrar" type="submit" disabled={enviando || !convite}>
                  {enviando
                    ? <><span>Criando a conta…</span><LoaderCircle size={18} className="gira" aria-hidden="true" /></>
                    : <><span>Criar conta e entrar</span><ArrowRight size={18} aria-hidden="true" /></>}
                </button>
              </form>
            </>
          )}
        </div>

        <section className="login-perfis" aria-labelledby="sobre-link">
          <h2 id="sobre-link">{convite ? convite.municipio : 'Cadastro pelo link da curadoria'}</h2>
          <p>
            A curadoria do município gerou este link para quem vai conduzir as formações. Como formador, você vê e conduz
            só as turmas em que estiver.
          </p>
          {convite && (
            <div className="cadastro-turmas">
              {convite.turmas.length ? (
                <>
                  <h3>Você já entra nestas turmas</h3>
                  <ul>
                    {convite.turmas.map((t) => (
                      <li key={t.id}><strong>{t.nome}</strong><span>{t.formacao.titulo}</span></li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Depois do cadastro, a curadoria aloca você nas turmas que vai conduzir.</p>
              )}
              <p className="cadastro-validade">Link válido até {fmtData(convite.expiraEm)}. Já tem conta na plataforma? Use o mesmo e-mail e a senha dela.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
