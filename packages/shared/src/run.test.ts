import { describe, expect, it } from 'vitest';
import { InvalidTransition, newRun, reduce, type RunEvent } from './run';

let n = 0;
const ev = <T extends RunEvent['type']>(type: T, extra: object = {}) => ({ id: `e${++n}`, type, ...extra }) as RunEvent;

describe('run state machine', () => {
  it('walks the happy path', () => {
    let r = newRun();
    for (const t of ['START', 'ANALYSIS_DONE', 'BUILD_DONE', 'GENERATION_DONE', 'FINISHED'] as const) r = reduce(r, ev(t));
    expect(r.state).toBe('completed');
  });
  it('goes through approval gate', () => {
    let r = reduce(reduce(newRun(), ev('START')), ev('GATE_REQUIRED'));
    expect(r.state).toBe('awaiting_approval');
    expect(reduce(r, ev('APPROVED')).state).toBe('building');
  });
  it('is idempotent for redelivered events', () => {
    const start = ev('START');
    const once = reduce(newRun(), start);
    expect(reduce(once, start)).toBe(once);
  });
  it('pauses and resumes to the same state', () => {
    let r = reduce(reduce(newRun(), ev('START')), ev('ANALYSIS_DONE'));
    r = reduce(r, ev('PAUSE', { reason: 'budget' }));
    expect(r.state).toBe('paused');
    expect(r.pauseReason).toBe('budget');
    expect(reduce(r, ev('RESUME')).state).toBe('building');
  });
  it('rejects invalid transitions and acts on terminal states', () => {
    expect(() => reduce(newRun(), ev('FINISHED'))).toThrow(InvalidTransition);
    expect(() => reduce(newRun(), ev('PAUSE', { reason: 'x' }))).toThrow(InvalidTransition);
    expect(() => reduce(newRun(), ev('RESUME'))).toThrow(InvalidTransition);
    const c = reduce(newRun(), ev('CANCEL'));
    expect(() => reduce(c, ev('CANCEL'))).toThrow(InvalidTransition);
    expect(() => reduce(c, ev('FAIL', { reason: 'x' }))).toThrow(InvalidTransition);
  });
  it('records failure reason', () => {
    const r = reduce(reduce(newRun(), ev('START')), ev('FAIL', { reason: 'boom' }));
    expect(r.state).toBe('failed');
    expect(r.failReason).toBe('boom');
  });
});
