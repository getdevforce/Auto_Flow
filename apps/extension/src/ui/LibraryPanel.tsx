import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cleanupCandidates, facets, filterLibrary, type LibraryQuery } from '@frameloom/shared';
import { db, type LibraryRow } from '../db/db';
import { addToAlbum, addUpload, createAlbum, deleteItems, extractFrameToLibrary, setTags, storageUsage, toggleFavorite } from '../library/store';

const field = 'rounded-md border border-line bg-surface px-2 py-1';
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function Thumb({ row }: { row: LibraryRow }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    db.assets.get(row.assetId).then((a) => { if (a) { u = URL.createObjectURL(a.blob); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [row.assetId]);
  if (!url) return <div className="h-20 w-full animate-pulse rounded-md bg-raised" />;
  return row.kind === 'video'
    ? <video src={url} className="h-20 w-full rounded-md border border-line object-cover" muted preload="metadata" aria-label="Video preview" />
    : <img src={url} alt={row.prompt ?? row.source} className="h-20 w-full rounded-md border border-line object-cover" />;
}

export function LibraryPanel() {
  const rows = useLiveQuery(() => db.library.toArray(), []) ?? [];
  const albums = useLiveQuery(() => db.albums.toArray(), []) ?? [];
  const [q, setQ] = useState<LibraryQuery>({});
  const [open, setOpen] = useState<string>();
  const [usage, setUsage] = useState<{ usage: number; quota: number }>();
  const [msg, setMsg] = useState('');
  const [frameAt, setFrameAt] = useState('1');
  const [newAlbum, setNewAlbum] = useState('');
  useEffect(() => { void storageUsage().then(setUsage); }, [rows.length]);
  const items = useMemo(() => filterLibrary(rows, q), [rows, q]) as LibraryRow[];
  const f = useMemo(() => facets(rows), [rows]);
  const selected = rows.find((r) => r.id === open);
  const set = <K extends keyof LibraryQuery>(k: K, v: LibraryQuery[K] | '') => setQ((p) => ({ ...p, [k]: v === '' ? undefined : v }));

  return (
    <section className="mt-4 grid gap-3" aria-label="Library">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 grid gap-1">Search<input value={q.text ?? ''} onChange={(e) => set('text', e.target.value)} placeholder="prompt, tag, character" className={field} /></label>
        <label className="grid gap-1">Project<select value={q.project ?? ''} onChange={(e) => set('project', e.target.value)} className={field}><option value="">All</option>{f.projects.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="grid gap-1">Character<select value={q.character ?? ''} onChange={(e) => set('character', e.target.value)} className={field}><option value="">All</option>{f.characters.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="grid gap-1">Provider<select value={q.provider ?? ''} onChange={(e) => set('provider', e.target.value)} className={field}><option value="">All</option>{f.providers.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="grid gap-1">Album<select value={q.albumId ?? ''} onChange={(e) => set('albumId', e.target.value)} className={field}><option value="">All</option>{albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!q.favoritesOnly} onChange={(e) => set('favoritesOnly', e.target.checked || '')} />Favorites only</label>
        <label className="grid gap-1">Add a file<input type="file" accept="image/*,video/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void addUpload(file); }} /></label>
      </div>

      {usage && <p className="text-muted" data-testid="quota">Using {mb(usage.usage)} of {mb(usage.quota)} available on this computer. {rows.length} item(s).
        {' '}<button className="underline" onClick={async () => { const c = cleanupCandidates(rows, usage.usage * 0.25 || 1); await deleteItems(c.map((x) => x.id)); setMsg(`Removed ${c.length} older item(s) that were not favorites or in an album.`); }}>Free space</button></p>}
      {msg && <p role="status" className="text-muted">{msg}</p>}

      {rows.length === 0
        ? <p className="text-muted">Nothing here yet. Everything you generate lands here, or add a file above. Run something in Create or Autopilot to fill it.</p>
        : items.length === 0 ? <p className="text-muted">No items match. Clear a filter or search for something else.</p> : (
          <ul className="grid grid-cols-3 gap-2" aria-label="Library items">
            {items.map((r) => (
              <li key={r.id} data-testid="lib-item" className="grid gap-1">
                <button onClick={() => setOpen(open === r.id ? undefined : r.id)} aria-label={`Open ${r.prompt ?? r.source}`}><Thumb row={r} /></button>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="truncate text-muted">{r.source}</span>
                  <button aria-label={r.favorite ? 'Remove favorite' : 'Add favorite'} aria-pressed={r.favorite} onClick={() => void toggleFavorite(r.id)}>{r.favorite ? '★' : '☆'}</button>
                </div>
              </li>
            ))}
          </ul>
        )}

      {selected && (
        <div className="grid gap-2 rounded-lg border border-line bg-surface p-3" data-testid="lib-detail">
          <p className="text-muted">{selected.prompt ?? 'No prompt recorded.'}</p>
          <p className="text-muted">{[selected.project, selected.provider, selected.model, selected.scene !== undefined ? `scene ${selected.scene}` : ''].filter(Boolean).join(' / ')}</p>
          <label className="grid gap-1">Tags (comma separated)<input defaultValue={selected.tags.join(', ')} key={selected.id} onBlur={(e) => void setTags(selected.id, e.target.value.split(','))} className={field} /></label>
          <div className="flex items-center gap-2">
            <select aria-label="Album" className={field} defaultValue="" onChange={async (e) => { if (e.target.value) { await addToAlbum(selected.id, e.target.value); e.target.value = ''; } }}>
              <option value="">Add to album</option>{albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input aria-label="New album name" value={newAlbum} onChange={(e) => setNewAlbum(e.target.value)} placeholder="New album" className={`${field} w-28`} />
            <button className="rounded-md border border-line px-2 py-1" disabled={!newAlbum.trim()} onClick={async () => { const id = await createAlbum(newAlbum.trim()); await addToAlbum(selected.id, id); setNewAlbum(''); }}>Create album</button>
          </div>
          {selected.kind === 'video' && (
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-md border border-line px-2 py-1" onClick={() => void extractFrameToLibrary(selected.id, 'first').then(() => setMsg('Saved the first frame.')).catch((e: Error) => setMsg(e.message))}>First frame</button>
              <button className="rounded-md border border-line px-2 py-1" onClick={() => void extractFrameToLibrary(selected.id, 'last').then(() => setMsg('Saved the last frame.')).catch((e: Error) => setMsg(e.message))}>Last frame</button>
              <label className="flex items-center gap-1">At <input aria-label="Frame time in seconds" value={frameAt} onChange={(e) => setFrameAt(e.target.value)} className={`${field} w-14`} /> s</label>
              <button className="rounded-md border border-line px-2 py-1" onClick={() => void extractFrameToLibrary(selected.id, Number(frameAt) || 0).then(() => setMsg(`Saved the frame at ${frameAt}s.`)).catch((e: Error) => setMsg(e.message))}>Extract frame</button>
            </div>
          )}
          <button className="w-fit rounded-md border border-line px-2 py-1 text-danger" onClick={async () => { await deleteItems([selected.id]); setOpen(undefined); }}>Delete</button>
        </div>
      )}
    </section>
  );
}
