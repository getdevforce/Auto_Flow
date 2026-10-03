import { describe, expect, it } from 'vitest';
import type { ZodType, ZodTypeDef } from 'zod';
import type { ScriptAnalysis } from '../analysis/schema';
import { NO_CAPS, type TextProvider, type TextRequest } from '../providers/types';
import { buildMp4Stub, probeMp4 } from '../media/mp4';
import { buildConcatList, buildManifest, buildReport, releasable, type ManifestShot } from './manifest';
import { decideFailure, type FailureContext } from './policy';
import { applyContinuity, clampDuration, ledgerText, planShots } from './shots';

const scene = (index: number, over: object = {}) => ({ index, slugline: `S${index}`, summary: '', characters: ['Ada', 'Ben'], location: 'Dock', dialogue: [], continuity: [], ...over });
const analysis = (scenes: ReturnType<typeof scene>[]): ScriptAnalysis => ({ characters: [], locations: [], props: [], scenes: scenes as never, coverage: { expected: scenes.length, covered: scenes.length, missing: [], complete: true } });

describe('continuity ledger', () => {
  it('replaces costume notes, stacks injuries, and filters to characters present', () => {
    let st = applyContinuity(new Map(), scene(1, { continuity: [{ type: 'costume', character: 'Ada', note: 'yellow raincoat' }] }) as never);
    st = applyContinuity(st, scene(2, { continuity: [{ type: 'costume', character: 'Ada', note: 'grey suit' }, { type: 'injury', character: 'Ada', note: 'bandaged hand' }, { type: 'time_jump', note: 'three years later' }] }) as never);
    expect(ledgerText(st, ['Ada'])).toBe('Ada: wearing: grey suit; injury: bandaged hand | scene: time: three years later');
    expect(ledgerText(st, ['Ben'])).toBe('scene: time: three years later');
    expect(ledgerText(new Map(), [])).toBe('');
  });
});

describe('clampDuration', () => {
  it('limits to the model maximum and snaps to allowed durations', () => {
    expect(clampDuration(30, 10)).toBe(10);
    expect(clampDuration(0.2, 10)).toBe(1);
    expect(clampDuration(7, 10, [5, 10])).toBe(5);
    expect(clampDuration(3, 10, [5, 10])).toBe(5);
  });
});

describe('planShots', () => {
  const planner = (perScene: Record<number, object[]>): TextProvider => ({
    id: 'f', capabilities: () => NO_CAPS, testKey: async () => undefined, complete: async () => '',
    async completeJson<T>(req: TextRequest, schema: ZodType<T, ZodTypeDef, unknown>) {
      const idx = Number(/Scene (\d+)/.exec(req.prompt)![1]);
      return schema.parse({ shots: perScene[idx] });
    },
  });
  const shot = (action: string, extra: object = {}) => ({ size: 'medium', action, characters: ['Ada'], durationSec: 12, ...extra });

  it('assigns one global sequence across scenes, clamps durations and carries continuity forward', async () => {
    const shots = await planShots({
      provider: planner({ 1: [shot('a'), shot('b', { establishes: ['door left open'] })], 2: [shot('c', { size: 'bogus' })] }),
      model: 'm', maxDurationSec: 10, allowedDurations: [5, 10], sceneText: () => '',
      analysis: analysis([scene(1, { continuity: [{ type: 'costume', character: 'Ada', note: 'raincoat' }] }), scene(2)]),
    });
    expect(shots.map((s) => [s.seq, s.sceneIndex, s.shotIndex])).toEqual([[1, 1, 1], [2, 1, 2], [3, 2, 1]]);
    expect(shots.every((s) => s.durationSec === 10)).toBe(true);
    expect(shots[0]!.continuity).toBe('Ada: wearing: raincoat');
    expect(shots[2]!.continuity).toContain('door left open');
    expect(shots[2]!.size).toBe('medium'); // unknown size falls back instead of failing the plan
  });

  it('keeps shots in scene order even when the analysis lists scenes out of order', async () => {
    const shots = await planShots({ provider: planner({ 1: [shot('x')], 2: [shot('y')] }), model: 'm', maxDurationSec: 5, sceneText: () => '', analysis: analysis([scene(2), scene(1)]) });
    expect(shots.map((s) => s.sceneIndex)).toEqual([1, 2]);
  });
});

