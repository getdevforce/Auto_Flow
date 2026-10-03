import { describe, expect, it } from 'vitest';
import type { ZodType, ZodTypeDef } from 'zod';
import { NO_CAPS, type TextProvider, type TextRequest } from '../providers/types';
import { findContradictions, mustKeep, validateRefinement } from './checks';
import { DEFAULT_IMAGE_DIALECT, DEFAULT_VIDEO_DIALECT, Dialect, pickDialect } from './dialect';
import { wordDiff } from './diff';
import { refinePrompt, refinementKey, type RefineResult, type RefinementCache } from './director';

const script = (...replies: Array<Record<string, unknown>>) => {
  const calls: TextRequest[] = [];
  const provider: TextProvider = {
    id: 'fake', capabilities: () => NO_CAPS, testKey: async () => undefined, complete: async () => '',
    async completeJson<T>(req: TextRequest, schema: ZodType<T, ZodTypeDef, unknown>) { calls.push(req); return schema.parse(replies[Math.min(calls.length - 1, replies.length - 1)]); },
  };
  return { provider, calls };
};
const memCache = (): RefinementCache & { map: Map<string, RefineResult> } => {
  const map = new Map<string, RefineResult>();
  return { map, get: async (h) => map.get(h), set: async (h, v) => { map.set(h, v); } };
};
const good = { refined: 'Ada walks across the dock at dusk, 35mm lens, slow tracking shot, tense mood.', negative: 'blur', rationale: 'filled gaps' };

describe('checks', () => {
  it('extracts what must survive: quotes, names mid-sentence, numbers with units', () => {
    expect(mustKeep('Then Ada says "stay here" for 3 seconds at 24 fps near Ben.').sort()).toEqual(['24 fps', '3 seconds', 'ada', 'ben', 'stay here'].sort());
  });
  it('detects contradictions only when the refinement introduces them', () => {
    expect(findContradictions('a sunny day, then night falls')).toEqual(['day and night']);
    expect(validateRefinement({ raw: 'night, sunny', refined: 'night scene, sunny sky', maxChars: 100, subjects: ['x'] }).filter((i) => i.code === 'contradiction')).toEqual([]);
    expect(validateRefinement({ raw: 'a street', refined: 'a street in daytime, later at night', maxChars: 100 }).map((i) => i.code)).toContain('contradiction');
  });
  it('flags empty, too long, lost constraints and missing subjects', () => {
    expect(validateRefinement({ raw: 'x', refined: '  ', maxChars: 10 })[0]!.code).toBe('empty');
    const codes = validateRefinement({ raw: 'Ada runs for 3 seconds', refined: 'a long prompt '.repeat(20), maxChars: 50, subjects: ['Ada'] }).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['too_long', 'lost_constraint']));
    expect(validateRefinement({ raw: 'x', refined: 'hi', maxChars: 50, subjects: ['Ada'] }).map((i) => i.code)).toContain('missing_subject');
    expect(validateRefinement({ raw: 'x', refined: 'hi', maxChars: 50 }).map((i) => i.code)).toContain('missing_subject');
  });
});

describe('dialects', () => {
  const mk = (over: object) => Dialect.parse({ id: 'd', version: '1', guidance: 'g', ...over });
  it('prefers provider-specific and longer model patterns, falls back to defaults', () => {
    const generic = mk({ id: 'generic' });
    const prov = mk({ id: 'prov', providerId: 'fal' });
    const model = mk({ id: 'model', providerId: 'fal', modelPattern: 'kling.*v2' });
    expect(pickDialect([generic, prov, model], { providerId: 'fal', model: 'kling-v2', kind: 'video' }).id).toBe('model');
    expect(pickDialect([generic, prov], { providerId: 'fal', model: 'x', kind: 'video' }).id).toBe('prov');
    expect(pickDialect([generic], { providerId: 'other', model: 'x', kind: 'video' }).id).toBe('generic');
    expect(pickDialect([], { providerId: 'a', model: 'b', kind: 'image' })).toBe(DEFAULT_IMAGE_DIALECT);
    expect(pickDialect([], { providerId: 'a', model: 'b', kind: 'video' })).toBe(DEFAULT_VIDEO_DIALECT);
  });
});

