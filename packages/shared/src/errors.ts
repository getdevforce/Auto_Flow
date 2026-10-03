export const ERROR_KINDS = [
  'rate_limited', 'transient', 'auth', 'quota', 'policy_rejected', 'invalid_request', 'unknown',
] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export class ProviderError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    message: string,
    public readonly opts: { status?: number; retryAfterMs?: number; provider?: string } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const isRetryable = (k: ErrorKind): boolean => k === 'rate_limited' || k === 'transient';
/** Kinds that mean every following job will fail too, so the run should pause. */
export const tripsBreakerImmediately = (k: ErrorKind): boolean => k === 'auth' || k === 'quota';

/** Map an HTTP status (and optional body hint) to the internal taxonomy. */
export function classifyHttp(status: number, bodyHint = ''): ErrorKind {
  const hint = bodyHint.toLowerCase();
  if (status === 429) return hint.includes('quota') || hint.includes('billing') ? 'quota' : 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'quota';
  if (status === 408 || status === 425 || status >= 500) return 'transient';
  if (status === 400 || status === 404 || status === 422) {
    return /safety|policy|moderation|content[_ ]filter|blocked/.test(hint) ? 'policy_rejected' : 'invalid_request';
  }
  return 'unknown';
}
