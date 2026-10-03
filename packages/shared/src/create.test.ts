import { describe, expect, it } from 'vitest';
import { estimateCost, promptsFromCsv, renderName, safeSegment, splitPrompts } from './create';

describe('splitPrompts', () => {
  it('splits on blank lines, keeps inner newlines, drops empties, handles CRLF', () => {
    expect(splitPrompts('a\nstill a\n\n\n b \r\n\r\n   \n\nc')).toEqual(['a\nstill a', 'b', 'c']);
    expect(splitPrompts('   ')).toEqual([]);
  });
});
describe('promptsFromCsv', () => {
  it('uses the prompt column when present, handling quotes and commas', () => {
    expect(promptsFromCsv('id,prompt\n1,"a, b"\n2,"say ""hi"""\n3,\n')).toEqual(['a, b', 'say "hi"']);
  });
  it('falls back to the first column and handles empty input', () => {
    expect(promptsFromCsv('one\r\ntwo')).toEqual(['one', 'two']);
    expect(promptsFromCsv('')).toEqual([]);
  });
});
describe('renderName', () => {
  it('fills tokens, pads the sequence and sanitises segments', () => {
    expect(renderName('{project}/{seq}_{scene}_{shot}', { project: 'My: Film', seq: 7, scene: 2, shot: 'a/b' }, 'mp4')).toBe('My_ Film/007_2_a_b.mp4');
  });
  it('blocks path traversal and keeps unknown tokens', () => {
    expect(renderName('../{project}/{x}', { project: 'p', seq: 1 }, 'png')).toBe('_/p/{x}.png');
    expect(safeSegment('...')).toBe('untitled');
  });
});
describe('estimateCost', () => {
  it('multiplies per item or per second, and is null without a price', () => {
    expect(estimateCost({ usd: 0.04, unit: 'image' }, { count: 3 })).toBe(0.12);
    expect(estimateCost({ usd: 0.1, unit: 'second' }, { count: 2, durationSec: 5 })).toBe(1);
    expect(estimateCost({ usd: 0.1, unit: 'second' }, { count: 1 })).toBe(0.5);
    expect(estimateCost(undefined, { count: 1 })).toBeNull();
  });
});
