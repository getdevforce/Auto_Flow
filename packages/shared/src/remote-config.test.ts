import { describe, expect, it } from 'vitest';
import { BUNDLED_CONFIG, RemoteConfigSchema, isBelowMinimum, loadRemoteConfig, type ConfigCache, type ConfigStore, type FetchLike } from './remote-config';

const mkStore = (initial?: ConfigCache): ConfigStore & { value?: ConfigCache } => {
  const s: ConfigStore & { value?: ConfigCache } = { value: initial, get: async () => s.value, set: async (c) => { s.value = c; } };
  return s;
};
const valid = { version: 3, schema: 1, minSupportedVersion: '0.1.0' };
const respond = (status: number, body: unknown, etag: string | null = '"e1"'): FetchLike =>
  async () => ({ status, ok: status >= 200 && status < 300, headers: { get: (n) => (n === 'ETag' ? etag : null) }, json: async () => body });

describe('loadRemoteConfig', () => {
  it('fetches, validates and caches with the ETag', async () => {
    const store = mkStore();
    const r = await loadRemoteConfig({ baseUrl: 'http://x', fetch: respond(200, valid), store });
    expect(r.source).toBe('network');
    expect(r.config.version).toBe(3);
    expect(store.value?.etag).toBe('"e1"');
  });
  it('sends If-None-Match and reuses the cache on 304', async () => {
    const store = mkStore({ etag: '"e1"', config: { ...BUNDLED_CONFIG, version: 2 } });
    let sent: Record<string, string> | undefined;
    const f: FetchLike = async (_u, init) => { sent = init?.headers; return { status: 304, ok: false, headers: { get: () => null }, json: async () => ({}) }; };
    const r = await loadRemoteConfig({ baseUrl: 'http://x', fetch: f, store });
    expect(sent).toEqual({ 'If-None-Match': '"e1"' });
    expect(r).toMatchObject({ source: 'cache', config: { version: 2 } });
  });
  it('falls back to the bundled default when offline with no cache', async () => {
    const f: FetchLike = async () => { throw new Error('offline'); };
    expect((await loadRemoteConfig({ baseUrl: 'http://x', fetch: f, store: mkStore() })).source).toBe('bundled');
  });
  it('ignores invalid payloads and keeps the cache', async () => {
    const store = mkStore({ etag: '"old"', config: { ...BUNDLED_CONFIG, version: 5 } });
    const r = await loadRemoteConfig({ baseUrl: 'http://x', fetch: respond(200, { nonsense: true }), store });
    expect(r).toMatchObject({ source: 'cache', config: { version: 5 } });
    expect(store.value?.etag).toBe('"old"');
  });
  it('ignores server errors', async () => {
    expect((await loadRemoteConfig({ baseUrl: 'http://x', fetch: respond(500, {}), store: mkStore() })).source).toBe('bundled');
  });
});

describe('RemoteConfigSchema', () => {
  it('accepts PHP-style empty arrays for featureFlags', () => {
    expect(RemoteConfigSchema.parse({ ...valid, featureFlags: [] }).featureFlags).toEqual({});
  });
});

describe('isBelowMinimum', () => {
  it.each([['0.0.1', '0.1.0', true], ['1.2.0', '1.2', false], ['1.10.0', '1.9.9', false], ['0.9', '1', true]])('%s vs %s', (c, m, e) =>
    expect(isBelowMinimum(c, m)).toBe(e));
});
