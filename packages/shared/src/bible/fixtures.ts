import type { Capabilities } from '../providers/types';
import { NO_CAPS } from '../providers/types';
import { lockCharacter, lockLocation } from './lock';
import type { CharacterDraft, LocationDraft } from './schemas';

export const ada: CharacterDraft = {
  id: 'char_ada', name: 'Ada Voss', aliases: ['Ada', 'the engineer'], role: 'lead', description: '',
  traits: { face: 'angular face, grey eyes', age: 'mid 30s', build: 'tall and lean', hair: 'short black bob', skin: 'olive skin', marks: 'scar through left eyebrow' },
  variants: { storm: 'wearing a yellow rain jacket' }, negative: ['beard'], refs: [
    { assetId: 'a-front', view: 'front' }, { assetId: 'a-34', view: 'three_quarter' }, { assetId: 'a-body', view: 'full_body' }, { assetId: 'a-prof', view: 'profile' },
  ],
};
export const ben: CharacterDraft = {
  id: 'char_ben', name: 'Ben Okoro', aliases: [], role: 'support', description: '',
  traits: { face: 'round face', age: 'late 50s', build: 'stocky', hair: 'grey beard', skin: 'dark brown skin', marks: '' },
  variants: {}, negative: ['glasses'], refs: [{ assetId: 'b-front', view: 'front' }, { assetId: 'b-body', view: 'full_body' }],
};
export const dock: LocationDraft = {
  id: 'loc_dock', name: 'Harbour dock', description: 'rusted cranes over black water', interior: false, lighting: 'sodium lamps', palette: 'teal and orange',
  variants: { night: 'night, light rain' }, plates: [{ assetId: 'p-wide', kind: 'wide' }, { assetId: 'p-alt', kind: 'alt' }],
};
export const adaV1 = lockCharacter(ada, [], 1000);
export const benV1 = lockCharacter(ben, [], 1000);
export const dockV1 = lockLocation(dock, [], 1000);

export const videoCaps: Capabilities = {
  ...NO_CAPS, maxReferenceImages: 3, ratios: ['16:9', '9:16'], durationsSec: [5, 10], resolutions: ['720p'],
};
