'use client';
// Entrada na plataforma (LoginForm do design system): marca, selo, titulo, campos
// altos com icone e o botao largo; ao lado, os perfis de demonstracao do seed.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, BookOpen, GraduationCap, Library, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Users } from 'lucide-react';
import { login } from '../../lib/api';

// Perfis do seed (packages/db/prisma/seed.ts), todos com a mesma senha.
const SENHA_DEMO = 'Formarede@2026';
const PERFIS: { email: string; titulo: string; descricao: string; icon: LucideIcon; soft: string }[] = [
  { email: 'curador.sp@formarede.gov.br', titulo: 'Entrar como curador(a)', descricao: 'Acervo, trilhas e devolutivas aos formadores', icon: Library, soft: 'var(--brand-soft)' },
  { email: 'formador.sp@formarede.gov.br', titulo: 'Entrar como formador(a)', descricao: 'Turmas, encontros e devolutivas', icon: Users, soft: 'var(--teal-soft)' },
  { email: 'prof.sp@formarede.gov.br', titulo: 'Entrar como professor(a)', descricao: 'Minhas formações e certificados', icon: BookOpen, soft: 'var(--peach-soft)' },
  { email: 'super@formarede.gov.br', titulo: 'Entrar como superadministração', descricao: 'Municípios da plataforma', icon: ShieldCheck, soft: 'var(--sage-soft)' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: string, s: string) {
    if (!e.trim() || !s) { setErro('Preencha o e-mail e a senha.'); return; }
    setErro(null);
    setCarregando(true);
    try {
      await login(e, s);
      router.push('/dashboard');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'E-mail ou senha inválidos.');
      setCarregando(false);
    }
  }

  useEffect(() => { document.title = 'Entrar · Formarede'; }, []);

  return (
    <main className="login">
      <div className="login-frame">
        <div>
          <span className="login-marca">
            <span className="brand-mark" aria-hidden="true"><GraduationCap size={23} strokeWidth={1.7} /></span>
            <span>Formarede<span className="ponto">.</span></span>
          </span>
          <h1 className="login-title">Que bom ter você por aqui.</h1>
          <p className="login-lede">Formação que vira prática em sala: entre para estudar, conduzir e certificar a formação continuada da sua rede.</p>

          <form onSubmit={(ev) => { ev.preventDefault(); void entrar(email, senha); }} style={{ display: 'grid', gap: 14 }} noValidate>
            <div className="login-campo">
              <label htmlFor="email">E-mail institucional</label>
              <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Mail size={17} aria-hidden="true" />
            </div>
            <div className="login-campo">
              <label htmlFor="senha">Senha</label>
              <input id="senha" className="input" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
              <LockKeyhole size={17} aria-hidden="true" />
            </div>
            {erro && <p className="note note-danger" role="alert" style={{ margin: 0 }}>{erro}</p>}
            <button className="btn btn-primary login-entrar" type="submit" disabled={carregando}>
              {carregando ? <><span>Entrando…</span><LoaderCircle size={18} className="gira" aria-hidden="true" /></> : <><span>Entrar na plataforma</span><ArrowRight size={18} aria-hidden="true" /></>}
            </button>
          </form>
        </div>

        <section className="login-perfis" aria-labelledby="perfis">
          <h2 id="perfis">Conheça pelos perfis de demonstração</h2>
          <p>Os municípios e professores são fictícios. Nada aqui é um cadastro real.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {PERFIS.map((p) => {
              const Icone = p.icon;
              return (
                <button key={p.email} type="button" className="demo-option" disabled={carregando} onClick={() => void entrar(p.email, SENHA_DEMO)}>
                  <span className="course-icon" style={{ ['--soft' as string]: p.soft, color: 'var(--ink)' }}>
                    <Icone size={19} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{p.titulo}</strong>
                    <span className="demo-desc">{p.descricao}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
