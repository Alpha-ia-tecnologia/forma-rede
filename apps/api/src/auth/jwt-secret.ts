// Segredo que assina os tokens. O valor de desenvolvimento e o do .env.example estao no
// repositorio (publico): com eles qualquer pessoa forjaria um token de qualquer perfil.
// Em producao a API nao sobe sem um segredo proprio.
const PUBLICOS = ['dev-secret', 'troque-por-um-segredo-forte-em-producao'];

export function jwtSecret(): string {
  const segredo = process.env.JWT_SECRET;
  if (process.env.NODE_ENV !== 'production') return segredo || 'dev-secret';
  if (!segredo || segredo.length < 32 || PUBLICOS.includes(segredo)) {
    throw new Error('JWT_SECRET ausente ou fraco: em producao use ao menos 32 caracteres aleatorios (openssl rand -hex 32).');
  }
  return segredo;
}
