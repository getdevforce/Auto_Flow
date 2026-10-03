import { db } from '../../src/db/db';

// Long-running and Blob-heavy work lives here because the service worker can be evicted and cannot create object URLs.

type FFmpegLike = {
  load(o: { coreURL: string; wasmURL: string }): Promise<void>;
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
    await ff.load({ coreURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.js'), wasmURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.wasm') });
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

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.target !== 'offscreen') return false;
  if (msg.type === 'blob-url') {
    db.assets.get(msg.assetId).then((a) => respond(a ? URL.createObjectURL(a.blob) : null)).catch(() => respond(null));
    return true;
  }
  if (msg.type === 'local-resize') {
    localResize(msg.assetId, msg.width, msg.height, msg.outId).then((id) => respond({ ok: true, assetId: id })).catch((e: Error) => respond({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'revoke') { URL.revokeObjectURL(msg.url); respond(true); }
  return false;
});
