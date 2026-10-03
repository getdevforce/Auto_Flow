const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Dependency-free base64 so this package stays free of Node and DOM globals. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += CHARS[a >> 2];
    out += CHARS[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : CHARS[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : CHARS[(c as number) & 63];
  }
  return out;
}

export function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? CHARS.indexOf(clean[i + k] as string) : -1));
    out.push(((n[0] as number) << 2) | ((n[1] as number) >> 4));
    if ((n[2] as number) >= 0) out.push((((n[1] as number) & 15) << 4) | ((n[2] as number) >> 2));
    if ((n[3] as number) >= 0) out.push((((n[2] as number) & 3) << 6) | (n[3] as number));
  }
  return Uint8Array.from(out);
}

export const dataUri = (b: { bytes: Uint8Array; mime: string }): string => `data:${b.mime};base64,${toBase64(b.bytes)}`;
