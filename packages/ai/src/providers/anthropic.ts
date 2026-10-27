// Provider Anthropic via SDK oficial. Modelo padrao: claude-opus-4-8.
// Usa adaptive thinking e structured outputs (output_config.format) para
// garantir JSON valido quando um schema e fornecido.
import Anthropic from '@anthropic-ai/sdk';
import type { AiCompletionRequest, AiCompletionResult, AiProvider } from '../types';

const MODELO_PADRAO = 'claude-opus-4-8';

export class AnthropicProvider implements AiProvider {
  readonly nome = 'anthropic';
  private readonly client: Anthropic;
  private readonly modelo: string;

  constructor(opts?: { apiKey?: string; modelo?: string }) {
    this.client = new Anthropic(opts?.apiKey ? { apiKey: opts.apiKey } : {});
    this.modelo = opts?.modelo ?? MODELO_PADRAO;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const response = await this.client.messages.create({
      model: this.modelo,
      max_tokens: req.maxTokens ?? 8192,
      thinking: { type: 'adaptive' },
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      ...(req.outputSchema
        ? { output_config: { format: { type: 'json_schema' as const, schema: req.outputSchema } } }
        : {}),
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      text,
      provider: this.nome,
      modelo: response.model,
      tokensEntrada: response.usage.input_tokens,
      tokensSaida: response.usage.output_tokens,
    };
  }
}
