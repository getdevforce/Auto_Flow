import { useCallback, useEffect, useState } from 'react';
import { buildFlowPlan, createProvider, type FlowJob, type FlowPlan, type ProviderId, type TextProvider } from '@frameloom/shared';
import { loadKey } from '../keys';
import { vault } from '../services';
import { importScriptFile } from '../import-script';
import { FLOW_URL, KEYS, flowStore, type FlowProgress, type FlowRun, type FlowSelectors, type TeachTarget } from '../flow/types';
import { KeysPanel } from './KeysPanel';

const TEXT_PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'deepseek', label: 'DeepSeek' }, { id: 'anthropic', label: 'Anthropic' }, { id: 'openai', label: 'OpenAI' }, { id: 'custom', label: 'Custom endpoint' },
];
interface Settings { project: string; provider: ProviderId; model: string; style: string; characters: boolean; maxSec: number; flowUrl: string }
const DEFAULTS: Settings = { project: 'My film', provider: 'deepseek', model: '', style: '', characters: true, maxSec: 8, flowUrl: FLOW_URL };
const TEACH: Array<{ id: TeachTarget; label: string }> = [
  { id: 'promptBox', label: 'Prompt box' }, { id: 'submit', label: 'Create button' }, { id: 'modeImage', label: 'Picture mode (optional)' }, { id: 'modeVideo', label: 'Video mode (optional)' },
];
const STATUS_TEXT: Record<FlowJob['status'], string> = { queued: 'Waiting', working: 'In Flow now', done: 'Saved', failed: 'Failed' };

const field = 'rounded-md border border-line bg-surface px-2 py-1';

