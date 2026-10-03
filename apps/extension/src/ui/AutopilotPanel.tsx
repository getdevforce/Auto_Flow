import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AUTONOMY_LEVELS, type Autonomy, type ProviderId } from '@frameloom/shared';
import { db, type RunRow } from '../db/db';
import { approve, gateFor, setAutonomy, startAutopilot } from '../autopilot/pipeline';
import { importScriptFile } from '../import-script';
import { resumeRun } from '../runs';

const AUTONOMY_LABEL: Record<Autonomy, string> = {
  manual: 'Manual: ask at every stage', checkpoints: 'Checkpoints: ask for characters, locations and the pilot scene', full_auto: 'Full auto: never ask, log every decision',
};

function useAssetUrl(id: string | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let revoked: string | undefined;
    if (id) db.assets.get(id).then((a) => { if (a) { revoked = URL.createObjectURL(a.blob); setUrl(revoked); } });
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [id]);
  return url;
}
const Thumb = ({ id, label }: { id: string; label: string }) => {
  const url = useAssetUrl(id);
  return url ? <img src={url} alt={label} className="h-16 w-16 rounded-md border border-line object-cover" /> : <div className="h-16 w-16 animate-pulse rounded-md bg-raised" />;
};

export function AutopilotPanel() {
  const [script, setScript] = useState('');
  const [autonomy, setAuto] = useState<Autonomy>('checkpoints');
  const [project, setProject] = useState('Untitled film');
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [textModel, setTextModel] = useState('claude-opus-5-5');
  const [imageProvider, setImageProvider] = useState<ProviderId>('openai');
  const [imageModel, setImageModel] = useState('');
  const [budget, setBudget] = useState('10');
  const [err, setErr] = useState('');
  const run = useLiveQuery(() => db.runs.orderBy('createdAt').filter((r) => r.kind === 'autopilot').last(), []);

  return (
    <section className="mt-4 grid gap-3" aria-label="Autopilot">
      {!run || ['completed', 'cancelled', 'failed'].includes(run.state) ? (
        <form className="grid gap-2" onSubmit={async (e) => {
          e.preventDefault();
          try { setErr(''); await startAutopilot({ project, script, autonomy, textProvider: provider, textModel, imageProvider, imageModel, budgetUsd: Number(budget) || 0 }); }
          catch (x) { setErr((x as Error).message); }
        }}>
          <label className="grid gap-1">Script or idea<textarea value={script} onChange={(e) => setScript(e.target.value)} rows={6} required className="rounded-md border border-line bg-surface px-2 py-1" /></label>
          <label className="grid gap-1">Import .txt, .md, .fountain or .docx
            <input type="file" accept=".txt,.md,.fountain,.docx" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setScript(await importScriptFile(f)); } catch (x) { setErr((x as Error).message); } } }} />
          </label>
          <label className="grid gap-1">Autonomy
            <select aria-label="Autonomy" value={autonomy} onChange={(e) => setAuto(e.target.value as Autonomy)} className="rounded-md border border-line bg-surface px-2 py-1">
              {AUTONOMY_LEVELS.map((l) => <option key={l} value={l}>{AUTONOMY_LABEL[l]}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">Project<input value={project} onChange={(e) => setProject(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
            <label className="grid gap-1">Budget cap (USD)<input value={budget} onChange={(e) => setBudget(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
            <label className="grid gap-1">Analysis provider
              <select aria-label="Analysis provider" value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)} className="rounded-md border border-line bg-surface px-2 py-1"><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="custom">Custom endpoint</option></select>
            </label>
            <label className="grid gap-1">Analysis model<input value={textModel} onChange={(e) => setTextModel(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
            <label className="grid gap-1">Image provider
              <select aria-label="Image provider" value={imageProvider} onChange={(e) => setImageProvider(e.target.value as ProviderId)} className="rounded-md border border-line bg-surface px-2 py-1"><option value="openai">OpenAI</option><option value="custom">Custom endpoint</option></select>
            </label>
            <label className="grid gap-1">Image model<input value={imageModel} onChange={(e) => setImageModel(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
          </div>
          <p className="text-muted">Runs only while Chrome is open. Cost estimates are approximate; the budget cap stops the run.</p>
          {err && <p role="alert" className="text-danger">{err}</p>}
          <button className="w-fit rounded-md bg-accent px-3 py-1.5 text-accent-ink">Analyse script</button>
        </form>
      ) : <RunView run={run} />}
    </section>
  );
}

function RunView({ run }: { run: RunRow }) {
  const analysis = useLiveQuery(() => db.analyses.get(run.id), [run.id]);
  const jobs = useLiveQuery(() => db.jobs.where('runId').equals(run.id).toArray(), [run.id]) ?? [];
  const versions = useLiveQuery(() => db.characterVersions.toArray(), []) ?? [];
  const locVersions = useLiveQuery(() => db.locationVersions.toArray(), []) ?? [];
  const gate = gateFor(run);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const entities = gate === 'characters' ? analysis?.analysis.characters.map((c) => c.name) : analysis?.analysis.locations.map((l) => l.name);
  const wanted = gate === 'characters' ? 'portrait' : 'plate';
  const candidates = (name: string) => jobs.filter((j) => j.state === 'succeeded' && (j.input as { purpose: string; entity: string }).purpose === wanted && (j.input as { entity: string }).entity === name)
    .map((j) => ((j.result as { assetIds: string[] }).assetIds)[0] as string);

  return (
    <div className="grid gap-2" data-testid="autopilot-run">
      <div className="flex items-center justify-between">
        <strong>{run.name}</strong>
        <span data-testid="ap-state" className="font-mono text-[11px]">{run.state}{run.stage ? ` / ${run.stage}` : ''}</span>
      </div>
      <label className="grid gap-1">Autonomy
        <select aria-label="Autonomy" value={run.autonomy} onChange={(e) => void setAutonomy(run.id, e.target.value as Autonomy)} className="rounded-md border border-line bg-surface px-2 py-1">
          {AUTONOMY_LEVELS.map((l) => <option key={l} value={l}>{AUTONOMY_LABEL[l]}</option>)}
        </select>
      </label>
      {run.state === 'paused' && <p role="status" className="text-warn">Paused: {run.pausedReason}. <button className="underline" onClick={() => void resumeRun(run.id)}>Resume</button></p>}
      {analysis && (
        <p className="text-muted" data-testid="analysis-summary">
          {analysis.analysis.characters.length} character(s), {analysis.analysis.locations.length} location(s), {analysis.analysis.scenes.length} scene(s). Coverage {analysis.analysis.coverage.covered} of {analysis.analysis.coverage.expected} scenes{analysis.analysis.coverage.complete ? '' : `, missing ${analysis.analysis.coverage.missing.join(', ')}`}.
        </p>
      )}
      {gate && entities && (
        <form className="grid gap-3" aria-label={`Approve ${gate}`} onSubmit={(e) => { e.preventDefault(); void approve(run.id, gate, Object.fromEntries(entities.map((n) => [n, picks[n] ?? candidates(n)[0] ?? '']).filter(([, v]) => v))); }}>
          <h3 className="font-semibold">{gate === 'characters' ? 'Approve characters' : 'Approve locations'}</h3>
          {entities.map((n) => (
            <fieldset key={n} className="rounded-lg border border-line p-2" data-testid={`gate-${n}`}>
              <legend className="px-1">{n}</legend>
              <div className="flex gap-2">
                {candidates(n).map((id, i) => (
                  <label key={id} className="grid justify-items-center gap-1">
                    <Thumb id={id} label={`${n} option ${i + 1}`} />
                    <input type="radio" name={`pick-${n}`} checked={(picks[n] ?? candidates(n)[0]) === id} onChange={() => setPicks((p) => ({ ...p, [n]: id }))} aria-label={`${n} option ${i + 1}`} />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button className="w-fit rounded-md bg-accent px-3 py-1.5 text-accent-ink">Approve and lock</button>
        </form>
      )}
      {(versions.length > 0 || locVersions.length > 0) && run.stage !== 'characters' && (
        <p className="text-muted" data-testid="locks">Locked: {versions.map((v) => v.versionId).join(', ')}{locVersions.length ? `; ${locVersions.map((v) => v.versionId).join(', ')}` : ''}</p>
      )}
      <ul className="text-muted" aria-label="Decision log">{run.decisions?.map((d, i) => <li key={i}>{d.text}</li>)}</ul>
      <p className="text-muted">{jobs.filter((j) => j.state === 'succeeded').length} of {jobs.length} image jobs done.</p>
    </div>
  );
}
