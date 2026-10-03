import {
  BUNDLED_CONFIG, DEFAULT_VIDEO_DIALECT, createProvider, pickDialect, refinePrompt,
  type CinemaSettings, type Dialect, type ProviderId, type RefineResult, type RefinementCache, type Strength, type TextProvider,
} from '@frameloom/shared';
import { db } from '../db/db';
import { loadKey } from '../keys';
import { vault } from '../services';

/** Refinements are cached in IndexedDB by input hash so the same prompt is never paid for twice. */
export const refinementCache: RefinementCache = {
  async get(hash) { const row = await db.llmCache.get(`refine:${hash}`); return row ? (JSON.parse(row.text) as RefineResult) : undefined; },
  async set(hash, v) { await db.llmCache.put({ hash: `refine:${hash}`, text: JSON.stringify(v) }); },
};

export async function textProvider(id: ProviderId): Promise<TextProvider> {
  if (!vault.isUnlocked) await vault.unlock();
  return createProvider(id, await loadKey(id), (u, i) => fetch(u, i)) as unknown as TextProvider;
}

export function describeCinema(c: CinemaSettings): string {
  return [c.angle, c.lens && `${c.lens} lens`, c.depthOfField, c.lighting, c.grade, c.movement, c.motionIntensity && `${c.motionIntensity} motion`].filter(Boolean).join(', ');
}

export interface DirectorRequest {
  raw: string; strength: Strength; providerId: ProviderId; model: string; critiqueModel?: string;
  targetProvider: string; targetModel: string; kind: 'image' | 'video'; cinema: CinemaSettings; pinned: string[]; characters: string[];
  dialects?: Dialect[];
}

/** Dialects come from remote config (editable in the CMS) with a bundled fallback. */
export async function directorRefine(r: DirectorRequest): Promise<{ result: RefineResult; dialect: Dialect }> {
  const cached = (await db.kv.get('config'))?.value as { config?: typeof BUNDLED_CONFIG } | undefined;
  const fromConfig = ((cached?.config?.dialects ?? []) as Dialect[]).filter((d) => d && typeof d === 'object');
  const dialect = pickDialect(r.dialects ?? fromConfig, { providerId: r.targetProvider, model: r.targetModel, kind: r.kind }) ?? DEFAULT_VIDEO_DIALECT;
  const provider = await textProvider(r.providerId);
  const result = await refinePrompt(
    { raw: r.raw, strength: r.strength, dialect, pinned: r.pinned, context: { characters: r.characters, cinema: describeCinema(r.cinema) } },
    { provider, model: r.model, critiqueModel: r.critiqueModel, cache: refinementCache },
  );
  return { result, dialect };
}
