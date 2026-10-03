import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type RunRow, type ShotRow } from '../db/db';
import { regenerateShot, skipShot } from '../autopilot/shots';
import { sendErrorReport } from '../feedback';

const LABEL: Record<string, string> = {
  planned: 'queued', refined: 'refining', keyframe: 'keyframe', kf_locked: 'keyframe', generating: 'generating', upscaling: 'upscaling',
  finalising: 'downloading', downloading: 'downloading', done: 'done', flagged: 'flagged', skipped: 'skipped',
};
const TONE: Record<string, string> = { done: 'text-ok', flagged: 'text-danger', skipped: 'text-muted' };

function useUrl(id?: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    if (id) db.assets.get(id).then((a) => { if (a) { u = URL.createObjectURL(a.blob); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url;
}

export function ProgressSummary({ run, shots }: { run: RunRow; shots: ShotRow[] }) {
  const doneN = shots.filter((s) => s.status === 'done').length;
  const settled = shots.filter((s) => ['done', 'flagged', 'skipped'].includes(s.status)).length;
  const spent = shots.reduce((t, s) => t + s.costUsd, 0);
  const elapsed = run.startedAt ? (Date.now() - run.startedAt) / 1000 : 0;
  const eta = settled > 0 && settled < shots.length ? Math.round((elapsed / settled) * (shots.length - settled)) : null;
  return (
    <div data-testid="progress">
      <progress className="w-full" value={settled} max={Math.max(shots.length, 1)} aria-label="Overall progress" />
      <p className="text-muted">
        {doneN} of {shots.length} shots done{shots.some((s) => s.status === 'flagged') ? `, ${shots.filter((s) => s.status === 'flagged').length} flagged` : ''}.
        {' '}Spent about ${spent.toFixed(2)}{run.budgetUsd ? ` of a $${run.budgetUsd.toFixed(2)} cap` : ''} (estimate).{eta !== null ? ` About ${eta}s left.` : ''}
      </p>
    </div>
  );
}

export function ShotGrid({ run }: { run: RunRow }) {
  const shots = useLiveQuery(() => db.shots.where('runId').equals(run.id).sortBy('seq'), [run.id]) ?? [];
  const [open, setOpen] = useState<number>();
  const scenes = [...new Set(shots.map((s) => s.plan.sceneIndex))];
  if (!shots.length) return null;
  return (
    <div className="grid gap-2" aria-label="Shots">
      <ProgressSummary run={run} shots={shots} />
      {scenes.map((sc) => (
        <div key={sc} className="grid gap-1">
          <h4 className="font-semibold">Scene {sc}</h4>
          <div className="flex flex-wrap gap-1">
            {shots.filter((s) => s.plan.sceneIndex === sc).map((s) => (
              <button key={s.id} data-testid={`shot-${s.seq}`} aria-label={`Shot ${s.seq}: ${LABEL[s.status] ?? s.status}`} onClick={() => setOpen(open === s.seq ? undefined : s.seq)}
                className={`rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px] ${TONE[s.status] ?? ''}`}>
                {String(s.seq).padStart(3, '0')} {LABEL[s.status] ?? s.status}
              </button>
            ))}
          </div>
        </div>
      ))}
      {open !== undefined && <ShotDetail run={run} shot={shots.find((s) => s.seq === open)!} />}
    </div>
  );
}

function ShotDetail({ run, shot }: { run: RunRow; shot: ShotRow }) {
  const kf = useUrl(shot.kfAssetId);
  const [prompt, setPrompt] = useState(shot.refined ?? '');
  const [model, setModel] = useState(shot.videoModel ?? '');
  const [reported, setReported] = useState(false);
  useEffect(() => { setPrompt(shot.refined ?? ''); }, [shot.refined, shot.seq]);
  return (
    <div className="grid gap-2 rounded-lg border border-line bg-surface p-3" data-testid="shot-detail">
      <div className="flex items-center justify-between"><strong>Shot {shot.seq}</strong><span className="font-mono text-[11px]">{LABEL[shot.status] ?? shot.status}</span></div>
      {kf && <img src={kf} alt={`Keyframe for shot ${shot.seq}`} className="h-24 w-40 rounded-md border border-line object-cover" />}
      <p className="text-muted">Plan: {shot.plan.size.replace('_', ' ')}, {shot.plan.durationSec}s{shot.plan.movement ? `, ${shot.plan.movement}` : ''}. {shot.plan.continuity && `Continuity: ${shot.plan.continuity}.`}</p>
      <p className="text-muted">Attempts: keyframe {shot.kfAttempt}, video {shot.videoAttempt}{shot.upAttempt ? `, upscale ${shot.upAttempt}` : ''}.
        {shot.kfScores.length > 0 && ` Keyframe scores (heuristic): ${shot.kfScores.map((x) => x.toFixed(2)).join(', ')}.`}</p>
      {shot.flagReason && <p role="status" className="text-danger">{shot.flagReason}</p>}
      {shot.status === 'flagged' && <button className="w-fit underline" onClick={async () => { const j = await db.jobs.where('runId').equals(run.id).filter((x) => x.seq === shot.seq && !!x.error).last(); try { await sendErrorReport({ error_code: j?.error?.kind ?? 'unknown', provider: j?.provider, model: j?.model, kind: j?.kind }); setReported(true); } catch { setReported(false); } }}>{reported ? 'Report sent' : 'Send an error report (codes only)'}</button>}
      {shot.suggestedRewrite && <p className="text-muted">Suggested rewrite: {shot.suggestedRewrite} <button className="underline" onClick={() => setPrompt(shot.suggestedRewrite!)}>Use it</button></p>}
      <label className="grid gap-1">Prompt<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
      {shot.rationale && <p className="text-muted">Why: {shot.rationale}</p>}
      <label className="grid gap-1">Video model<input value={model} onChange={(e) => setModel(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1" /></label>
      <div className="flex gap-2">
        <button className="rounded-md bg-accent px-3 py-1 text-accent-ink" onClick={() => void regenerateShot(run.id, shot.seq, { prompt: prompt !== shot.refined ? prompt : undefined, model: model !== shot.videoModel ? model : undefined })}>Regenerate</button>
        <button className="rounded-md border border-line px-3 py-1" onClick={() => void skipShot(run.id, shot.seq)}>Skip</button>
      </div>
    </div>
  );
}
