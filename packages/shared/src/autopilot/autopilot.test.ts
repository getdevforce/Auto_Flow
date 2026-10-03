import { describe, expect, it } from 'vitest';
import { GATES, STAGES, autoPick, needsApproval } from './autonomy';
import { characterTraits, platePrompts, portraitPrompt, sheetPrompt } from './entity-prompts';
import type { AnalysedCharacter } from '../analysis/schema';

describe('needsApproval', () => {
  it('manual waits everywhere, full auto nowhere, checkpoints only at the three gates', () => {
    for (const s of STAGES) {
      expect(needsApproval('manual', s)).toBe(true);
      expect(needsApproval('full_auto', s)).toBe(false);
      expect(needsApproval('checkpoints', s)).toBe(GATES.includes(s));
    }
    expect(GATES).toEqual(['characters', 'locations', 'pilot_scene']);
  });
});

describe('autoPick', () => {
  it('picks the best score, earliest on ties, and explains', () => {
    expect(autoPick([{ id: 'a', score: 0.4 }, { id: 'b', score: 0.9 }, { id: 'c', score: 0.9 }])).toMatchObject({ id: 'b' });
    expect(autoPick([{ id: 'a' }, { id: 'b' }])).toMatchObject({ id: 'a', reason: expect.stringContaining('first candidate') });
    expect(autoPick([])).toBeNull();
  });
});

const ada: AnalysedCharacter = {
  name: 'Ada Voss', aliases: [], role: 'engineer', stated: { age: 'mid 30s', hair: 'short black bob', marks: 'scar through left eyebrow' },
  inferred: { build: 'lean', hair: 'ignored because stated' }, ageStages: [], ambiguity: [], confidence: 1,
};
describe('entity prompts', () => {
  it('prefers stated traits and reports which came from inference', () => {
    const t = characterTraits(ada);
    expect(t.used.hair).toBe('short black bob');
    expect(t.inferredKeys).toEqual(['build']);
  });
  it('builds portrait and sheet prompts deterministically', () => {
    expect(portraitPrompt(ada)).toMatchInlineSnapshot(`"Portrait of Ada Voss, engineer: mid 30s, lean, short black bob, scar through left eyebrow. Head and shoulders, neutral expression, plain neutral background, soft even lighting, photographic."`);
    expect(sheetPrompt(ada, 'profile')).toContain('side profile view');
  });
  it('builds a wide and an alternate plate without people', () => {
    const p = platePrompts({ name: 'Dock', interior: false, timeOfDay: 'night', weather: 'rain', mood: 'tense', description: 'rusted cranes', confidence: 1 });
    expect(p.map((x) => x.kind)).toEqual(['wide', 'alt']);
    expect(p[0]!.prompt).toContain('exterior');
    expect(p[0]!.prompt).toContain('No people');
  });
});
