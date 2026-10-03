import { describe, expect, it } from 'vitest';
import { FALLBACK_ENTITLEMENTS as free, EntitlementsSchema, checkCharacters, checkStartRun, shotAllowance } from './entitlements';

const pro = { ...free, plan: 'pro', limits: { ...free.limits, runs_per_month: 100, features: ['full_auto'], projects: 100, characters: 100, shots_per_run: 200 } };
const base = { autonomy: 'checkpoints', runsThisMonth: 0, project: 'Film', existingProjects: [] as string[] };

describe('checkStartRun', () => {
  it('allows a normal run on the free plan', () => expect(checkStartRun(free, base)).toEqual({ ok: true }));
  it('blocks full auto without the feature and allows it with it', () => {
    expect(checkStartRun(free, { ...base, autonomy: 'full_auto' })).toMatchObject({ ok: false, code: 'feature' });
    expect(checkStartRun(pro, { ...base, autonomy: 'full_auto' })).toEqual({ ok: true });
    expect(checkStartRun(free, { ...base, autonomy: 'manual' })).toEqual({ ok: true });
  });
  it('enforces runs per month including bonus runs', () => {
    expect(checkStartRun(free, { ...base, runsThisMonth: 3 })).toMatchObject({ ok: false, code: 'runs', message: expect.stringContaining('all 3') });
    expect(checkStartRun({ ...free, bonus_runs: 2 }, { ...base, runsThisMonth: 3 })).toEqual({ ok: true });
    expect(checkStartRun({ ...free, bonus_runs: 2 }, { ...base, runsThisMonth: 5 })).toMatchObject({ code: 'runs' });
  });
  it('enforces the project limit only for new projects', () => {
    const three = ['A', 'B', 'C'];
    expect(checkStartRun(free, { ...base, project: 'D', existingProjects: three })).toMatchObject({ ok: false, code: 'projects' });
    expect(checkStartRun(free, { ...base, project: 'B', existingProjects: three })).toEqual({ ok: true });
  });
});

describe('shotAllowance and characters', () => {
  it('trims to the plan limit with an explanation', () => {
    expect(shotAllowance(free, 12)).toEqual({ allowed: 12, skippedReason: null });
    expect(shotAllowance(free, 30)).toEqual({ allowed: 12, skippedReason: expect.stringContaining('12 shots per run') });
    expect(shotAllowance({ ...free, limits: { ...free.limits, shots_per_run: 0 } }, 30).allowed).toBe(30);
  });
  it('checks the character count', () => {
    expect(checkCharacters(free, 6)).toEqual({ ok: true });
    expect(checkCharacters(free, 7)).toMatchObject({ ok: false, code: 'characters', message: expect.stringContaining('7 characters') });
  });
  it('parses the API shape, including a null subscription', () => {
    expect(EntitlementsSchema.parse({ plan: 'pro', limits: { runs_per_month: 5, features: ['full_auto'] }, bonus_runs: 1, subscription: null }).limits.shots_per_run).toBe(0);
  });
});
