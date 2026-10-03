import type { ZodType, ZodTypeDef } from 'zod';

export interface Capabilities {
  maxReferenceImages: number;
  ratios: string[];
  durationsSec: number[];
  resolutions: string[];
  firstLastFrame: boolean;
  identityTraining: boolean;
  lipSync: boolean;
  upscaleFactors: number[];
}
export const NO_CAPS: Capabilities = {
  maxReferenceImages: 0, ratios: [], durationsSec: [], resolutions: [],
  firstLastFrame: false, identityTraining: false, lipSync: false, upscaleFactors: [],
};

/** Media crossing the adapter boundary. Bytes only; adapters never touch IndexedDB or the DOM. */
export interface MediaBlob { bytes: Uint8Array; mime: string }

export interface ImageInput { bytes: Uint8Array; mime: string }

export interface TextRequest {
  model: string;
  system?: string;
  prompt: string;
  images?: ImageInput[];
  maxTokens?: number;
  temperature?: number;
  /** Long, stable prefixes (e.g. a script) the provider may cache. */
  cacheablePrefix?: string;
}

export interface TextProvider {
  id: string;
  capabilities(): Capabilities;
  complete(req: TextRequest): Promise<string>;
  completeJson<T>(req: TextRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T>;
  testKey(): Promise<void>;
}

export interface ImageRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  ratio?: string;
  count?: number;
  seed?: number;
  references?: ImageInput[];
}
export interface ImageProvider {
  id: string;
  capabilities(): Capabilities;
  generate(req: ImageRequest): Promise<MediaBlob[]>;
  testKey(): Promise<void>;
}

export interface JobHandle { provider: string; jobId: string; model: string }
export type JobStatus =
  | { state: 'queued' | 'running'; progress?: number }
  | { state: 'succeeded'; resultUrl?: string }
  | { state: 'failed'; message: string; policy?: boolean };

export interface VideoRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  ratio?: string;
  durationSec?: number;
  resolution?: string;
  seed?: number;
  firstFrame?: ImageInput;
  lastFrame?: ImageInput;
  references?: ImageInput[];
}
export interface VideoProvider {
  id: string;
  capabilities(): Capabilities;
  generate(req: VideoRequest): Promise<JobHandle>;
  poll(job: JobHandle): Promise<JobStatus>;
  fetchResult(job: JobHandle): Promise<MediaBlob>;
  testKey(): Promise<void>;
}

export interface UpscaleRequest { model: string; video: MediaBlob; factor?: number; targetResolution?: string }
export interface UpscaleProvider {
  id: string;
  capabilities(): Capabilities;
  upscale(req: UpscaleRequest): Promise<JobHandle>;
  poll(job: JobHandle): Promise<JobStatus>;
  fetchResult(job: JobHandle): Promise<MediaBlob>;
  testKey(): Promise<void>;
}

export interface VoiceRequest { model: string; voiceId: string; text: string; format?: string }
export interface VoiceProvider {
  id: string;
  capabilities(): Capabilities;
  synthesize(req: VoiceRequest): Promise<MediaBlob>;
  testKey(): Promise<void>;
}
