import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AUTONOMY_LEVELS, type Autonomy, type ProviderId } from '@frameloom/shared';
import { db, type RunRow } from '../db/db';
import { approve, gateFor, setAutonomy, startAutopilot } from '../autopilot/pipeline';
import { approvePilot } from '../autopilot/shots';
import { ShotGrid } from './ShotGrid';
import type { RunSettings } from '../db/db';
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
  const [mode, setMode] = useState<RunSettings['mode']>('draft_upscale');
  const [videoModel, setVideoModel] = useState('');
  const [upscaleModel, setUpscaleModel] = useState('');
  const [strict, setStrict] = useState(false);
  const [strength, setStrength] = useState<RunSettings['refineStrength']>('standard');
  const [score, setScore] = useState(false);
  const [pVid, setPVid] = useState('');
  const [pUp, setPUp] = useState('');
  const [err, setErr] = useState('');
  const [dismissed, setDismissed] = useState<string>();
  const run = useLiveQuery(() => db.runs.orderBy('createdAt').filter((r) => r.kind === 'autopilot').last(), []);

  return (
    <section className="mt-4 grid gap-3" aria-label="Autopilot">
      {!run || run.id === dismissed || ['cancelled', 'failed'].includes(run.state) ? (
        <form className="grid gap-2" onSubmit={async (e) => {
          e.preventDefault();
          try { setErr(''); await startAutopilot({ project, script, autonomy, textProvider: provider, textModel, imageProvider, imageModel, budgetUsd: Number(budget) || 0,
            settings: { mode, videoModel, upscaleModel, strictOrder: strict, refineStrength: strength, score, priceVideoPerSec: Number(pVid) || 0, priceUpscale: Number(pUp) || 0, directorModel: textModel } }); }
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
          <fieldset className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2">
            <legend className="px-1">Production</legend>
            <label className="grid gap-1">Video mode
              <select aria-label="Video mode" value={mode} onChange={(e) => setMode(e.target.value as RunSettings['mode'])} className="rounded-md border border-line bg-surface px-2 py-1"><option value="draft_upscale">Draft at 360p, then upscale to 720p</option><option value="native">Generate directly at 720p</option></select>
            </label>
            <label className="grid gap-1">Prompt refinement
              <select aria-label="Prompt refinement" value={strength} onChange={(e) => setStrength(e.target.value as RunSettings['refineStrength'])} className="rounded-md border border-line bg-surface px-2 py-1"><option value="off">Off</option><option value="light">Light polish</option><option value="standard">Standard</option><option value="full">Full rewrite</option></select>
            </label>
            <label className="grid gap-1">Video model (fal.ai)<input value={videoModel} onChange={(e) => setVideoModel(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
            <label className="grid gap-1">Upscale model<input value={upscaleModel} onChange={(e) => setUpscaleModel(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
            <label className="grid gap-1">Video price per second (USD)<input value={pVid} onChange={(e) => setPVid(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
            <label className="grid gap-1">Upscale price per clip (USD)<input value={pUp} onChange={(e) => setPUp(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />Strict download order</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={score} onChange={(e) => setScore(e.target.checked)} />Score keyframes (uses analysis key)</label>
            <p className="col-span-2 text-muted">{mode === 'draft_upscale' ? 'Upscaling cannot add real detail; it enlarges the draft. It costs less than native 720p but the result is softer.' : 'Native generation costs more per clip and keeps real detail.'}</p>
          </fieldset>
          <p className="text-muted">Runs only while Chrome is open. Cost estimates are approximate; the budget cap stops the run.</p>
          {err && <p role="alert" className="text-danger">{err}</p>}
          <button className="w-fit rounded-md bg-accent px-3 py-1.5 text-accent-ink">Analyse script</button>
        </form>
      ) : <><RunView run={run} />{run.state === 'completed' && <button className="w-fit rounded-md border border-line px-3 py-1" onClick={() => setDismissed(run.id)}>Start another</button>}</>}
    </section>
  );
}

function RunView({ run }: { run: RunRow }) {
  const analysis = useLiveQuery(() => db.analyses.get(run.id), [run.id]);
  const jobs = useLiveQuery(() => db.jobs.where('runId').equals(run.id).toArray(), [run.id]) ?? [];
  const versions = useLiveQuery(() => db.characterVersions.toArray(), []) ?? [];
  const locVersions = useLiveQuery(() => db.locationVersions.toArray(), []) ?? [];
  const gate = gateFor(run);
  const shotRows = useLiveQuery(() => db.shots.where('runId').equals(run.id).sortBy('seq'), [run.id]) ?? [];
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
      {gate === 'pilot_scene' && (
        <div className="grid gap-2" data-testid="pilot-gate">
          <h3 className="font-semibold">Approve the pilot scene</h3>
          <p className="text-muted">These are the keyframes for the first scene. Approve them to generate the rest. Open a shot below to regenerate or edit it.</p>
          <button className="w-fit rounded-md bg-accent px-3 py-1.5 text-accent-ink" onClick={() => void approvePilot(run.id)}>Approve pilot scene</button>
        </div>
      )}
      {gate && gate !== 'pilot_scene' && entities && (
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
      {shotRows.length === 0 && <p className="text-muted">{jobs.filter((j) => j.state === 'succeeded').length} of {jobs.length} jobs done.</p>}
      <ShotGrid run={run} />
      {run.state === 'completed' && !!run.report && <RunReport report={run.report as { succeeded: number; flagged: Array<{ seq: number; reason: string }>; skipped: number; retries: number; costUsd: number }} runId={run.id} />}
    </div>
  );
}

function RunReport({ report, runId }: { report: { succeeded: number; flagged: Array<{ seq: number; reason: string }>; skipped: number; retries: number; costUsd: number }; runId: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-line bg-surface p-3" data-testid="report">
      <h3 className="font-semibold">Run report</h3>
      <p>{report.succeeded} shot(s) delivered, {report.flagged.length} flagged, {report.skipped} skipped, {report.retries} retries. Estimated spend ${report.costUsd.toFixed(2)}.</p>
      {report.flagged.map((f) => <p key={f.seq} className="text-danger">Shot {f.seq}: {f.reason}</p>)}
      {report.flagged.length > 0 && <button className="w-fit rounded-md border border-line px-3 py-1" onClick={async () => { for (const f of report.flagged) { const { regenerateShot } = await import('../autopilot/shots'); await regenerateShot(runId, f.seq); } }}>Re-run flagged shots</button>}
    </div>
  );
}
