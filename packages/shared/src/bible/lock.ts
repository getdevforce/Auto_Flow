import type { CharacterDraft, CharacterVersion, LocationDraft, LocationVersion } from './schemas';

/** Stable JSON: keys sorted so the same content always hashes the same. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** FNV-1a 64-bit, as hex. Not cryptographic: it detects "did the content change", nothing more. */
export function contentHash(v: unknown): string {
  const s = stableStringify(v);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0xdeadbeef;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function nextVersion<T extends { version: number; contentHash: string }>(prior: T[], hash: string): { version: number; reuse?: T } {
  const latest = prior.reduce<T | undefined>((a, b) => (!a || b.version > a.version ? b : a), undefined);
  // Locking unchanged content again returns the existing version rather than minting a duplicate.
  if (latest && latest.contentHash === hash) return { version: latest.version, reuse: latest };
  return { version: (latest?.version ?? 0) + 1 };
}

export function lockCharacter(draft: CharacterDraft, prior: CharacterVersion[], now = Date.now()): CharacterVersion {
  const hash = contentHash(draft);
  const { version, reuse } = nextVersion(prior, hash);
  return reuse ?? { ...draft, versionId: `${draft.id}@v${version}`, version, lockedAt: now, contentHash: hash };
}

export function lockLocation(draft: LocationDraft, prior: LocationVersion[], now = Date.now()): LocationVersion {
  const hash = contentHash(draft);
  const { version, reuse } = nextVersion(prior, hash);
  return reuse ?? { ...draft, versionId: `${draft.id}@v${version}`, version, lockedAt: now, contentHash: hash };
}

export interface ShotRecord { id: string; characterVersionIds: string[]; locationVersionId?: string }

/** Shots that used an older version of an entity than `latest`; the UI offers to re-render these. */
export function staleShots(shots: ShotRecord[], latest: { entityId: string; versionId: string }): ShotRecord[] {
  return shots.filter((s) =>
    [...s.characterVersionIds, ...(s.locationVersionId ? [s.locationVersionId] : [])]
      .some((v) => v.startsWith(`${latest.entityId}@`) && v !== latest.versionId));
}
