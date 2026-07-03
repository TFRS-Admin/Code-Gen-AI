import { config } from '../../config';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  model: string;
  provider: string;
}

export interface Provider {
  name: string;
  complete(messages: ProviderMessage[], systemPrompt?: string): Promise<ProviderResponse>;
}

// ─────────────────────────────────────────────
// MOCK PROVIDER — for local dev without API keys
// ─────────────────────────────────────────────
const mockProvider: Provider = {
  name: 'mock',
  async complete(messages) {
    const lastUser = messages.filter(m => m.role === 'user').pop();
    return {
      content: `[MOCK RESPONSE] Received: "${lastUser?.content?.slice(0, 80)}..." — Replace with a real provider in .env`,
      model: 'mock-v1',
      provider: 'mock',
      inputTokens: 0,
      outputTokens: 0,
    };
  },
};

// ─────────────────────────────────────────────
// OPENAI PROVIDER
// ─────────────────────────────────────────────
async function openaiComplete(
  messages: ProviderMessage[],
  systemPrompt?: string
): Promise<ProviderResponse> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.providers.openai.apiKey });

  const allMessages = systemPrompt
    ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
    : messages;

  const res = await client.chat.completions.create({
    model: config.providers.openai.model,
    messages: allMessages,
  });

  return {
    content: res.choices[0]?.message?.content || '',
    inputTokens: res.usage?.prompt_tokens,
    outputTokens: res.usage?.completion_tokens,
    model: res.model,
    provider: 'openai',
  };
}

const openaiProvider: Provider = {
  name: 'openai',
  complete: openaiComplete,
};

// ─────────────────────────────────────────────
// ANTHROPIC PROVIDER
// ─────────────────────────────────────────────
async function anthropicComplete(
  messages: ProviderMessage[],
  systemPrompt?: string
): Promise<ProviderResponse> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: config.providers.anthropic.apiKey });

  const res = await client.messages.create({
    model: config.providers.anthropic.model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
  });

  const text = res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');

  return {
    content: text,
    inputTokens: res.usage?.input_tokens,
    outputTokens: res.usage?.output_tokens,
    model: res.model,
    provider: 'anthropic',
  };
}

const anthropicProvider: Provider = {
  name: 'anthropic',
  complete: anthropicComplete,
};

// ─────────────────────────────────────────────
// GATEWAY — picks the right provider
// ─────────────────────────────────────────────
const providers: Record<string, Provider> = {
  mock: mockProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
};

export function getProvider(name?: string): Provider {
  const key = name || config.providers.default;
  const provider = providers[key];
  if (!provider) throw new Error(`Unknown provider: ${key}. Valid options: mock, openai, anthropic`);
  return provider;
}
