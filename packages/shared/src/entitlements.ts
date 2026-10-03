import { z } from 'zod';

export const EntitlementsSchema = z.object({
  plan: z.string(),
  limits: z.object({
    runs_per_month: z.number().default(0),
    shots_per_run: z.number().default(0),
    projects: z.number().default(0),
    characters: z.number().default(0),
    devices: z.number().default(1),
    features: z.array(z.string()).default([]),
  }),
  bonus_runs: z.number().default(0),
  subscription: z.object({ status: z.string(), renews_or_ends: z.string().nullable().optional() }).nullable().optional(),
});
export type Entitlements = z.infer<typeof EntitlementsSchema>;

/**
 * Used before the first successful fetch and for people who have not signed in. Deliberately the same as the default
 * plan the seeder creates, so a fresh install behaves like a free account instead of being locked out.
 */
export const FALLBACK_ENTITLEMENTS: Entitlements = {
  plan: 'free',
  limits: { runs_per_month: 3, shots_per_run: 12, projects: 3, characters: 6, devices: 1, features: [] },
  bonus_runs: 0,
};

export type Blocked = { ok: false; code: 'feature' | 'runs' | 'projects' | 'characters'; message: string };
export type Allowed = { ok: true };

const upgrade = ' Upgrade your plan in your account to continue.';

export function checkStartRun(e: Entitlements, o: { autonomy: string; runsThisMonth: number; project: string; existingProjects: string[] }): Allowed | Blocked {
  if (o.autonomy === 'full_auto' && !e.limits.features.includes('full_auto')) {
    return { ok: false, code: 'feature', message: `Full auto is not part of the ${e.plan} plan. Choose Checkpoints or Manual, or upgrade.` };
  }
  const allowedRuns = e.limits.runs_per_month + e.bonus_runs;
  if (o.runsThisMonth >= allowedRuns) {
    return { ok: false, code: 'runs', message: `You have used all ${allowedRuns} Autopilot runs this month on the ${e.plan} plan.${upgrade}` };
  }
  if (!o.existingProjects.includes(o.project) && o.existingProjects.length >= e.limits.projects) {
    return { ok: false, code: 'projects', message: `The ${e.plan} plan allows ${e.limits.projects} projects. Use an existing project name or upgrade.` };
  }
  return { ok: true };
}

/** How many of `planned` shots the plan allows, and the message to show for the rest. */
export function shotAllowance(e: Entitlements, planned: number): { allowed: number; skippedReason: string | null } {
  const max = e.limits.shots_per_run;
  if (!max || planned <= max) return { allowed: planned, skippedReason: null };
  return { allowed: max, skippedReason: `Your ${e.plan} plan allows ${max} shots per run. Upgrade to generate the rest.` };
}

export function checkCharacters(e: Entitlements, count: number): Allowed | Blocked {
  return count <= e.limits.characters ? { ok: true } : { ok: false, code: 'characters', message: `The script has ${count} characters; the ${e.plan} plan allows ${e.limits.characters}.${upgrade}` };
}
