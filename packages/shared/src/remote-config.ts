import { z } from 'zod';

const Capabilities = z.object({
  maxReferenceImages: z.number().int().min(0).default(0),
  ratios: z.array(z.string()).default([]),
  durationsSec: z.array(z.number()).default([]),
  resolutions: z.array(z.string()).default([]),
  firstLastFrame: z.boolean().default(false),
  identityTraining: z.boolean().default(false),
  lipSync: z.boolean().default(false),
  upscaleFactors: z.array(z.number()).default([]),
});

export const ModelEntry = z.object({
  id: z.string(),
  providerId: z.string(),
  kind: z.enum(['text', 'image', 'video', 'upscale', 'voice']),
  label: z.string(),
  capabilities: Capabilities,
  /** Approximate price in USD per unit; unit says what a unit is. Always shown as an estimate. */
  price: z.object({ usd: z.number().min(0), unit: z.string() }).optional(),
  deprecated: z.boolean().default(false),
  dialectVersion: z.string().optional(),
});

export const RemoteConfigSchema = z.object({
  version: z.number().int().min(0),
  schema: z.literal(1),
  minSupportedVersion: z.string(),
  // PHP serialises an empty map as [], so accept that as an empty record.
  featureFlags: z.preprocess((v) => (Array.isArray(v) && v.length === 0 ? {} : v), z.record(z.boolean())).default({}),
  announcements: z.array(z.object({ id: z.string(), title: z.string(), body: z.string(), dismissible: z.boolean().default(true) })).default([]),
  providers: z.array(z.object({ id: z.string(), label: z.string(), kinds: z.array(z.string()) })).default([]),
  models: z.array(ModelEntry).default([]),
  presets: z.object({
    camera: z.array(z.unknown()).default([]),
    effects: z.array(z.unknown()).default([]),
    styles: z.array(z.unknown()).default([]),
  }).default({}),
  dialects: z.array(z.unknown()).default([]),
});
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

/** Used until the first successful fetch and whenever the backend is unreachable or serves something invalid. */
export const BUNDLED_CONFIG: RemoteConfig = RemoteConfigSchema.parse({
  version: 0, schema: 1, minSupportedVersion: '0.0.1',
});

export interface ConfigCache { etag: string; config: RemoteConfig }
export interface ConfigStore { get(): Promise<ConfigCache | undefined>; set(c: ConfigCache): Promise<void> }
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  status: number; ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown>;
}>;

export interface LoadedConfig { config: RemoteConfig; source: 'network' | 'cache' | 'bundled' }

export async function loadRemoteConfig(deps: { baseUrl: string; fetch: FetchLike; store: ConfigStore }): Promise<LoadedConfig> {
  const cached = await deps.store.get();
  try {
    const res = await deps.fetch(`${deps.baseUrl}/api/v1/config`, {
      headers: cached ? { 'If-None-Match': cached.etag } : {},
    });
    if (res.status === 304 && cached) return { config: cached.config, source: 'cache' };
    if (res.ok) {
      const parsed = RemoteConfigSchema.safeParse(await res.json());
      const etag = res.headers.get('ETag');
      if (parsed.success && etag) {
        await deps.store.set({ etag, config: parsed.data });
        return { config: parsed.data, source: 'network' };
      }
    }
  } catch {
    // Offline or backend down: fall through to cache/bundled so the extension keeps working.
  }
  return cached ? { config: cached.config, source: 'cache' } : { config: BUNDLED_CONFIG, source: 'bundled' };
}

/** True when `current` is older than the minimum the backend still supports (dotted numeric versions). */
export function isBelowMinimum(current: string, minimum: string): boolean {
  const a = current.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
