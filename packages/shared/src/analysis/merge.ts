import type { AnalysedCharacter, AnalysedLocation, ChunkAnalysis, CoverageReport, TraitSet } from './schema';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const TITLES = /^(mr|mrs|ms|dr|young|old|little|the)\s+/;
const key = (s: string) => norm(s).replace(TITLES, '');

function mergeTraits(a: TraitSet, b: TraitSet): TraitSet {
  const out: TraitSet = { ...a };
  for (const [k, v] of Object.entries(b) as Array<[keyof TraitSet, string | undefined]>) if (v && !out[k]) out[k] = v;
  return out;
}

/** Fold `c` into `hit` in place: fullest name wins, aliases and traits are unioned. */
function fold(hit: AnalysedCharacter, c: AnalysedCharacter): void {
  // Longest name is usually the canonical one ("Ada Voss" over "Ada").
  const canonical = key(c.name).length > key(hit.name).length ? c.name : hit.name;
  const aliases = new Set([hit.name, ...hit.aliases, c.name, ...c.aliases]);
  aliases.delete(canonical);
  hit.name = canonical;
  hit.aliases = [...aliases].sort();
  hit.role = hit.role || c.role;
  hit.firstScene = Math.min(hit.firstScene ?? Infinity, c.firstScene ?? Infinity);
  if (!Number.isFinite(hit.firstScene)) hit.firstScene = undefined;
  hit.stated = mergeTraits(hit.stated, c.stated);
  hit.inferred = mergeTraits(hit.inferred, c.inferred);
  hit.ageStages = [...hit.ageStages, ...c.ageStages.filter((s) => !hit.ageStages.some((h) => norm(h.label) === norm(s.label)))];
  hit.ambiguity = [...new Set([...hit.ambiguity, ...c.ambiguity])];
  hit.confidence = Math.max(hit.confidence, c.confidence);
}

/** Two name keys match when equal, or when one is a single word that is the first or last word of the other. */
function namesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.includes(' ')) return false;
  const words = long.split(' ');
  return words.length > 1 && (words[0] === short || words[words.length - 1] === short);
}

export function mergeCharacters(list: AnalysedCharacter[]): AnalysedCharacter[] {
  const out: AnalysedCharacter[] = [];
  for (const c of list) {
    const names = [c.name, ...c.aliases].map(key).filter(Boolean);
    const hits = out.filter((o) => [o.name, ...o.aliases].map(key).some((n) => names.some((m) => namesMatch(n, m))));
    if (hits.length === 0) { out.push({ ...c, aliases: [...c.aliases], ambiguity: [...c.ambiguity] }); continue; }
    if (hits.length > 1) {
      // A bare first name that fits several people ("John" vs John Smith and John Brown): keep apart and say so.
      out.push({ ...c, aliases: [...c.aliases], ambiguity: [...new Set([...c.ambiguity, `Could be ${hits.map((h) => h.name).join(' or ')}`])] });
      continue;
    }
    fold(hits[0] as AnalysedCharacter, c);
  }
  return out;
}

export function mergeLocations(list: AnalysedLocation[]): AnalysedLocation[] {
  const out: AnalysedLocation[] = [];
  for (const l of list) {
    const hit = out.find((o) => norm(o.name) === norm(l.name));
    if (!hit) { out.push({ ...l }); continue; }
    hit.description = hit.description || l.description;
    hit.mood = hit.mood || l.mood;
    hit.timeOfDay = hit.timeOfDay || l.timeOfDay;
    hit.weather = hit.weather || l.weather;
    hit.interior = hit.interior ?? l.interior;
    hit.confidence = Math.max(hit.confidence, l.confidence);
  }
  return out;
}

/** Rewrites scene character/speaker names to the canonical name of the merged entity. */
export function canonicaliseScenes(a: ChunkAnalysis): ChunkAnalysis {
  const lookup = new Map<string, string>();
  for (const c of a.characters) for (const n of [c.name, ...c.aliases]) lookup.set(key(n), c.name);
  const fix = (n: string) => lookup.get(key(n)) ?? n;
  const locLookup = new Map(a.locations.map((l) => [norm(l.name), l.name]));
  return {
    ...a,
    scenes: a.scenes.map((s) => ({
      ...s,
      characters: [...new Set(s.characters.map(fix))],
      location: locLookup.get(norm(s.location)) ?? s.location,
      dialogue: s.dialogue.map((d) => ({ ...d, speaker: fix(d.speaker) })),
      continuity: s.continuity.map((e) => (e.character ? { ...e, character: fix(e.character) } : e)),
    })),
  };
}

export function applyMerges(a: ChunkAnalysis, merges: Array<{ keep: string; absorb: string[]; kind: 'character' | 'location' }>): ChunkAnalysis {
  let chars = a.characters;
  let locs = a.locations;
  for (const m of merges) {
    const list = m.kind === 'character' ? chars : locs;
    const keep = list.find((x) => norm(x.name) === norm(m.keep));
    if (!keep) continue;
    const absorbed = list.filter((x) => x !== keep && m.absorb.some((n) => norm(n) === norm(x.name)));
    if (!absorbed.length) continue;
    if (m.kind === 'character') {
      const target = { ...(keep as AnalysedCharacter), aliases: [...(keep as AnalysedCharacter).aliases] };
      for (const x of absorbed as AnalysedCharacter[]) fold(target, x);
      target.aliases = [...new Set([...target.aliases, target.name, ...(absorbed as AnalysedCharacter[]).map((x) => x.name)])].filter((n) => n !== keep.name).sort();
      target.name = keep.name;
      chars = [target, ...chars.filter((c) => c !== keep && !absorbed.includes(c))];
    } else {
      locs = locs.filter((l) => l !== keep && !absorbed.includes(l as AnalysedLocation));
      locs.unshift(...mergeLocations([keep as AnalysedLocation, ...(absorbed as AnalysedLocation[])]));
    }
  }
  return { ...a, characters: chars, locations: locs };
}

export function checkCoverage(expectedIndexes: number[], a: Pick<ChunkAnalysis, 'scenes'>): CoverageReport {
  const have = new Set(a.scenes.map((s) => s.index));
  const missing = expectedIndexes.filter((i) => !have.has(i));
  return { expected: expectedIndexes.length, covered: expectedIndexes.length - missing.length, missing, complete: missing.length === 0 };
}
