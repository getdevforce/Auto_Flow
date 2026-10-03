import { describe, expect, it } from 'vitest';
import { ProviderError } from '../errors';
import { parseRetryAfter, request } from './http';

const resp = (status: number, body = '', headers: Record<string, string> = {}) => new Response(body, { status, headers });
const opts = (r: Response | Error) => ({ provider: 'acme', fetch: async () => { if (r instanceof Error) throw r; return r; } });

describe('request', () => {
  it('returns ok responses untouched', async () => {
    expect((await request(opts(resp(200, 'hi')), 'u', {})).status).toBe(200);
  });
  it.each([[401, 'auth'], [429, 'rate_limited'], [503, 'transient'], [402, 'quota'], [400, 'invalid_request']])('maps %s to %s', async (s, k) => {
    await expect(request(opts(resp(s, 'x')), 'u', {})).rejects.toMatchObject({ kind: k });
  });
  it('carries retry-after and names the fix for auth errors', async () => {
    const err = (await request(opts(resp(429, '', { 'retry-after': '3' })), 'u', {}).catch((e) => e)) as ProviderError;
    expect(err.opts.retryAfterMs).toBe(3000);
    const auth = (await request(opts(resp(401)), 'u', {}).catch((e) => e)) as ProviderError;
    expect(auth.message).toContain('Settings > Keys');
  });
  it('lets adapters flag policy rejections', async () => {
    await expect(request(opts(resp(400, 'moderation_blocked')), 'u', {}, (_s, b) => (b.includes('moderation') ? 'policy_rejected' : undefined))).rejects.toMatchObject({ kind: 'policy_rejected' });
  });
  it('treats network failures as transient', async () => {
    await expect(request(opts(new TypeError('boom')), 'u', {})).rejects.toMatchObject({ kind: 'transient' });
  });
});

describe('parseRetryAfter', () => {
  it('handles seconds, dates and junk', () => {
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:05 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'))).toBe(5000);
    expect(parseRetryAfter('nonsense')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
