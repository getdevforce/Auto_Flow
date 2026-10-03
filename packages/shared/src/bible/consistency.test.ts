import { describe, expect, it } from 'vitest';
import { generateWithChecks, scoreEnvironment, scoreIdentity } from './consistency';
import type { TextProvider } from '../providers/types';
import { NO_CAPS } from '../providers/types';

describe('generateWithChecks', () => {
  const run = (scores: number[], threshold = 0.7, maxAttempts = 3) => {
    let i = 0;
    return generateWithChecks({ generate: async (a) => `img${a}`, score: async () => scores[i++]!, threshold, maxAttempts });
  };
  it('stops at the first attempt that clears the threshold', async () => {
    const r = await run([0.4, 0.8, 0.9]);
    expect(r.attempts).toHaveLength(2);
    expect(r.best.value).toBe('img2');
    expect(r.flagged).toBe(false);
  });
  it('keeps the best attempt and flags it when none clear the threshold', async () => {
    const r = await run([0.3, 0.6, 0.5]);
    expect(r.attempts).toHaveLength(3);
    expect(r.best).toMatchObject({ value: 'img2', score: 0.6 });
    expect(r.flagged).toBe(true);
  });
  it('breaks ties toward the earlier attempt and always tries at least once', async () => {
    expect((await run([0.5, 0.5], 0.9, 2)).best.value).toBe('img1');
    expect((await run([0.1], 0.9, 0)).attempts).toHaveLength(1);
  });
});

describe('vision scoring', () => {
  const seen: Array<{ prompt: string; images: number }> = [];
  const provider: TextProvider = {
    id: 't', capabilities: () => NO_CAPS, testKey: async () => undefined, complete: async () => '',
    completeJson: async (req, schema) => { seen.push({ prompt: req.prompt, images: req.images?.length ?? 0 }); return schema.parse({ score: 0.82 }); },
  };
  const img = { bytes: new Uint8Array([1]), mime: 'image/png' };
  it('sends references then the candidate, and returns validated scores', async () => {
    expect(await scoreIdentity(provider, 'm', [img, img], img, 'angular face')).toEqual({ score: 0.82, reasons: [] });
    expect(seen[0]).toMatchObject({ images: 3 });
    expect(seen[0]!.prompt).toContain('angular face');
    await scoreEnvironment(provider, 'm', img, img);
    expect(seen[1]!.images).toBe(2);
  });
});