export function FlowPanel() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [script, setScript] = useState('');
  const [plan, setPlan] = useState<FlowPlan | undefined>();
  const [run, setRun] = useState<FlowRun | undefined>();
  const [progress, setProgress] = useState<FlowProgress>({});
  const [selectors, setSelectors] = useState<FlowSelectors>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setS({ ...DEFAULTS, ...(await flowStore.get<Settings>('flowSettings')) });
    setRun(await flowStore.get<FlowRun>(KEYS.run));
    setProgress((await flowStore.get<FlowProgress>(KEYS.progress)) ?? {});
    setSelectors((await flowStore.get<FlowSelectors>(KEYS.selectors)) ?? {});
    setScript((await flowStore.get<string>('flowScript')) ?? '');
  }, []);
  useEffect(() => {
    void load();
    const on = (c: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (c[KEYS.run]) setRun(c[KEYS.run]!.newValue as FlowRun | undefined);
      if (c[KEYS.progress]) setProgress((c[KEYS.progress]!.newValue as FlowProgress | undefined) ?? {});
      if (c[KEYS.selectors]) setSelectors((c[KEYS.selectors]!.newValue as FlowSelectors | undefined) ?? {});
    };
    chrome.storage.onChanged.addListener(on);
    return () => chrome.storage.onChanged.removeListener(on);
  }, [load]);

  const update = (p: Partial<Settings>) => { const n = { ...s, ...p }; setS(n); void flowStore.set('flowSettings', n); };
  const guard = (label: string, fn: () => Promise<void>) => async () => {
    try { setErr(''); setBusy(label); await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };

  const prepare = guard('Reading your script', async () => {
    if (!script.trim()) throw new Error('Paste your script first, or import a .txt, .md, .fountain or .docx file.');
    if (!s.model.trim()) throw new Error('Type the model name exactly as your provider lists it (for DeepSeek, the model id from its docs).');
    if (!(await vault.isInitialised())) throw new Error('Open "Keys" below, create the vault and save your key first.');
    if (!vault.isUnlocked) await vault.unlock();
    const key = await loadKey(s.provider).catch(() => { throw new Error(`No ${s.provider} key saved yet. Add it under "Keys" below.`); });
    const provider = createProvider(s.provider, key, (u, i) => fetch(u, i)) as unknown as TextProvider;
    const p = await buildFlowPlan({
      provider, model: s.model.trim(), script, project: s.project || 'My film', style: s.style.trim() || undefined, maxDurationSec: s.maxSec,
      makeCharacterImages: s.characters, onProgress: setBusy,
    });
    setPlan(p);
    setNote(p.missingScenes.length ? `The model skipped scene(s) ${p.missingScenes.join(', ')} even after a retry. Check the list below before you start.` : '');
  });

  const editPrompt = (id: string, prompt: string) => plan && setPlan({ ...plan, jobs: plan.jobs.map((j) => (j.id === id ? { ...j, prompt } : j)) });
  const dropJob = (id: string) => plan && setPlan({ ...plan, jobs: plan.jobs.filter((j) => j.id !== id) });

  const start = guard('Opening Flow', async () => {
    if (!plan?.jobs.length) throw new Error('Prepare a plan first.');
    let tab = (await chrome.tabs.query({ url: 'https://labs.google/*' }))[0];
    tab ??= await chrome.tabs.create({ url: s.flowUrl });
    const next: FlowRun = { id: crypto.randomUUID(), project: s.project, state: 'running', tabId: tab.id, jobs: plan.jobs };
    await flowStore.set(KEYS.progress, {});
    await flowStore.set(KEYS.run, next);
    if (tab.id) await chrome.tabs.update(tab.id, { active: true }).catch(() => undefined);
    setNote('Running. Keep the Flow tab open and signed in. Files go to Downloads/Frameloom/ in story order.');
  });

  const setState = (state: FlowRun['state']) => guard('', async () => {
    if (!run) return;
    await flowStore.set(KEYS.run, { ...run, state });
    if (state === 'running' && run.tabId) await chrome.tabs.sendMessage(run.tabId, { type: 'flow:wake' }).catch(() => undefined);
  })();
  const retryFailed = guard('', async () => {
    if (!run) return;
    const next = Object.fromEntries(Object.entries(progress).filter(([, v]) => v.status !== 'failed'));
    await flowStore.set(KEYS.progress, next);
    await flowStore.set(KEYS.run, { ...run, state: 'running' });
  });

  const teach = (target: TeachTarget) => guard('', async () => {
    const tab = run?.tabId ? { id: run.tabId } : (await chrome.tabs.query({ url: 'https://labs.google/*' }))[0];
    if (!tab?.id) throw new Error('Open Flow in a tab first.');
    await chrome.tabs.update(tab.id, { active: true });
    const r = (await chrome.tabs.sendMessage(tab.id, { type: 'flow:teach', target })) as { ok: boolean } | undefined;
    if (!r?.ok) setNote('Nothing was saved. Click the element in the Flow tab when the dark bar appears.');
  })();

  const counts = run ? run.jobs.reduce((a, j) => { const st = progress[j.id]?.status ?? 'queued'; a[st] = (a[st] ?? 0) + 1; return a; }, {} as Record<string, number>) : {};
  const importFile = async (f?: File) => { if (f) { const t = await importScriptFile(f); setScript(t); void flowStore.set('flowScript', t); } };

  return (
    <section className="mt-4 grid gap-3" aria-labelledby="flow-h">
      <h2 id="flow-h" className="text-[15px] font-semibold">Script to Flow</h2>
      <p className="text-muted">Paste a script. Your text key reads it, finds the characters and scenes, writes a prompt for each shot, then this panel types them into Flow one by one and saves each result in order.</p>

      <label className="grid gap-1">Project name<input className={field} value={s.project} onChange={(e) => update({ project: e.target.value })} /></label>
      <label className="grid gap-1">Script
        <textarea className={`${field} font-mono`} rows={8} value={script} onChange={(e) => { setScript(e.target.value); void flowStore.set('flowScript', e.target.value); }} />
      </label>
      <label className="grid gap-1">Import a script file<input type="file" accept=".txt,.md,.fountain,.docx" onChange={(e) => void importFile(e.target.files?.[0])} /></label>

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">Text provider
          <select className={field} value={s.provider} onChange={(e) => update({ provider: e.target.value as ProviderId })}>
            {TEXT_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Model name<input className={field} value={s.model} onChange={(e) => update({ model: e.target.value })} placeholder="as listed by the provider" /></label>
      </div>
      <label className="grid gap-1">Look for every shot (optional)<input className={field} value={s.style} onChange={(e) => update({ style: e.target.value })} placeholder="for example: cinematic, warm light, 35mm film" /></label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.characters} onChange={(e) => update({ characters: e.target.checked })} />Make a picture of each character in Flow first</label>
        <label className="flex items-center gap-2">Longest clip
          <select className={field} value={s.maxSec} onChange={(e) => update({ maxSec: Number(e.target.value) })}>{[4, 6, 8].map((n) => <option key={n} value={n}>{n} s</option>)}</select>
        </label>
      </div>

      <details className="rounded-md border border-line p-2">
        <summary className="cursor-pointer font-semibold">Keys</summary>
        <KeysPanel />
      </details>

      <button className="w-fit rounded-md bg-accent px-3 py-1.5 text-accent-ink disabled:opacity-60" disabled={!!busy} onClick={() => void prepare()}>{busy || 'Read script and prepare prompts'}</button>
      {err && <p role="alert" className="text-danger">{err}</p>}
      {note && <p role="status" className="text-muted">{note}</p>}

      {plan && (
        <section aria-label="Plan" className="grid gap-2">
          <h3 className="font-semibold">{plan.characters.length} characters, {plan.jobs.filter((j) => j.kind === 'shot').length} shots</h3>
          <ul className="grid gap-1">{plan.characters.map((c) => <li key={c.name}><strong>{c.name}</strong>: <span className="text-muted">{c.description || 'no details in the script'}</span></li>)}</ul>
          <ol className="grid gap-2">
            {plan.jobs.map((j) => (
              <li key={j.id} className="rounded-md border border-line p-2">
                <div className="flex items-center justify-between"><strong>{j.title}</strong><button className="text-muted underline" onClick={() => dropJob(j.id)}>Remove</button></div>
                <textarea aria-label={`Prompt for ${j.title}`} className={`${field} mt-1 w-full`} rows={3} value={j.prompt} onChange={(e) => editPrompt(j.id, e.target.value)} />
              </li>
            ))}
          </ol>
          <button className="w-fit rounded-md bg-accent px-3 py-1.5 text-accent-ink" disabled={!!busy || run?.state === 'running'} onClick={() => void start()}>Open Flow and start</button>
        </section>
      )}

      {run && (
        <section aria-label="Progress" className="grid gap-2">
          <h3 className="font-semibold">Progress ({run.state})</h3>
          <p data-testid="flow-counts" className="text-muted">{counts.done ?? 0} saved, {counts.working ?? 0} in Flow, {counts.failed ?? 0} failed, {run.jobs.length - (counts.done ?? 0) - (counts.failed ?? 0) - (counts.working ?? 0)} waiting</p>
          <div className="flex gap-2">
            {run.state === 'running' ? <button className="rounded-md border border-line px-3 py-1" onClick={() => void setState('paused')}>Pause</button>
              : run.state !== 'done' && <button className="rounded-md border border-line px-3 py-1" onClick={() => void setState('running')}>Resume</button>}
            <button className="rounded-md border border-line px-3 py-1" onClick={() => void setState('stopped')}>Stop</button>
            {!!counts.failed && <button className="rounded-md border border-line px-3 py-1" onClick={() => void retryFailed()}>Retry failed</button>}
          </div>
          <ul className="grid gap-1">
            {run.jobs.map((j) => {
              const p = progress[j.id];
              return <li key={j.id} data-testid="flow-job"><span className="font-mono text-[11px]">{STATUS_TEXT[p?.status ?? 'queued']}</span> {j.title}{p?.savedAs && <span className="text-muted"> {p.savedAs}</span>}{p?.error && <span role="alert" className="text-danger"> {p.error}</span>}</li>;
            })}
          </ul>
        </section>
      )}

      <details className="rounded-md border border-line p-2">
        <summary className="cursor-pointer font-semibold">If it cannot find Flow's buttons</summary>
        <p className="mt-2 text-muted">Open Flow, press a button below, then click that control on the Flow page. Frameloom remembers it.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEACH.map((t) => <button key={t.id} className="rounded-md border border-line px-3 py-1" onClick={() => teach(t.id)}>{t.label}{selectors[t.id] ? ' (saved)' : ''}</button>)}
        </div>
        <label className="mt-2 grid gap-1">Flow address<input className={field} value={s.flowUrl} onChange={(e) => update({ flowUrl: e.target.value })} /></label>
      </details>
    </section>
  );
}
