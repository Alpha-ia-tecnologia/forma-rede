// Minimizacao de dados pessoais antes do envio a provedores externos (RIA-007).
// Mascara e-mails, CPFs e telefones no texto de entrada.

const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const TELEFONE = /\(?\b\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g;

export function maskPii(texto: string): string {
  return texto
    .replace(EMAIL, '[email-removido]')
    .replace(CPF, '[cpf-removido]')
    .replace(TELEFONE, '[telefone-removido]');
}
