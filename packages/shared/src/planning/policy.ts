import { isRetryable, type ErrorKind } from '../errors';

export type FailureAction =
  | { action: 'retry' }
  | { action: 'retry_variant' }
  | { action: 'fallback_model'; model: string }
  | { action: 'flag'; reason: string };

export interface FailureContext {
  kind: ErrorKind;
  /** How many times the engine already retried this exact request (transient errors only). */
  attempts: number;
  variantTried: boolean;
  fallbackChain: string[];
  fallbacksTried: string[];
  fallbackEnabled: boolean;
  message: string;
}

/**
 * What to do with a shot whose job failed for good. A single bad shot is flagged and the run moves on.
 * Policy rejections are never retried blindly: the shot is flagged with the provider's reason.
 */
export function decideFailure(c: FailureContext): FailureAction {
  if (c.kind === 'policy_rejected') return { action: 'flag', reason: `Provider declined the prompt: ${c.message}` };
  if (c.kind === 'auth' || c.kind === 'quota') return { action: 'flag', reason: c.message };
  if (isRetryable(c.kind) && c.attempts < 1) return { action: 'retry' };
  if (!c.variantTried && c.kind !== 'invalid_request') return { action: 'retry_variant' };
  if (c.fallbackEnabled) {
    const next = c.fallbackChain.find((m) => !c.fallbacksTried.includes(m));
    if (next) return { action: 'fallback_model', model: next };
  }
  return { action: 'flag', reason: c.message };
}
