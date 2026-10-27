// Provider DeepSeek (API compativel com OpenAI). Modelo padrao: deepseek-chat.
// Usa fetch nativo (Node 20+) - sem dependencia extra. Para saida estruturada
// usa response_format json_object + schema reforcado no prompt (a API do
// DeepSeek nao suporta json_schema completo).
import type { AiCompletionRequest, AiCompletionResult, AiProvider } from '../types';

const BASE_URL_PADRAO = 'https://api.deepseek.com';
const MODELO_PADRAO = 'deepseek-chat';
const MAX_TOKENS_LIMITE = 8192;

interface DeepSeekResponse {
  model: string;
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class DeepSeekProvider implements AiProvider {
  readonly nome = 'deepseek';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly modelo: string;

  constructor(opts?: { apiKey?: string; modelo?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '';
    this.baseUrl = opts?.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? BASE_URL_PADRAO;
    this.modelo = opts?.modelo ?? process.env.DEEPSEEK_MODEL ?? MODELO_PADRAO;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    if (!this.apiKey) {
      throw new Error(
        'DEEPSEEK_API_KEY nao configurada no servidor. Defina a chave no .env ou troque o provider na tela "IA governada".',
      );
    }

    // json_object garante JSON valido; o schema vai reforcado como instrucao.
    const system = req.outputSchema
      ? `${req.system}\n\nA resposta DEVE seguir exatamente este JSON Schema:\n${JSON.stringify(req.outputSchema)}`
      : req.system;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelo,
        max_tokens: Math.min(req.maxTokens ?? MAX_TOKENS_LIMITE, MAX_TOKENS_LIMITE),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: req.user },
        ],
        ...(req.outputSchema ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => '');
      throw new Error(`DeepSeek retornou ${res.status}: ${corpo.slice(0, 300)}`);
    }

    const body = (await res.json()) as DeepSeekResponse;
    const text = body.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('DeepSeek retornou resposta vazia.');

    return {
      text,
      provider: this.nome,
      modelo: body.model ?? this.modelo,
      tokensEntrada: body.usage?.prompt_tokens ?? 0,
      tokensSaida: body.usage?.completion_tokens ?? 0,
    };
  }
}
