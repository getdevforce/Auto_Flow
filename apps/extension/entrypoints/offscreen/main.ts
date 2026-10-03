import { db } from '../../src/db/db';

// Long-running and Blob-heavy work lives here because the service worker can be evicted and cannot create object URLs.

type FFmpegLike = {
  load(o: { coreURL: string; wasmURL: string; classWorkerURL: string }): Promise<void>;
  writeFile(n: string, d: Uint8Array): Promise<void>;
  readFile(n: string): Promise<Uint8Array | string>;
  exec(a: string[]): Promise<number>;
};
let ffmpeg: Promise<FFmpegLike> | undefined;

/** Lazy: the wasm core (~30 MB) is only fetched from the extension package the first time it is needed. */
function loadFfmpeg(): Promise<FFmpegLike> {
  ffmpeg ??= (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ff = new FFmpeg() as unknown as FFmpegLike;
    await ff.load({ coreURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.js'), wasmURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.wasm'), classWorkerURL: chrome.runtime.getURL('ffmpeg/worker.js') });
    return ff;
  })();
  return ffmpeg;
}

/** Basic Lanczos resize. It enlarges pixels; it does not add detail and is not AI upscaling. */
async function localResize(assetId: string, width: number, height: number, outId: string): Promise<string> {
  const asset = await db.assets.get(assetId);
  if (!asset) throw new Error('The draft video is missing from local storage.');
  const ff = await loadFfmpeg();
  await ff.writeFile('in.mp4', new Uint8Array(await asset.blob.arrayBuffer()));
  const code = await ff.exec(['-i', 'in.mp4', '-vf', `scale=${width}:${height}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-y', 'out.mp4']);
  if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
  const data = (await ff.readFile('out.mp4')) as Uint8Array;
  await db.assets.put({ id: outId, jobId: '', mime: 'video/mp4', blob: new Blob([data as BlobPart], { type: 'video/mp4' }) });
  return outId;
}

/** Draws one frame of a stored video to a PNG asset. `at` is 'first', 'last' or seconds from the start. */
async function extractFrame(assetId: string, at: 'first' | 'last' | number, outId: string): Promise<string> {
  const asset = await db.assets.get(assetId);
  if (!asset) throw new Error('That video is missing from local storage.');
  const url = URL.createObjectURL(asset.blob);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = url;
    await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('This browser cannot decode that video.')); });
    // Last frame: a hair before the end, since seeking to exactly `duration` can show nothing.
    const t = at === 'first' ? 0 : at === 'last' ? Math.max(0, v.duration - 0.05) : Math.min(Math.max(0, at), v.duration);
    await new Promise<void>((res, rej) => { v.onseeked = () => res(); v.onerror = () => rej(new Error('Could not seek in the video.')); v.currentTime = t; });
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the frame.'))), 'image/png'));
    await db.assets.put({ id: outId, jobId: '', mime: 'image/png', blob });
    return outId;
  } finally { URL.revokeObjectURL(url); }
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.target !== 'offscreen') return false;
  if (msg.type === 'blob-url') {
    db.assets.get(msg.assetId).then((a) => respond(a ? URL.createObjectURL(a.blob) : null)).catch(() => respond(null));
    return true;
  }
  if (msg.type === 'local-resize') {
    localResize(msg.assetId, msg.width, msg.height, msg.outId).then((id) => respond({ ok: true, assetId: id })).catch((e: unknown) => respond({ ok: false, error: String((e as Error)?.message ?? e) }));
    return true;
  }
  if (msg.type === 'extract-frame') {
    extractFrame(msg.assetId, msg.at, msg.outId).then((id) => respond({ ok: true, assetId: id })).catch((e: unknown) => respond({ ok: false, error: String((e as Error)?.message ?? e) }));
    return true;
  }
  if (msg.type === 'revoke') { URL.revokeObjectURL(msg.url); respond(true); }
  return false;
});
