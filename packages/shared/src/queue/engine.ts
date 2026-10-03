import { AdaptivePacer, backoffDelay } from '../backoff';
import { ProviderError, isRetryable, type ErrorKind } from '../errors';
import { BudgetGuard, CircuitBreaker } from '../safety';
import type { EngineEvent, Executor, Job, JobStore } from './types';

export interface EngineOptions {
  store: JobStore;
  executor: Executor;
  breaker: CircuitBreaker;
  budget: BudgetGuard;
  /** Max parallel jobs per provider id; unknown providers default to 2. */
  concurrency?: Record<string, number>;
  now?: () => number;
  rng?: () => number;
  pollIntervalMs?: number;
  onEvent?: (e: EngineEvent) => void;
}

export interface TickResult {
  started: number;
  polled: number;
  /** Earliest time something becomes actionable; used to set the next chrome.alarms wake-up. */
  nextWakeAt: number | null;
  paused: boolean;
}

/**
 * Durable job runner. It holds no timers and keeps no state beyond the pacers: everything that matters is
 * in the JobStore, so a service worker can die between any two calls and the next tick continues correctly.
 */
export class QueueEngine {
  private readonly pacers = new Map<string, AdaptivePacer>();
  private pausedReason: 'budget' | 'breaker' | null = null;
  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly pollMs: number;

  constructor(private readonly o: EngineOptions) {
    this.now = o.now ?? Date.now;
    this.rng = o.rng ?? Math.random;
    this.pollMs = o.pollIntervalMs ?? 5000;
  }

  get paused(): boolean { return this.pausedReason !== null; }
  resume(): void { this.pausedReason = null; this.o.breaker.reset(); }

  private pacer(provider: string): AdaptivePacer {
    let p = this.pacers.get(provider);
    if (!p) { p = new AdaptivePacer(this.o.concurrency?.[provider] ?? 2); this.pacers.set(provider, p); }
    return p;
  }

  /** Call once after a restart: work in flight with no provider id never reached the provider, so requeue it. */
  async recover(): Promise<number> {
    let n = 0;
    for (const j of await this.o.store.all()) {
      if (j.state === 'running' && !j.providerJobId) { await this.o.store.put({ ...j, state: 'queued' }); n++; }
      else if (j.state === 'running' && j.providerJobId) { await this.o.store.put({ ...j, state: 'polling', nextAt: 0 }); n++; }
    }
    return n;
  }

  async tick(): Promise<TickResult> {
    const now = this.now();
    const jobs = await this.o.store.all();
    let started = 0;
    let polled = 0;

    // Poll accepted jobs first: they cost nothing to check and free provider slots.
    for (const job of jobs.filter((j) => j.state === 'polling' && j.nextAt <= now)) {
      polled++;
      await this.pollOne(job);
    }

    if (!this.paused) {
      const fresh = await this.o.store.all();
      const running = (p: string) => fresh.filter((j) => j.provider === p && (j.state === 'running' || j.state === 'polling')).length;
      const slots = new Map<string, number>();
      const due = fresh.filter((j) => j.state === 'queued' && j.nextAt <= now).sort((a, b) => a.seq - b.seq);
      for (const job of due) {
        if (this.paused) break;
        const free = slots.get(job.provider) ?? this.pacer(job.provider).slots - running(job.provider);
        if (free <= 0) { slots.set(job.provider, free); continue; }
        if (this.o.budget.wouldExceed(job.estimateUsd)) { this.pause('budget', `Budget cap of $${this.o.budget.capUsd.toFixed(2)} reached`); break; }
        slots.set(job.provider, free - 1);
        started++;
        await this.startOne(job);
      }
    }

    return { started, polled, nextWakeAt: await this.nextWake(), paused: this.paused };
  }

  private pause(reason: 'budget' | 'breaker', detail: string): void {
    if (this.pausedReason) return;
    this.pausedReason = reason;
    this.o.onEvent?.({ type: 'paused', reason, detail });
  }

  private async startOne(job: Job): Promise<void> {
    const running: Job = { ...job, state: 'running', attempts: job.attempts + 1 };
    await this.o.store.put(running);
    try {
      const out = await this.o.executor.start(running);
      if (out.done) return this.succeed(running, out.result, out.costUsd);
      // Persist the provider id immediately; losing it would mean paying again after a crash.
      await this.o.store.put({ ...running, state: 'polling', providerJobId: out.providerJobId, nextAt: this.now() + this.pollMs });
    } catch (e) {
      await this.fail(running, e);
    }
  }

  private async pollOne(job: Job): Promise<void> {
    try {
      const out = await this.o.executor.poll(job);
      if (out.state === 'running') return this.o.store.put({ ...job, nextAt: this.now() + this.pollMs });
      if (out.state === 'succeeded') return this.succeed(job, out.result, out.costUsd);
      await this.fail(job, new ProviderError(out.policy ? 'policy_rejected' : 'transient', out.message));
    } catch (e) {
      await this.fail(job, e);
    }
  }

  private async succeed(job: Job, result: unknown, costUsd: number): Promise<void> {
    this.o.budget.record(costUsd);
    this.o.breaker.recordSuccess();
    this.pacer(job.provider).onSuccess();
    const done: Job = { ...job, state: 'succeeded', result, costUsd, error: undefined };
    await this.o.store.put(done);
    this.o.onEvent?.({ type: 'job_done', job: done });
  }

  private async fail(job: Job, e: unknown): Promise<void> {
    const kind: ErrorKind = e instanceof ProviderError ? e.kind : 'unknown';
    const message = (e as Error).message ?? 'Unknown error';
    const retryAfterMs = e instanceof ProviderError ? e.opts.retryAfterMs : undefined;
    this.o.breaker.recordFailure(kind);
    if (kind === 'rate_limited') this.pacer(job.provider).onRateLimited();

    if (this.o.breaker.isOpen) this.pause('breaker', this.o.breaker.reason ?? 'too many failures');

    // The job that tripped the breaker stays retryable so resuming picks it up again.
    const canRetry = (isRetryable(kind) || (this.o.breaker.isOpen && (kind === 'auth' || kind === 'quota'))) && job.attempts < job.maxAttempts;
    if (canRetry) {
      const delay = retryAfterMs ?? backoffDelay(job.attempts, { baseMs: 2000, capMs: 120_000, rng: this.rng });
      const next: Job = { ...job, state: 'queued', providerJobId: undefined, nextAt: this.now() + delay, error: { kind, message } };
      await this.o.store.put(next);
      this.o.onEvent?.({ type: 'job_retry', job: next, delayMs: delay });
      return;
    }
    const failed: Job = { ...job, state: 'failed', error: { kind, message }, flagged: true };
    await this.o.store.put(failed);
    this.o.onEvent?.({ type: 'job_failed', job: failed });
  }

  private async nextWake(): Promise<number | null> {
    const times = (await this.o.store.all())
      .filter((j) => (j.state === 'queued' && !this.paused) || j.state === 'polling')
      .map((j) => j.nextAt);
    return times.length ? Math.min(...times) : null;
  }
}
