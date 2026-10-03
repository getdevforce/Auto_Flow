import { type ErrorKind, tripsBreakerImmediately } from './errors';

export class CircuitBreaker {
  private consecutive = 0;
  private tripped: string | null = null;
  constructor(private readonly threshold = 5) {}
  get reason(): string | null { return this.tripped; }
  get isOpen(): boolean { return this.tripped !== null; }
  recordSuccess(): void { this.consecutive = 0; }
  recordFailure(kind: ErrorKind): void {
    if (tripsBreakerImmediately(kind)) { this.tripped = `${kind} error`; return; }
    // Policy rejections are per-shot content problems, not a sign the provider is down.
    if (kind === 'policy_rejected' || kind === 'invalid_request') return;
    this.consecutive += 1;
    if (this.consecutive >= this.threshold) this.tripped = `${this.consecutive} consecutive failures`;
  }
  reset(): void { this.consecutive = 0; this.tripped = null; }
}

export class BudgetGuard {
  constructor(public readonly capUsd: number, private spent = 0) {}
  get spentUsd(): number { return this.spent; }
  /** True when starting a job of this estimated cost would exceed the cap. */
  wouldExceed(estimateUsd: number): boolean { return this.capUsd > 0 && this.spent + estimateUsd > this.capUsd; }
  record(costUsd: number): void { this.spent += costUsd; }
}
