import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { extractVariables, fillTemplate, missingVariables } from '@frameloom/shared';
import { db } from '../db/db';
import { useDraft } from '../draft';
import { getApiBase, getSession } from '../services';

interface Card { slug: string; title: string; summary?: string; category?: string; tags: string[]; difficulty: string; featured: boolean; trending: boolean; use_count: number; rating: number | null }
interface Detail extends Card { body: { prompt?: string; defaults?: Record<string, string> } }
const field = 'rounded-md border border-line bg-surface px-2 py-1';

export function TemplatesPanel() {
  const [cards, setCards] = useState<Card[]>();
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState('featured');
  const [open, setOpen] = useState<Detail>();
  const [values, setValues] = useState<Record<string, string>>({});
  const setDraft = useDraft((d) => d.set);
  const saved = useLiveQuery(() => db.prompts.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const params = new URLSearchParams({ sort, ...(q ? { q } : {}), ...(difficulty ? { difficulty } : {}) });
        const res = await fetch(`${await getApiBase()}/api/v1/templates?${params}`);
        if (!res.ok) throw new Error(`The server answered ${res.status}.`);
        const json = (await res.json()) as { data: Card[] };
        if (live) { setCards(json.data); setError(''); }
      } catch (e) { if (live) setError(`Could not load templates. ${(e as Error).message || 'Check your connection.'}`); }
    })();
    return () => { live = false; };
  }, [q, difficulty, sort]);

  async function openCard(slug: string) {
    const res = await fetch(`${await getApiBase()}/api/v1/templates/${slug}`);
    const d = (await res.json()) as Detail;
    setOpen(d);
    setValues(d.body.defaults ?? {});
  }
  const promptText = open?.body.prompt ?? '';
  const vars = extractVariables(promptText);
  const missing = missingVariables(promptText, values);

  async function useTemplate() {
    setDraft(fillTemplate(promptText, values));
    // Counts the use. Sends only the template's slug, never the filled text.
    void fetch(`${await getApiBase()}/api/v1/templates/${open!.slug}/use`, { method: 'POST' }).catch(() => undefined);
  }
  async function rate(stars: number) {
    const s = await getSession();
    if (!s) return setError('Sign in to rate templates.');
    await fetch(`${await getApiBase()}/api/v1/templates/${open!.slug}/rate`, { method: 'POST', headers: { Authorization: `Bearer ${s.token}`, 'content-type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ stars }) });
  }

  return (
    <section className="mt-4 grid gap-3" aria-label="Templates">
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-3 grid gap-1">Search templates<input value={q} onChange={(e) => setQ(e.target.value)} className={field} /></label>
        <label className="grid gap-1">Difficulty<select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={field}><option value="">Any</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
        <label className="grid gap-1">Sort<select value={sort} onChange={(e) => setSort(e.target.value)} className={field}><option value="featured">Featured</option><option value="trending">Trending</option><option value="new">New</option><option value="popular">Most used</option></select></label>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {cards === undefined && !error && <div className="h-16 animate-pulse rounded-md bg-raised" aria-label="Loading templates" />}
      {cards?.length === 0 && <p className="text-muted">No templates match. Clear the search or pick another difficulty.</p>}
      <ul className="grid gap-2" aria-label="Template list">
        {cards?.map((c) => (
          <li key={c.slug}>
            <button className="w-full rounded-lg border border-line bg-surface p-3 text-left" onClick={() => void openCard(c.slug)} data-testid="template-card">
              <strong>{c.title}</strong>{c.featured && <span className="ml-2 text-[11px] text-accent">featured</span>}
              <p className="text-muted">{c.summary}</p>
              <p className="font-mono text-[11px] text-muted">{c.difficulty} / {c.use_count} uses{c.rating ? ` / ${c.rating} stars` : ''}</p>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div className="grid gap-2 rounded-lg border border-line bg-surface p-3" data-testid="template-detail">
          <h3 className="font-semibold">{open.title}</h3>
          <p className="text-muted">{promptText}</p>
          {vars.map((v) => <label key={v} className="grid gap-1 capitalize">{v}<input value={values[v] ?? ''} onChange={(e) => setValues((p) => ({ ...p, [v]: e.target.value }))} className={field} /></label>)}
          {missing.length > 0 && <p className="text-muted">Still to fill: {missing.join(', ')}. Unfilled variables stay in braces.</p>}
          <div className="flex items-center gap-2">
            <button className="rounded-md bg-accent px-3 py-1 text-accent-ink" onClick={() => void useTemplate()}>Use in Create</button>
            <span className="text-muted">Rate</span>{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} stars`} className="px-1" onClick={() => void rate(n)}>{n}</button>)}
          </div>
        </div>
      )}

      <h3 className="font-semibold">My prompts</h3>
      <form className="grid gap-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await db.prompts.put({ id: crypto.randomUUID(), title: title.trim() || text.trim().slice(0, 30), text: text.trim(), kind: 'prompt', createdAt: Date.now() }); setTitle(''); setText(''); }}>
        <label className="grid gap-1">Title<input value={title} onChange={(e) => setTitle(e.target.value)} className={field} /></label>
        <label className="grid gap-1">Prompt (use {'{character}'}, {'{location}'}, {'{mood}'} for variables)<textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className={field} /></label>
        <button className="w-fit rounded-md border border-line px-3 py-1">Save prompt</button>
      </form>
      {saved.length === 0 && <p className="text-muted">No saved prompts yet. Save one above to reuse it with variables.</p>}
      <ul className="grid gap-1" aria-label="Saved prompts">
        {saved.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-md border border-line px-2 py-1">
            <span>{p.title}</span>
            <span className="flex gap-2"><button className="underline" onClick={() => setDraft(p.text)}>Use</button><button className="underline text-danger" onClick={() => void db.prompts.delete(p.id)}>Delete</button></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
