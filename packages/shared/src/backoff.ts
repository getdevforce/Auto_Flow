export interface BackoffOpts { baseMs: number; capMs: number; rng?: () => number }

/** Full-jitter exponential backoff: uniform in [0, min(cap, base*2^attempt)]. */
export function backoffDelay(attempt: number, { baseMs, capMs, rng = Math.random }: BackoffOpts): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.floor(rng() * ceiling);
}

/** Additive-increase / multiplicative-decrease concurrency that learns from 429s. */
export class AdaptivePacer {
  private limit: number;
  constructor(private readonly max: number, start = max) { this.limit = Math.max(1, Math.min(start, max)); }
  get concurrency(): number { return this.limit; }
  onSuccess(): void { this.limit = Math.min(this.max, this.limit + 0.1); }
  onRateLimited(): void { this.limit = Math.max(1, this.limit / 2); }
  get slots(): number { return Math.max(1, Math.floor(this.limit)); }
}
