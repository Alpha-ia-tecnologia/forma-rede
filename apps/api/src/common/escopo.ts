// Recorte de quem conduz: o formador ve e age so nas turmas em que a curadoria o alocou
// (conduzSoTurmasAlocadas). Para os demais papeis o escopo e null: o municipio todo, com o
// RLS. Cada servico consulta o escopo e filtra (listas) ou recusa com 404 (um item fora dele,
// como se nao existisse, para nao revelar o que ha nas outras turmas).
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { forTenant } from '@formarede/db';
import { AuthUser, conduzSoTurmasAlocadas } from '@formarede/contracts';

export interface EscopoConducao {
  turmas: string[];
  formacoes: string[];
}

/** Turmas e formacoes do formador; null quando a pessoa ve o municipio todo. */
export async function escopoConducao(user: AuthUser): Promise<EscopoConducao | null> {
  if (!conduzSoTurmasAlocadas(user.role)) return null;
  const alocacoes = await forTenant(user.tenantId).turmaFormador.findMany({
    where: { tenantId: user.tenantId, userId: user.id },
    select: { turmaId: true, turma: { select: { formacaoId: true } } },
  });
  return {
    turmas: alocacoes.map((a) => a.turmaId),
    formacoes: [...new Set(alocacoes.map((a) => a.turma.formacaoId))],
  };
}

/** Recusa a formacao fora do escopo; devolve o escopo para filtrar as turmas dentro dela. */
export async function exigirFormacao(user: AuthUser, formacaoId: string, mensagem = 'Formação não encontrada.'): Promise<EscopoConducao | null> {
  const escopo = await escopoConducao(user);
  if (escopo && !escopo.formacoes.includes(formacaoId)) throw new NotFoundException(mensagem);
  return escopo;
}

/** Recusa a turma fora do escopo. */
export async function exigirTurma(user: AuthUser, turmaId: string, mensagem = 'Turma não encontrada.'): Promise<EscopoConducao | null> {
  const escopo = await escopoConducao(user);
  if (escopo && !escopo.turmas.includes(turmaId)) throw new NotFoundException(mensagem);
  return escopo;
}

/** Filtro Prisma por turma (undefined: sem recorte). */
export const naTurma = (escopo: EscopoConducao | null) => (escopo ? { in: escopo.turmas } : undefined);
/** Filtro Prisma por formacao (undefined: sem recorte). */
export const naFormacao = (escopo: EscopoConducao | null) => (escopo ? { in: escopo.formacoes } : undefined);

/**
 * Confere que cada id e de um formador ativo do municipio (o id vem do cliente e o RLS so
 * garante o municipio da alocacao, nao o papel da pessoa).
 */
export async function exigirFormadores(tenantId: string, ids: string[]): Promise<string[]> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return [];
  const vinculos = await forTenant(tenantId).membership.findMany({
    where: { tenantId, userId: { in: unicos }, role: 'FORMADOR', ativo: true },
    select: { userId: true },
  });
  if (new Set(vinculos.map((v) => v.userId)).size !== unicos.length) {
    throw new BadRequestException('Só dá para alocar quem tem o perfil de formador neste município.');
  }
  return unicos;
}
