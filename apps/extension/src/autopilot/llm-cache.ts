import { contentHash, type Capabilities, type TextProvider, type TextRequest } from '@frameloom/shared';
import type { ZodType, ZodTypeDef } from 'zod';
import { db } from '../db/db';

/**
 * Wraps a text provider so identical requests are answered from IndexedDB. After a crash a rerun of analysis
 * replays finished chunks for free instead of paying again. Images are excluded from the key by length only.
 */
export class CachingTextProvider implements TextProvider {
  constructor(private readonly inner: TextProvider) {}
  get id() { return this.inner.id; }
  capabilities(): Capabilities { return this.inner.capabilities(); }
  testKey() { return this.inner.testKey(); }

  private hash(req: TextRequest, mode: string): string {
    return contentHash({ mode, p: this.inner.id, m: req.model, s: req.system, c: req.cacheablePrefix, q: req.prompt, i: req.images?.length ?? 0, t: req.temperature });
  }

  async complete(req: TextRequest): Promise<string> {
    const hash = this.hash(req, 'text');
    const hit = await db.llmCache.get(hash);
    if (hit) return hit.text;
    const text = await this.inner.complete(req);
    await db.llmCache.put({ hash, text });
    return text;
  }

  async completeJson<T>(req: TextRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
    const hash = this.hash(req, 'json');
    const hit = await db.llmCache.get(hash);
    if (hit) {
      const parsed = schema.safeParse(JSON.parse(hit.text));
      if (parsed.success) return parsed.data;
    }
    const out = await this.inner.completeJson(req, schema);
    await db.llmCache.put({ hash, text: JSON.stringify(out) });
    return out;
  }
}
