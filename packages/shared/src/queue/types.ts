import type { ErrorKind } from '../errors';

export type JobKind = 'text' | 'image' | 'video' | 'upscale' | 'voice';
export type JobState = 'queued' | 'running' | 'polling' | 'succeeded' | 'failed' | 'skipped';

export interface Job {
  id: string;
  runId: string;
  kind: JobKind;
  provider: string;
  model: string;
  /** Opaque to the engine; interpreted by the executor. Never contains secrets. */
  input: unknown;
  state: JobState;
  seq: number;
  attempts: number;
  maxAttempts: number;
  /** Set as soon as a provider accepts the job, so a restart can poll instead of paying again. */
  providerJobId?: string;
  /** Epoch ms before which the job must not run (backoff, pacing). */
  nextAt: number;
  estimateUsd: number;
  costUsd?: number;
  error?: { kind: ErrorKind; message: string };
  result?: unknown;
  /** Set when the job ended in a state a human should look at (policy rejection, retries exhausted). */
  flagged?: boolean;
}

export interface JobStore {
  all(): Promise<Job[]>;
  put(job: Job): Promise<void>;
}

export type StartOutcome =
  | { done: true; result: unknown; costUsd: number }
  | { done: false; providerJobId: string };

export type PollOutcome =
  | { state: 'running' }
  | { state: 'succeeded'; result: unknown; costUsd: number }
  | { state: 'failed'; message: string; policy?: boolean };

export interface Executor {
  start(job: Job): Promise<StartOutcome>;
  poll(job: Job): Promise<PollOutcome>;
}

export type EngineEvent =
  | { type: 'job_done'; job: Job }
  | { type: 'job_failed'; job: Job }
  | { type: 'job_retry'; job: Job; delayMs: number }
  | { type: 'paused'; reason: 'budget' | 'breaker'; detail: string };
