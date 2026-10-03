/**
 * Anthropic Messages adapter (text + vision), called directly from the extension with the user's key.
 *
 * Verified 2026-10-03 against platform.claude.com docs: endpoint, anthropic-version, error shapes, model ids,
 * output_config.format json_schema, cache_control, GET /v1/models for key tests.
 * NOT verified from an official page: the `anthropic-dangerous-direct-browser-access` header (needed for browser
 * origins). The extension's host permission may make it unnecessary; confirm with a real key (docs/qa-checklist.md).
 * Notes: forced tool_choice is rejected on Opus/Sonnet 5.5, so JSON uses output_config.format. `thinking` is omitted.
 */
import type { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ProviderError } from '../errors';
import { toBase64 } from './bytes';
import { request, type Fetcher } from './http';
import { NO_CAPS, type Capabilities, type TextProvider, type TextRequest } from './types';

const BASE = 'https://api.anthropic.com';
const VERSION = '2023-06-01';

interface Block { type: string; text?: string }
interface MessageResponse { content: Block[]; stop_reason?: string }

export class AnthropicProvider implements TextProvider {
  readonly id = 'anthropic';
  constructor(private readonly apiKey: string, private readonly fetchFn: Fetcher, private readonly baseUrl = BASE) {}

  capabilities(): Capabilities { return { ...NO_CAPS, maxReferenceImages: 20 }; }

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': VERSION,
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }


  private call(path: string, init: RequestInit): Promise<Response> {
    return request({ provider: 'Anthropic', fetch: this.fetchFn }, `${this.baseUrl}${path}`, init, (status, body, headers) => {
      if (/refus|usage polic/i.test(body) && status === 400) return 'policy_rejected';
      // A monthly spend cap arrives as 429 with no retry-after; retrying cannot help.
      if (status === 429 && !headers.get('retry-after') && /usage limit|spend/i.test(body)) return 'quota';
      return undefined;
    });
  }

  async testKey(): Promise<void> {
    await this.call('/v1/models?limit=1', { method: 'GET', headers: this.headers() });
  }

  private body(req: TextRequest, extra: Record<string, unknown> = {}): string {
    const system: Block[] & { cache_control?: unknown }[] = [];
    if (req.system) system.push({ type: 'text', text: req.system });
    if (req.cacheablePrefix) system.push({ type: 'text', text: req.cacheablePrefix, cache_control: { type: 'ephemeral' } } as Block);
    const content: unknown[] = (req.images ?? []).map((img) => ({
      type: 'image', source: { type: 'base64', media_type: img.mime, data: toBase64(img.bytes) },
    }));
    content.push({ type: 'text', text: req.prompt });
    return JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(system.length ? { system } : {}),
      messages: [{ role: 'user', content }],
      ...extra,
    });
  }

  private async send(req: TextRequest, extra?: Record<string, unknown>): Promise<string> {
    const res = await this.call('/v1/messages', { method: 'POST', headers: this.headers(), body: this.body(req, extra) });
    const data = (await res.json()) as MessageResponse;
    // A refusal is HTTP 200 with stop_reason "refusal", not an error status.
    if (data.stop_reason === 'refusal') {
      throw new ProviderError('policy_rejected', 'Anthropic declined this request under its usage policy. Review the wording.', { provider: 'anthropic' });
    }
    const text = data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    if (!text) throw new ProviderError('transient', 'Anthropic returned no text. Retrying.', { provider: 'anthropic' });
    return text;
  }

  complete(req: TextRequest): Promise<string> { return this.send(req); }

  async completeJson<T>(req: TextRequest, schema: ZodType<T>): Promise<T> {
    const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none', target: 'jsonSchema7' });
    const extra = { output_config: { format: { type: 'json_schema', schema: jsonSchema } } };
    let lastIssue = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = attempt === 0 ? req.prompt : `${req.prompt}\n\nYour previous reply was invalid JSON for the schema (${lastIssue}). Reply again with valid JSON only.`;
      const raw = await this.send({ ...req, prompt }, extra);
      try {
        return schema.parse(JSON.parse(stripFence(raw)));
      } catch (e) {
        lastIssue = (e as Error).message.slice(0, 300);
      }
    }
    throw new ProviderError('invalid_request', `Anthropic returned JSON that did not match the expected shape: ${lastIssue}`, { provider: 'anthropic' });
  }
}

const stripFence = (s: string): string => s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
