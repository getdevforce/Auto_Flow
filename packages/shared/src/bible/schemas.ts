import { z } from 'zod';

export const RefView = z.enum(['front', 'three_quarter', 'profile', 'full_body', 'expression']);
export type RefView = z.infer<typeof RefView>;
export const PlateKind = z.enum(['wide', 'alt']);

export const CharacterRef = z.object({ assetId: z.string(), view: RefView });
export const PlateRef = z.object({ assetId: z.string(), kind: PlateKind, variant: z.string().optional() });

/** Locked traits are the sentences injected into every prompt; keep them short and visual. */
export const LockedTraits = z.object({
  face: z.string().default(''),
  age: z.string().default(''),
  build: z.string().default(''),
  hair: z.string().default(''),
  skin: z.string().default(''),
  marks: z.string().default(''),
});

export const CharacterDraft = z.object({
  id: z.string(),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  role: z.string().default(''),
  description: z.string().default(''),
  traits: LockedTraits,
  /** Per-variant wardrobe or age-stage text, e.g. "wardrobe: grey wool coat". */
  variants: z.record(z.string()).default({}),
  negative: z.array(z.string()).default([]),
  seed: z.number().int().optional(),
  identityHandle: z.string().optional(),
  voiceId: z.string().optional(),
  refs: z.array(CharacterRef).default([]),
});
export type CharacterDraft = z.infer<typeof CharacterDraft>;

export const CharacterVersion = CharacterDraft.extend({
  /** e.g. "char_ada@v3". Shots store this id, never the mutable draft. */
  versionId: z.string(),
  version: z.number().int().min(1),
  lockedAt: z.number(),
  contentHash: z.string(),
});
export type CharacterVersion = z.infer<typeof CharacterVersion>;

export const LocationDraft = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  interior: z.boolean().optional(),
  lighting: z.string().default(''),
  palette: z.string().default(''),
  /** time-of-day / weather variants, keyed by variant name. */
  variants: z.record(z.string()).default({}),
  plates: z.array(PlateRef).default([]),
});
export type LocationDraft = z.infer<typeof LocationDraft>;
export const LocationVersion = LocationDraft.extend({
  versionId: z.string(), version: z.number().int().min(1), lockedAt: z.number(), contentHash: z.string(),
});
export type LocationVersion = z.infer<typeof LocationVersion>;

export const StyleDef = z.object({ id: z.string(), name: z.string(), descriptor: z.string(), refs: z.array(z.string()).default([]) });
export type StyleDef = z.infer<typeof StyleDef>;
