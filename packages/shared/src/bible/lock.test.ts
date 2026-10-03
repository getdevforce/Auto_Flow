import { describe, expect, it } from 'vitest';
import { contentHash, lockCharacter, lockLocation, stableStringify, staleShots } from './lock';
import { ada, dock } from './fixtures';

describe('stableStringify / contentHash', () => {
  it('ignores key order and differs on content', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
    expect(stableStringify(undefined)).toBe('null');
  });
});

describe('locking', () => {
  it('mints v1, reuses on unchanged content, and mints v2 on change', () => {
    const v1 = lockCharacter(ada, [], 1);
    expect(v1.versionId).toBe('char_ada@v1');
    expect(lockCharacter(ada, [v1], 2)).toBe(v1);
    const edited = { ...ada, traits: { ...ada.traits, hair: 'long red hair' } };
    const v2 = lockCharacter(edited, [v1], 3);
    expect(v2).toMatchObject({ versionId: 'char_ada@v2', version: 2, lockedAt: 3 });
    expect(v1.traits.hair).toBe('short black bob'); // old version untouched
  });
  it('locks locations the same way', () => {
    const v1 = lockLocation(dock, [], 1);
    expect(lockLocation({ ...dock, lighting: 'dawn' }, [v1], 2).versionId).toBe('loc_dock@v2');
  });
  it('finds shots rendered with an older version of an entity', () => {
    const shots = [
      { id: 's1', characterVersionIds: ['char_ada@v1'] },
      { id: 's2', characterVersionIds: ['char_ada@v2', 'char_ben@v1'] },
      { id: 's3', characterVersionIds: [], locationVersionId: 'loc_dock@v1' },
    ];
    expect(staleShots(shots, { entityId: 'char_ada', versionId: 'char_ada@v2' }).map((s) => s.id)).toEqual(['s1']);
    expect(staleShots(shots, { entityId: 'loc_dock', versionId: 'loc_dock@v2' }).map((s) => s.id)).toEqual(['s3']);
    expect(staleShots(shots, { entityId: 'char_ben', versionId: 'char_ben@v1' })).toEqual([]);
  });
});
