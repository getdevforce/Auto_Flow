export const RUN_STATES = [
  'draft', 'analysing', 'awaiting_approval', 'building', 'generating', 'finishing',
  'completed', 'paused', 'failed', 'cancelled',
] as const;
export type RunState = (typeof RUN_STATES)[number];

export type RunEvent =
  | { id: string; type: 'START' }
  | { id: string; type: 'ANALYSIS_DONE' }
  | { id: string; type: 'GATE_REQUIRED' }
  | { id: string; type: 'APPROVED' }
  | { id: string; type: 'BUILD_DONE' }
  | { id: string; type: 'GENERATION_DONE' }
  | { id: string; type: 'FINISHED' }
  | { id: string; type: 'PAUSE'; reason: string }
  | { id: string; type: 'RESUME' }
  | { id: string; type: 'FAIL'; reason: string }
  | { id: string; type: 'CANCEL' };

export interface Run {
  state: RunState;
  /** State to return to on RESUME. */
  resumeTo: RunState | null;
  pauseReason: string | null;
  failReason: string | null;
  /** Applied event ids; makes redelivery of the same event a no-op. */
  applied: string[];
}

export const newRun = (): Run => ({ state: 'draft', resumeTo: null, pauseReason: null, failReason: null, applied: [] });

const TERMINAL: RunState[] = ['completed', 'failed', 'cancelled'];
export const isTerminal = (s: RunState): boolean => TERMINAL.includes(s);

const FLOW: Record<string, Partial<Record<RunEvent['type'], RunState>>> = {
  draft: { START: 'analysing' },
  analysing: { ANALYSIS_DONE: 'building', GATE_REQUIRED: 'awaiting_approval' },
  awaiting_approval: { APPROVED: 'building' },
  building: { GATE_REQUIRED: 'awaiting_approval', BUILD_DONE: 'generating' },
  generating: { GENERATION_DONE: 'finishing' },
  finishing: { FINISHED: 'completed' },
};

export class InvalidTransition extends Error {}

/** Pure reducer. Throws InvalidTransition for events that make no sense in the current state. */
export function reduce(run: Run, ev: RunEvent): Run {
  if (run.applied.includes(ev.id)) return run;
  const applied = [...run.applied, ev.id];
  const s = run.state;

  if (ev.type === 'CANCEL') {
    if (isTerminal(s)) throw new InvalidTransition(`cannot cancel a ${s} run`);
    return { ...run, state: 'cancelled', applied };
  }
  if (ev.type === 'FAIL') {
    if (isTerminal(s)) throw new InvalidTransition(`cannot fail a ${s} run`);
    return { ...run, state: 'failed', failReason: ev.reason, applied };
  }
  if (ev.type === 'PAUSE') {
    if (isTerminal(s) || s === 'draft' || s === 'paused') throw new InvalidTransition(`cannot pause from ${s}`);
    return { ...run, state: 'paused', resumeTo: s, pauseReason: ev.reason, applied };
  }
  if (ev.type === 'RESUME') {
    if (s !== 'paused' || !run.resumeTo) throw new InvalidTransition('run is not paused');
    return { ...run, state: run.resumeTo, resumeTo: null, pauseReason: null, applied };
  }
  const next = FLOW[s]?.[ev.type];
  if (!next) throw new InvalidTransition(`${ev.type} is not valid from ${s}`);
  return { ...run, state: next, applied };
}
