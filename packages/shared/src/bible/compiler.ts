import type { Capabilities } from '../providers/types';
import type { CharacterVersion, LocationVersion, RefView, StyleDef } from './schemas';

export type ShotSize = 'extreme_close' | 'close' | 'medium_close' | 'medium' | 'wide' | 'extreme_wide';

export interface CinemaSettings { angle?: string; lens?: string; depthOfField?: string; lighting?: string; grade?: string; movement?: string; motionIntensity?: string }

export interface CompileInput {
  /** Refined shot description (the Director's output, or the user's own words). */
  description: string;
  size?: ShotSize;
  characters: CharacterVersion[];
  /** Optional wardrobe or age-stage variant name per character id. */
  characterVariants?: Record<string, string>;
  location?: LocationVersion;
  locationVariant?: string;
  style?: StyleDef;
  cinema?: CinemaSettings;
  extraNegative?: string[];
  caps: Capabilities;
  ratio?: string;
  durationSec?: number;
  maxPromptChars?: number;
}

export interface PickedRef { assetId: string; role: string }
export interface CompiledRequest {
  prompt: string;
  negativePrompt: string;
  references: PickedRef[];
  ratio?: string;
  durationSec?: number;
  warnings: string[];
}

const FACE_FIRST: RefView[] = ['front', 'three_quarter', 'profile', 'expression', 'full_body'];
const BODY_FIRST: RefView[] = ['full_body', 'three_quarter', 'front', 'profile', 'expression'];
const CLOSE: ShotSize[] = ['extreme_close', 'close', 'medium_close'];
const WIDE: ShotSize[] = ['wide', 'extreme_wide'];

const join = (parts: Array<string | undefined>, sep = ', ') => parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);
const label = (s: string) => s.replace(/_/g, ' ');

function describeCharacter(c: CharacterVersion, variant?: string): string {
  const t = c.traits;
  const desc = join([t.face, t.age, t.build, t.hair, t.skin, t.marks]);
  const v = variant && c.variants[variant] ? c.variants[variant] : '';
  return `${c.name}${desc || v ? ': ' : ''}${join([desc, v])}`;
}

function describeLocation(l: LocationVersion, variant?: string): string {
  const v = variant && l.variants[variant] ? l.variants[variant] : '';
  return join([`${l.name}${l.description ? `, ${l.description}` : ''}`, v, l.lighting && `lighting: ${l.lighting}`, l.palette && `palette: ${l.palette}`]);
}

function describeCinema(c: CinemaSettings | undefined, size?: ShotSize): string {
  return join([size && `${label(size)} shot`, c?.angle, c?.lens && `${c.lens} lens`, c?.depthOfField, c?.lighting, c?.grade, c?.movement, c?.motionIntensity && `${c.motionIntensity} motion`]);
}

/** Best views for this shot size; ties break on asset id so output never depends on input order. */
export function pickReferences(input: Pick<CompileInput, 'characters' | 'location' | 'locationVariant' | 'size' | 'caps'>): PickedRef[] {
  const max = input.caps.maxReferenceImages;
  if (max <= 0) return [];
  const order = input.size && CLOSE.includes(input.size) ? FACE_FIRST : BODY_FIRST;
  const chars = [...input.characters].sort((a, b) => a.versionId.localeCompare(b.versionId));
  const ranked = chars.map((c) => ({
    c,
    refs: [...c.refs].sort((a, b) => order.indexOf(a.view) - order.indexOf(b.view) || a.assetId.localeCompare(b.assetId)),
  }));
  const plates = input.location
    ? [...input.location.plates]
        .filter((p) => !input.locationVariant || !p.variant || p.variant === input.locationVariant)
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'wide' ? -1 : 1) || a.assetId.localeCompare(b.assetId))
    : [];

  const out: PickedRef[] = [];
  const add = (assetId: string, role: string) => { if (out.length < max && !out.some((r) => r.assetId === assetId)) out.push({ assetId, role }); };
  // Wide shots are about the world, so the plate comes before the second and later character refs.
  if (input.size && WIDE.includes(input.size) && plates[0]) add(plates[0].assetId, `environment: ${input.location?.versionId}`);
  for (const { c, refs } of ranked) if (refs[0]) add(refs[0].assetId, `${c.versionId} ${label(refs[0].view)}`);
  if (plates[0]) add(plates[0].assetId, `environment: ${input.location?.versionId}`);
  for (let i = 1; out.length < max; i++) {
    const before = out.length;
    for (const { c, refs } of ranked) if (refs[i]) add(refs[i]!.assetId, `${c.versionId} ${label(refs[i]!.view)}`);
    if (out.length === before) break;
  }
  return out;
}

/**
 * Pure and deterministic: identical input produces identical output. Parts are dropped in a fixed priority order
 * when the prompt is too long; the shot description itself is never cut unless it alone exceeds the limit.
 */
export function compilePrompt(input: CompileInput): CompiledRequest {
  const warnings: string[] = [];
  const chars = [...input.characters].sort((a, b) => a.versionId.localeCompare(b.versionId));
  const parts = {
    shot: input.description.trim(),
    cinema: describeCinema(input.cinema, input.size),
    characters: chars.map((c) => describeCharacter(c, input.characterVariants?.[c.id])).join('. '),
    location: input.location ? describeLocation(input.location, input.locationVariant) : '',
    style: input.style?.descriptor.trim() ?? '',
  };
  const assemble = () => join([parts.shot, parts.cinema && `Camera: ${parts.cinema}`, parts.characters && `Characters: ${parts.characters}`, parts.location && `Setting: ${parts.location}`, parts.style && `Style: ${parts.style}`], '. ');

  const max = input.maxPromptChars ?? 4000;
  let prompt = assemble();
  for (const key of ['style', 'cinema', 'location'] as const) {
    if (prompt.length <= max) break;
    if (parts[key]) { parts[key] = ''; warnings.push(`Dropped ${key} text to fit the ${max} character limit.`); prompt = assemble(); }
  }
  if (prompt.length > max) {
    // Characters carry identity; shorten rather than drop them, keeping the shot description whole if possible.
    const room = Math.max(0, max - parts.shot.length - 'Characters: '.length - 2);
    parts.characters = parts.characters.slice(0, room).replace(/[,.\s]+$/, '');
    warnings.push('Shortened character descriptors to fit the limit.');
    prompt = assemble();
  }
  if (prompt.length > max) { prompt = prompt.slice(0, max); warnings.push('Truncated the shot description to fit the limit.'); }

  const negative = [...new Set([...chars.flatMap((c) => c.negative), ...(input.extraNegative ?? [])].map((s) => s.trim()).filter(Boolean))].sort();

  let ratio = input.ratio;
  if (ratio && input.caps.ratios.length && !input.caps.ratios.includes(ratio)) {
    warnings.push(`Ratio ${ratio} is not supported; using ${input.caps.ratios[0]}.`);
    ratio = input.caps.ratios[0];
  }
  let durationSec = input.durationSec;
  if (durationSec !== undefined && input.caps.durationsSec.length) {
    const allowed = [...input.caps.durationsSec].sort((a, b) => a - b);
    // Longest supported duration not above the request; shortest allowed if the request is below all of them.
    const fit = allowed.filter((d) => d <= durationSec!).pop() ?? allowed[0]!;
    if (fit !== durationSec) warnings.push(`Duration ${durationSec}s is not supported; using ${fit}s.`);
    durationSec = fit;
  }

  return { prompt, negativePrompt: negative.join(', '), references: pickReferences(input), ratio, durationSec, warnings };
}
