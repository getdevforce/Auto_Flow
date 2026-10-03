/**
 * fal.ai queue adapter used for both video generation and video upscaling.
 *
 * Verification status 2026-10-03: UNCONFIRMED against current docs (the research sandbox could not reach fal.ai).
 * Written from the documented queue protocol: POST https://queue.fal.run/{model} with `Authorization: Key <key>`,
 * the submit response carries status_url and response_url, statuses IN_QUEUE / IN_PROGRESS / COMPLETED.
 * The model id IS the fal endpoint path, and each model has its own input fields, so the field names below are a
 * best-effort mapping that the prompt dialect / model registry should override. Verify with a real key first.
 */
import { ProviderError } from '../errors';
import { dataUri } from './bytes';
import { request, type Fetcher } from './http';
import {
  NO_CAPS, type Capabilities, type JobHandle, type JobStatus, type MediaBlob,
  type UpscaleProvider, type UpscaleRequest, type VideoProvider, type VideoRequest,
} from './types';

interface Submit { request_id: string; status_url?: string; response_url?: string }

export class FalProvider implements VideoProvider, UpscaleProvider {
  readonly id = 'fal';
  /** Job-scoped URLs returned at submit time; kept so poll/fetch survive without recomputing paths. */
  private readonly urls = new Map<string, { status?: string; response?: string }>();

  constructor(private readonly apiKey: string, private readonly fetchFn: Fetcher, private readonly baseUrl = 'https://queue.fal.run') {}

  capabilities(): Capabilities { return { ...NO_CAPS, firstLastFrame: false, upscaleFactors: [2, 4] }; }

  private call(url: string, init: RequestInit = {}): Promise<Response> {
    return request({ provider: 'fal.ai', fetch: this.fetchFn }, url,
      { ...init, headers: { Authorization: `Key ${this.apiKey}`, 'content-type': 'application/json' } });
  }

  /** fal has no cheap whoami; a status lookup for an unknown id answers 404 when the key is valid and 401/403 when not. */
  async testKey(): Promise<void> {
    try {
      await this.call(`${this.baseUrl}/fal-ai/flux/requests/00000000-0000-0000-0000-000000000000/status`);
    } catch (e) {
      if (e instanceof ProviderError && (e.kind === 'invalid_request' || e.opts.status === 404)) return;
      throw e;
    }
  }

  private async submit(model: string, input: Record<string, unknown>): Promise<JobHandle> {
    const res = await this.call(`${this.baseUrl}/${model}`, { method: 'POST', body: JSON.stringify(input) });
    const data = (await res.json()) as Submit;
    if (!data.request_id) throw new ProviderError('transient', 'fal.ai did not return a job id. Retrying.', { provider: 'fal' });
    // URLs we follow with the API key attached must stay on the queue host; anything else is ignored and rebuilt from the documented layout.
    const sameHost = (u?: string) => { try { return u !== undefined && new URL(u).origin === new URL(this.baseUrl).origin ? u : undefined; } catch { return undefined; } };
    this.urls.set(data.request_id, { status: sameHost(data.status_url), response: sameHost(data.response_url) });
    return { provider: 'fal', jobId: data.request_id, model };
  }

  generate(req: VideoRequest): Promise<JobHandle> {
    return this.submit(req.model, {
      prompt: req.prompt,
      ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      ...(req.ratio ? { aspect_ratio: req.ratio } : {}),
      ...(req.durationSec ? { duration: String(req.durationSec) } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(req.firstFrame ? { image_url: dataUri(req.firstFrame) } : {}),
    });
  }

  upscale(req: UpscaleRequest): Promise<JobHandle> {
    return this.submit(req.model, { video_url: dataUri(req.video), ...(req.factor ? { scale: req.factor } : {}) });
  }

  private urlsFor(job: JobHandle) {
    const known = this.urls.get(job.jobId);
    // After a restart (or when a returned url was rejected) the documented path layout lets us rebuild the urls.
    const root = `${this.baseUrl}/${job.model}/requests/${job.jobId}`;
    return { status: known?.status ?? `${root}/status`, response: known?.response ?? root };
  }

  async poll(job: JobHandle): Promise<JobStatus> {
    const res = await this.call(this.urlsFor(job).status as string);
    const d = (await res.json()) as { status?: string; error?: string };
    switch (d.status) {
      case 'IN_QUEUE': return { state: 'queued' };
      case 'IN_PROGRESS': return { state: 'running' };
      case 'COMPLETED': {
        if (d.error) return { state: 'failed', message: d.error, policy: /safety|policy|nsfw|moderation/i.test(d.error) };
        const out = await (await this.call(this.urlsFor(job).response as string)).json() as { video?: { url?: string } };
        return out.video?.url ? { state: 'succeeded', resultUrl: out.video.url } : { state: 'failed', message: 'fal.ai finished without a video.' };
      }
      default: return { state: 'failed', message: `Unexpected fal.ai status: ${String(d.status)}` };
    }
  }

  async fetchResult(job: JobHandle): Promise<MediaBlob> {
    const status = await this.poll(job);
    if (status.state !== 'succeeded' || !status.resultUrl) throw new ProviderError('invalid_request', 'The job has no result yet.', { provider: 'fal' });
    const file = await request({ provider: 'fal.ai', fetch: this.fetchFn }, status.resultUrl, { method: 'GET' });
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.headers.get('content-type') ?? 'video/mp4' };
  }
}
