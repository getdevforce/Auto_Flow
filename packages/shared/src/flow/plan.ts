import type { AnalysedCharacter, AnalysedLocation, ScriptAnalysis } from '../analysis/schema';
import { analyseScript } from '../analysis/analyse';
import { characterTraits } from '../autopilot/entity-prompts';
import { planShots, type Shot } from '../planning/shots';
import type { TextProvider } from '../providers/types';

/** One thing to type into Flow and wait for. */
export interface FlowJob {
  id: string;
  kind: 'character' | 'shot';
  /** Short human label for the progress list. */
  title: string;
  prompt: string;
  /** Path relative to the Downloads folder, without extension; the extension comes from the saved media. */
  file: string;
  status: 'queued' | 'working' | 'done' | 'failed';
  error?: string;
}

export interface FlowPlan {
  characters: Array<{ name: string; description: string }>;
  locations: Array<{ name: string; description: string }>;
  jobs: FlowJob[];
  /** Scenes the model skipped even after a retry; shown to the user, never hidden. */
  missingScenes: number[];
}

export interface FlowPlanOptions {
  provider: TextProvider;
  model: string;
  script: string;
  project: string;
  /** Free text applied to every prompt, e.g. "cinematic, warm film grain, 35mm". */
  style?: string;
  /** Longest clip Flow makes; shot durations are clamped to it. */
  maxDurationSec?: number;
  makeCharacterImages?: boolean;
  onProgress?: (msg: string) => void;
}

const join = (xs: Array<string | undefined>, sep = ', ') => xs.map((x) => (x ?? '').trim()).filter(Boolean).join(sep);
const slug = (s: string) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'untitled';
const pad = (n: number, w = 3) => String(n).padStart(w, '0');

/** Look of one character as plain words. The same sentence is reused in every shot so Flow sees the same description each time. */
export function characterLook(c: AnalysedCharacter): string {
  const { used } = characterTraits(c);
  return join([c.role, used.age, used.build, used.face, used.hair, used.skin, used.marks, used.other]);
}

export function locationLook(l: AnalysedLocation): string {
  return join([l.description, l.interior === true ? 'interior' : l.interior === false ? 'exterior' : '', l.timeOfDay, l.weather, l.mood && `${l.mood} mood`]);
}

export function characterPrompt(c: AnalysedCharacter, style?: string): string {
  return join([
    `Character reference image of ${c.name}: ${characterLook(c) || 'a person fitting the story'}`,
    'full body, standing, facing the camera, plain neutral background, even soft lighting, sharp detail',
    style,
  ], '. ');
}

const SIZE_WORDS: Record<Shot['size'], string> = {
  extreme_close: 'extreme close-up', close: 'close-up', medium_close: 'medium close-up', medium: 'medium shot', wide: 'wide shot', extreme_wide: 'extreme wide shot',
};

/** A self-contained prompt: Flow gets the people, place, camera and spoken lines in every single prompt. */
export function shotPrompt(shot: Shot, analysis: ScriptAnalysis, style?: string): string {
  const people = shot.characters.map((n) => analysis.characters.find((c) => c.name === n || c.aliases.includes(n))).filter((c): c is AnalysedCharacter => !!c);
  const place = analysis.locations.find((l) => l.name === shot.location);
  const parts = [
    join([SIZE_WORDS[shot.size], shot.lens, shot.movement && `camera ${shot.movement}`]),
    place && `Setting: ${join([place.name, locationLook(place)])}`,
    ...people.map((c) => `${c.name} (${characterLook(c) || 'as described in the story'})`),
    shot.action,
    ...shot.dialogue.map((d) => `${d.speaker} says: "${d.line}"`),
    shot.continuity && `Continuity: ${shot.continuity}`,
    style,
  ];
  return join(parts, '. ').replace(/\.\s*\./g, '.');
}

export const shotFile = (project: string, shot: Shot) => `${slug(project)}/${pad(shot.seq)}_scene${pad(shot.sceneIndex, 2)}_shot${pad(shot.shotIndex, 2)}`;
export const characterFile = (project: string, index: number, name: string) => `${slug(project)}/characters/${pad(index + 1, 2)}_${slug(name)}`;

/** Script in, ordered list of Flow jobs out: characters first (so they exist before the scenes that use them), then every shot in story order. */
export async function buildFlowPlan(o: FlowPlanOptions): Promise<FlowPlan> {
  o.onProgress?.('Reading the script and finding characters and scenes');
  const { analysis, scenes } = await analyseScript({ provider: o.provider, model: o.model, script: o.script });
  o.onProgress?.(`Found ${analysis.characters.length} character(s) and ${analysis.scenes.length} scene(s). Planning shots`);
  const byIndex = new Map(scenes.map((s) => [s.index, s.text]));
  const shots = await planShots({
    provider: o.provider, model: o.model, analysis, maxDurationSec: o.maxDurationSec ?? 8, sceneText: (i) => byIndex.get(i) ?? '',
  });

  const jobs: FlowJob[] = [];
  if (o.makeCharacterImages ?? true) {
    analysis.characters.forEach((c, i) => jobs.push({
      id: `char-${i}`, kind: 'character', title: `Character: ${c.name}`, prompt: characterPrompt(c, o.style), file: characterFile(o.project, i, c.name), status: 'queued',
    }));
  }
  for (const s of shots) {
    jobs.push({
      id: `shot-${s.seq}`, kind: 'shot', title: `Scene ${s.sceneIndex}, shot ${s.shotIndex}`, prompt: shotPrompt(s, analysis, o.style), file: shotFile(o.project, s), status: 'queued',
    });
  }
  return {
    characters: analysis.characters.map((c) => ({ name: c.name, description: characterLook(c) })),
    locations: analysis.locations.map((l) => ({ name: l.name, description: locationLook(l) })),
    jobs,
    missingScenes: analysis.coverage.missing,
  };
}
