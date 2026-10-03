import { z } from 'zod';
import { contentHash } from '../bible/lock';
import type { TextProvider } from '../providers/types';
import { validateRefinement, type Issue } from './checks';
import type { Dialect } from './dialect';

export type Strength = 'off' | 'light' | 'standard' | 'full';

export const Refinement = z.object({ refined: z.string(), negative: z.string().default(''), rationale: z.string().default('') });

export interface RefineInput {
  raw: string;
  strength: Strength;
  dialect: Dialect;
  /** Facts the Director must respect but must not restate wholesale: shot plan, continuity, locked descriptors. */
  context?: { shotPlan?: string; continuity?: string; characters?: string[]; locked?: string; cinema?: string };
  /** Pinned wording the user wants kept verbatim. */
  pinned?: string[];
}

export interface RefineResult {
  refined: string;
  negative: string;
  rationale: string;
  /** Issues left after self-critique; empty when clean. */
  issues: Issue[];
  /** True when the refinement was rejected and the original wording is returned. */
  revertedToRaw: boolean;
  cached: boolean;
  strength: Strength;
}

export interface RefinementCache { get(hash: string): Promise<RefineResult | undefined>; set(hash: string, v: RefineResult): Promise<void> }

const STRENGTH_RULES: Record<Exclude<Strength, 'off'>, string> = {
  light: 'Light polish: fix wording and add at most one missing detail (lighting or camera). Keep the structure of the original.',
  standard: 'Standard: keep the intent and every explicit constraint, and fill in whatever is missing from the field list.',
  full: 'Full rewrite: restructure freely into the best prompt for the target, still keeping the intent, every explicit constraint, names and numbers.',
};

function systemPrompt(d: Dialect): string {
  return `You rewrite film shot descriptions into prompts for a ${d.kind} generation model.
Dialect guidance: ${d.guidance}
Cover these fields where they are missing: ${d.fields.join(', ')}.
Hard rules: preserve the user's intent and every explicit constraint (names, numbers, quoted text); never add plot events or new characters; remove contradictions; stay under ${d.maxChars} characters.
Reply as JSON: {"refined": string, "negative": string (empty if unsupported), "rationale": one or two sentences}.${d.supportsNegative ? '' : ' This model has no negative prompt, so leave "negative" empty.'}`;
}

function userPrompt(i: RefineInput): string {
  const c = i.context ?? {};
  return [
    `Strength: ${STRENGTH_RULES[i.strength as Exclude<Strength, 'off'>]}`,
    `Raw shot description:\n${i.raw}`,
    c.shotPlan && `Shot plan: ${c.shotPlan}`,
    c.continuity && `Continuity so far: ${c.continuity}`,
    c.locked && `Locked descriptors (already injected later; do not repeat them): ${c.locked}`,
    c.cinema && `Camera settings chosen by the user: ${c.cinema}`,
    i.pinned?.length && `Keep these phrases exactly: ${i.pinned.map((p) => `"${p}"`).join(', ')}`,
  ].filter(Boolean).join('\n\n');
}

export function refinementKey(i: RefineInput, model: string): string {
  return contentHash({ r: i.raw, s: i.strength, d: [i.dialect.id, i.dialect.version], c: i.context ?? null, p: i.pinned ?? null, m: model });
}

export interface DirectorDeps {
  provider: TextProvider;
  /** Strong model for the rewrite. */
  model: string;
  /** Cheaper model for the critique pass; defaults to the strong one. */
  critiqueModel?: string;
  cache?: RefinementCache;
}

/**
 * Turn a weak prompt into a strong, provider-specific one. Always returns something usable: if refinement keeps
 * failing the checks, the user's own wording comes back with revertedToRaw set so the UI can say so.
 */
export async function refinePrompt(i: RefineInput, deps: DirectorDeps): Promise<RefineResult> {
  if (i.strength === 'off' || !i.raw.trim()) {
    return { refined: i.raw, negative: '', rationale: 'Refinement is off for this shot.', issues: [], revertedToRaw: false, cached: false, strength: i.strength };
  }
  const key = refinementKey(i, deps.model);
  const hit = await deps.cache?.get(key);
  if (hit) return { ...hit, cached: true };

  const subjects = i.context?.characters ?? [];
  const first = await deps.provider.completeJson({ model: deps.model, system: systemPrompt(i.dialect), prompt: userPrompt(i), maxTokens: 1500, temperature: 0.4 }, Refinement);
  let current = first;
  const check = (r: z.infer<typeof Refinement>) => [
    ...validateRefinement({ raw: i.raw, refined: r.refined, maxChars: i.dialect.maxChars, subjects }),
    ...(i.pinned ?? []).filter((p) => !r.refined.toLowerCase().includes(p.toLowerCase())).map((p): Issue => ({ code: 'lost_constraint', detail: `The refined prompt dropped the pinned phrase "${p}".` })),
  ];
  let issues = check(current);

  if (issues.length) {
    // Self-critique: a second, cheaper pass fixes exactly the listed problems.
    current = await deps.provider.completeJson({
      model: deps.critiqueModel ?? deps.model, system: systemPrompt(i.dialect), maxTokens: 1500, temperature: 0,
      prompt: `${userPrompt(i)}\n\nYour previous attempt:\n${current.refined}\n\nIt has these problems:\n${issues.map((x) => `- ${x.detail}`).join('\n')}\nFix them and return the corrected JSON.`,
    }, Refinement);
    issues = check(current);
  }

  const reverted = issues.some((x) => x.code === 'empty' || x.code === 'lost_constraint' || x.code === 'too_long');
  const result: RefineResult = reverted
    ? { refined: i.raw, negative: '', rationale: `Kept your wording: the rewrite kept failing checks (${issues.map((x) => x.code).join(', ')}).`, issues, revertedToRaw: true, cached: false, strength: i.strength }
    : { refined: current.refined.trim(), negative: i.dialect.supportsNegative ? current.negative.trim() : '', rationale: current.rationale, issues, revertedToRaw: false, cached: false, strength: i.strength };
  await deps.cache?.set(key, result);
  return result;
}
