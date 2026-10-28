import { permissionsForRole, type ApiResponse, type AuthUser, type Role } from '@formarede/contracts';
import { mockRequest, mockStream } from './mock';

const MOCK = process.env.NEXT_PUBLIC_MOCK === '1';

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333') + '/api/v1';
const TOKEN_KEY = 'formarede.token';
const USER_KEY = 'formarede.user';

export function getToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
}
export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  const user = JSON.parse(raw) as AuthUser;
  // A sessao guarda as permissoes do momento do login; o papel e a fonte da verdade,
  // entao recursos criados depois (ex.: o Assistente IA) aparecem sem novo login.
  return { ...user, permissions: permissionsForRole(user.role) };
}
export function setSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (MOCK) return mockRequest<T>(path, init);
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || body.success === false) {
    throw new Error(body.success === false ? body.error : 'Falha na requisicao');
  }
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  /** `signal` cancela a espera (ex.: geracao com IA que a pessoa desistiu de aguardar). */
  post: <T>(path: string, data: unknown, opcoes?: { signal?: AbortSignal }) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data), signal: opcoes?.signal }),
  put: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * POST com resposta em streaming (SSE): chama `onEvento` a cada evento `data:`.
 * Erros anteriores ao stream (validacao, permissao, configuracao) chegam como JSON
 * e viram excecao; erros durante o stream chegam como evento.
 */
export async function streamPost<E>(
  path: string, data: unknown, onEvento: (e: E) => void, signal?: AbortSignal,
): Promise<void> {
  if (MOCK) return mockStream<E>(path, data, onEvento, signal);
  const token = getToken();
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
    signal,
  });
  if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const body = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
    throw new Error(body && body.success === false ? body.error : 'Falha na requisição');
  }
  const leitor = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    buffer += value;
    let fim: number;
    while ((fim = buffer.indexOf('\n\n')) >= 0) {
      const bloco = buffer.slice(0, fim);
      buffer = buffer.slice(fim + 2);
      for (const linha of bloco.split('\n')) {
        if (linha.startsWith('data: ')) onEvento(JSON.parse(linha.slice(6)) as E);
      }
    }
  }
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
  tenants: { slug: string; nome: string; role: Role }[];
}

export async function login(email: string, senha: string, tenantSlug?: string): Promise<LoginResult> {
  const result = await api.post<LoginResult>('/auth/login', { email, senha, tenantSlug });
  setSession(result.accessToken, result.user);
  return result;
}

/** Cadastro de formador pelo link da curadoria: cria a conta e ja entra logado. */
export async function cadastrarFormador(token: string, dados: { nome: string; email: string; senha: string }): Promise<LoginResult> {
  const result = await api.post<LoginResult>(`/convites/publico/${encodeURIComponent(token)}/cadastro`, dados);
  setSession(result.accessToken, result.user);
  return result;
}
