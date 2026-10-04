import type { Fetcher } from './http';
import { AnthropicProvider } from './anthropic';
import { ElevenLabsProvider } from './elevenlabs';
import { FalProvider } from './fal';
import { OpenAICompatibleProvider } from './openai-compatible';

export const PROVIDER_IDS = ['anthropic', 'openai', 'deepseek', 'custom', 'fal', 'elevenlabs'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderSettings { apiKey: string; baseUrl?: string }

/** Single place that turns a provider id plus the user's key into an adapter. */
export function createProvider(id: ProviderId, s: ProviderSettings, fetchFn: Fetcher) {
  switch (id) {
    case 'anthropic': return new AnthropicProvider(s.apiKey, fetchFn);
    case 'openai': return new OpenAICompatibleProvider('openai', s.apiKey, fetchFn, undefined, 'OpenAI');
    // DeepSeek speaks the OpenAI chat protocol. The model name is chosen by the user; nothing here pins one.
    case 'deepseek': return new OpenAICompatibleProvider('deepseek', s.apiKey, fetchFn, s.baseUrl || 'https://api.deepseek.com', 'DeepSeek');
    case 'custom': return new OpenAICompatibleProvider('custom', s.apiKey, fetchFn, s.baseUrl, 'Custom endpoint');
    case 'fal': return new FalProvider(s.apiKey, fetchFn, s.baseUrl);
    case 'elevenlabs': return new ElevenLabsProvider(s.apiKey, fetchFn);
  }
}
