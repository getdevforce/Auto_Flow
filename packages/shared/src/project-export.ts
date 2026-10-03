import { z } from 'zod';

/** A project bundle: metadata only by default, assets as base64 when the user opts in. Never contains keys or vault data. */
export const ProjectBundle = z.object({
  format: z.literal('frameloom-project'),
  version: z.literal(1),
  exportedAt: z.string(),
  project: z.string(),
  tables: z.record(z.array(z.record(z.unknown()))),
  assets: z.array(z.object({ id: z.string(), mime: z.string(), base64: z.string() })).default([]),
});
export type ProjectBundle = z.infer<typeof ProjectBundle>;

/** Tables a bundle may carry. Anything else (kv, llmCache, vault) is refused on import. */
export const EXPORTABLE_TABLES = ['runs', 'jobs', 'shots', 'analyses', 'characters', 'characterVersions', 'locations', 'locationVersions', 'library', 'albums', 'prompts'] as const;

const FORBIDDEN = /vault|apikey|api_key|secret|password|token|passphrase/i;

/** Walks any value and reports the first key that looks like a credential. Defence in depth: tables are allowlisted too. */
export function findSecretKey(v: unknown, path = ''): string | null {
  if (Array.isArray(v)) { for (const [i, x] of v.entries()) { const r = findSecretKey(x, `${path}[${i}]`); if (r) return r; } return null; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN.test(k)) return `${path}.${k}`;
      const r = findSecretKey(x, `${path}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

export function buildBundle(project: string, tables: Record<string, Array<Record<string, unknown>>>, assets: ProjectBundle['assets'] = [], now = new Date()): ProjectBundle {
  const picked: ProjectBundle['tables'] = {};
  for (const t of EXPORTABLE_TABLES) if (tables[t]?.length) picked[t] = tables[t] as Array<Record<string, unknown>>;
  const bundle: ProjectBundle = { format: 'frameloom-project', version: 1, exportedAt: now.toISOString(), project, tables: picked, assets };
  const leak = findSecretKey(bundle.tables);
  if (leak) throw new Error(`Refusing to export: ${leak} looks like a credential.`);
  return bundle;
}

export type ImportCheck = { ok: true; bundle: ProjectBundle } | { ok: false; error: string };

export function validateBundle(raw: unknown): ImportCheck {
  const parsed = ProjectBundle.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'That file is not a Frameloom project export.' };
  const unknown = Object.keys(parsed.data.tables).filter((t) => !(EXPORTABLE_TABLES as readonly string[]).includes(t));
  if (unknown.length) return { ok: false, error: `The file contains data this version does not import (${unknown.join(', ')}).` };
  const leak = findSecretKey(parsed.data.tables);
  if (leak) return { ok: false, error: 'The file contains something that looks like a credential, so it was not imported.' };
  return { ok: true, bundle: parsed.data };
}
