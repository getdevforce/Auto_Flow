import {
  ProviderError, createProvider, type Executor, type Job, type JobHandle, type JobStatus, type MediaBlob, type ProviderId,
  type UpscaleProvider, type VideoProvider,
} from '@frameloom/shared';
import { db } from '../db/db';
import { loadKey } from '../keys';
import { vault } from '../services';
import { localResize } from './offscreen';

export interface ImageJobInput {
  providerId: ProviderId; prompt: string; negative?: string; ratio?: string; count: number; label?: string; download?: boolean;
  /** Asset ids passed to the provider as reference images (keyframes use these for identity and environment). */
  referenceAssetIds?: string[];
  purpose?: string; entity?: string;
}
export interface VideoJobInput {
  providerId: ProviderId; model: string; prompt: string; negative?: string; ratio?: string; durationSec?: number; firstFrameAssetId?: string; label?: string;
}
export interface UpscaleJobInput { providerId: ProviderId | 'local'; model: string; assetId: string; factor?: number; targetWidth?: number; targetHeight?: number; label?: string }

async function adapter(id: ProviderId) {
  try {
    if (!vault.isUnlocked) await vault.unlock();
    return createProvider(id, await loadKey(id), (u, i) => fetch(u, i));
  } catch {
    throw new ProviderError('auth', 'Your keys are locked or missing. Unlock them in Settings > Keys, then resume the run.');
  }
}

async function readAsset(id: string): Promise<MediaBlob> {
  const a = await db.assets.get(id);
  if (!a) throw new ProviderError('invalid_request', 'A needed image is missing from local storage.');
  return { bytes: new Uint8Array(await a.blob.arrayBuffer()), mime: a.mime };
}

async function storeAsset(jobId: string, i: number, b: MediaBlob): Promise<string> {
  const id = `${jobId}:${i}`;
  await db.assets.put({ id, jobId, mime: b.mime, blob: new Blob([b.bytes as BlobPart], { type: b.mime }) });
  return id;
}

const handleOf = (job: Job): JobHandle => ({ provider: job.provider, jobId: job.providerJobId as string, model: job.model });

function mapStatus(s: JobStatus): { state: 'running' } | { state: 'succeeded' } | { state: 'failed'; message: string; policy?: boolean } {
  if (s.state === 'queued' || s.state === 'running') return { state: 'running' };
  if (s.state === 'failed') return { state: 'failed', message: s.message, policy: s.policy };
  return { state: 'succeeded' };
}

export const executor: Executor = {
  async start(job) {
    if (job.kind === 'image') {
      const input = job.input as ImageJobInput;
      const provider = (await adapter(input.providerId)) as unknown as {
        generate?(r: unknown): Promise<MediaBlob[]>;
      };
      if (!provider.generate) throw new ProviderError('invalid_request', `${input.providerId} cannot generate images.`);
      const references = await Promise.all((input.referenceAssetIds ?? []).map(readAsset));
      const blobs = await provider.generate({ model: job.model, prompt: input.prompt, negativePrompt: input.negative, ratio: input.ratio, count: input.count, references: references.length ? references : undefined });
      const ids: string[] = [];
      for (const [i, b] of blobs.entries()) ids.push(await storeAsset(job.id, i, b));
      return { done: true, result: { assetIds: ids }, costUsd: job.estimateUsd ?? 0 };
    }
    if (job.kind === 'video') {
      const input = job.input as VideoJobInput;
      const provider = (await adapter(input.providerId)) as unknown as VideoProvider;
      const handle = await provider.generate({
        model: job.model, prompt: input.prompt, negativePrompt: input.negative, ratio: input.ratio, durationSec: input.durationSec,
        firstFrame: input.firstFrameAssetId ? await readAsset(input.firstFrameAssetId) : undefined,
      });
      return { done: false, providerJobId: handle.jobId };
    }
    if (job.kind === 'upscale') {
      const input = job.input as UpscaleJobInput;
      if (input.providerId === 'local') {
        // Basic resize in the offscreen document; no provider, no key, no cost.
        const id = await localResize(input.assetId, input.targetWidth as number, input.targetHeight as number, `${job.id}:0`);
        return { done: true, result: { assetIds: [id] }, costUsd: 0 };
      }
      const provider = (await adapter(input.providerId as ProviderId)) as unknown as UpscaleProvider;
      const handle = await provider.upscale({ model: job.model, video: await readAsset(input.assetId), factor: input.factor });
      return { done: false, providerJobId: handle.jobId };
    }
    throw new ProviderError('invalid_request', `Unsupported job kind ${job.kind}.`);
  },

  async poll(job) {
    const providerId = (job.input as { providerId: ProviderId }).providerId;
    const provider = (await adapter(providerId)) as unknown as VideoProvider & UpscaleProvider;
    const status = mapStatus(await provider.poll(handleOf(job)));
    if (status.state !== 'succeeded') return status;
    const blob = await provider.fetchResult(handleOf(job));
    const id = await storeAsset(job.id, 0, blob);
    return { state: 'succeeded', result: { assetIds: [id] }, costUsd: job.estimateUsd ?? 0 };
  },
};
