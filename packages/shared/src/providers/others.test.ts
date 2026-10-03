// Fixtures here are hand-written to the documented shapes, not recordings from live services.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createProvider } from './registry';
import { OpenAICompatibleProvider } from './openai-compatible';
import { ElevenLabsProvider } from './elevenlabs';
import { FalProvider } from './fal';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const scripted = (...rs: Array<Response | ((url: string, init?: RequestInit) => Response)>) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  return { calls, fetch: async (url: string, init?: RequestInit) => { calls.push({ url, init }); const r = rs[Math.min(i++, rs.length - 1)]!; return typeof r === 'function' ? r(url, init) : r.clone(); } };
};

describe('OpenAICompatibleProvider', () => {
  it('chats with vision input and a custom base url', async () => {
    const s = scripted(json({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }));
    const p = new OpenAICompatibleProvider('custom', 'k', s.fetch, 'https://llm.local/v1', 'Custom');
    expect(await p.complete({ model: 'm', system: 'sys', prompt: 'p', images: [{ bytes: new Uint8Array([1]), mime: 'image/png' }] })).toBe('hi');
    expect(s.calls[0]!.url).toBe('https://llm.local/v1/chat/completions');
    const body = JSON.parse(s.calls[0]!.init!.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });
  it('validates JSON with one repair attempt', async () => {
    const ok = (c: string) => json({ choices: [{ message: { content: c } }] });
    const s = scripted(ok('nope'), ok('{"a":1}'));
    expect(await new OpenAICompatibleProvider('o', 'k', s.fetch).completeJson({ model: 'm', prompt: 'p' }, z.object({ a: z.number() }))).toEqual({ a: 1 });
    const bad = scripted(ok('{"a":"x"}'));
    await expect(new OpenAICompatibleProvider('o', 'k', bad.fetch).completeJson({ model: 'm', prompt: 'p' }, z.object({ a: z.number() }))).rejects.toMatchObject({ kind: 'invalid_request' });
  });
  it('flags content filtering and moderation rejections as policy_rejected', async () => {
    const f = scripted(json({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] }));
    await expect(new OpenAICompatibleProvider('o', 'k', f.fetch).complete({ model: 'm', prompt: 'p' })).rejects.toMatchObject({ kind: 'policy_rejected' });
    const m = scripted(json({ error: { code: 'moderation_blocked' } }, 400));
    await expect(new OpenAICompatibleProvider('o', 'k', m.fetch).generate({ model: 'i', prompt: 'p' })).rejects.toMatchObject({ kind: 'policy_rejected' });
  });
  it('decodes base64 images, follows url images, and errors when empty', async () => {
    const png = Buffer.from([137, 80, 78, 71]).toString('base64');
    const a = scripted(json({ data: [{ b64_json: png }] }));
    const out = await new OpenAICompatibleProvider('o', 'k', a.fetch).generate({ model: 'i', prompt: 'p', ratio: '2:3', negativePrompt: 'blur' });
    expect(Array.from(out[0]!.bytes)).toEqual([137, 80, 78, 71]);
    expect(JSON.parse(a.calls[0]!.init!.body as string)).toMatchObject({ size: '1024x1536' });
    const u = scripted(json({ data: [{ url: 'https://cdn/x.png' }] }), new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/webp' } }));
    expect((await new OpenAICompatibleProvider('o', 'k', u.fetch).generate({ model: 'i', prompt: 'p' }))[0]!.mime).toBe('image/webp');
    await expect(new OpenAICompatibleProvider('o', 'k', scripted(json({ data: [] })).fetch).generate({ model: 'i', prompt: 'p' })).rejects.toMatchObject({ kind: 'transient' });
  });
  it('uses the multipart edits endpoint when reference images are given', async () => {
    const png = Buffer.from([1, 2]).toString('base64');
    const s = scripted(json({ data: [{ b64_json: png }] }));
    const out = await new OpenAICompatibleProvider('o', 'k', s.fetch).generate({ model: 'i', prompt: 'new angle', references: [{ bytes: new Uint8Array([9]), mime: 'image/png' }] });
    expect(out).toHaveLength(1);
    expect(s.calls[0]!.url).toBe('https://api.openai.com/v1/images/edits');
    const form = s.calls[0]!.init!.body as FormData;
    expect(form.get('prompt')).toBe('new angle');
    expect(form.getAll('image[]')).toHaveLength(1);
    expect((s.calls[0]!.init!.headers as Record<string, string>)['content-type']).toBeUndefined();
  });
  it('tests keys against /models', async () => {
    const s = scripted(json({ data: [] }));
    await new OpenAICompatibleProvider('o', 'k', s.fetch).testKey();
    expect(s.calls[0]!.url).toBe('https://api.openai.com/v1/models');
    await expect(new OpenAICompatibleProvider('o', 'k', scripted(json({}, 401)).fetch).testKey()).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('ElevenLabsProvider', () => {
  it('synthesises audio and sends the key header', async () => {
    const s = scripted(new Response(new Uint8Array([9, 9]), { headers: { 'content-type': 'audio/mpeg' } }));
    const blob = await new ElevenLabsProvider('xi', s.fetch).synthesize({ model: 'm', voiceId: 'v 1', text: 'hello' });
    expect(blob.mime).toBe('audio/mpeg');
    expect(s.calls[0]!.url).toContain('/v1/text-to-speech/v%201?output_format=mp3_44100_128');
    expect((s.calls[0]!.init!.headers as Record<string, string>)['xi-api-key']).toBe('xi');
    expect((await new ElevenLabsProvider('xi', scripted(new Response(new Uint8Array([1]))).fetch).synthesize({ model: 'm', voiceId: 'v', text: 't', format: 'pcm_44100' })).mime).toBe('audio/wav');
  });
  it('tests keys and maps auth failure', async () => {
    await new ElevenLabsProvider('k', scripted(json({ voices: [] })).fetch).testKey();
    await expect(new ElevenLabsProvider('k', scripted(json({}, 401)).fetch).testKey()).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('FalProvider', () => {
  const submit = json({ request_id: 'r1', status_url: 'https://queue.fal.run/m/requests/r1/status', response_url: 'https://queue.fal.run/m/requests/r1' });
  it('submits, polls through queued/running/succeeded and downloads the result', async () => {
    const s = scripted(
      submit, json({ status: 'IN_QUEUE' }), json({ status: 'IN_PROGRESS' }),
      json({ status: 'COMPLETED' }), json({ video: { url: 'https://cdn/v.mp4' } }),
      json({ status: 'COMPLETED' }), json({ video: { url: 'https://cdn/v.mp4' } }),
      new Response(new Uint8Array([7]), { headers: { 'content-type': 'video/mp4' } }),
    );
    const p = new FalProvider('k', s.fetch);
    const job = await p.generate({ model: 'm', prompt: 'p', ratio: '16:9', durationSec: 5, seed: 3, firstFrame: { bytes: new Uint8Array([1]), mime: 'image/png' } });
    expect(job).toEqual({ provider: 'fal', jobId: 'r1', model: 'm' });
    const body = JSON.parse(s.calls[0]!.init!.body as string);
    expect(body).toMatchObject({ aspect_ratio: '16:9', duration: '5', seed: 3 });
    expect((s.calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('Key k');
    expect(await p.poll(job)).toEqual({ state: 'queued' });
    expect(await p.poll(job)).toEqual({ state: 'running' });
    expect(await p.poll(job)).toEqual({ state: 'succeeded', resultUrl: 'https://cdn/v.mp4' });
    expect(Array.from((await p.fetchResult(job)).bytes)).toEqual([7]);
  });
  it('rebuilds job urls after a restart and flags policy failures', async () => {
    const s = scripted(json({ status: 'COMPLETED', error: 'blocked by safety checker' }));
    const st = await new FalProvider('k', s.fetch).poll({ provider: 'fal', jobId: 'old', model: 'fal-ai/x' });
    expect(s.calls[0]!.url).toBe('https://queue.fal.run/fal-ai/x/requests/old/status');
    expect(st).toMatchObject({ state: 'failed', policy: true });
  });
  it('handles odd responses', async () => {
    await expect(new FalProvider('k', scripted(json({})).fetch).generate({ model: 'm', prompt: 'p' })).rejects.toMatchObject({ kind: 'transient' });
    expect(await new FalProvider('k', scripted(json({ status: 'WEIRD' })).fetch).poll({ provider: 'fal', jobId: 'a', model: 'm' })).toMatchObject({ state: 'failed' });
    expect(await new FalProvider('k', scripted(json({ status: 'COMPLETED' }), json({})).fetch).poll({ provider: 'fal', jobId: 'a', model: 'm' })).toMatchObject({ state: 'failed' });
    await expect(new FalProvider('k', scripted(json({ status: 'IN_QUEUE' })).fetch).fetchResult({ provider: 'fal', jobId: 'a', model: 'm' })).rejects.toMatchObject({ kind: 'invalid_request' });
  });
  it('upscales and tests keys (404 on the probe means the key is accepted)', async () => {
    const s = scripted(submit);
    await new FalProvider('k', s.fetch).upscale({ model: 'm', video: { bytes: new Uint8Array([1]), mime: 'video/mp4' }, factor: 2 });
    expect(JSON.parse(s.calls[0]!.init!.body as string)).toMatchObject({ scale: 2 });
    await new FalProvider('k', scripted(json({}, 404)).fetch).testKey();
    await expect(new FalProvider('k', scripted(json({}, 401)).fetch).testKey()).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('createProvider', () => {
  it('builds each adapter from an id', () => {
    const f = scripted(json({})).fetch;
    for (const id of ['anthropic', 'openai', 'custom', 'fal', 'elevenlabs'] as const) {
      expect(createProvider(id, { apiKey: 'k', baseUrl: 'https://x/v1' }, f)).toBeTruthy();
    }
  });
});
