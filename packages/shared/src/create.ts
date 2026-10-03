/** Pure helpers behind the Create tab: prompt splitting, CSV import, file naming, cost estimates. */

/** Blank-line separated prompts; single newlines stay inside a prompt. */
export function splitPrompts(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** One prompt per CSV row. Uses a column named "prompt" if there is a header, else the first column. */
export function promptsFromCsv(csv: string): string[] {
  const rows = parseCsv(csv);
  if (!rows.length) return [];
  const header = rows[0]!.map((c) => c.trim().toLowerCase());
  const idx = header.indexOf('prompt');
  const body = idx >= 0 ? rows.slice(1) : rows;
  return body.map((r) => (r[Math.max(idx, 0)] ?? '').trim()).filter(Boolean);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const UNSAFE = /[<>:"/\\|?*\u0000-\u001f]/g;
export const safeSegment = (s: string): string => s.replace(UNSAFE, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'untitled';

/** Fills {project} {seq} {scene} {shot}; seq is zero padded to 3. Unknown tokens are left as written. */
export function renderName(template: string, v: { project: string; seq: number; scene?: string | number; shot?: string | number }, ext: string): string {
  const out = template.replace(/\{(\w+)\}/g, (m, key: string) => {
    switch (key) {
      case 'project': return safeSegment(v.project);
      case 'seq': return String(v.seq).padStart(3, '0');
      case 'scene': return safeSegment(String(v.scene ?? '0'));
      case 'shot': return safeSegment(String(v.shot ?? '0'));
      default: return m;
    }
  });
  // Keep the project folder separator but never allow path traversal.
  const parts = out.split('/').map((p) => (p === '..' ? '_' : p)).filter(Boolean);
  return `${parts.join('/')}.${ext}`;
}

export interface PriceRef { usd: number; unit: string }
/** Estimate in USD. Units: 'image'/'request' = per output item, 'second' = per second of video. */
export function estimateCost(price: PriceRef | undefined, o: { count: number; durationSec?: number }): number | null {
  if (!price) return null;
  const units = price.unit === 'second' ? (o.durationSec ?? 5) * o.count : o.count;
  return Math.round(price.usd * units * 10000) / 10000;
}