describe('wordDiff', () => {
  it('marks additions, deletions and unchanged runs', () => {
    expect(wordDiff('Ada walks', 'Ada walks fast at dusk')).toEqual([{ kind: 'same', text: 'Ada walks' }, { kind: 'add', text: 'fast at dusk' }]);
    expect(wordDiff('a b c', 'a x c')).toEqual([{ kind: 'same', text: 'a' }, { kind: 'del', text: 'b' }, { kind: 'add', text: 'x' }, { kind: 'same', text: 'c' }]);
    expect(wordDiff('', '')).toEqual([]);
  });
});

describe('refinePrompt', () => {
  const input = { raw: 'Ada walks across the dock', strength: 'standard' as const, dialect: DEFAULT_VIDEO_DIALECT, context: { characters: ['Ada'] } };

  it('returns a clean refinement in one call and passes strength and context to the model', async () => {
    const s = script(good);
    const r = await refinePrompt({ ...input, context: { characters: ['Ada'], continuity: 'raincoat on' } }, { provider: s.provider, model: 'big' });
    expect(r).toMatchObject({ refined: good.refined, revertedToRaw: false, issues: [], cached: false });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.prompt).toContain('Standard');
    expect(s.calls[0]!.prompt).toContain('raincoat on');
    expect(s.calls[0]!.system).toContain(DEFAULT_VIDEO_DIALECT.guidance);
  });

  it('runs the cheaper critique pass when checks fail and keeps the fixed version', async () => {
    const s = script({ ...good, refined: 'A man walks at dusk, 35mm lens, slow tracking shot.' }, good);
    const r = await refinePrompt({ ...input, raw: 'Then Ada walks across the dock' }, { provider: s.provider, model: 'big', critiqueModel: 'small' });
    expect(s.calls.map((c) => c.model)).toEqual(['big', 'small']);
    expect(r.refined).toBe(good.refined);
    expect(s.calls[1]!.prompt).toContain('It has these problems');
  });

  it('reverts to the user wording when the rewrite keeps losing constraints', async () => {
    const bad = { refined: 'A person strolls at dusk.', negative: '', rationale: '' };
    const r = await refinePrompt({ ...input, raw: 'Ada says "wait" for 3 seconds' }, { provider: script(bad).provider, model: 'm' });
    expect(r).toMatchObject({ revertedToRaw: true, refined: 'Ada says "wait" for 3 seconds' });
    expect(r.rationale).toContain('Kept your wording');
  });

  it('enforces pinned phrases', async () => {
    const r = await refinePrompt({ ...input, pinned: ['rusted cranes'] }, { provider: script(good).provider, model: 'm' });
    expect(r.revertedToRaw).toBe(true);
    const ok = await refinePrompt({ ...input, pinned: ['slow tracking shot'] }, { provider: script(good).provider, model: 'm' });
    expect(ok.revertedToRaw).toBe(false);
  });

  it('does nothing when off and drops negatives for models without them', async () => {
    const s = script(good);
    expect((await refinePrompt({ ...input, strength: 'off' }, { provider: s.provider, model: 'm' })).refined).toBe(input.raw);
    expect(s.calls).toHaveLength(0);
    const noNeg = await refinePrompt({ ...input, dialect: { ...DEFAULT_VIDEO_DIALECT, supportsNegative: false } }, { provider: script(good).provider, model: 'm' });
    expect(noNeg.negative).toBe('');
    expect((await refinePrompt({ ...input, raw: '   ' }, { provider: s.provider, model: 'm' })).refined).toBe('   ');
  });

  it('caches by input hash so the same refinement is never paid for twice', async () => {
    const cache = memCache();
    const s = script(good);
    await refinePrompt(input, { provider: s.provider, model: 'm', cache });
    const again = await refinePrompt(input, { provider: s.provider, model: 'm', cache });
    expect(again.cached).toBe(true);
    expect(s.calls).toHaveLength(1);
    expect(refinementKey(input, 'm')).not.toBe(refinementKey({ ...input, strength: 'full' }, 'm'));
    expect(refinementKey(input, 'm')).not.toBe(refinementKey(input, 'other'));
  });
});
