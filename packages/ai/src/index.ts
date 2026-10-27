// Gateway de IA governado da FORMAREDE.
// Unico ponto de acesso a provedores (RNF-024): resolve o provider configurado
// pelo municipio, mascara PII (RIA-007) e devolve metadados completos para o
// log de interacao (RIA-004). A decisao humana acontece na camada de dominio.
import { AnthropicProvider } from './providers/anthropic';
import { DeepSeekProvider } from './providers/deepseek';
import { MockProvider } from './providers/mock';
import {
  COPILOTO_PLANEJAMENTO,
  ContextoCopiloto,
  montarPromptCopiloto,
  PLANO_SCHEMA,
} from './prompts';
import { maskPii } from './pii';
import type { AiCompletionResult, AiProvider, PlanoGerado } from './types';

export * from './types';
export { maskPii } from './pii';
export { COPILOTO_PLANEJAMENTO, PLANO_SCHEMA, montarPromptCopiloto } from './prompts';
export type { ContextoCopiloto } from './prompts';

export const PROVIDERS_DISPONIVEIS = ['deepseek', 'anthropic', 'mock'] as const;
export type ProviderNome = (typeof PROVIDERS_DISPONIVEIS)[number];

function resolveProvider(nome: string): AiProvider {
  switch (nome) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY });
    case 'mock':
      return new MockProvider();
    case 'deepseek':
    default:
      return new DeepSeekProvider();
  }
}

export interface ResultadoCopiloto {
  plano: PlanoGerado;
  bruto: AiCompletionResult;
  promptId: string;
  promptVersao: string;
  entradaMascarada: string;
}

/**
 * IA-01 - Copiloto de planejamento formativo.
 * Gera um rascunho estruturado de plano; quem chama registra a AiInteracao e
 * submete o resultado a revisao humana (RIA-002/009).
 */
export async function gerarPlanoFormativo(
  providerNome: string,
  ctx: ContextoCopiloto,
): Promise<ResultadoCopiloto> {
  const provider = resolveProvider(providerNome);
  const user = maskPii(montarPromptCopiloto(ctx));

  const bruto = await provider.complete({
    system: COPILOTO_PLANEJAMENTO.system,
    user,
    outputSchema: PLANO_SCHEMA,
    maxTokens: 8192,
  });

  let plano: PlanoGerado;
  try {
    plano = JSON.parse(bruto.text) as PlanoGerado;
  } catch {
    throw new Error(
      `O provider "${provider.nome}" nao retornou JSON valido. Sinalize a interacao e tente regenerar.`,
    );
  }

  return {
    plano,
    bruto,
    promptId: COPILOTO_PLANEJAMENTO.id,
    promptVersao: COPILOTO_PLANEJAMENTO.versao,
    entradaMascarada: user,
  };
}

// Assistente Pedagogico (LangGraph + Claude Opus 5.5): conversa com professores e formadores.
export * from './assistente';
