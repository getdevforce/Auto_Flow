import { z } from 'zod';

const Conf = z.number().min(0).max(1).catch(0.5);
const Traits = z.object({
  face: z.string().optional(), age: z.string().optional(), build: z.string().optional(),
  hair: z.string().optional(), skin: z.string().optional(), marks: z.string().optional(), other: z.string().optional(),
}).default({});
export type TraitSet = z.infer<typeof Traits>;

export const AnalysedCharacter = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  role: z.string().default(''),
  firstScene: z.number().int().min(1).optional(),
  /** Only what the script says outright. */
  stated: Traits,
  /** What the model guessed. Kept apart so the UI can mark it as inferred. */
  inferred: Traits,
  ageStages: z.array(z.object({ label: z.string(), description: z.string().default('') })).default([]),
  ambiguity: z.array(z.string()).default([]),
  confidence: Conf,
});
export type AnalysedCharacter = z.infer<typeof AnalysedCharacter>;

export const AnalysedLocation = z.object({
  name: z.string().min(1),
  interior: z.boolean().nullable().default(null),
  timeOfDay: z.string().default(''),
  weather: z.string().default(''),
  mood: z.string().default(''),
  description: z.string().default(''),
  confidence: Conf,
});
export type AnalysedLocation = z.infer<typeof AnalysedLocation>;

export const AnalysedProp = z.object({ name: z.string().min(1), plotRelevance: z.string().default(''), confidence: Conf });

export const ContinuityEvent = z.object({
  type: z.enum(['costume', 'injury', 'time_jump', 'other']).catch('other'),
  character: z.string().optional(),
  note: z.string(),
});

export const AnalysedScene = z.object({
  /** Global 1-based scene number given in the prompt; the coverage check matches on this. */
  index: z.number().int().min(1),
  slugline: z.string().default(''),
  summary: z.string().default(''),
  characters: z.array(z.string()).default([]),
  location: z.string().default(''),
  dialogue: z.array(z.object({ speaker: z.string(), line: z.string() })).default([]),
  continuity: z.array(ContinuityEvent).default([]),
});
export type AnalysedScene = z.infer<typeof AnalysedScene>;

export const ChunkAnalysis = z.object({
  characters: z.array(AnalysedCharacter).default([]),
  locations: z.array(AnalysedLocation).default([]),
  props: z.array(AnalysedProp).default([]),
  scenes: z.array(AnalysedScene).default([]),
});
export type ChunkAnalysis = z.infer<typeof ChunkAnalysis>;

export const CoverageReport = z.object({
  expected: z.number(), covered: z.number(), missing: z.array(z.number()), complete: z.boolean(),
});
export type CoverageReport = z.infer<typeof CoverageReport>;

export interface ScriptAnalysis extends ChunkAnalysis { coverage: CoverageReport }

export const MergeResolution = z.object({
  merges: z.array(z.object({ keep: z.string(), absorb: z.array(z.string()), kind: z.enum(['character', 'location']).default('character') })).default([]),
});
export type MergeResolution = z.infer<typeof MergeResolution>;
