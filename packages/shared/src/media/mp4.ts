export interface Mp4Info { width: number; height: number; durationSec: number }

const u32 = (b: Uint8Array, o: number) => ((b[o] as number) * 2 ** 24) + ((b[o + 1] as number) << 16) + ((b[o + 2] as number) << 8) + (b[o + 3] as number);
const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o] as number, b[o + 1] as number, b[o + 2] as number, b[o + 3] as number);

/** Walk top-level and container boxes looking for `want`; returns [start of payload, end]. */
function findBox(b: Uint8Array, want: string, from = 0, to = b.length): [number, number] | null {
  let o = from;
  while (o + 8 <= to) {
    let size = u32(b, o);
    const type = tag(b, o + 4);
    let header = 8;
    if (size === 1) { size = u32(b, o + 12); header = 16; } // 64-bit size; low word is enough for clips
    if (size === 0) size = to - o;
    if (size < header) return null;
    if (type === want) return [o + header, o + size];
    if (['moov', 'trak', 'mdia'].includes(type)) {
      const inner = findBox(b, want, o + header, o + size);
      if (inner) return inner;
    }
    o += size;
  }
  return null;
}

/** Reads width, height and duration from an MP4 so upscale results can be verified without a media element. */
export function probeMp4(bytes: Uint8Array): Mp4Info | null {
  const mvhd = findBox(bytes, 'mvhd');
  const tkhd = findBox(bytes, 'tkhd');
  if (!mvhd || !tkhd) return null;
  const mv = mvhd[0];
  const version = bytes[mv] as number;
  const timescale = version === 1 ? u32(bytes, mv + 20) : u32(bytes, mv + 12);
  const duration = version === 1 ? u32(bytes, mv + 28) : u32(bytes, mv + 16);
  const tk = tkhd[0];
  const tv = bytes[tk] as number;
  const wOff = tk + (tv === 1 ? 88 : 76);
  return { width: u32(bytes, wOff) >>> 16, height: u32(bytes, wOff + 4) >>> 16, durationSec: timescale ? duration / timescale : 0 };
}

/** Test and mock helper: the smallest structure probeMp4 understands. Not playable video. */
export function buildMp4Stub(width: number, height: number, durationSec: number, timescale = 1000): Uint8Array {
  const box = (type: string, payload: number[]) => {
    const size = payload.length + 8;
    return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...[...type].map((c) => c.charCodeAt(0)), ...payload];
  };
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const mvhd = box('mvhd', [0, 0, 0, 0, ...be(0), ...be(0), ...be(timescale), ...be(Math.round(durationSec * timescale)), ...new Array(80).fill(0)]);
  const tkhd = box('tkhd', [0, 0, 0, 0, ...new Array(72).fill(0), ...be(width << 16), ...be(height << 16)]);
  const ftyp = box('ftyp', [...[...'isom'].map((c) => c.charCodeAt(0)), 0, 0, 2, 0]);
  return Uint8Array.from([...ftyp, ...box('moov', [...mvhd, ...box('trak', tkhd)])]);
}
