import { describe, expect, it } from 'vitest';
import { ProviderError } from '../errors';
import { BudgetGuard, CircuitBreaker } from '../safety';
import { QueueEngine } from './engine';
import { MemoryJobStore } from './memory-store';
import type { EngineEvent, Executor, Job, PollOutcome, StartOutcome } from './types';

const mkJob = (id: string, over: Partial<Job> = {}): Job => ({
  id, runId: 'r', kind: 'image', provider: 'p', model: 'm', input: {}, state: 'queued', seq: Number(id.replace(/\D/g, '')) || 0,
  attempts: 0, maxAttempts: 3, nextAt: 0, estimateUsd: 0.1, ...over,
});

function setup(opts: { exec?: Partial<Executor>; cap?: number; breaker?: number; concurrency?: number } = {}) {
  const store = new MemoryJobStore();
  const events: EngineEvent[] = [];
  let t = 1_000_000;
  const started: string[] = [];
  const executor: Executor = {
    start: async (j): Promise<StartOutcome> => { started.push(j.id); return { done: true, result: `r-${j.id}`, costUsd: 0.1 }; },
    poll: async (): Promise<PollOutcome> => ({ state: 'running' }),
    ...opts.exec,
  };
  const budget = new BudgetGuard(opts.cap ?? 0);
  const breaker = new CircuitBreaker(opts.breaker ?? 5);
  const engine = new QueueEngine({
    store, executor, budget, breaker, now: () => t, rng: () => 0.5, pollIntervalMs: 1000,
    concurrency: { p: opts.concurrency ?? 2 }, onEvent: (e) => events.push(e),
  });
  return { store, engine, events, started, budget, breaker, advance: (ms: number) => { t += ms; }, now: () => t };
}
const state = async (s: MemoryJobStore, id: string) => (await s.all()).find((j) => j.id === id)!;

