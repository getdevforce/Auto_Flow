import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FIXTURE_SCENE_COUNT, FIXTURE_SCRIPT } from '../fixtures/script';
import { NO_CAPS, type TextProvider, type TextRequest } from '../providers/types';
import { chunkScenes, cleanFountain, splitScenes } from '../script/scenes';
import { docxXmlToText } from '../script/docx';
import { analyseScript } from './analyse';
import { applyMerges, canonicaliseScenes, checkCoverage, mergeCharacters, mergeLocations } from './merge';
import type { AnalysedCharacter, ChunkAnalysis } from './schema';

const char = (name: string, extra: Partial<AnalysedCharacter> = {}): AnalysedCharacter =>
  ({ name, aliases: [], role: '', stated: {}, inferred: {}, ageStages: [], ambiguity: [], confidence: 0.8, ...extra });

describe('splitScenes', () => {
  it('splits the fixture on sluglines and keeps every word', () => {
    const scenes = splitScenes(FIXTURE_SCRIPT);
    expect(scenes).toHaveLength(FIXTURE_SCENE_COUNT);
    expect(scenes.map((s) => s.slugline)).toEqual([
      'INT. HARBOUR OFFICE - DAY', 'EXT. DOCK - NIGHT', "INT. ADA'S CHILDHOOD KITCHEN - DAY (FLASHBACK)", 'EXT. DOCK - DAWN', 'INT. HARBOUR OFFICE - NIGHT',
    ]);
    const rejoined = scenes.map((s) => s.text).join(' ').replace(/\s+/g, ' ');
    expect(rejoined).toBe(FIXTURE_SCRIPT.replace(/\s+/g, ' ').trim());
  });
  it('treats leading text as an opening scene and handles numbered sluglines', () => {
    const s = splitScenes('Cold open text.\n\n12 INT. ROOM - DAY\nA man waits.');
    expect(s.map((x) => x.slugline)).toEqual(['Opening', 'INT. ROOM - DAY']);
  });
  it('falls back to sections when there are no sluglines, and never returns nothing for text', () => {
    const s = splitScenes('First idea.\n\nSecond idea.\n\n\nThird.');
    expect(s).toHaveLength(3);
    expect(splitScenes('')).toEqual([]);
  });
});

describe('cleanFountain / docx', () => {
  it('strips notes, boneyard and emphasis marks', () => {
    const out = cleanFountain('Title: X\n\n/* cut */INT. A - DAY\n\nHe *runs* [[note]] fast.\n\n===\n\n# Act 1');
    expect(out).toBe('INT. A - DAY\n\nHe runs  fast.');
  });
  it('reads paragraphs from document.xml', () => {
    expect(docxXmlToText('<w:p><w:r><w:t>INT. A &amp; B</w:t></w:r></w:p><w:p><w:r><w:t>Line</w:t></w:r></w:p>')).toBe('INT. A & B\nLine');
  });
});

describe('chunkScenes', () => {
  it('groups whole scenes under the limit, and gives oversize scenes their own chunk', () => {
    const scenes = [1, 2, 3, 4].map((i) => ({ index: i, slugline: '', text: 'x'.repeat(i === 3 ? 500 : 100) }));
    const chunks = chunkScenes(scenes, 250);
    expect(chunks.map((c) => c.scenes.map((s) => s.index))).toEqual([[1, 2], [3], [4]]);
  });
});

describe('merge', () => {
  it('unifies aliases, nicknames and age stages into one character with the fullest name', () => {
    const merged = mergeCharacters([
      char('Ada', { aliases: ['the engineer'], stated: { hair: 'short black bob' }, firstScene: 2 }),
      char('Ada Voss', { stated: { hair: 'long', marks: 'scar through left eyebrow' }, inferred: { build: 'lean' }, firstScene: 1, confidence: 0.9 }),
      char('Young Ada', { ageStages: [{ label: 'age 8', description: 'child' }] }),
      char('Ben Okoro'),
    ]);
    expect(merged).toHaveLength(2);
    const ada = merged.find((c) => c.name === 'Ada Voss')!;
    expect(ada.aliases).toEqual(['Ada', 'Young Ada', 'the engineer']);
    expect(ada.stated).toEqual({ hair: 'short black bob', marks: 'scar through left eyebrow' });
    expect(ada.inferred.build).toBe('lean');
    expect(ada.firstScene).toBe(1);
    expect(ada.confidence).toBe(0.9);
    expect(ada.ageStages).toHaveLength(1);
  });
  it('merges locations by normalised name', () => {
    const l = mergeLocations([
      { name: 'Harbour Office', interior: null, timeOfDay: '', weather: '', mood: '', description: '', confidence: 0.5 },
      { name: 'HARBOUR  OFFICE', interior: true, timeOfDay: 'day', weather: '', mood: 'tense', description: 'cramped', confidence: 0.9 },
    ]);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ interior: true, mood: 'tense', confidence: 0.9 });
  });
  it('rewrites scene names to canonical ones', () => {
    const a: ChunkAnalysis = {
      characters: [char('Ada Voss', { aliases: ['Ada'] })], locations: [], props: [],
      scenes: [{ index: 1, slugline: '', summary: '', characters: ['Ada', 'Ada Voss'], location: '', dialogue: [{ speaker: 'ADA', line: 'hi' }], continuity: [{ type: 'costume', character: 'Ada', note: 'raincoat' }] }],
    };
    const out = canonicaliseScenes(a).scenes[0]!;
    expect(out.characters).toEqual(['Ada Voss']);
    expect(out.dialogue[0]!.speaker).toBe('Ada Voss');
    expect(out.continuity[0]!.character).toBe('Ada Voss');
  });
  it('applies model-suggested merges and ignores unknown names', () => {
    const base: ChunkAnalysis = { characters: [char('Ada Voss'), char('The Engineer'), char('Ben')], locations: [], props: [], scenes: [] };
    const out = applyMerges(base, [{ keep: 'Ada Voss', absorb: ['The Engineer'], kind: 'character' }, { keep: 'Nobody', absorb: ['Ben'], kind: 'character' }]);
    expect(out.characters.map((c) => c.name).sort()).toEqual(['Ada Voss', 'Ben']);
    expect(out.characters.find((c) => c.name === 'Ada Voss')!.aliases).toContain('The Engineer');
  });
  it('reports coverage', () => {
    expect(checkCoverage([1, 2, 3], { scenes: [{ index: 1 }, { index: 3 }] as never })).toEqual({ expected: 3, covered: 2, missing: [2], complete: false });
  });
});

