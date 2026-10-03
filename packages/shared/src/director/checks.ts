export interface Issue { code: 'empty' | 'too_long' | 'lost_constraint' | 'contradiction' | 'missing_subject'; detail: string }

const norm = (s: string) => s.toLowerCase();

/** Words the user explicitly wrote that must survive: quoted text, names (capitalised mid-sentence), numbers with units. */
export function mustKeep(raw: string): string[] {
  const keep = new Set<string>();
  for (const m of raw.matchAll(/"([^"]+)"|'([^']{3,})'/g)) keep.add(norm((m[1] ?? m[2]) as string));
  for (const m of raw.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,})\b/g)) keep.add(norm(m[1] as string));
  for (const m of raw.matchAll(/\b(\d+(?:\.\d+)?\s?(?:s|sec|seconds?|mm|fps|k|%))\b/gi)) keep.add(norm(m[1] as string));
  return [...keep];
}

const OPPOSITES: Array<[RegExp, RegExp, string]> = [
  [/\b(day|daytime|noon|sunny)\b/, /\b(night|nighttime|midnight)\b/, 'day and night'],
  [/\b(indoors?|interior)\b/, /\b(outdoors?|exterior)\b/, 'indoor and outdoor'],
  [/\b(close-?up|extreme close)\b/, /\b(wide shot|extreme wide|establishing)\b/, 'close-up and wide shot'],
  [/\b(static camera|locked-off|still camera)\b/, /\b(tracking|orbit|whip pan|handheld|crane)\b/, 'static camera and camera movement'],
  [/\bslow[- ]motion\b/, /\btime-?lapse\b/, 'slow motion and time-lapse'],
];

export function findContradictions(text: string): string[] {
  const t = norm(text);
  return OPPOSITES.filter(([a, b]) => a.test(t) && b.test(t)).map(([, , label]) => label);
}

export interface CheckInput { raw: string; refined: string; maxChars: number; subjects?: string[]; allowContradictionsIn?: string }

/** Deterministic checks shared by the Director's self-critique and the eval harness. */
export function validateRefinement({ raw, refined, maxChars, subjects = [] }: CheckInput): Issue[] {
  const issues: Issue[] = [];
  if (!refined.trim()) return [{ code: 'empty', detail: 'The refined prompt is empty.' }];
  if (refined.length > maxChars) issues.push({ code: 'too_long', detail: `${refined.length} characters; limit is ${maxChars}.` });
  const lower = norm(refined);
  for (const k of mustKeep(raw)) if (!lower.includes(k)) issues.push({ code: 'lost_constraint', detail: `The refined prompt dropped "${k}".` });
  // Only contradictions the refinement introduced; the user's own wording is theirs to keep.
  const before = new Set(findContradictions(raw));
  for (const c of findContradictions(refined)) if (!before.has(c)) issues.push({ code: 'contradiction', detail: `Mentions both ${c}.` });
  if (subjects.length && !subjects.some((s) => lower.includes(norm(s))) && refined.split(/\s+/).length < 4) {
    issues.push({ code: 'missing_subject', detail: 'No subject is named.' });
  } else if (!subjects.length && refined.split(/\s+/).filter(Boolean).length < 3) {
    issues.push({ code: 'missing_subject', detail: 'The prompt is too short to describe a subject.' });
  }
  return issues;
}
