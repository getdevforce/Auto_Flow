import { describe, expect, it } from 'vitest';
import type { TextProvider } from '../providers/types';
import { buildFlowPlan, characterFile, shotFile } from './plan';

const script = `INT. KITCHEN - MORNING\nAnaya, a tall woman with short grey hair, pours tea. Rohan walks in.\nRohan: You are up early.\n\nEXT. GARDEN - DAY\nAnaya waters the roses.`;

/** Answers by prompt content so the test needs no network and no provider key. */
const fake: TextProvider = {
  id: 'fake', capabilities: () => ({} as never), complete: async () => '', testKey: async () => {},
  completeJson: async (req: { prompt: string }, schema: { parse(x: unknown): unknown }) => {
    if (req.prompt.startsWith('Analyse')) {
      return schema.parse({
        characters: [
          { name: 'Anaya', role: 'host', stated: { hair: 'short grey hair', build: 'tall' }, inferred: {} },
          { name: 'Rohan', stated: {}, inferred: { age: 'thirties' } },
        ],
        locations: [{ name: 'Kitchen', interior: true, timeOfDay: 'morning', description: 'small sunny kitchen' }, { name: 'Garden', interior: false }],
        scenes: [
          { index: 1, slugline: 'INT. KITCHEN - MORNING', characters: ['Anaya', 'Rohan'], location: 'Kitchen', dialogue: [{ speaker: 'Rohan', line: 'You are up early.' }] },
          { index: 2, slugline: 'EXT. GARDEN - DAY', characters: ['Anaya'], location: 'Garden' },
        ],
      });
    }
    const scene = /^Scene (\d+)/.exec(req.prompt)![1];
    return schema.parse({ shots: [{ size: 'medium', movement: 'slow push in', durationSec: 12, characters: scene === '1' ? ['Anaya', 'Rohan'] : ['Anaya'], action: `Action for scene ${scene}`, dialogue: scene === '1' ? [{ speaker: 'Rohan', line: 'You are up early.' }] : [] }] });
  },
} as unknown as TextProvider;

describe('buildFlowPlan', () => {
  it('lists characters first, then every shot in story order, with self-contained prompts', async () => {
    const plan = await buildFlowPlan({ provider: fake, model: 'm', script, project: 'Tea Time!', style: 'warm film grain' });
    expect(plan.jobs.map((j) => j.id)).toEqual(['char-0', 'char-1', 'shot-1', 'shot-2']);
    expect(plan.jobs[0]!.prompt).toContain('Anaya');
    expect(plan.jobs[0]!.prompt).toContain('short grey hair');
    const shot1 = plan.jobs[2]!;
    expect(shot1.prompt).toContain('Anaya (host, tall, short grey hair)');
    expect(shot1.prompt).toContain('Rohan says: "You are up early."');
    expect(shot1.prompt).toContain('Setting: Kitchen');
    expect(shot1.prompt).toContain('warm film grain');
    expect(plan.jobs.map((j) => j.file)).toEqual([
      'Tea_Time/characters/01_Anaya', 'Tea_Time/characters/02_Rohan', 'Tea_Time/001_scene01_shot01', 'Tea_Time/002_scene02_shot01',
    ]);
    expect(plan.missingScenes).toEqual([]);
  });

  it('can skip character images and clamps durations', async () => {
    const plan = await buildFlowPlan({ provider: fake, model: 'm', script, project: 'p', makeCharacterImages: false, maxDurationSec: 8 });
    expect(plan.jobs.every((j) => j.kind === 'shot')).toBe(true);
  });

  it('builds stable file names', () => {
    expect(characterFile('A b', 0, 'Dr. Ráo')).toBe('A_b/characters/01_Dr_Rao');
    expect(shotFile('x', { seq: 12, sceneIndex: 3, shotIndex: 2 } as never)).toBe('x/012_scene03_shot02');
  });
});
