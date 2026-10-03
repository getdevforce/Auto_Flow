import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { CharacterDraft, RefView } from '@frameloom/shared';
import { db } from '../db/db';
import { getEntitlements } from '../entitlements';
import { addReferenceAsset, lockCharacterDraft, newCharacter, saveCharacter } from '../bible/store';

const TRAITS = ['face', 'age', 'build', 'hair', 'skin', 'marks'] as const;
const VIEWS: RefView[] = ['front', 'three_quarter', 'profile', 'full_body', 'expression'];

export function BiblePanel() {
  const characters = useLiveQuery(() => db.characters.orderBy('name').toArray(), []);
  const versions = useLiveQuery(() => db.characterVersions.toArray(), []);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  return (
    <section className="mt-4 grid gap-3" aria-label="Story Bible">
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const limit = (await getEntitlements()).limits.characters;
        if ((await db.characters.count()) >= limit) { setMsg(`Your plan allows ${limit} characters. Remove one or upgrade your plan.`); return; }
        await saveCharacter(newCharacter(name.trim())); setName('');
      }}>
        <label className="grid flex-1 gap-1">New character name<input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
        <button className="self-end rounded-md bg-accent px-3 py-1.5 text-accent-ink">Add</button>
      </form>
      {characters?.length === 0 && <p className="text-muted">No characters yet. Add one by name, describe their face, hair and build, then lock them so every shot uses the same description.</p>}
      {msg && <p role="status" className="text-muted">{msg}</p>}
      {characters?.map((c) => {
        const mine = (versions ?? []).filter((v) => v.id === c.id).sort((a, b) => b.version - a.version);
        return <CharacterCard key={c.id} c={c} latest={mine[0]?.versionId} onLock={async () => { const v = await lockCharacterDraft(c.id); setMsg(`${c.name} locked as ${v.versionId}.`); }} />;
      })}
    </section>
  );
}

function CharacterCard({ c, latest, onLock }: { c: CharacterDraft; latest?: string; onLock: () => Promise<void> }) {
  return (
    <article className="rounded-lg border border-line bg-surface p-3" data-testid={`char-${c.name}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{c.name}</h3>
        <span className="font-mono text-[11px] text-muted" data-testid="locked-as">{latest ? `locked: ${latest}` : 'not locked'}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {TRAITS.map((t) => (
          <label key={t} className="grid gap-1 capitalize">{t}
            <input defaultValue={c.traits[t]} onBlur={(e) => void saveCharacter({ ...c, traits: { ...c.traits, [t]: e.target.value } })} className="rounded-md border border-line bg-surface px-2 py-1" />
          </label>
        ))}
      </div>
      <p className="mt-2 text-muted">{c.refs.length} reference image(s)</p>
      <label className="mt-1 grid gap-1">Add reference
        <select id={`view-${c.id}`} defaultValue="front" className="rounded-md border border-line bg-surface px-2 py-1">{VIEWS.map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}</select>
        <input type="file" accept="image/*" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const view = (document.getElementById(`view-${c.id}`) as HTMLSelectElement).value as RefView;
          await saveCharacter({ ...(await db.characters.get(c.id))!, refs: [...c.refs, { assetId: await addReferenceAsset(f), view }] });
        }} />
      </label>
      <button className="mt-2 rounded-md border border-line px-3 py-1" onClick={() => void onLock()}>Lock character</button>
    </article>
  );
}
