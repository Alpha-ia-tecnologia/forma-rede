'use client';
// Casca do painel no modelo AppShell do design system: moldura `paper` sobre
// `canvas` com a faixa da marca na base, menu lateral (rotina + "Gestao da rede"),
// topo com o "Voltar" para a tela de cima e a pessoa, e no celular a barra fixa
// no rodape. O menu e por papel: o cursista ve o que e dele; quem conduz, a rotina
// de conduzir; cadastro e curadoria so para quem cadastra. Toda entrada do
// Assistente (menu, botao flutuante, botoes das telas) abre o mesmo painel.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft, Award, BarChart3, BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Home, Landmark, Layers,
  Library, LogOut, Menu, School, Sparkles, UserCheck, X,
} from 'lucide-react';
import type { AuthUser } from '@formarede/contracts';
import { ROLE_LABELS } from '@formarede/contracts';
import { api, clearSession, getToken, getUser } from '../../lib/api';
import { EVENTO_ABRIR_ASSISTENTE } from '../../lib/assistente';
import { AssistentePopup } from './assistente/popup';

interface Papel { cursista: boolean; conduz: boolean }
interface ItemNav {
  href: string; label: string; curto: string; icon: LucideIcon;
  /** Quem ve o item: permissao simples ou regra por papel. */
  ve: (u: AuthUser, p: Papel) => boolean;
  gestao?: boolean; assistente?: boolean;
  /** So no Menu do celular (no computador o caminho ja esta na pagina). */
  soNoMenu?: boolean;
}

function can(user: AuthUser, perm?: string): boolean {
  if (!perm) return true;
  return user.permissions.includes('*') || user.permissions.includes(perm);
}
const perm = (p: string) => (u: AuthUser) => can(u, p);
/** Quem conduz ou acompanha formacoes (mesma regra da API). */
const CONDUZ = ['trilha:editar', 'frequencia:registrar', 'entrega:read', 'inscricao:read', 'formacao:update'];

// Rotina primeiro; cadastro e indicadores da rede no grupo "Gestao da rede".
const NAV: ItemNav[] = [
  { href: '/dashboard', label: 'Início', curto: 'Início', icon: Home, ve: () => true },
  { href: '/minhas-formacoes', label: 'Minhas formações', curto: 'Formações', icon: BookOpen, ve: perm('participante:area') },
  { href: '/formacoes', label: 'Formações', curto: 'Formações', icon: Layers, ve: (u, p) => can(u, 'formacao:read') && !p.cursista },
  { href: '/encontros', label: 'Encontros', curto: 'Encontros', icon: CalendarDays, ve: perm('frequencia:registrar') },
  { href: '/frequencia', label: 'Frequência', curto: 'Frequência', icon: UserCheck, ve: perm('frequencia:acompanhar') },
  { href: '/avaliacoes', label: 'Pesquisas', curto: 'Pesquisas', icon: ClipboardCheck, ve: (u) => can(u, 'avaliacao:read') || can(u, 'avaliacao:responder') },
  { href: '/materiais', label: 'Materiais', curto: 'Materiais', icon: Library, ve: (u) => can(u, 'material:create') || can(u, 'material:aprovar') },
  { href: '/assistente', label: 'Assistente IA', curto: 'Assistente', icon: Sparkles, assistente: true, ve: perm('ia:assistente') },
  { href: '/minhas-formacoes#concluidas', label: 'Meus certificados', curto: 'Certificados', icon: Award, soNoMenu: true, ve: (_u, p) => p.cursista },
  { href: '/formacoes', label: 'Formações da rede', curto: 'Rede', icon: Layers, soNoMenu: true, ve: (_u, p) => p.cursista },
  { href: '/escolas', label: 'Escolas', curto: 'Escolas', icon: School, gestao: true, ve: perm('escola:create') },
  { href: '/relatorios', label: 'Relatórios', curto: 'Relatórios', icon: BarChart3, gestao: true, ve: perm('report:read') },
  { href: '/municipios', label: 'Municípios', curto: 'Municípios', icon: Landmark, gestao: true, ve: perm('platform:admin') },
];

