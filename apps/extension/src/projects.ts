import { buildBundle, validateBundle, type ProjectBundle } from '@frameloom/shared';
import { db } from './db/db';

const b64 = async (blob: Blob) => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s: string, mime: string) => new Blob([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))], { type: mime });

export async function listProjects(): Promise<string[]> {
  const names = new Set((await db.runs.toArray()).map((r) => r.project));
  for (const l of await db.library.toArray()) if (l.project) names.add(l.project);
  return [...names].sort();
}

/** Everything belonging to one project. Provider keys, the vault and settings are never read. */
export async function exportProject(project: string, withAssets: boolean): Promise<ProjectBundle> {
  const runs = (await db.runs.toArray()).filter((r) => r.project === project);
  const runIds = new Set(runs.map((r) => r.id));
  const jobs = (await db.jobs.toArray()).filter((j) => runIds.has(j.runId));
  const shots = (await db.shots.toArray()).filter((s) => runIds.has(s.runId));
  const analyses = (await db.analyses.toArray()).filter((a) => runIds.has(a.runId));
  const library = (await db.library.toArray()).filter((l) => l.project === project);
  const charNames = new Set(shots.flatMap((s) => s.plan.characters));
  const characters = (await db.characters.toArray()).filter((c) => charNames.has(c.name) || runs.some((r) => c.id.includes(r.id.slice(0, 6))));
  const charIds = new Set(characters.map((c) => c.id));
  const locations = (await db.locations.toArray()).filter((l) => runs.some((r) => l.id.includes(r.id.slice(0, 6))));
  const locIds = new Set(locations.map((l) => l.id));
  const tables = {
    runs, jobs, shots, analyses, library, characters, locations,
    characterVersions: (await db.characterVersions.toArray()).filter((v) => charIds.has(v.id)),
    locationVersions: (await db.locationVersions.toArray()).filter((v) => locIds.has(v.id)),
    albums: await db.albums.toArray(),
  } as unknown as Record<string, Array<Record<string, unknown>>>;
  const assetIds = new Set<string>([...library.map((l) => l.assetId), ...jobs.flatMap((j) => ((j.result as { assetIds?: string[] } | undefined)?.assetIds) ?? [])]);
  const assets: ProjectBundle['assets'] = [];
  if (withAssets) for (const id of assetIds) { const a = await db.assets.get(id); if (a) assets.push({ id, mime: a.mime, base64: await b64(a.blob) }); }
  return buildBundle(project, tables, assets);
}

/** Adds the bundle's rows. Existing rows with the same id are left alone, so importing twice is harmless. */
export async function importProject(raw: unknown): Promise<{ project: string; added: number }> {
  const check = validateBundle(raw);
  if (!check.ok) throw new Error(check.error);
  let added = 0;
  const tableOf = db as unknown as Record<string, { bulkAdd(rows: unknown[]): Promise<unknown>; get(k: string): Promise<unknown>; schema: { primKey: { keyPath: string } } }>;
  await db.transaction('rw', db.tables, async () => {
    for (const [name, rows] of Object.entries(check.bundle.tables)) {
      const t = tableOf[name]!;
      for (const row of rows) {
        const key = (row as Record<string, string>)[t.schema.primKey.keyPath];
        if (key !== undefined && !(await t.get(key))) { await t.bulkAdd([row]); added++; }
      }
    }
    for (const a of check.bundle.assets) if (!(await db.assets.get(a.id))) await db.assets.put({ id: a.id, jobId: '', mime: a.mime, blob: fromB64(a.base64, a.mime) });
  });
  return { project: check.bundle.project, added };
}

/** Removes every database, preference and cache this extension keeps on this computer. */
export async function deleteAllLocalData(): Promise<void> {
  db.close();
  await db.delete();
  try { localStorage.clear(); } catch { /* nothing to clear */ }
  await chrome.alarms.clearAll();
}
