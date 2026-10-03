import { createProvider, type ProviderId } from '@frameloom/shared';
import { vault } from './services';

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic (script analysis, director, checks)',
  openai: 'OpenAI (text and images)',
  custom: 'Custom OpenAI-compatible endpoint',
  fal: 'fal.ai (video and upscale)',
  elevenlabs: 'ElevenLabs (voice)',
};

// Base URLs for custom endpoints are stored next to the key, inside the encrypted blob, as JSON.
export interface StoredKey { apiKey: string; baseUrl?: string }

export async function saveKey(id: ProviderId, k: StoredKey): Promise<void> {
  await vault.setKey(id, JSON.stringify(k));
}
export async function loadKey(id: ProviderId): Promise<StoredKey> {
  return JSON.parse(await vault.getKey(id)) as StoredKey;
}

/** Runs the provider's cheap key check; throws ProviderError with a message that names the fix. */
export async function testConnection(id: ProviderId): Promise<void> {
  const k = await loadKey(id);
  await createProvider(id, k, (u, i) => fetch(u, i)).testKey();
}
