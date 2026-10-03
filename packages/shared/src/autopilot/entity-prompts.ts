import type { AnalysedCharacter, AnalysedLocation, TraitSet } from '../analysis/schema';
import type { RefView } from '../bible/schemas';

const order: Array<keyof TraitSet> = ['face', 'age', 'build', 'hair', 'skin', 'marks', 'other'];
const join = (xs: Array<string | undefined>) => xs.map((x) => (x ?? '').trim()).filter(Boolean).join(', ');

/** Stated details win; inferred ones fill the gaps. Both are reported so the UI can mark which is which. */
export function characterTraits(c: AnalysedCharacter): { used: TraitSet; inferredKeys: Array<keyof TraitSet> } {
  const used: TraitSet = {};
  const inferredKeys: Array<keyof TraitSet> = [];
  for (const k of order) {
    if (c.stated[k]) used[k] = c.stated[k];
    else if (c.inferred[k]) { used[k] = c.inferred[k]; inferredKeys.push(k); }
  }
  return { used, inferredKeys };
}

export function portraitPrompt(c: AnalysedCharacter): string {
  const { used } = characterTraits(c);
  const desc = join(order.map((k) => used[k]));
  return `Portrait of ${c.name}${c.role ? `, ${c.role}` : ''}${desc ? `: ${desc}` : ''}. Head and shoulders, neutral expression, plain neutral background, soft even lighting, photographic.`;
}

const VIEW_TEXT: Record<RefView, string> = {
  front: 'front view, facing the camera, neutral expression',
  three_quarter: 'three-quarter view, head and shoulders',
  profile: 'side profile view, head and shoulders',
  full_body: 'full body, standing, facing the camera, plain neutral background',
  expression: 'close-up showing a distinct emotion (surprise)',
};

export const SHEET_VIEWS: RefView[] = ['three_quarter', 'profile', 'full_body', 'expression'];

export function sheetPrompt(c: AnalysedCharacter, view: RefView): string {
  const { used } = characterTraits(c);
  return `${c.name}: ${join(order.map((k) => used[k]))}. ${VIEW_TEXT[view]}. Same person as the approved portrait; consistent face, hair and build. Plain background, photographic.`;
}

export function platePrompts(l: AnalysedLocation): Array<{ kind: 'wide' | 'alt'; variant?: string; prompt: string }> {
  const base = join([l.name, l.description, l.interior === true ? 'interior' : l.interior === false ? 'exterior' : '', l.mood && `${l.mood} mood`]);
  const out: Array<{ kind: 'wide' | 'alt'; variant?: string; prompt: string }> = [
    { kind: 'wide', prompt: `Establishing wide shot of ${base}${l.timeOfDay ? `, ${l.timeOfDay}` : ''}${l.weather ? `, ${l.weather}` : ''}. No people. Cinematic, photographic.` },
    { kind: 'alt', prompt: `Alternate angle of ${base}, closer view of the space${l.timeOfDay ? `, ${l.timeOfDay}` : ''}. No people. Cinematic, photographic.` },
  ];
  return out;
}
