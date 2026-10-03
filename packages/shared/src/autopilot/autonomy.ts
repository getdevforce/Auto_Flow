export const AUTONOMY_LEVELS = ['manual', 'checkpoints', 'full_auto'] as const;
export type Autonomy = (typeof AUTONOMY_LEVELS)[number];

export const STAGES = [
  'analysis', 'characters', 'locations', 'pilot_scene', 'shot_plan', 'prompts', 'keyframes', 'video', 'upscale', 'audio',
] as const;
export type Stage = (typeof STAGES)[number];

/** The three approval gates that Checkpoints mode keeps. */
export const GATES: Stage[] = ['characters', 'locations', 'pilot_scene'];

/** Manual waits at every stage, Checkpoints only at the gates, Full auto never. */
export function needsApproval(level: Autonomy, stage: Stage): boolean {
  if (level === 'manual') return true;
  if (level === 'checkpoints') return GATES.includes(stage);
  return false;
}

export interface Candidate { id: string; score?: number }

/** Full auto: best score wins, earliest on ties; with no scores at all, the first candidate. Returns the decision for the log. */
export function autoPick(candidates: Candidate[]): { id: string; reason: string } | null {
  if (!candidates.length) return null;
  const scored = candidates.filter((c) => c.score !== undefined);
  if (!scored.length) return { id: candidates[0]!.id, reason: 'No scores available; took the first candidate.' };
  const best = scored.reduce((a, b) => ((b.score as number) > (a.score as number) ? b : a));
  return { id: best.id, reason: `Highest score ${(best.score as number).toFixed(2)} of ${scored.length} scored candidate(s).` };
}
