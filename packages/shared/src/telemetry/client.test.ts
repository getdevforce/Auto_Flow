import { describe, expect, it } from 'vitest';
import { TelemetryClient, sanitizeProps, type TelemetryEvent } from './client';

const mk = (over: { enabled?: boolean; ok?: boolean | 'throw'; maxBatch?: number } = {}) => {
  let queue: TelemetryEvent[] = [];
  const sent: TelemetryEvent[][] = [];
  const client = new TelemetryClient({
    send: async (_id, e) => { if (over.ok === 'throw') throw new Error('offline'); if (over.ok === false) return false; sent.push(e); return true; },
    isEnabled: async () => over.enabled ?? true, load: async () => [...queue], save: async (q) => { queue = q; }, installId: async () => 'i', now: () => 1_700_000_000_000, maxBatch: over.maxBatch, maxQueue: 5,
  });
  return { client, sent, queue: () => queue };
};

describe('sanitizeProps', () => {
  it('keeps catalogue properties and drops content, unknown keys and bad values', () => {
    expect(sanitizeProps({ provider: 'openai', success: true, duration_ms: 5, prompt: 'a red door', script: 'INT.', filename: 'x.mp4', autonomy: 'full_auto' }))
      .toEqual({ provider: 'openai', success: true, duration_ms: 5, autonomy: 'full_auto' });
    expect(sanitizeProps({ provider: 'has <html> & text!', duration_ms: -1, gate: 'nope', success: 'yes', shots: 1.5 })).toEqual({});
  });
});

describe('TelemetryClient', () => {
  it('queues known events with a timestamp and ignores unknown ones', async () => {
    const t = mk();
    await t.client.track('generation', { provider: 'p', prompt: 'secret' });
    await t.client.track('script_pasted', {});
    expect(t.queue()).toEqual([{ name: 'generation', ts: 1_700_000_000, props: { provider: 'p' } }]);
  });
  it('does nothing at all when disabled, and clears what was queued', async () => {
    const off = mk({ enabled: false });
    await off.client.track('app_opened');
    expect(off.queue()).toEqual([]);
    expect(await off.client.flush()).toBe(0);
    expect(off.sent).toEqual([]);
  });
  it('flushes in batches and keeps the rest when the server fails', async () => {
    const t = mk({ maxBatch: 2 });
    for (let i = 0; i < 5; i++) await t.client.track('app_opened');
    expect(await t.client.flush()).toBe(5);
    expect(t.sent.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(t.queue()).toEqual([]);
    const bad = mk({ ok: false });
    await bad.client.track('app_opened');
    expect(await bad.client.flush()).toBe(0);
    expect(bad.queue()).toHaveLength(1); // retried next time
    const thrown = mk({ ok: 'throw' });
    await thrown.client.track('app_opened');
    expect(await thrown.client.flush()).toBe(0);
    expect(thrown.queue()).toHaveLength(1);
  });
  it('bounds the offline queue', async () => {
    const t = mk({ ok: false });
    for (let i = 0; i < 8; i++) await t.client.track('app_opened');
    expect(t.queue()).toHaveLength(5);
  });
});
