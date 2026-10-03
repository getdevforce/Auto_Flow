/**
 * OpenAI-compatible adapter: chat completions (text/vision) and image generation.
 * Also serves as the "custom endpoint" adapter: pass any base URL that speaks the same protocol.
 *
 * Verification status 2026-10-03: only partly confirmed. A docs snippet says GPT image models return
 * data[].b64_json (no url format). Chat completions and /v1/models shapes are written from the long-stable public
 * protocol, not re-read from current docs. Policy rejections are detected by matching moderation/policy/safety in the
 * error body because the exact code is unconfirmed. See docs/provider-notes.md and docs/qa-checklist.md.
 */
import type { ZodType } from 'zod';
import { ProviderError } from '../errors';
import { dataUri, fromBase64 } from './bytes';
import { request, type Fetcher } from './http';
import { NO_CAPS, type Capabilities, type ImageProvider, type ImageRequest, type MediaBlob, type TextProvider, type TextRequest } from './types';

const policy = (status: number, body: string) =>
  status === 400 && /moderation|content[_ ]policy|safety system|policy_violation/i.test(body) ? ('policy_rejected' as const) : undefined;

export class OpenAICompatibleProvider implements TextProvider, ImageProvider {
  constructor(
    readonly id: string,
    private readonly apiKey: string,
    private readonly fetchFn: Fetcher,
    private readonly baseUrl = 'https://api.openai.com/v1',
    private readonly label = 'OpenAI-compatible provider',
  ) {}

  capabilities(): Capabilities { return { ...NO_CAPS, maxReferenceImages: 4, ratios: ['1:1', '3:2', '2:3'] }; }

  private call(path: string, init: RequestInit): Promise<Response> {
    const headers = { Authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' };
    return request({ provider: this.label, fetch: this.fetchFn }, `${this.baseUrl}${path}`, { ...init, headers }, policy);
  }

  async testKey(): Promise<void> { await this.call('/models', { method: 'GET' }); }

  async complete(req: TextRequest): Promise<string> { return this.chat(req, false); }

  private async chat(req: TextRequest, json: boolean): Promise<string> {
    const userContent: unknown[] = [{ type: 'text', text: req.cacheablePrefix ? `${req.cacheablePrefix}\n\n${req.prompt}` : req.prompt }];
    for (const img of req.images ?? []) userContent.push({ type: 'image_url', image_url: { url: dataUri(img) } });
    const messages = [...(req.system ? [{ role: 'system', content: req.system }] : []), { role: 'user', content: userContent }];
    const res = await this.call('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: req.model, messages,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'content_filter') {
      throw new ProviderError('policy_rejected', `${this.label} filtered this response. Review the wording.`, { provider: this.id });
    }
    const text = choice?.message?.content;
    if (!text) throw new ProviderError('transient', `${this.label} returned no text. Retrying.`, { provider: this.id });
    return text;
  }

  async completeJson<T>(req: TextRequest, schema: ZodType<T>): Promise<T> {
    let issue = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = attempt === 0 ? `${req.prompt}\n\nReply with JSON only.` : `${req.prompt}\n\nYour previous reply was invalid (${issue}). Reply with valid JSON only.`;
      try {
        return schema.parse(JSON.parse(await this.chat({ ...req, prompt }, true)));
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        issue = (e as Error).message.slice(0, 300);
      }
    }
    throw new ProviderError('invalid_request', `${this.label} returned JSON that did not match the expected shape: ${issue}`, { provider: this.id });
  }

  async generate(req: ImageRequest): Promise<MediaBlob[]> {
    const size = req.ratio === '2:3' ? '1024x1536' : req.ratio === '3:2' ? '1536x1024' : '1024x1024';
    const res = await this.call('/images/generations', {
      method: 'POST',
      body: JSON.stringify({ model: req.model, prompt: req.negativePrompt ? `${req.prompt}\nAvoid: ${req.negativePrompt}` : req.prompt, n: req.count ?? 1, size }),
    });
    const data = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const out: MediaBlob[] = [];
    for (const item of data.data ?? []) {
      if (item.b64_json) out.push({ bytes: fromBase64(item.b64_json), mime: 'image/png' });
      else if (item.url) {
        const img = await request({ provider: this.label, fetch: this.fetchFn }, item.url, { method: 'GET' });
        out.push({ bytes: new Uint8Array(await img.arrayBuffer()), mime: img.headers.get('content-type') ?? 'image/png' });
      }
    }
    if (!out.length) throw new ProviderError('transient', `${this.label} returned no image. Retrying.`, { provider: this.id });
    return out;
  }
}
