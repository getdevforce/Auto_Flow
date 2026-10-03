import { createProvider, type ProviderId } from '@frameloom/shared';
import { db } from '../db/db';
import { loadKey } from '../keys';
import { vault } from '../services';

/** Angles and Stylize both re-render a still with the original as a reference image. */
export async function runImageTool(o: { file: File; providerId: ProviderId; model: string; prompt: string }): Promise<string> {
  if (!vault.isUnlocked) await vault.unlock();
  const provider = createProvider(o.providerId, await loadKey(o.providerId), (u, i) => fetch(u, i)) as unknown as {
    generate(r: { model: string; prompt: string; references: Array<{ bytes: Uint8Array; mime: string }> }): Promise<Array<{ bytes: Uint8Array; mime: string }>>;
  };
  if (typeof provider.generate !== 'function') throw new Error('That provider cannot generate images.');
  const [out] = await provider.generate({ model: o.model, prompt: o.prompt, references: [{ bytes: new Uint8Array(await o.file.arrayBuffer()), mime: o.file.type || 'image/png' }] });
  if (!out) throw new Error('The provider returned no image.');
  const id = `asset_${crypto.randomUUID()}`;
  await db.assets.put({ id, jobId: '', mime: out.mime, blob: new Blob([out.bytes as BlobPart], { type: out.mime }) });
  return id;
}
