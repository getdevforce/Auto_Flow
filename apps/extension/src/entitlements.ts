import { EntitlementsSchema, FALLBACK_ENTITLEMENTS, type Entitlements } from '@frameloom/shared';
import { db } from './db/db';
import { getApiBase, getSession } from './services';

/** Cached plan limits. Offline, signed out or before the first fetch, the free-plan fallback applies. */
export async function getEntitlements(): Promise<Entitlements> {
  const row = (await db.kv.get('entitlements'))?.value as Entitlements | undefined;
  return row ?? FALLBACK_ENTITLEMENTS;
}

export async function refreshEntitlements(): Promise<Entitlements> {
  const session = await getSession();
  if (!session) { await db.kv.delete('entitlements'); return FALLBACK_ENTITLEMENTS; }
  try {
    const res = await fetch(`${await getApiBase()}/api/v1/entitlements`, { headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const e = EntitlementsSchema.parse(await res.json());
      await db.kv.put({ key: 'entitlements', value: e });
      return e;
    }
  } catch { /* offline: keep what we last knew */ }
  return getEntitlements();
}

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

export async function usage(): Promise<{ runsThisMonth: number; projects: string[] }> {
  const runs = await db.runs.filter((r) => r.kind === 'autopilot').toArray();
  return { runsThisMonth: runs.filter((r) => r.createdAt >= monthStart()).length, projects: [...new Set(runs.map((r) => r.project))] };
}
