import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider } from './anthropic';
import { fromBase64, toBase64 } from './bytes';

type Call = { url: string; init: RequestInit };
const mock = (...responses: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>) => {
  const calls: Call[] = [];
  let i = 0;
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers });
  };
  return { fetch, calls };
};
const text = (t: string, extra: object = {}) => ({ content: [{ type: 'thinking' }, { type: 'text', text: t }], stop_reason: 'end_turn', ...extra });

describe('bytes', () => {
  it('round-trips base64 for every remainder length', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'abcd', 'hello world!']) {
      const b = new TextEncoder().encode(s);
      expect(toBase64(b)).toBe(Buffer.from(s).toString('base64'));
      expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b));
    }
  });
});

describe('AnthropicProvider', () => {
  it('sends auth, version and caches the prefix; reads the text block past thinking', async () => {
    const m = mock({ body: text('hello') });
    const p = new AnthropicProvider('sk-test', m.fetch);
    expect(await p.complete({ model: 'claude-opus-5-5', system: 'sys', cacheablePrefix: 'SCRIPT', prompt: 'go' })).toBe('hello');
    const c = m.calls[0]!;
    expect(c.url).toBe('https://api.anthropic.com/v1/messages');
    expect((c.init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
    expect((c.init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(c.init.body as string);
    expect(body.system[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.thinking).toBeUndefined();
  });

  it('attaches images as base64 blocks', async () => {
    const m = mock({ body: text('ok') });
    await new AnthropicProvider('k', m.fetch).complete({ model: 'm', prompt: 'p', images: [{ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' }] });
    const content = JSON.parse(m.calls[0]!.init.body as string).messages[0].content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AQID' } });
  });

  it('requests structured output, validates, and repairs once on bad JSON', async () => {
    const m = mock({ body: text('not json') }, { body: text('```json\n{"n":2}\n```') });
    const out = await new AnthropicProvider('k', m.fetch).completeJson({ model: 'm', prompt: 'p' }, z.object({ n: z.number() }));
    expect(out).toEqual({ n: 2 });
    expect(m.calls).toHaveLength(2);
    expect(JSON.parse(m.calls[0]!.init.body as string).output_config.format.type).toBe('json_schema');
    expect(JSON.parse(m.calls[1]!.init.body as string).messages[0].content[0].text).toContain('invalid JSON');
  });

  it('gives up with invalid_request after the repair attempt', async () => {
    const m = mock({ body: text('{"n":"x"}') });
    await expect(new AnthropicProvider('k', m.fetch).completeJson({ model: 'm', prompt: 'p' }, z.object({ n: z.number() })))
      .rejects.toMatchObject({ kind: 'invalid_request' });
  });

  it('maps a 200 refusal to policy_rejected', async () => {
    const m = mock({ body: { content: [], stop_reason: 'refusal' } });
    await expect(new AnthropicProvider('k', m.fetch).complete({ model: 'm', prompt: 'p' })).rejects.toMatchObject({ kind: 'policy_rejected' });
  });

  it.each([[401, 'auth'], [429, 'rate_limited'], [529, 'transient'], [500, 'transient'], [400, 'invalid_request']])('maps HTTP %s to %s', async (status, kind) => {
    const m = mock({ status, body: { type: 'error', error: { type: 'x', message: 'm' } }, headers: status === 429 ? { 'retry-after': '1' } : {} });
    await expect(new AnthropicProvider('k', m.fetch).complete({ model: 'm', prompt: 'p' })).rejects.toMatchObject({ kind });
  });

  it('treats a monthly spend-limit 429 without retry-after as quota', async () => {
    const m = mock({ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'You have reached your specified API usage limits' } } });
    await expect(new AnthropicProvider('k', m.fetch).complete({ model: 'm', prompt: 'p' })).rejects.toMatchObject({ kind: 'quota' });
  });

  it('tests keys with the free models endpoint and fails with an actionable message', async () => {
    const ok = mock({ body: { data: [] } });
    await new AnthropicProvider('k', ok.fetch).testKey();
    expect(ok.calls[0]!.url).toContain('/v1/models?limit=1');
    const bad = mock({ status: 401, body: {} });
    await expect(new AnthropicProvider('k', bad.fetch).testKey()).rejects.toThrow('Settings > Keys');
  });

  it('errors transiently when no text comes back', async () => {
    const m = mock({ body: { content: [{ type: 'thinking' }], stop_reason: 'end_turn' } });
    await expect(new AnthropicProvider('k', m.fetch).complete({ model: 'm', prompt: 'p' })).rejects.toMatchObject({ kind: 'transient' });
  });
});
