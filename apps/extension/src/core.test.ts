import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { NO_CAPS, type TextProvider } from '@frameloom/shared';
import { CachingTextProvider } from './autopilot/llm-cache';
import { db } from './db/db';
import { useDraft } from './draft';
import { getEntitlements, refreshEntitlements, usage } from './entitlements';
import { addToAlbum, addUpload, createAlbum, deleteItems, indexLibrary, setTags, toggleFavorite } from './library/store';
import { deleteAllLocalData, exportProject, importProject, listProjects } from './projects';
import { previewCreate, resumeRun, startCreateRun } from './runs';

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

async function seedRun(project = 'Film') {
  await db.runs.put({ id: 'r1', name: project, project, state: 'completed', budgetUsd: 0, nameTemplate: '{project}/{seq}', createdAt: Date.now(), kind: 'create' });
  await db.assets.put({ id: 'r1:1:0', jobId: 'r1:1', mime: 'image/png', blob: png() });
  await db.jobs.put({ id: 'r1:1', runId: 'r1', kind: 'image', provider: 'openai', model: 'img', input: { prompt: 'a red door', providerId: 'openai', count: 1 }, state: 'succeeded', seq: 1, attempts: 1, maxAttempts: 3, nextAt: 0, estimateUsd: 0, result: { assetIds: ['r1:1:0'] } });
}

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe('library store', () => {
  it('indexes finished jobs once and supports favorites, tags, albums, uploads and deletion', async () => {
    await seedRun();
    await indexLibrary('r1');
    await indexLibrary('r1'); // idempotent
    const rows = await db.library.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'image', prompt: 'a red door', project: 'Film', provider: 'openai', favorite: false });
    await toggleFavorite(rows[0]!.id);
    await setTags(rows[0]!.id, [' hero ', 'hero', '', 'set']);
    const album = await createAlbum('Doors');
    await addToAlbum(rows[0]!.id, album);
    await addToAlbum(rows[0]!.id, album);
    expect(await db.library.get(rows[0]!.id)).toMatchObject({ favorite: true, tags: ['hero', 'set'], albumIds: [album] });
    const up = await addUpload(new File([new Uint8Array(5)], 'x.mp4', { type: 'video/mp4' }), 'Uploads');
    expect((await db.library.get(up))!.kind).toBe('video');
    await deleteItems([rows[0]!.id, 'missing']);
    expect(await db.library.count()).toBe(1);
    expect(await db.assets.get('r1:1:0')).toBeUndefined();
  });
});

describe('projects', () => {
  it('exports one project without credentials and imports it idempotently', async () => {
    await seedRun();
    await indexLibrary('r1');
    await db.kv.put({ key: 'vault', value: { secrets: { openai: { iv: 1 } } } });
    await db.runs.put({ id: 'other', name: 'Other', project: 'Other', state: 'completed', budgetUsd: 0, nameTemplate: 'x', createdAt: 1 });
    expect(await listProjects()).toEqual(['Film', 'Other']);
    const b = await exportProject('Film', true);
    expect(JSON.stringify(b)).not.toMatch(/vault|secrets/);
    expect(b.tables.runs).toHaveLength(1);
    expect(b.assets).toHaveLength(1);
    await Promise.all(db.tables.filter((t) => t.name !== 'kv').map((t) => t.clear()));
    const first = await importProject(JSON.parse(JSON.stringify(b)));
    expect(first).toMatchObject({ project: 'Film' });
    expect(first.added).toBeGreaterThanOrEqual(3);
    expect((await importProject(JSON.parse(JSON.stringify(b)))).added).toBe(0);
    expect(await db.assets.count()).toBe(1);
    await expect(importProject({ nope: true })).rejects.toThrow('not a Frameloom project');
  });

  it('exports without assets when asked and deletes everything on request', async () => {
    await seedRun();
    expect((await exportProject('Film', false)).assets).toEqual([]);
    localStorage.setItem('theme', 'dark');
    await deleteAllLocalData();
    expect(localStorage.getItem('theme')).toBeNull();
    await db.open();
    expect(await db.runs.count()).toBe(0);
  });
});

