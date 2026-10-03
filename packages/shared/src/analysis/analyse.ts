import { chunkScenes, splitScenes, type RawScene } from '../script/scenes';
import type { TextProvider } from '../providers/types';
import { applyMerges, canonicaliseScenes, checkCoverage, mergeCharacters, mergeLocations } from './merge';
import { ChunkAnalysis, MergeResolution, type ScriptAnalysis } from './schema';

const SYSTEM = `You are a script analyst for a film production tool. Read the scenes and extract structured data.
Rules: never invent plot. Put only facts stated in the script under "stated"; put your guesses under "inferred".
Every scene must appear in "scenes" with the exact index given. Use the character's fullest name as "name" and list nicknames, titles and pronoun-only references as aliases.
Mark ambiguity (e.g. two people who might be one) in "ambiguity" instead of guessing. Confidence is 0 to 1.`;

const sceneBlock = (s: RawScene) => `### Scene ${s.index}\n${s.text}`;

export interface AnalyseOptions {
  provider: TextProvider;
  model: string;
  script: string;
  maxChunkChars?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  /** Cheap second pass that unifies aliases across chunks. Skipped for a single chunk. */
  resolve?: boolean;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i] as T, i); }
  }));
  return out;
}

async function analyseScenes(o: AnalyseOptions, scenes: RawScene[]): Promise<ChunkAnalysis> {
  return o.provider.completeJson(
    {
      model: o.model, system: SYSTEM, maxTokens: 8000, temperature: 0,
      prompt: `Analyse these scenes (scene numbers are global):\n\n${scenes.map(sceneBlock).join('\n\n')}`,
    },
    ChunkAnalysis,
  );
}

/**
 * S1. Chunk by scene groups, analyse in parallel, merge, optionally resolve aliases, then verify coverage.
 * Scenes the model skipped are re-requested once; anything still missing is reported, never silently dropped.
 */
export async function analyseScript(o: AnalyseOptions): Promise<{ analysis: ScriptAnalysis; scenes: RawScene[] }> {
  const scenes = splitScenes(o.script);
  if (!scenes.length) throw new Error('The script is empty. Paste or import some text first.');
  const chunks = chunkScenes(scenes, o.maxChunkChars);
  let done = 0;
  const parts = await mapLimit(chunks, o.concurrency ?? 3, async (c) => {
    const r = await analyseScenes(o, c.scenes);
    o.onProgress?.(++done, chunks.length);
    return r;
  });

  let combined: ChunkAnalysis = {
    characters: mergeCharacters(parts.flatMap((p) => p.characters)),
    locations: mergeLocations(parts.flatMap((p) => p.locations)),
    props: dedupeProps(parts.flatMap((p) => p.props)),
    scenes: dedupeScenes(parts.flatMap((p) => p.scenes)),
  };

  const expected = scenes.map((s) => s.index);
  const first = checkCoverage(expected, combined);
  if (!first.complete) {
    const retry = await analyseScenes(o, scenes.filter((s) => first.missing.includes(s.index)));
    combined = {
      characters: mergeCharacters([...combined.characters, ...retry.characters]),
      locations: mergeLocations([...combined.locations, ...retry.locations]),
      props: dedupeProps([...combined.props, ...retry.props]),
      scenes: dedupeScenes([...combined.scenes, ...retry.scenes]),
    };
  }

  if ((o.resolve ?? true) && chunks.length > 1 && combined.characters.length > 1) {
    const res = await o.provider.completeJson(
      {
        model: o.model, maxTokens: 2000, temperature: 0,
        prompt: `These characters and locations were extracted from different parts of one script. Identify entries that are the same person or place (nicknames, pronoun references, spelling variants). Do NOT merge a character at two different ages unless the script says they are the same person. Return merges only where you are confident.\n\n${JSON.stringify({
          characters: combined.characters.map((c) => ({ name: c.name, aliases: c.aliases, role: c.role })),
          locations: combined.locations.map((l) => l.name),
        })}`,
      },
      MergeResolution,
    );
    combined = applyMerges(combined, res.merges);
  }

  combined = canonicaliseScenes(combined);
  combined.scenes.sort((a, b) => a.index - b.index);
  return { analysis: { ...combined, coverage: checkCoverage(expected, combined) }, scenes };
}

function dedupeScenes(list: ChunkAnalysis['scenes']): ChunkAnalysis['scenes'] {
  const map = new Map<number, ChunkAnalysis['scenes'][number]>();
  for (const s of list) if (!map.has(s.index)) map.set(s.index, s);
  return [...map.values()];
}
function dedupeProps(list: ChunkAnalysis['props']): ChunkAnalysis['props'] {
  const map = new Map<string, ChunkAnalysis['props'][number]>();
  for (const p of list) { const k = p.name.toLowerCase(); if (!map.has(k)) map.set(k, p); }
  return [...map.values()];
}
