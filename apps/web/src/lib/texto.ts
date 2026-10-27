// Texto em portugues de verdade: plurais certos e numeros com virgula.

/** "1 encontro" / "3 encontros". */
export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

/** 4.4 -> "4,4" (uma casa decimal por padrao). */
export function decimal(n: number, casas = 1): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** A etapa do processo como quem estuda entende (o fluxo interno fica para quem conduz). */
export function etapaParaCursista(etapa: string): string {
  if (etapa === 'CONCLUIDA') return 'Encerrada';
  if (etapa === 'CANCELADA') return 'Cancelada';
  if (etapa === 'EXECUCAO' || etapa === 'AVALIACAO') return 'Em andamento';
  return 'Em preparação';
}

const MODALIDADES: Record<string, string> = { PRESENCIAL: 'Presencial', HIBRIDA: 'Híbrida', VIRTUAL: 'Virtual' };
/** "HIBRIDA" -> "Híbrida". */
export function modalidade(m: string): string {
  return MODALIDADES[m] ?? m.charAt(0) + m.slice(1).toLowerCase();
}

/**
 * Link colado pela pessoa como endereco da internet: completa o "https://" que faltar
 * ("drive.google.com/..." vira "https://drive.google.com/..."). Vazio devolve "";
 * algo que nao parece endereco devolve null (a tela explica o que conferir).
 */
export function linkWeb(texto: string): string | null {
  const t = texto.trim();
  if (!t) return '';
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
  try {
    const u = new URL(comEsquema);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname.includes('.') || /\s/.test(t)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
