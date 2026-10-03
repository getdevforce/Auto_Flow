import { describe, expect, it } from 'vitest';
import { cleanupCandidates, facets, filterLibrary, type LibraryItem } from './filter';
import { extractVariables, fillTemplate, missingVariables } from './templates';

const item = (id: string, over: Partial<LibraryItem> = {}): LibraryItem => ({
  id, kind: 'image', source: 'keyframe', characters: [], favorite: false, tags: [], albumIds: [], createdAt: Number(id.replace(/\D/g, '')) || 0, bytes: 100, ...over,
});

describe('template variables', () => {
  it('extracts unique variables in order and fills only the known ones', () => {
    const t = '{character} walks through {location}, {mood} mood, {character} smiles';
    expect(extractVariables(t)).toEqual(['character', 'location', 'mood']);
    expect(fillTemplate(t, { character: ' Ada ', location: 'the dock' })).toBe('Ada walks through the dock, {mood} mood, Ada smiles');
    expect(missingVariables(t, { character: 'Ada', mood: '  ' })).toEqual(['location', 'mood']);
    expect(extractVariables('no variables, {not valid} {1x}')).toEqual([]);
  });
});

describe('filterLibrary', () => {
  const items = [
    item('1', { prompt: 'Ada on the dock', project: 'Film', characters: ['Ada'], scene: 2, provider: 'openai', favorite: true, tags: ['hero'] }),
    item('2', { prompt: 'Ben in the office', project: 'Film', characters: ['Ben'], scene: 1, provider: 'fal', kind: 'video' }),
    item('3', { prompt: 'Empty street', project: 'Other', provider: 'openai', albumIds: ['a1'] }),
  ];
  it('searches all words across prompt, tags and names, newest first', () => {
    expect(filterLibrary(items, { text: 'dock ada' }).map((i) => i.id)).toEqual(['1']);
    expect(filterLibrary(items, { text: 'HERO' }).map((i) => i.id)).toEqual(['1']);
    expect(filterLibrary(items, {}).map((i) => i.id)).toEqual(['3', '2', '1']);
  });
  it('filters by project, character, scene, provider, kind, favourites, tag and album', () => {
    expect(filterLibrary(items, { project: 'Film' })).toHaveLength(2);
    expect(filterLibrary(items, { character: 'Ben' })[0]!.id).toBe('2');
    expect(filterLibrary(items, { scene: 2 })[0]!.id).toBe('1');
    expect(filterLibrary(items, { provider: 'openai' })).toHaveLength(2);
    expect(filterLibrary(items, { kind: 'video' })[0]!.id).toBe('2');
    expect(filterLibrary(items, { favoritesOnly: true })[0]!.id).toBe('1');
    expect(filterLibrary(items, { tag: 'hero' })[0]!.id).toBe('1');
    expect(filterLibrary(items, { albumId: 'a1' })[0]!.id).toBe('3');
    expect(filterLibrary(items, { text: 'nothing matches' })).toEqual([]);
  });
  it('lists facets without blanks or duplicates', () => {
    expect(facets(items)).toEqual({ projects: ['Film', 'Other'], characters: ['Ada', 'Ben'], scenes: [1, 2], providers: ['fal', 'openai'], tags: ['hero'] });
  });
});

describe('cleanupCandidates', () => {
  it('suggests oldest unprotected items until enough space would be freed', () => {
    const items = [item('1', { bytes: 50 }), item('2', { favorite: true, bytes: 500 }), item('3', { albumIds: ['a'], bytes: 500 }), item('4', { bytes: 70 }), item('5', { bytes: 90 })];
    expect(cleanupCandidates(items, 100).map((i) => i.id)).toEqual(['1', '4']);
    expect(cleanupCandidates(items, 10_000).map((i) => i.id)).toEqual(['1', '4', '5']);
    expect(cleanupCandidates(items, 0)).toEqual([]);
  });
});
