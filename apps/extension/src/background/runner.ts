import {
  BudgetGuard, CircuitBreaker, ProviderError, QueueEngine, createProvider, renderName,
  type Executor, type Job, type JobStore, type ProviderId,
} from '@frameloom/shared';
import { db, type JobRow } from '../db/db';
import { loadKey } from '../keys';
import { vault } from '../services';

export interface ImageJobInput { providerId: ProviderId; prompt: string; ratio?: string; count: number; label: string }

/** Jobs of one run presented to the engine as a store. Writes preserve extension-only fields (downloaded). */
class RunStore implements JobStore {
  constructor(private readonly runId: string) {}
  async all(): Promise<Job[]> { return db.jobs.where('runId').equals(this.runId).toArray(); }
  async put(job: Job): Promise<void> {
    const prev = await db.jobs.get(job.id);
    await db.jobs.put({ ...job, downloaded: prev?.downloaded, files: prev?.files });
  }
}

const executor: Executor = {
  async start(job) {
    const input = job.input as ImageJobInput;
    let key;
    try {
      if (!vault.isUnlocked) await vault.unlock();
      key = await loadKey(input.providerId);
    } catch {
      throw new ProviderError('auth', 'Your keys are locked or missing. Unlock them in Settings > Keys, then resume the run.');
    }
    const provider = createProvider(input.providerId, key, (u, i) => fetch(u, i));
    if (!('generate' in provider) || job.kind !== 'image') throw new ProviderError('invalid_request', `${input.providerId} cannot generate images.`);
    const blobs = await (provider as unknown as { generate(r: unknown): Promise<Array<{ bytes: Uint8Array; mime: string }>> })
      .generate({ model: job.model, prompt: input.prompt, ratio: input.ratio, count: input.count });
    const ids: string[] = [];
    await db.transaction('rw', db.assets, async () => {
      for (const [i, b] of blobs.entries()) {
        const id = `${job.id}:${i}`;
        await db.assets.put({ id, jobId: job.id, mime: b.mime, blob: new Blob([b.bytes as BlobPart], { type: b.mime }) });
        ids.push(id);
      }
    });
    return { done: true, result: { assetIds: ids }, costUsd: (job.estimateUsd ?? 0) };
  },
  async poll() { return { state: 'running' }; },
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
const extFor = (mime: string) => (mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : mime.includes('mp4') ? 'mp4' : 'png');

/** Downloads finished jobs exactly once. Safe to call repeatedly, including after a crash. */
export async function downloadFinished(runId: string): Promise<void> {
  const run = await db.runs.get(runId);
  if (!run) return;
  const jobs = await db.jobs.where('runId').equals(runId).toArray();
  for (const job of jobs.filter((j) => j.state === 'succeeded' && !j.downloaded)) {
    const ids = ((job.result as { assetIds?: string[] })?.assetIds) ?? [];
    const files: string[] = [];
    for (const [i, id] of ids.entries()) {
      const asset = await db.assets.get(id);
      if (!asset) continue;
      const filename = renderName(run.nameTemplate, { project: run.project, seq: job.seq, scene: 1, shot: i + 1 }, extFor(asset.mime));
      await chrome.downloads.download({ url: await blobToDataUrl(asset.blob), filename, conflictAction: 'uniquify' });
      files.push(filename);
    }
    await db.jobs.update(job.id, { downloaded: true, files });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives every active run. A Web Lock keeps one loop alive at a time. The loop is only an optimisation:
 * state is in IndexedDB and the alarm below re-enters it if the worker was evicted.
 */
export async function runLoop(): Promise<void> {
  await navigator.locks.request('frameloom-run-loop', { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    const engines = new Map<string, QueueEngine>();
    const recovered = new Set<string>();
    for (;;) {
      const runs = (await db.runs.toArray()).filter((r) => r.state === 'generating');
      if (!runs.length) break;
      let wake: number | null = null;
      for (const run of runs) {
        let engine = engines.get(run.id);
        if (!engine) {
          const spent = (await db.jobs.where('runId').equals(run.id).toArray()).reduce((s, j) => s + (j.costUsd ?? 0), 0);
          engine = new QueueEngine({
            store: new RunStore(run.id), executor, breaker: new CircuitBreaker(5), budget: new BudgetGuard(run.budgetUsd, spent),
            concurrency: { openai: 2, custom: 2, anthropic: 2 },
            onEvent: (e) => { if (e.type === 'paused') void db.runs.update(run.id, { state: 'paused', pausedReason: e.detail }); },
          });
          engines.set(run.id, engine);
        }
        if (!recovered.has(run.id)) { await engine.recover(); recovered.add(run.id); }
        const r = await engine.tick();
        await downloadFinished(run.id);
        const jobs = await db.jobs.where('runId').equals(run.id).toArray();
        if (!r.paused && jobs.every((j) => j.state === 'succeeded' || j.state === 'failed' || j.state === 'skipped')) {
          await db.runs.update(run.id, { state: 'completed' });
        }
        if (r.nextWakeAt !== null) wake = wake === null ? r.nextWakeAt : Math.min(wake, r.nextWakeAt);
      }
      if (wake === null) break;
      await sleep(Math.min(Math.max(wake - Date.now(), 250), 2000));
    }
  });
  await scheduleSafetyAlarm();
}

/** Fallback wake-up in case this worker is evicted while work remains. */
export async function scheduleSafetyAlarm(): Promise<void> {
  const active = (await db.runs.toArray()).some((r) => r.state === 'generating');
  if (active) await chrome.alarms.create('frameloom-tick', { delayInMinutes: 0.5, periodInMinutes: 0.5 });
  else await chrome.alarms.clear('frameloom-tick');
}

export type { JobRow };
