import { contentHash } from './bible/lock';

export interface FlagDef { enabled: boolean; plans?: string[] | null; percent?: number }
export type FlagValue = boolean | FlagDef;

/** Stable 0..99 bucket for an install and flag key, so a percentage rollout never flip-flops between sessions. */
export function bucket(installId: string, key: string): number {
  return parseInt(contentHash(`${key}:${installId}`).slice(0, 8), 16) % 100;
}

/** A plain boolean means on or off for everyone. An object adds plan targeting and a percentage rollout. */
export function isFlagOn(flag: FlagValue | undefined, ctx: { installId: string; plan: string; key: string }): boolean {
  if (flag === undefined) return false;
  if (typeof flag === 'boolean') return flag;
  if (!flag.enabled) return false;
  if (flag.plans?.length && !flag.plans.includes(ctx.plan)) return false;
  const pct = flag.percent ?? 100;
  return pct >= 100 || bucket(ctx.installId, ctx.key) < pct;
}