/** A tela de cima de onde a pessoa esta (o "Voltar"), ou null nas telas do menu. */
function telaDeCima(pathname: string, cursista: boolean): { href: string; label: string } | null {
  const seg = pathname.split('/').filter(Boolean);
  if (seg.length < 2) return null;
  if (seg[0] === 'formacoes') {
    if (seg.length > 2) return { href: `/formacoes/${seg[1]}`, label: 'a formação' };
    if (seg[1] !== 'nova' && cursista) return { href: '/minhas-formacoes', label: 'Minhas formações' };
    return { href: '/formacoes', label: 'Formações' };
  }
  const raiz = NAV.find((n) => n.href === `/${seg[0]}`);
  return raiz ? { href: raiz.href, label: raiz.label } : null;
}

interface TenantInfo { nome: string; uf: string; slug: string }

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : '';
  return (first + last).toUpperCase();
}

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [assistenteAberto, setAssistenteAberto] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getUser());
    api.get<TenantInfo>('/tenants/current').then(setTenant).catch(() => undefined);
  }, [router]);

  // Ao navegar: fecha o menu do celular; na pagina /assistente o painel fecha.
  useEffect(() => {
    setMenuAberto(false);
    if (pathname.startsWith('/assistente')) setAssistenteAberto(false);
  }, [pathname]);

  // Qualquer tela pode pedir o Assistente (abrirAssistente()); abre o mesmo painel.
  useEffect(() => {
    const abrir = () => setAssistenteAberto(true);
    window.addEventListener(EVENTO_ABRIR_ASSISTENTE, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ASSISTENTE, abrir);
  }, []);

  useEffect(() => {
    if (!menuAberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuAberto(false); botaoMenu.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuAberto]);

  if (!user) return null;
  const conduz = CONDUZ.some((p) => can(user, p));
  const papel: Papel = { conduz, cursista: !conduz && can(user, 'participante:area') };
  const nav = NAV.filter((n) => n.ve(user, papel));
  const rotina = nav.filter((n) => !n.gestao && !n.soNoMenu);
  const gestao = nav.filter((n) => n.gestao);
  const naPaginaDoAssistente = pathname.startsWith('/assistente');
  const podeAssistente = can(user, 'ia:assistente');
  // Para o cursista, a pagina de uma formacao pertence a "Minhas formacoes", nao ao catalogo.
  const deMinhas = papel.cursista && /^\/formacoes\/[^/]+/.test(pathname) && !pathname.startsWith('/formacoes/nova');
  const ativo = (n: ItemNav) => (deMinhas ? n.href === '/minhas-formacoes'
    : n.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(n.href));
  const raiz = telaDeCima(pathname, papel.cursista);
  // Formacao da tela: o assistente aberto ali ja comeca com ela em foco.
  const formacaoDaTela = pathname.match(/^\/formacoes\/([0-9a-z-]{2,})/i)?.[1];
  const formacaoEmFoco = formacaoDaTela && formacaoDaTela !== 'nova' ? formacaoDaTela : undefined;

  function logout() {
    clearSession();
    router.replace('/login');
  }

  // Funcao (nao componente): um componente declarado aqui remontaria a cada render.
  function item(n: ItemNav, classe: 'rail-link' | 'mobile-nav-item') {
    const Icone = n.icon;
    const rotulo = classe === 'rail-link' ? n.label : n.curto;
    // O Assistente abre o painel; na propria pagina /assistente, e so o item atual.
    if (n.assistente && !naPaginaDoAssistente) {
      return (
        <button key={n.href} type="button" className={classe} aria-expanded={assistenteAberto} aria-controls="painel-assistente"
          onClick={() => { setMenuAberto(false); setAssistenteAberto(!assistenteAberto); }}>
          <Icone size={20} aria-hidden="true" />
          <span>{rotulo}</span>
        </button>
      );
    }
    return (
      <Link key={n.href} href={n.href} className={classe} aria-current={ativo(n) ? 'page' : undefined}>
        <Icone size={20} aria-hidden="true" />
        <span>{rotulo}</span>
      </Link>
    );
  }

  // Celular: tres destinos da rotina na barra; o Menu traz so o que nao esta nela.
  const naBarra = rotina.filter((n) => !n.assistente).slice(0, 3);
  const noMenu = nav.filter((n) => !naBarra.includes(n));

  return (
    <>
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <div className="app-frame">
        <aside className="nav-rail" aria-label="Menu lateral">
          <Link href="/dashboard" className="rail-brand" aria-label="Formarede — início">
            <span className="brand-mark" aria-hidden="true"><GraduationCap size={20} /></span>
            <span className="brand-name">Formarede</span>
          </Link>
          <p className="rail-tenant" title={tenant?.nome}>{tenant ? `${tenant.nome} · ${tenant.uf}` : user.tenantSlug}</p>
          <nav className="rail-nav" aria-label="Navegação principal">
            {rotina.map((n) => item(n, 'rail-link'))}
            {gestao.length > 0 && <p className="rail-group">Gestão da rede</p>}
            {gestao.map((n) => item(n, 'rail-link'))}
          </nav>
          <div className="rail-foot">
            <strong>{user.nome}</strong>
            <small>{ROLE_LABELS[user.role]}</small>
            <button type="button" className="rail-sair" onClick={logout}>
              <LogOut size={18} aria-hidden="true" />
              Sair da plataforma
            </button>
          </div>
        </aside>

        <div className="app-content">
          <header className="shell-header">
            <Link href="/dashboard" className="shell-marca" aria-label="Formarede — início">
              <span className="brand-mark" aria-hidden="true"><GraduationCap size={17} /></span>
              Formarede
            </Link>
            {raiz ? (
              <Link href={raiz.href} className="shell-voltar" aria-label={`Voltar para ${raiz.label}`}>
                <ArrowLeft size={18} aria-hidden="true" />
                <span className="shell-voltar-texto">Voltar para {raiz.label}</span>
              </Link>
            ) : (
              <span className="shell-frase" aria-hidden="true" />
            )}
            <div className="shell-acoes">
              <span className="shell-pessoa" title={`${user.nome} · ${ROLE_LABELS[user.role]}`}>
                <span className="avatar" aria-hidden="true">{initials(user.nome)}</span>
                <span>{user.nome.split(/\s+/)[0]}</span>
              </span>
            </div>
          </header>
          <main id="conteudo" className="min-w-0">{children}</main>
        </div>
      </div>

      <nav className="mobile-nav" aria-label="Navegação">
        {naBarra.map((n) => item(n, 'mobile-nav-item'))}
        <button ref={botaoMenu} type="button" className="mobile-nav-item" aria-expanded={menuAberto} aria-controls="menu-celular"
          onClick={() => setMenuAberto(!menuAberto)}>
          {menuAberto ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          <span>Menu</span>
        </button>
      </nav>
      <div id="menu-celular" className="mobile-sheet" hidden={!menuAberto}>
        {tenant && <p className="mobile-sheet-tenant">{tenant.nome} · {tenant.uf}</p>}
        <h2>Para onde você quer ir?</h2>
        <div className="mobile-sheet-grid">
          {noMenu.map((n) => item(n, 'rail-link'))}
        </div>
        <button type="button" className="rail-sair" onClick={logout}>
          <LogOut size={18} aria-hidden="true" />
          Sair da plataforma
        </button>
      </div>

      {podeAssistente && !naPaginaDoAssistente && (
        <AssistentePopup aberto={assistenteAberto} setAberto={setAssistenteAberto} role={user.role} formacaoId={formacaoEmFoco} />
      )}
    </>
  );
}