describe('QueueEngine', () => {
  it('runs jobs in sequence order within provider concurrency', async () => {
    const h = setup({ concurrency: 2 });
    for (const id of ['j3', 'j1', 'j2']) await h.store.put(mkJob(id));
    const r = await h.engine.tick();
    expect(h.started).toEqual(['j1', 'j2']);
    expect(r.started).toBe(2);
    await h.engine.tick();
    expect(h.started).toEqual(['j1', 'j2', 'j3']);
    expect((await state(h.store, 'j3')).state).toBe('succeeded');
    expect(h.budget.spentUsd).toBeCloseTo(0.3);
  });

  it('persists the provider job id before polling and finishes on poll success', async () => {
    let polls = 0;
    const h = setup({ exec: {
      start: async () => ({ done: false, providerJobId: 'pj1' }),
      poll: async () => (++polls < 2 ? { state: 'running' } : { state: 'succeeded', result: 'video', costUsd: 0.5 }),
    } });
    await h.store.put(mkJob('j1'));
    await h.engine.tick();
    expect(await state(h.store, 'j1')).toMatchObject({ state: 'polling', providerJobId: 'pj1' });
    h.advance(1000);
    await h.engine.tick();
    expect((await state(h.store, 'j1')).state).toBe('polling');
    h.advance(1000);
    await h.engine.tick();
    expect(await state(h.store, 'j1')).toMatchObject({ state: 'succeeded', result: 'video', costUsd: 0.5 });
  });

  it('recovers after a crash: polls known provider jobs, requeues never-submitted ones, does not re-submit paid work', async () => {
    const h = setup({ exec: { poll: async () => ({ state: 'succeeded', result: 'ok', costUsd: 0.2 }) } });
    await h.store.put(mkJob('j1', { state: 'running', providerJobId: 'pj' }));
    await h.store.put(mkJob('j2', { state: 'running' }));
    await h.store.put(mkJob('j3', { state: 'succeeded', result: 'old' }));
    expect(await h.engine.recover()).toBe(2);
    await h.engine.tick();
    expect(h.started).toEqual(['j2']);
    expect(await state(h.store, 'j1')).toMatchObject({ state: 'succeeded', result: 'ok' });
    expect((await state(h.store, 'j3')).result).toBe('old');
  });

  it('retries transient failures with backoff and gives up after maxAttempts, flagging the job', async () => {
    const h = setup({ exec: { start: async () => { throw new ProviderError('transient', 'oops'); } }, breaker: 99 });
    await h.store.put(mkJob('j1', { maxAttempts: 2 }));
    await h.engine.tick();
    const retried = await state(h.store, 'j1');
    expect(retried.state).toBe('queued');
    expect(retried.nextAt).toBeGreaterThan(h.now());
    expect(h.events.some((e) => e.type === 'job_retry')).toBe(true);
    await h.engine.tick();
    expect((await state(h.store, 'j1')).state).toBe('queued');
    h.advance(200_000);
    await h.engine.tick();
    expect(await state(h.store, 'j1')).toMatchObject({ state: 'failed', flagged: true, error: { kind: 'transient' } });
  });

  it('honours retry-after on rate limits and slows the provider down', async () => {
    const h = setup({ exec: { start: async () => { throw new ProviderError('rate_limited', 'slow', { retryAfterMs: 7000 }); } }, concurrency: 4, breaker: 99 });
    await h.store.put(mkJob('j1'));
    await h.engine.tick();
    const j = await state(h.store, 'j1');
    expect(j.nextAt).toBe(h.now() + 7000);
  });

  it('never retries policy rejections and flags the shot without tripping the breaker', async () => {
    const h = setup({ exec: { start: async () => { throw new ProviderError('policy_rejected', 'nope'); } }, breaker: 1 });
    await h.store.put(mkJob('j1'));
    await h.store.put(mkJob('j2'));
    await h.engine.tick();
    expect(await state(h.store, 'j1')).toMatchObject({ state: 'failed', flagged: true, attempts: 1 });
    expect(h.engine.paused).toBe(false);
  });

  it('pauses the whole run on an auth error and resumes with the failing job intact', async () => {
    let fail = true;
    const h = setup({ exec: { start: async (j) => { if (fail) throw new ProviderError('auth', 'bad key'); return { done: true, result: j.id, costUsd: 0 }; } } });
    await h.store.put(mkJob('j1'));
    await h.store.put(mkJob('j2'));
    const r = await h.engine.tick();
    expect(r.paused).toBe(true);
    expect(h.events.find((e) => e.type === 'paused')).toMatchObject({ reason: 'breaker' });
    expect((await state(h.store, 'j1')).state).toBe('queued');
    h.advance(10_000_000);
    expect((await h.engine.tick()).started).toBe(0);
    fail = false;
    h.engine.resume();
    await h.engine.tick();
    expect((await state(h.store, 'j1')).state).toBe('succeeded');
  });

  it('counts repeated failures of one shot once, so a single bad shot cannot stall the run', async () => {
    const h = setup({ exec: { start: async () => { throw new ProviderError('transient', 'x'); } }, breaker: 2, concurrency: 1 });
    await h.store.put(mkJob('j1', { seq: 7, maxAttempts: 10 }));
    for (let i = 0; i < 4; i++) { await h.engine.tick(); h.advance(500_000); }
    expect(h.engine.paused).toBe(false);
    expect((await state(h.store, 'j1')).attempts).toBe(4);
  });

  it('trips the breaker after N consecutive failures', async () => {
    const h = setup({ exec: { start: async () => { throw new ProviderError('transient', 'x'); } }, breaker: 2, concurrency: 5 });
    for (const id of ['j1', 'j2', 'j3']) await h.store.put(mkJob(id));
    const r = await h.engine.tick();
    expect(r.paused).toBe(true);
    expect(r.started).toBe(2);
  });

  it('stops before exceeding the budget cap and leaves remaining jobs queued', async () => {
    const h = setup({ cap: 0.25, concurrency: 5 });
    for (const id of ['j1', 'j2', 'j3']) await h.store.put(mkJob(id));
    await h.engine.tick();
    expect(h.started).toEqual(['j1', 'j2']);
    await h.engine.tick();
    expect(h.started).toEqual(['j1', 'j2']);
    expect(h.engine.paused).toBe(true);
    expect(h.events.find((e) => e.type === 'paused')).toMatchObject({ reason: 'budget' });
    expect((await state(h.store, 'j3')).state).toBe('queued');
  });

  it('fails polled jobs the provider reports as failed, marking policy rejections', async () => {
    const h = setup({ exec: { start: async () => ({ done: false, providerJobId: 'x' }), poll: async () => ({ state: 'failed', message: 'blocked', policy: true }) } });
    await h.store.put(mkJob('j1'));
    await h.engine.tick();
    h.advance(1000);
    await h.engine.tick();
    expect(await state(h.store, 'j1')).toMatchObject({ state: 'failed', error: { kind: 'policy_rejected' } });
  });

  it('reports the next wake-up time and unknown errors as unknown', async () => {
    const h = setup({ exec: { start: async () => { throw new Error('weird'); } }, breaker: 99 });
    await h.store.put(mkJob('j1', { maxAttempts: 1 }));
    await h.store.put(mkJob('j2', { nextAt: 5_000_000 }));
    const r = await h.engine.tick();
    expect(r.nextWakeAt).toBe(5_000_000);
    expect((await state(h.store, 'j1')).error?.kind).toBe('unknown');
  });
});