describe('decideFailure', () => {
  const base: FailureContext = { kind: 'transient', attempts: 0, variantTried: false, fallbackChain: ['b', 'c'], fallbacksTried: [], fallbackEnabled: true, message: 'boom' };
  it('walks retry, variant, fallback models, then flag', () => {
    expect(decideFailure(base)).toEqual({ action: 'retry' });
    expect(decideFailure({ ...base, attempts: 1 })).toEqual({ action: 'retry_variant' });
    expect(decideFailure({ ...base, attempts: 1, variantTried: true })).toEqual({ action: 'fallback_model', model: 'b' });
    expect(decideFailure({ ...base, attempts: 1, variantTried: true, fallbacksTried: ['b'] })).toEqual({ action: 'fallback_model', model: 'c' });
    expect(decideFailure({ ...base, attempts: 1, variantTried: true, fallbacksTried: ['b', 'c'] })).toEqual({ action: 'flag', reason: 'boom' });
    expect(decideFailure({ ...base, attempts: 1, variantTried: true, fallbackEnabled: false }).action).toBe('flag');
  });
  it('never blindly retries policy rejections, auth or quota', () => {
    for (const kind of ['policy_rejected', 'auth', 'quota'] as const) expect(decideFailure({ ...base, kind }).action).toBe('flag');
    expect(decideFailure({ ...base, kind: 'policy_rejected', message: 'unsafe' })).toMatchObject({ reason: expect.stringContaining('unsafe') });
  });
  it('does not rewrite the prompt for invalid requests', () => {
    expect(decideFailure({ ...base, kind: 'invalid_request', attempts: 1 }).action).toBe('fallback_model');
  });
});

describe('mp4 probe', () => {
  it('reads dimensions and duration back from the stub', () => {
    expect(probeMp4(buildMp4Stub(1280, 720, 5))).toEqual({ width: 1280, height: 720, durationSec: 5 });
    expect(probeMp4(buildMp4Stub(640, 360, 2.5, 600))).toEqual({ width: 640, height: 360, durationSec: 2.5 });
  });
  it('returns null for non-mp4 data', () => { expect(probeMp4(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull(); });
});

describe('manifest and ordering', () => {
  const s = (seq: number, status: ManifestShot['status'], extra: Partial<ManifestShot> = {}): ManifestShot => ({ seq, sceneIndex: 1, shotIndex: seq, status, ...extra });
  it('writes a sorted manifest with estimated cost', () => {
    const m = buildManifest('Film', 'native', [s(2, 'done', { costUsd: 0.5 }), s(1, 'done', { costUsd: 0.25 })], new Date('2026-01-01T00:00:00Z'));
    expect(m.shots.map((x) => x.seq)).toEqual([1, 2]);
    expect(m).toMatchObject({ totalCostUsd: 0.75, estimate: true, generatedAt: '2026-01-01T00:00:00.000Z' });
  });
  it('lists finished files in order and notes the rest as comments', () => {
    expect(buildConcatList([s(2, 'flagged', { flagReason: 'policy' }), s(1, 'done', { file: 'Film/001_1_1.mp4' }), s(3, 'done', { file: "Film/003_it's.mp4" })]))
      .toBe("file '001_1_1.mp4'\n# 002 flagged: policy\nfile '003_it'\\''s.mp4'\n");
  });
  it('releases finished shots immediately, or holds them behind earlier unfinished ones in strict mode', () => {
    const shots = [
      { seq: 1, status: 'generating' as const, ready: false },
      { seq: 2, status: 'done' as const, ready: true },
      { seq: 3, status: 'done' as const, ready: true },
    ];
    expect(releasable(shots, false)).toEqual([2, 3]);
    expect(releasable(shots, true)).toEqual([]);
    expect(releasable([{ seq: 1, status: 'flagged' as const, ready: false }, ...shots.slice(1)], true)).toEqual([2, 3]);
    expect(releasable([{ seq: 1, status: 'done' as const, ready: true, downloaded: true }, ...shots.slice(1)], true)).toEqual([2, 3]);
  });
  it('summarises a run', () => {
    const r = buildReport([s(1, 'done', { costUsd: 0.1 }), s(2, 'flagged', { flagReason: 'x' }), s(3, 'skipped'), s(4, 'done', { flagReason: 'draft kept' })], 4, 1000);
    expect(r).toEqual({ succeeded: 2, flagged: [{ seq: 2, reason: 'x' }, { seq: 4, reason: 'draft kept' }], skipped: 1, retries: 4, costUsd: 0.1, durationMs: 1000 });
  });
});
