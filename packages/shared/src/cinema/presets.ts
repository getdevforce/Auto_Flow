import { z } from 'zod';

export const PresetKind = z.enum(['camera', 'effect', 'style']);

/** A preset is prompt text plus structured parameters; providers pick whichever they understand. */
export const Preset = z.object({
  id: z.string(),
  kind: PresetKind,
  name: z.string(),
  prompt: z.string(),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** Hidden for models lacking every listed capability (e.g. a camera preset for an image-only model). */
  requires: z.array(z.enum(['video', 'image', 'lipSync', 'firstLastFrame'])).default([]),
});
export type Preset = z.infer<typeof Preset>;

export const BUNDLED_PRESETS: Preset[] = [
  ['static', 'Static', 'locked-off static camera, no camera movement'],
  ['push_in', 'Push in', 'slow push-in toward the subject'],
  ['pull_out', 'Pull out', 'slow pull-out revealing the surroundings'],
  ['pan', 'Pan', 'smooth horizontal pan'],
  ['tilt', 'Tilt', 'smooth vertical tilt'],
  ['tracking', 'Tracking', 'tracking shot following the subject at walking pace'],
  ['orbit', 'Orbit', 'camera orbits slowly around the subject'],
  ['crane_up', 'Crane up', 'crane shot rising upward'],
  ['crane_down', 'Crane down', 'crane shot descending'],
  ['handheld', 'Handheld', 'handheld camera with subtle natural shake'],
  ['whip_pan', 'Whip pan', 'fast whip pan to a new subject'],
  ['dolly_zoom', 'Dolly zoom', 'dolly zoom, background stretching while the subject stays the same size'],
].map(([id, name, prompt]) => Preset.parse({ id: `cam_${id}`, kind: 'camera', name, prompt, requires: ['video'] }));

export const BUNDLED_STYLES: Preset[] = [
  ['noir', 'Noir', 'high-contrast black and white, hard shadows, grainy 16mm film'],
  ['watercolor', 'Watercolor', 'soft watercolor wash, visible paper texture, bleeding edges'],
  ['anime', 'Anime', 'hand-drawn anime look, clean line work, flat shading'],
  ['ink', 'Ink', 'ink drawing, bold black lines, cross-hatching'],
  ['pastel_film', 'Pastel film', 'faded pastel colour grade, soft halation, 35mm film grain'],
].map(([id, name, prompt]) => Preset.parse({ id: `sty_${id}`, kind: 'style', name, prompt, requires: ['image'] }));

export const BUNDLED_EFFECTS: Preset[] = [
  ['rack_focus', 'Rack focus', 'rack focus from foreground to background'],
  ['light_leak', 'Light leak', 'warm film light leaks along the frame edge'],
  ['slow_motion', 'Slow motion', 'slow motion, 120 fps look'],
].map(([id, name, prompt]) => Preset.parse({ id: `fx_${id}`, kind: 'effect', name, prompt, requires: ['video'] }));

export const ALL_BUNDLED_PRESETS: Preset[] = [...BUNDLED_PRESETS, ...BUNDLED_STYLES, ...BUNDLED_EFFECTS];

export interface Capable { video: boolean; image: boolean; lipSync: boolean; firstLastFrame: boolean }

/** Hide a preset when the chosen model lacks something it needs, rather than showing a control that cannot work. */
export function visiblePresets(presets: Preset[], caps: Capable): Preset[] {
  return presets.filter((p) => p.requires.every((r) => caps[r]));
}

/** Strength 0..1 mapped to wording for the Stylize tool. */
export function stylizeWording(style: Preset, intensity: number): string {
  const level = intensity < 0.34 ? 'a subtle hint of' : intensity < 0.67 ? 'a clear' : 'a strong, fully committed';
  return `${level} ${style.prompt}`;
}

export function anglesPrompt(angle: string, subjectHint = ''): string {
  return `Re-render this exact scene from a new camera angle: ${angle}. Keep the same character${subjectHint ? ` (${subjectHint})` : ''}, same clothing, same environment, same lighting and colour palette. Only the camera position changes.`;
}

export function stylizePrompt(style: Preset, intensity: number): string {
  return `Restyle this image with ${stylizeWording(style, intensity)}. Keep the composition, the character's face and proportions, and the environment layout unchanged.`;
}
