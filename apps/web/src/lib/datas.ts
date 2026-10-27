// Datas como as pessoas falam na escola: "qua., 4 de nov. · 18h30", "em 9 dias".

const DIA = 24 * 60 * 60 * 1000;

/** "qua., 4 de nov." */
export function fmtDia(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "18h30" (ou "18h" na hora cheia). */
export function fmtHora(iso: string): string {
  const d = new Date(iso);
  const m = d.getMinutes();
  return `${d.getHours()}h${m ? String(m).padStart(2, '0') : ''}`;
}

/** "04/11/2026" */
export function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** Dia do mes e mes abreviado, para o selo de data dos encontros. */
export function partesData(iso: string): { dia: string; mes: string } {
  const d = new Date(iso);
  return { dia: String(d.getDate()), mes: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') };
}

/** "hoje", "amanhã", "em 9 dias", "ontem", "há 12 dias" (por dia de calendario). */
export function quando(iso: string, agora = new Date()): string {
  const alvo = new Date(iso);
  const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((meiaNoite(alvo) - meiaNoite(agora)) / DIA);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  return dias > 0 ? `em ${dias} dias` : `há ${-dias} dias`;
}

/** O prazo ja passou (fim do dia do prazo). */
export function prazoEncerrado(iso: string, agora = new Date()): boolean {
  return new Date(iso).getTime() < agora.getTime();
}
