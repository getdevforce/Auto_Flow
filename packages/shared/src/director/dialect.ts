import { z } from 'zod';

/**
 * A dialect is data, not code: how a specific provider/model likes prompts written.
 * Admins edit these in the CMS and publish them through remote config.
 */
export const Dialect = z.object({
  id: z.string(),
  version: z.string(),
  /** Provider id; "*" matches any. */
  providerId: z.string().default('*'),
  /** Regex source matched against the model id; "." matches any. */
  modelPattern: z.string().default('.'),
  kind: z.enum(['image', 'video']).default('video'),
  maxChars: z.number().int().min(50).default(1200),
  supportsNegative: z.boolean().default(true),
  /** Plain-language guidance injected into the Director's system prompt. */
  guidance: z.string(),
  /** Fields a good prompt should cover, in the order they should appear. */
  fields: z.array(z.string()).default(['subject', 'action', 'environment', 'lighting', 'lens', 'camera movement', 'mood']),
});
export type Dialect = z.infer<typeof Dialect>;

export const DEFAULT_VIDEO_DIALECT: Dialect = Dialect.parse({
  id: 'default-video', version: '1', kind: 'video', maxChars: 1200,
  guidance: 'Write one flowing paragraph in present tense. Lead with the subject and the single main action, then the setting, lighting, lens and camera movement, then mood. Be concrete and visual; avoid abstract adjectives, brackets, lists and meta commentary.',
});
export const DEFAULT_IMAGE_DIALECT: Dialect = Dialect.parse({
  id: 'default-image', version: '1', kind: 'image', maxChars: 900,
  guidance: 'Write a single descriptive paragraph. Name the subject, pose, setting, lighting, lens and framing. Be concrete and visual; no lists or meta commentary.',
});

/** Most specific match wins: exact provider beats wildcard, longer model pattern beats shorter. */
export function pickDialect(dialects: Dialect[], q: { providerId: string; model: string; kind: 'image' | 'video' }): Dialect {
  const fits = dialects.filter((d) => d.kind === q.kind && (d.providerId === '*' || d.providerId === q.providerId) && new RegExp(d.modelPattern).test(q.model));
  fits.sort((a, b) => Number(b.providerId !== '*') - Number(a.providerId !== '*') || b.modelPattern.length - a.modelPattern.length);
  return fits[0] ?? (q.kind === 'image' ? DEFAULT_IMAGE_DIALECT : DEFAULT_VIDEO_DIALECT);
}
