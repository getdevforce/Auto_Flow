import { lockCharacter, lockLocation, type CharacterDraft, type CharacterVersion, type LocationDraft, type LocationVersion } from '@frameloom/shared';
import { db } from '../db/db';

export const newCharacter = (name: string): CharacterDraft => ({
  id: `char_${crypto.randomUUID().slice(0, 8)}`, name, aliases: [], role: '', description: '',
  traits: { face: '', age: '', build: '', hair: '', skin: '', marks: '' }, variants: {}, negative: [], refs: [],
});

export const saveCharacter = (c: CharacterDraft) => db.characters.put(c);

/** Locks the current draft. Unchanged content returns the existing version; edits mint the next one. */
export async function lockCharacterDraft(id: string): Promise<CharacterVersion> {
  const draft = await db.characters.get(id);
  if (!draft) throw new Error('That character no longer exists.');
  const prior = await db.characterVersions.where('id').equals(id).toArray();
  const v = lockCharacter(draft, prior);
  await db.characterVersions.put(v);
  return v;
}

export const newLocation = (name: string): LocationDraft => ({
  id: `loc_${crypto.randomUUID().slice(0, 8)}`, name, description: '', lighting: '', palette: '', variants: {}, plates: [],
});
export const saveLocation = (l: LocationDraft) => db.locations.put(l);
export async function lockLocationDraft(id: string): Promise<LocationVersion> {
  const draft = await db.locations.get(id);
  if (!draft) throw new Error('That location no longer exists.');
  const prior = await db.locationVersions.where('id').equals(id).toArray();
  const v = lockLocation(draft, prior);
  await db.locationVersions.put(v);
  return v;
}

/** Stores an uploaded reference image as an asset and returns its id. */
export async function addReferenceAsset(file: File): Promise<string> {
  const id = `asset_${crypto.randomUUID()}`;
  await db.assets.put({ id, jobId: '', mime: file.type || 'image/png', blob: file });
  return id;
}
