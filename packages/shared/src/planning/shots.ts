import { z } from 'zod';
import type { AnalysedScene, ScriptAnalysis } from '../analysis/schema';
import type { TextProvider } from '../providers/types';

export const ShotSizeSchema = z.enum(['extreme_close', 'close', 'medium_close', 'medium', 'wide', 'extreme_wide']).catch('medium');

export const PlannedShot = z.object({
  size: ShotSizeSchema,
  lens: z.string().default(''),
  movement: z.string().default(''),
  durationSec: z.number().min(1).max(60).catch(5),
  characters: z.array(z.string()).default([]),
  action: z.string().min(1),
  dialogue: z.array(z.object({ speaker: z.string(), line: z.string() })).default([]),
  transition: z.string().default('cut'),
  /** What this shot establishes for later shots (wardrobe, prop state, injuries). */
  establishes: z.array(z.string()).default([]),
});
export type PlannedShot = z.infer<typeof PlannedShot>;

export const ScenePlan = z.object({ shots: z.array(PlannedShot).min(1) });

export interface Shot extends PlannedShot {
  /** Global 1-based sequence number: fixes file names and playback order for the whole run. */
  seq: number;
  sceneIndex: number;
  shotIndex: number;
  location: string;
  /** Ledger text valid at the start of this shot. */
  continuity: string;
}

/** Scene-level continuity state, carried forward across scenes so shot 14 knows what shot 13 established. */
export function applyContinuity(state: Map<string, string[]>, scene: AnalysedScene): Map<string, string[]> {
  const next = new Map(state);
  for (const e of scene.continuity) {
    const who = e.character ?? 'scene';
    const list = [...(next.get(who) ?? [])];
    if (e.type === 'costume') {
      // A costume change replaces the earlier costume note instead of stacking.
      next.set(who, [...list.filter((n) => !n.startsWith('wearing:')), `wearing: ${e.note}`]);
    } else if (e.type === 'injury') next.set(who, [...list, `injury: ${e.note}`]);
    else if (e.type === 'time_jump') next.set(who, [...list.filter((n) => !n.startsWith('time:')), `time: ${e.note}`]);
    else next.set(who, [...list, e.note]);
  }
  return next;
}

export function ledgerText(state: Map<string, string[]>, present: string[]): string {
  const keys = [...state.keys()].filter((k) => k === 'scene' || present.includes(k)).sort();
  return keys.map((k) => `${k}: ${(state.get(k) ?? []).join('; ')}`).filter((l) => !l.endsWith(': ')).join(' | ');
}

const SYSTEM = `You are a film director planning shots for ONE scene. Break the scene into an ordered list of shots.
For each shot give: size, lens, camera movement, duration in seconds, which characters are visible, the single main action, any dialogue spoken, the transition to the next shot, and what it establishes for continuity (wardrobe, prop state, injuries).
Cover the whole scene; never invent plot events. Prefer 2 to 6 shots per scene.`;

export interface PlanOptions {
  provider: TextProvider;
  model: string;
  analysis: ScriptAnalysis;
  /** Longest clip the target video model can make; every shot duration is clamped to it. */
  maxDurationSec: number;
  allowedDurations?: number[];
  sceneText: (index: number) => string;
}

export function clampDuration(d: number, max: number, allowed?: number[]): number {
  const capped = Math.min(Math.max(d, 1), max);
  if (!allowed?.length) return Math.round(capped);
  const sorted = [...allowed].sort((a, b) => a - b);
  return sorted.filter((x) => x <= capped).pop() ?? (sorted[0] as number);
}

/** S4. One call per scene; sequence numbers, duration limits and continuity are enforced here, not left to the model. */
export async function planShots(o: PlanOptions): Promise<Shot[]> {
  const out: Shot[] = [];
  let ledger = new Map<string, string[]>();
  let seq = 0;
  for (const scene of [...o.analysis.scenes].sort((a, b) => a.index - b.index)) {
    ledger = applyContinuity(ledger, scene);
    const plan = await o.provider.completeJson({
      model: o.model, system: SYSTEM, maxTokens: 3000, temperature: 0.3,
      prompt: `Scene ${scene.index} (${scene.slugline})\nSummary: ${scene.summary}\nCharacters present: ${scene.characters.join(', ')}\nLocation: ${scene.location}\n\nScene text:\n${o.sceneText(scene.index)}`,
    }, ScenePlan);
    let running = ledger;
    for (const [i, s] of plan.shots.entries()) {
      const present = (s.characters.length ? s.characters : scene.characters).filter((c) => scene.characters.includes(c) || s.characters.includes(c));
      out.push({
        ...s, characters: present, durationSec: clampDuration(s.durationSec, o.maxDurationSec, o.allowedDurations),
        seq: ++seq, sceneIndex: scene.index, shotIndex: i + 1, location: scene.location, continuity: ledgerText(running, present),
      });
      // Things this shot establishes become true for the next one.
      if (s.establishes.length) {
        running = new Map(running);
        for (const note of s.establishes) running.set('scene', [...(running.get('scene') ?? []), note]);
      }
    }
    ledger = running;
  }
  return out;
}
