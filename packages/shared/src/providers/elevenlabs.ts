/**
 * ElevenLabs text-to-speech adapter.
 * Verification status 2026-10-03: endpoint POST /v1/text-to-speech/{voice_id}, xi-api-key header and the
 * output_format query parameter were confirmed from search snippets only. Response format, error shape and the
 * key-test endpoint (GET /v1/voices) are UNCONFIRMED; see docs/provider-notes.md.
 */
import { request, type Fetcher } from './http';
import { NO_CAPS, type Capabilities, type MediaBlob, type VoiceProvider, type VoiceRequest } from './types';

export class ElevenLabsProvider implements VoiceProvider {
  readonly id = 'elevenlabs';
  constructor(private readonly apiKey: string, private readonly fetchFn: Fetcher, private readonly baseUrl = 'https://api.elevenlabs.io') {}

  capabilities(): Capabilities { return { ...NO_CAPS, lipSync: false }; }

  private call(path: string, init: RequestInit): Promise<Response> {
    return request({ provider: 'ElevenLabs', fetch: this.fetchFn }, `${this.baseUrl}${path}`,
      { ...init, headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json' } });
  }

  async testKey(): Promise<void> { await this.call('/v1/voices', { method: 'GET' }); }

  async synthesize(req: VoiceRequest): Promise<MediaBlob> {
    const fmt = req.format ?? 'mp3_44100_128';
    const res = await this.call(`/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=${fmt}`, {
      method: 'POST', body: JSON.stringify({ text: req.text, model_id: req.model }),
    });
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime: fmt.startsWith('mp3') ? 'audio/mpeg' : 'audio/wav' };
  }
}
