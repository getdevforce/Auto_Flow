export interface RawScene { index: number; slugline: string; text: string }

/** Remove Fountain-only markup that would confuse analysis, keeping every story word. */
export function cleanFountain(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')            // boneyard
    .replace(/\[\[[\s\S]*?\]\]/g, '')            // notes
    .replace(/^(?:Title|Credit|Author|Authors|Source|Draft date|Contact|Copyright):.*$/gim, '')
    .replace(/^={3,}\s*$/gm, '')                  // page breaks
    .replace(/^#{1,6}\s.*$/gm, '')                // section headings
    .replace(/^=\s.*$/gm, '')                     // synopses
    .replace(/(\*{1,3}|_)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/^[.](?=[A-Za-z])/gm, '')            // forced sluglines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SLUG = /^\s*(?:\d+[A-Z]?\s+)?((?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ].*|SCENE\s+\d+.*)$/i;

/**
 * Deterministic scene splitter. Sluglines (INT./EXT., "SCENE 3") start scenes; text before the first slugline becomes
 * scene 1. A script with no sluglines is split on blank-line separated sections so nothing is ever lost.
 * Concatenating every scene's text reproduces the (cleaned) input, which the coverage check relies on.
 */
export function splitScenes(script: string): RawScene[] {
  const lines = script.replace(/\r\n/g, '\n').split('\n');
  const starts = lines.flatMap((l, i) => (SLUG.test(l) ? [i] : []));
  const scenes: RawScene[] = [];

  if (!starts.length) {
    const blocks = script.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    return blocks.map((b, i) => ({ index: i + 1, slugline: `Section ${i + 1}`, text: b }));
  }
  if (starts[0]! > 0 && lines.slice(0, starts[0]).some((l) => l.trim())) starts.unshift(0);

  starts.forEach((s, i) => {
    const end = starts[i + 1] ?? lines.length;
    const text = lines.slice(s, end).join('\n').trim();
    const first = (lines[s] ?? '').trim();
    scenes.push({ index: scenes.length + 1, slugline: SLUG.test(first) ? first.replace(/^\d+[A-Z]?\s+/, '') : 'Opening', text });
  });
  return scenes;
}

export interface Chunk { scenes: RawScene[]; chars: number }

/** Groups whole scenes up to maxChars. An oversize scene gets a chunk of its own; scenes are never cut. */
export function chunkScenes(scenes: RawScene[], maxChars = 12000): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: Chunk = { scenes: [], chars: 0 };
  for (const s of scenes) {
    if (cur.scenes.length && cur.chars + s.text.length > maxChars) { chunks.push(cur); cur = { scenes: [], chars: 0 }; }
    cur.scenes.push(s);
    cur.chars += s.text.length;
  }
  if (cur.scenes.length) chunks.push(cur);
  return chunks;
}
