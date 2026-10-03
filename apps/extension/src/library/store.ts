import type { LibraryItem } from '@frameloom/shared';
import { db, type LibraryRow } from '../db/db';

/** Adds every finished image or video job of a run to the library once. Safe to call repeatedly. */
export async function indexLibrary(runId: string): Promise<void> {
  const run = await db.runs.get(runId);
  if (!run) return;
  const jobs = await db.jobs.where('runId').equals(runId).filter((j) => j.state === 'succeeded' && !j.indexed).toArray();
  for (const job of jobs) {
    const input = job.input as { prompt?: string; entity?: string; purpose?: string; providerId?: string };
    const ids = ((job.result as { assetIds?: string[] } | undefined)?.assetIds) ?? [];
    for (const [i, assetId] of ids.entries()) {
      const asset = await db.assets.get(assetId);
      if (!asset) continue;
      const shot = job.seq && run.kind === 'autopilot' ? await db.shots.get(`${runId}:${job.seq}`) : undefined;
      const row: LibraryRow = {
        id: `lib:${assetId}`, assetId, kind: asset.mime.startsWith('video') ? 'video' : 'image', source: input.purpose ?? (job.kind === 'image' ? 'create' : job.kind),
        project: run.project, characters: input.entity ? [input.entity] : (shot?.plan.characters ?? []), scene: shot?.plan.sceneIndex, shot: shot?.plan.shotIndex,
        provider: job.provider, model: job.model, prompt: input.prompt, favorite: false, tags: input.purpose ? [input.purpose] : [], albumIds: [],
        createdAt: Date.now() + i, bytes: asset.blob.size,
      };
      await db.library.put(row);
    }
    await db.jobs.update(job.id, { indexed: true });
  }
}

export async function addUpload(file: File, project = 'Uploads'): Promise<string> {
  const assetId = `asset_${crypto.randomUUID()}`;
  await db.assets.put({ id: assetId, jobId: '', mime: file.type || 'image/png', blob: file });
  const row: LibraryRow = {
    id: `lib:${assetId}`, assetId, kind: file.type.startsWith('video') ? 'video' : 'image', source: 'upload', project, characters: [], favorite: false, tags: [], albumIds: [], createdAt: Date.now(), bytes: file.size,
  };
  await db.library.put(row);
  return row.id;
}

export const toggleFavorite = async (id: string) => { const r = await db.library.get(id); if (r) await db.library.update(id, { favorite: !r.favorite }); };
export const setTags = (id: string, tags: string[]) => db.library.update(id, { tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))] });
export const createAlbum = async (name: string) => { const id = `album_${crypto.randomUUID().slice(0, 8)}`; await db.albums.put({ id, name, createdAt: Date.now() }); return id; };
export async function addToAlbum(itemId: string, albumId: string) { const r = await db.library.get(itemId); if (r && !r.albumIds.includes(albumId)) await db.library.update(itemId, { albumIds: [...r.albumIds, albumId] }); }

export async function deleteItems(ids: string[]) {
  await db.transaction('rw', db.library, db.assets, async () => {
    for (const id of ids) { const r = await db.library.get(id); if (r) { await db.assets.delete(r.assetId); await db.library.delete(id); } }
  });
}

export async function storageUsage(): Promise<{ usage: number; quota: number }> {
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

export type { LibraryItem };


/** Pulls a still out of a library video and adds it as a library image (usable as a reference or first frame). */
export async function extractFrameToLibrary(videoItemId: string, at: 'first' | 'last' | number): Promise<string> {
  const item = await db.library.get(videoItemId);
  if (!item) throw new Error('That item no longer exists.');
  // The service worker owns the offscreen document; extension pages ask it to do the work.
  const r = (await chrome.runtime.sendMessage({ type: 'sw-extract-frame', assetId: item.assetId, at, outId: `asset_${crypto.randomUUID()}` })) as { ok: boolean; assetId?: string; error?: string };
  if (!r?.ok) throw new Error(r?.error ?? 'Could not extract a frame.');
  const assetId = r.assetId as string;
  const blob = (await db.assets.get(assetId))!.blob;
  const row: LibraryRow = {
    id: `lib:${assetId}`, assetId, kind: 'image', source: 'frame', project: item.project, characters: item.characters, scene: item.scene, shot: item.shot,
    prompt: item.prompt, favorite: false, tags: ['frame', typeof at === 'number' ? `t=${at}s` : at], albumIds: item.albumIds, createdAt: Date.now(), bytes: blob.size,
  };
  await db.library.put(row);
  return row.id;
}
