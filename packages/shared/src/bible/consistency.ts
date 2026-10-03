import { z } from 'zod';
import type { ImageInput, TextProvider } from '../providers/types';

export const ScoreSchema = z.object({
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()).default([]),
});
export type Score = z.infer<typeof ScoreSchema>;

export interface Scored<T> { value: T; score: number; attempt: number }
export interface CheckedResult<T> { best: Scored<T>; attempts: Scored<T>[]; flagged: boolean }

/**
 * Generate, score, retry up to maxAttempts. Keeps the best-scoring attempt and flags it if still below threshold.
 * Scores are model heuristics, not measurements; the UI labels them that way.
 */
export async function generateWithChecks<T>(opts: {
  generate: (attempt: number) => Promise<T>;
  score: (value: T) => Promise<number>;
  threshold: number;
  maxAttempts: number;
}): Promise<CheckedResult<T>> {
  const attempts: Scored<T>[] = [];
  for (let attempt = 1; attempt <= Math.max(1, opts.maxAttempts); attempt++) {
    const value = await opts.generate(attempt);
    const score = await opts.score(value);
    attempts.push({ value, score, attempt });
    if (score >= opts.threshold) break;
  }
  // Earliest attempt wins ties, so results are stable.
  const best = attempts.reduce((a, b) => (b.score > a.score ? b : a));
  return { best, attempts, flagged: best.score < opts.threshold };
}

const IDENTITY_PROMPT = `You compare a generated image against reference images of one character.
The first images are references; the last image is the candidate.
Score from 0 to 1 how likely the candidate shows the same person: face shape, age, hair, build, distinguishing marks. Ignore pose, lighting and clothing unless the descriptor says otherwise.
Reply as JSON: {"score": number, "reasons": [short strings]}.`;

const ENVIRONMENT_PROMPT = `You compare a generated image against an establishing plate of a location.
The first image is the plate; the last image is the candidate.
Score from 0 to 1 how likely the candidate shows the same place: architecture, layout, palette, lighting, key props. Ignore characters.
Reply as JSON: {"score": number, "reasons": [short strings]}.`;

export async function scoreIdentity(p: TextProvider, model: string, refs: ImageInput[], candidate: ImageInput, descriptor = ''): Promise<Score> {
  return p.completeJson({ model, prompt: `${IDENTITY_PROMPT}${descriptor ? `\nCharacter descriptor: ${descriptor}` : ''}`, images: [...refs, candidate], maxTokens: 400, temperature: 0 }, ScoreSchema);
}

export async function scoreEnvironment(p: TextProvider, model: string, plate: ImageInput, candidate: ImageInput): Promise<Score> {
  return p.completeJson({ model, prompt: ENVIRONMENT_PROMPT, images: [plate, candidate], maxTokens: 400, temperature: 0 }, ScoreSchema);
}