/** Fake model: answers per scene from a table, so we can simulate duplicate names and dropped scenes. */
function fakeModel(opts: { dropOnce?: number; dropAlways?: number } = {}) {
  const calls: string[] = [];
  let dropped = false;
  const sceneData: Record<number, { chars: string[]; loc: string }> = {
    1: { chars: ['Ada Voss', 'Ben Okoro'], loc: 'Harbour Office' }, 2: { chars: ['Ada', 'Ben'], loc: 'Dock' }, 3: { chars: ['Young Ada', 'Mother'], loc: "Ada's Childhood Kitchen" },
    4: { chars: ['Ada'], loc: 'Dock' }, 5: { chars: ['Ada Voss', 'Ben'], loc: 'Harbour Office' },
  };
  const provider: TextProvider = {
    id: 'fake', capabilities: () => NO_CAPS, testKey: async () => undefined, complete: async () => '',
    async completeJson<T>(req: TextRequest, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
      calls.push(req.prompt.slice(0, 20));
      if (req.prompt.includes('same person or place')) {
        return schema.parse({ merges: [{ keep: 'Ben Okoro', absorb: ['Ben'], kind: 'character' }] });
      }
      const idx = [...req.prompt.matchAll(/### Scene (\d+)/g)].map((m) => Number(m[1]));
      const scenes = idx.filter((i) => {
        if (i === opts.dropAlways) return false;
        if (i === opts.dropOnce && !dropped) { dropped = true; return false; }
        return true;
      });
      const names = new Set(scenes.flatMap((i) => sceneData[i]!.chars));
      return schema.parse({
        characters: [...names].map((n) => ({ name: n, confidence: 0.8 })),
        locations: [...new Set(scenes.map((i) => sceneData[i]!.loc))].map((n) => ({ name: n })),
        scenes: scenes.map((i) => ({ index: i, slugline: `s${i}`, characters: sceneData[i]!.chars, location: sceneData[i]!.loc })),
      });
    },
  };
  return { provider, calls };
}

describe('analyseScript (fake model)', () => {
  it('chunks, analyses in parallel, resolves aliases, and reaches full coverage', async () => {
    const { provider, calls } = fakeModel();
    const progress: number[] = [];
    const { analysis } = await analyseScript({ provider, model: 'm', script: FIXTURE_SCRIPT, maxChunkChars: 200, onProgress: (d) => progress.push(d) });
    expect(calls.length).toBeGreaterThan(2);
    expect(progress.at(-1)).toBeGreaterThan(1);
    expect(analysis.coverage).toEqual({ expected: 5, covered: 5, missing: [], complete: true });
    expect(analysis.characters.map((c) => c.name).sort()).toEqual(['Ada Voss', 'Ben Okoro', 'Mother']);
    expect(analysis.scenes.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
    expect(analysis.scenes[2]!.characters).toEqual(['Ada Voss', 'Mother']); // Young Ada resolved to Ada Voss
    expect(analysis.scenes[1]!.characters).toEqual(['Ada Voss', 'Ben Okoro']);
  });
  it('re-requests a scene the model skipped', async () => {
    const { provider } = fakeModel({ dropOnce: 4 });
    const { analysis } = await analyseScript({ provider, model: 'm', script: FIXTURE_SCRIPT, maxChunkChars: 100000 });
    expect(analysis.coverage.complete).toBe(true);
  });
  it('reports (never hides) scenes that stay missing', async () => {
    const { provider } = fakeModel({ dropAlways: 2 });
    const { analysis } = await analyseScript({ provider, model: 'm', script: FIXTURE_SCRIPT, maxChunkChars: 100000, resolve: false });
    expect(analysis.coverage).toMatchObject({ complete: false, missing: [2], covered: 4 });
  });
  it('rejects an empty script', async () => {
    await expect(analyseScript({ provider: fakeModel().provider, model: 'm', script: '  ' })).rejects.toThrow('script is empty');
  });
  it('handles a very long script by chunking into many parts', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `INT. ROOM ${i} - DAY\n\nAda talks. ${'word '.repeat(80)}`).join('\n\n');
    const calls: number[] = [];
    const provider: TextProvider = {
      id: 'f', capabilities: () => NO_CAPS, testKey: async () => undefined, complete: async () => '',
      async completeJson<T>(req: TextRequest, schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
        const idx = [...req.prompt.matchAll(/### Scene (\d+)/g)].map((m) => Number(m[1]));
        calls.push(idx.length);
        return schema.parse({ characters: [{ name: 'Ada' }], scenes: idx.map((index) => ({ index })) });
      },
    };
    const { analysis } = await analyseScript({ provider, model: 'm', script: long, maxChunkChars: 3000, resolve: false });
    expect(calls.length).toBeGreaterThanOrEqual(10);
    expect(analysis.coverage).toMatchObject({ expected: 60, complete: true });
  });
});