describe('entitlements', () => {
  it('prefers a local override, then the cache, then the free fallback; counts usage this month', async () => {
    expect((await getEntitlements()).plan).toBe('free');
    await db.kv.put({ key: 'entitlements', value: { plan: 'pro', limits: { runs_per_month: 9, shots_per_run: 1, projects: 1, characters: 1, devices: 1, features: [] }, bonus_runs: 0 } });
    expect((await getEntitlements()).plan).toBe('pro');
    await db.kv.put({ key: 'entitlementsOverride', value: { plan: 'team', limits: { runs_per_month: 1, features: ['full_auto'] }, bonus_runs: 2 } });
    expect(await getEntitlements()).toMatchObject({ plan: 'team', bonus_runs: 2 });
    expect((await refreshEntitlements()).plan).toBe('team');
    await db.kv.delete('entitlementsOverride');
    expect((await refreshEntitlements()).plan).toBe('free'); // signed out: cache cleared, fallback applies
    await db.runs.put({ id: 'a', name: 'A', project: 'A', state: 'completed', budgetUsd: 0, nameTemplate: 'x', createdAt: Date.now(), kind: 'autopilot' });
    await db.runs.put({ id: 'b', name: 'B', project: 'B', state: 'completed', budgetUsd: 0, nameTemplate: 'x', createdAt: 5, kind: 'autopilot' });
    expect(await usage()).toEqual({ runsThisMonth: 1, projects: ['A', 'B'] });
  });
});

describe('create runs', () => {
  it('previews prompts and cost, creates one job per prompt, and wakes the worker', async () => {
    const send = vi.fn(async () => ({}));
    (globalThis as unknown as { chrome: { runtime: { sendMessage: unknown } } }).chrome.runtime.sendMessage = send;
    expect(previewCreate({ promptsText: 'a\n\nb', count: 2, priceUsd: 0.05 })).toEqual({ prompts: ['a', 'b'], estimateUsd: 0.2 });
    expect(previewCreate({ promptsText: 'a', count: 1 }).estimateUsd).toBeNull();
    const id = await startCreateRun({ project: 'P', nameTemplate: '{project}/{seq}', promptsText: 'a\n\nb', providerId: 'openai', model: 'm', count: 1, budgetUsd: 1, priceUsd: 0.04 });
    const jobs = await db.jobs.where('runId').equals(id).sortBy('seq');
    expect(jobs.map((j) => [j.seq, j.state, j.estimateUsd])).toEqual([[1, 'queued', 0.04], [2, 'queued', 0.04]]);
    expect(send).toHaveBeenCalledWith({ type: 'wake' });
    await expect(startCreateRun({ project: 'P', nameTemplate: 'x', promptsText: '  ', providerId: 'openai', model: 'm', count: 1, budgetUsd: 0 })).rejects.toThrow('Add at least one prompt');
    await db.runs.update(id, { state: 'paused' });
    await resumeRun(id);
    expect((await db.runs.get(id))!.state).toBe('generating');
  });
});

describe('draft store and LLM cache', () => {
  it('shares prompt text between panels', () => { useDraft.getState().set('hello'); expect(useDraft.getState().text).toBe('hello'); });

  it('answers repeated requests from IndexedDB so work is never paid for twice', async () => {
    let calls = 0;
    const inner: TextProvider = {
      id: 't', capabilities: () => NO_CAPS, testKey: async () => undefined,
      complete: async () => { calls++; return 'text'; },
      completeJson: async (_r, schema) => { calls++; return schema.parse({ n: 1 }); },
    };
    const p = new CachingTextProvider(inner);
    expect(p.id).toBe('t');
    expect(p.capabilities()).toBe(NO_CAPS);
    await p.testKey();
    const schema = z.object({ n: z.number() });
    for (let i = 0; i < 3; i++) { expect(await p.completeJson({ model: 'm', prompt: 'q' }, schema)).toEqual({ n: 1 }); expect(await p.complete({ model: 'm', prompt: 'q' })).toBe('text'); }
    expect(calls).toBe(2);
    await p.completeJson({ model: 'm', prompt: 'different' }, schema);
    expect(calls).toBe(3);
    // A cached value that no longer fits the schema is ignored and refetched.
    await p.completeJson({ model: 'm', prompt: 'q' }, z.object({ n: z.string() }).catch({ n: 'x' })).catch(() => undefined);
  });
});
