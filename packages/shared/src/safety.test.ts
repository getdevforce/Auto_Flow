import { describe, expect, it } from 'vitest';
import { AdaptivePacer, backoffDelay } from './backoff';
import { classifyHttp, isRetryable } from './errors';
import { BudgetGuard, CircuitBreaker } from './safety';

describe('classifyHttp', () => {
  it.each([
    [429, '', 'rate_limited'], [429, 'billing quota exceeded', 'quota'], [401, '', 'auth'], [403, '', 'auth'],
    [402, '', 'quota'], [503, '', 'transient'], [400, 'blocked by safety system', 'policy_rejected'],
    [422, 'bad field', 'invalid_request'], [418, '', 'unknown'],
  ])('%s %s -> %s', (s, h, k) => expect(classifyHttp(s, h)).toBe(k));
  it('marks only rate_limited/transient retryable', () => {
    expect(isRetryable('transient')).toBe(true);
    expect(isRetryable('policy_rejected')).toBe(false);
  });
});

describe('backoff', () => {
  it('grows then caps, with jitter in range', () => {
    expect(backoffDelay(0, { baseMs: 100, capMs: 1000, rng: () => 0.999 })).toBe(99);
    expect(backoffDelay(10, { baseMs: 100, capMs: 1000, rng: () => 0.999 })).toBe(999);
    expect(backoffDelay(3, { baseMs: 100, capMs: 1000, rng: () => 0 })).toBe(0);
  });
  it('pacer halves on 429 and recovers slowly', () => {
    const p = new AdaptivePacer(4);
    p.onRateLimited();
    expect(p.slots).toBe(2);
    p.onRateLimited(); p.onRateLimited();
    expect(p.slots).toBe(1);
    for (let i = 0; i < 100; i++) p.onSuccess();
    expect(p.slots).toBe(4);
  });
});

describe('circuit breaker', () => {
  it('trips after N consecutive failures and resets on success', () => {
    const b = new CircuitBreaker(3);
    b.recordFailure('transient'); b.recordFailure('transient'); b.recordSuccess();
    b.recordFailure('transient'); b.recordFailure('unknown');
    expect(b.isOpen).toBe(false);
    b.recordFailure('rate_limited');
    expect(b.isOpen).toBe(true);
    b.reset();
    expect(b.isOpen).toBe(false);
  });
  it('trips at once on auth/quota, ignores policy rejections', () => {
    const b = new CircuitBreaker(2);
    for (let i = 0; i < 5; i++) b.recordFailure('policy_rejected');
    expect(b.isOpen).toBe(false);
    b.recordFailure('auth');
    expect(b.reason).toBe('auth error');
  });
});

describe('budget', () => {
  it('hard stops at the cap and treats 0 as unlimited', () => {
    const g = new BudgetGuard(1);
    g.record(0.8);
    expect(g.wouldExceed(0.3)).toBe(true);
    expect(g.wouldExceed(0.2)).toBe(false);
    expect(new BudgetGuard(0).wouldExceed(1e9)).toBe(false);
  });
});

import { ProviderError } from './errors';
describe('ProviderError', () => {
  it('carries kind and metadata', () => {
    const e = new ProviderError('rate_limited', 'slow down', { status: 429, retryAfterMs: 2000 });
    expect(e.kind).toBe('rate_limited');
    expect(e.opts.retryAfterMs).toBe(2000);
    expect(e.name).toBe('ProviderError');
  });
});
