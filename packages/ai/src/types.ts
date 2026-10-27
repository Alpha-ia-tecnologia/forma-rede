// Contratos do gateway de IA governado (secao 07 do DRF-001).
// O dominio NUNCA fala com um provedor direto: passa pelo gateway, que aplica
// mascaramento de PII, prompt versionado e devolve metadados para o log.

export interface AiFonte {
  id: string;
  titulo: string;
  tipo: string;
}

export interface AiCompletionRequest {
  system: string;
  user: string;
  /** JSON Schema da saida estruturada, quando o provider suportar. */
  outputSchema?: Record<string, unknown>;
  maxTokens?: number;
}

export interface AiCompletionResult {
  text: string;
  provider: string;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
}

export interface AiProvider {
  readonly nome: string;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
}

/** Estrutura do plano gerado pelo copiloto (IA-01). */
export interface PlanoGerado {
  objetivos: string[];
  resultadosEsperados: string[];
  modulos: { titulo: string; descricao: string; cargaHoraria: number }[];
  metodologias: string[];
  atividadesSugeridas: { titulo: string; descricao: string }[];
  avaliacao: string;
  observacoes?: string;
}
