/**
 * Deliberately weak prompts for the Prompt Director eval. `recorded` is a model-style output captured by hand for CI
 * (no live key was available when this was written); run with FRAMELOOM_LIVE_EVAL=1 and ANTHROPIC_API_KEY to score a real model.
 */
export interface EvalCase {
  id: string;
  raw: string;
  subjects: string[];
  maxChars: number;
  recorded: { refined: string; negative: string; rationale: string };
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'lazy-one-liner', raw: 'Ada walks across the dock', subjects: ['Ada'], maxChars: 1200,
    recorded: {
      refined: 'Ada walks steadily across a wet harbour dock past rusted cranes, her coat catching the wind. Overcast dusk light with sodium lamps flickering on, 35mm lens at eye level, slow tracking shot following at walking pace, shallow depth of field, tense and quiet mood.',
      negative: 'blurry, extra people', rationale: 'Added setting, lighting, lens and camera movement without changing the action.',
    },
  },
  {
    id: 'numbers-and-quotes', raw: 'Ben says "the ferry is late" after 3 seconds of silence, 24 fps', subjects: ['Ben'], maxChars: 900,
    recorded: {
      refined: 'Ben stands in a cramped harbour office and, after 3 seconds of silence, says "the ferry is late", his gaze fixed on the window. Warm desk-lamp light against cold blue window light, 50mm lens, static medium close-up, restrained and weary mood, shot at 24 fps.',
      negative: '', rationale: 'Kept the quote, the 3 seconds and the frame rate; added setting, lens and light.',
    },
  },
  {
    id: 'contradiction-trap', raw: 'Ada in the office at night, sunny', subjects: ['Ada'], maxChars: 800,
    recorded: {
      refined: 'Ada sits alone in a harbour office at night, a single desk lamp throwing warm light across the tide charts while the window stays black. 35mm lens, static medium shot, quiet focused mood.',
      negative: 'daylight', rationale: 'The brief said both night and sunny; chose night because the scene text says night and removed the clash.',
    },
  },
  {
    id: 'length-limit', raw: 'A huge battle scene with Ada Voss leading the charge', subjects: ['Ada Voss'], maxChars: 400,
    recorded: {
      refined: 'Ada Voss leads a desperate charge across a muddy field as banners snap in the wind and smoke rolls over the line. Low sun backlighting the dust, 24mm wide lens, handheld camera sprinting alongside, chaotic and urgent.',
      negative: '', rationale: 'Kept to one concrete action and the limit.',
    },
  },
];
