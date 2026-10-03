import { describe, expect, it } from 'vitest';
import { validateRefinement } from '../src/director/checks';
import { DEFAULT_VIDEO_DIALECT } from '../src/director/dialect';
import { refinePrompt } from '../src/director/director';
import { createProvider } from '../src/providers/registry';
import { EVAL_CASES } from './cases';

/** Rubric: required fields present, entities preserved, no contradictions, limit respected. */
const FIELD_HINTS: Record<string, RegExp> = {
  lighting: /light|lamp|sun|shadow|glow|dusk|dawn/i,
  lens: /\b\d{2,3}\s?mm\b|lens|focal/i,
  camera: /camera|tracking|static|pan|tilt|handheld|dolly|crane|shot/i,
  mood: /mood|tense|quiet|urgent|weary|calm|chaotic|restrained/i,
};

describe('Prompt Director eval (recorded outputs)', () => {
  for (const c of EVAL_CASES) {
    it(`${c.id}: passes the rubric`, () => {
      expect(validateRefinement({ raw: c.raw, refined: c.recorded.refined, maxChars: c.maxChars, subjects: c.subjects })).toEqual([]);
      for (const [field, re] of Object.entries(FIELD_HINTS)) expect(c.recorded.refined, `missing ${field}`).toMatch(re);
      expect(c.recorded.refined.length).toBeGreaterThan(c.raw.length);
    });
  }
});

const live = process.env.FRAMELOOM_LIVE_EVAL === '1' && process.env.ANTHROPIC_API_KEY;
describe.skipIf(!live)('Prompt Director eval (live model, opt-in)', () => {
  for (const c of EVAL_CASES) {
    it(`${c.id}: live refinement passes the rubric`, async () => {
      const provider = createProvider('anthropic', { apiKey: process.env.ANTHROPIC_API_KEY as string }, (u, i) => fetch(u, i));
      const r = await refinePrompt(
        { raw: c.raw, strength: 'standard', dialect: { ...DEFAULT_VIDEO_DIALECT, maxChars: c.maxChars }, context: { characters: c.subjects } },
        { provider: provider as never, model: process.env.FRAMELOOM_EVAL_MODEL ?? 'claude-opus-5-5' },
      );
      expect(r.revertedToRaw).toBe(false);
      expect(r.issues).toEqual([]);
    }, 60_000);
  }
});
