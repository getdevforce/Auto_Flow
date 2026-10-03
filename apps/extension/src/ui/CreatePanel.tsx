import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { promptsFromCsv, type ProviderId } from '@frameloom/shared';
import { db } from '../db/db';
import { useDraft } from '../draft';
import { previewCreate, resumeRun, startCreateRun } from '../runs';

export function CreatePanel() {
  const [text, setText] = useState('');
  const [project, setProject] = useState('Untitled');
  const [providerId, setProviderId] = useState<ProviderId>('openai');
  const [model, setModel] = useState('');
  const [count, setCount] = useState(1);
  const [price, setPrice] = useState('');
  const [budget, setBudget] = useState('5');
  const [err, setErr] = useState('');
  const runs = useLiveQuery(() => db.runs.orderBy('createdAt').reverse().limit(5).toArray(), []);
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  useEffect(() => { setErr(''); }, [text]);
  const draft = useDraft((d) => d.text);
  useEffect(() => { if (draft) setText(draft); }, [draft]);

  const preview = previewCreate({ promptsText: text, count, priceUsd: price ? Number(price) : undefined });

  async function onFile(f: File | undefined) {
    if (!f) return;
    const content = await f.text();
    setText(f.name.toLowerCase().endsWith('.csv') ? promptsFromCsv(content).join('\n\n') : content);
  }

  return (
    <section className="mt-4 grid gap-2" aria-label="Create">
      <label className="grid gap-1">Prompts (blank line between prompts)
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="rounded-md border border-line bg-surface px-2 py-1" />
      </label>
      <label className="grid gap-1">Import .txt or .csv<input type="file" accept=".txt,.csv" onChange={(e) => void onFile(e.target.files?.[0])} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">Project<input value={project} onChange={(e) => setProject(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
        <label className="grid gap-1">Provider
          <select value={providerId} onChange={(e) => setProviderId(e.target.value as ProviderId)} className="rounded-md border border-line bg-surface px-2 py-1">
            <option value="openai">OpenAI</option><option value="custom">Custom endpoint</option>
          </select>
        </label>
        <label className="grid gap-1">Model<input value={model} onChange={(e) => setModel(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
        <label className="grid gap-1">Images per prompt<input type="number" min={1} max={8} value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
        <label className="grid gap-1">Price per image (USD, optional)<input value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
        <label className="grid gap-1">Budget cap (USD, 0 = none)<input value={budget} onChange={(e) => setBudget(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
      </div>
      <p className="text-muted" data-testid="estimate">
        {preview.prompts.length} prompt(s). {preview.estimateUsd === null ? 'Add a price per image to see a cost estimate.' : `Estimated cost about $${preview.estimateUsd.toFixed(2)} (estimate).`}
      </p>
      <p className="text-muted">Runs only while Chrome is open. If the computer sleeps, the run continues when it wakes.</p>
      {err && <p role="alert" className="text-danger">{err}</p>}
      <button className="w-fit rounded-md bg-accent px-3 py-1.5 text-accent-ink"
        onClick={() => startCreateRun({ project, nameTemplate: '{project}/{seq}_{scene}_{shot}', promptsText: text, providerId, model, count, budgetUsd: Number(budget) || 0, priceUsd: price ? Number(price) : undefined }).then(() => setText('')).catch((e: Error) => setErr(e.message))}>
        Start
      </button>
      <ul className="grid gap-2" aria-label="Runs">
        {runs?.map((r) => {
          const mine = jobs?.filter((j) => j.runId === r.id) ?? [];
          const done = mine.filter((j) => j.state === 'succeeded').length;
          return (
            <li key={r.id} className="rounded-lg border border-line bg-surface p-3" data-testid="run">
              <div className="flex justify-between"><strong>{r.name}</strong><span data-testid="run-state">{r.state}</span></div>
              <p className="text-muted">{done} of {mine.length} done{mine.some((j) => j.state === 'failed') ? `, ${mine.filter((j) => j.state === 'failed').length} flagged` : ''}</p>
              {r.state === 'paused' && (
                <p role="status" className="text-warn">Paused: {r.pausedReason}. <button className="underline" onClick={() => void resumeRun(r.id)}>Resume</button></p>
              )}
              {mine.filter((j) => j.error).map((j) => <p key={j.id} className="text-danger">{j.error?.message}</p>)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
