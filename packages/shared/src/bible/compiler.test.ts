import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compilePrompt, pickReferences, type CompileInput } from './compiler';
import { adaV1, benV1, dockV1, videoCaps } from './fixtures';

const base: CompileInput = {
  description: 'Ada crosses the dock at dusk, looking for the ferry.',
  size: 'medium', characters: [adaV1, benV1], location: dockV1, caps: videoCaps, ratio: '16:9', durationSec: 5,
  cinema: { angle: 'eye-level', lens: '35mm', depthOfField: 'shallow depth of field', movement: 'slow push-in' },
  style: { id: 's', name: 'Noir', descriptor: 'grainy 16mm film, muted colour', refs: [] },
};

describe('compilePrompt', () => {
  it('matches the reference output (snapshot)', () => {
    expect(compilePrompt(base)).toMatchInlineSnapshot(`
      {
        "durationSec": 5,
        "negativePrompt": "beard, glasses",
        "prompt": "Ada crosses the dock at dusk, looking for the ferry.. Camera: medium shot, eye-level, 35mm lens, shallow depth of field, slow push-in. Characters: Ada Voss: angular face, grey eyes, mid 30s, tall and lean, short black bob, olive skin, scar through left eyebrow. Ben Okoro: round face, late 50s, stocky, grey beard, dark brown skin. Setting: Harbour dock, rusted cranes over black water, lighting: sodium lamps, palette: teal and orange. Style: grainy 16mm film, muted colour",
        "ratio": "16:9",
        "references": [
          {
            "assetId": "a-body",
            "role": "char_ada@v1 full body",
          },
          {
            "assetId": "b-body",
            "role": "char_ben@v1 full body",
          },
          {
            "assetId": "p-wide",
            "role": "environment: loc_dock@v1",
          },
        ],
        "warnings": [],
      }
    `);
  });

  it('is independent of character order', () => {
    expect(compilePrompt({ ...base, characters: [benV1, adaV1] })).toEqual(compilePrompt(base));
  });

  it('applies wardrobe variants and location variants', () => {
    const out = compilePrompt({ ...base, characterVariants: { char_ada: 'storm' }, locationVariant: 'night' });
    expect(out.prompt).toContain('wearing a yellow rain jacket');
    expect(out.prompt).toContain('night, light rain');
  });

  it('drops style, then cinema, then location when too long, never the shot description', () => {
    const out = compilePrompt({ ...base, maxPromptChars: 330 });
    expect(out.prompt.length).toBeLessThanOrEqual(330);
    expect(out.prompt).toContain('Ada crosses the dock');
    expect(out.prompt).not.toContain('Style:');
    expect(out.warnings[0]).toContain('Dropped style');
  });

  it('shortens characters and finally truncates when still too long', () => {
    const shortened = compilePrompt({ ...base, maxPromptChars: 120 });
    expect(shortened.prompt.length).toBeLessThanOrEqual(120);
    expect(shortened.warnings.some((w) => w.includes('Shortened character'))).toBe(true);
    const cut = compilePrompt({ ...base, description: 'x'.repeat(200), maxPromptChars: 50 });
    expect(cut.prompt).toHaveLength(50);
    expect(cut.warnings.at(-1)).toContain('Truncated');
  });

  it('clamps unsupported ratio and duration with a warning', () => {
    const out = compilePrompt({ ...base, ratio: '1:1', durationSec: 8 });
    expect(out).toMatchObject({ ratio: '16:9', durationSec: 5 });
    expect(out.warnings).toHaveLength(2);
    expect(compilePrompt({ ...base, durationSec: 2 }).durationSec).toBe(5);
    expect(compilePrompt({ ...base, durationSec: 30 }).durationSec).toBe(10);
  });

  it('works without characters, location, style or cinema', () => {
    const out = compilePrompt({ description: ' A empty street. ', characters: [], caps: videoCaps });
    expect(out.prompt).toBe('A empty street.');
    expect(out.references).toEqual([]);
  });

  it('property: deterministic, bounded, and refs never exceed the provider limit', () => {
    fc.assert(fc.property(
      fc.string({ maxLength: 300 }), fc.integer({ min: 40, max: 600 }), fc.integer({ min: 0, max: 5 }),
      fc.constantFrom('extreme_close', 'close', 'medium', 'wide', undefined),
      (description, maxPromptChars, maxRefs, size) => {
        const input: CompileInput = { ...base, description, maxPromptChars, size, caps: { ...videoCaps, maxReferenceImages: maxRefs } };
        const a = compilePrompt(input);
        expect(a).toEqual(compilePrompt(structuredClone(input)));
        expect(a.prompt.length).toBeLessThanOrEqual(maxPromptChars);
        expect(a.references.length).toBeLessThanOrEqual(maxRefs);
        expect(new Set(a.references.map((r) => r.assetId)).size).toBe(a.references.length);
      },
    ));
  });
});

describe('pickReferences', () => {
  it('prefers face views for close-ups', () => {
    const refs = pickReferences({ characters: [adaV1], size: 'close', caps: { ...videoCaps, maxReferenceImages: 2 } });
    expect(refs.map((r) => r.assetId)).toEqual(['a-front', 'a-34']);
    expect(pickReferences({ characters: [adaV1], size: 'close', location: dockV1, caps: { ...videoCaps, maxReferenceImages: 2 } }).map((r) => r.assetId)).toEqual(['a-front', 'p-wide']);
  });
  it('puts the environment plate first for wide shots and fills spare slots with more views', () => {
    const refs = pickReferences({ characters: [adaV1], location: dockV1, size: 'wide', caps: { ...videoCaps, maxReferenceImages: 3 } });
    expect(refs.map((r) => r.assetId)).toEqual(['p-wide', 'a-body', 'a-34']);
  });
  it('returns nothing when the provider takes no references and respects plate variants', () => {
    expect(pickReferences({ characters: [adaV1], caps: videoCaps.maxReferenceImages ? { ...videoCaps, maxReferenceImages: 0 } : videoCaps })).toEqual([]);
    const loc = { ...dockV1, plates: [{ assetId: 'day', kind: 'wide' as const, variant: 'day' }, { assetId: 'night', kind: 'wide' as const, variant: 'night' }] };
    expect(pickReferences({ characters: [], location: loc, locationVariant: 'night', caps: videoCaps }).map((r) => r.assetId)).toEqual(['night']);
  });
});
