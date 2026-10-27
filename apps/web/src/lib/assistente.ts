// Um so jeito de abrir o Assistente: qualquer tela pede, a casca do painel abre o
// painel flutuante (com a formacao da tela em foco, quando houver).
export const EVENTO_ABRIR_ASSISTENTE = 'formarede:abrir-assistente';

export function abrirAssistente(): void {
  window.dispatchEvent(new Event(EVENTO_ABRIR_ASSISTENTE));
}
