import { describe, expect, it } from 'vitest';
import { bucket, isFlagOn } from './flags';

const ctx = (over: object = {}) => ({ installId: 'install-1', plan: 'free', key: 'audio', ...over });

describe('isFlagOn', () => {
  it('handles booleans, missing flags and disabled objects', () => {
    expect(isFlagOn(true, ctx())).toBe(true);
    expect(isFlagOn(false, ctx())).toBe(false);
    expect(isFlagOn(undefined, ctx())).toBe(false);
    expect(isFlagOn({ enabled: false }, ctx())).toBe(false);
  });
  it('targets by plan', () => {
    expect(isFlagOn({ enabled: true, plans: ['pro'] }, ctx())).toBe(false);
    expect(isFlagOn({ enabled: true, plans: ['pro'] }, ctx({ plan: 'pro' }))).toBe(true);
    expect(isFlagOn({ enabled: true, plans: [] }, ctx())).toBe(true);
  });
  it('rolls out by a stable percentage bucket', () => {
    expect(bucket('install-1', 'audio')).toBe(bucket('install-1', 'audio'));
    expect(isFlagOn({ enabled: true, percent: 0 }, ctx())).toBe(false);
    expect(isFlagOn({ enabled: true, percent: 100 }, ctx())).toBe(true);
    const on = Array.from({ length: 1000 }, (_, i) => isFlagOn({ enabled: true, percent: 30 }, ctx({ installId: `i${i}` }))).filter(Boolean).length;
    expect(on).toBeGreaterThan(230);
    expect(on).toBeLessThan(370);
    // Raising the percentage only ever adds installs.
    for (let i = 0; i < 200; i++) {
      const c = ctx({ installId: `i${i}` });
      if (isFlagOn({ enabled: true, percent: 30 }, c)) expect(isFlagOn({ enabled: true, percent: 60 }, c)).toBe(true);
    }
  });
});
