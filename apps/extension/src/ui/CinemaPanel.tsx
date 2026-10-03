import { useMemo, useState } from 'react';
import {
  ALL_BUNDLED_PRESETS, anglesPrompt, stylizePrompt, visiblePresets, wordDiff,
  type CinemaSettings, type Preset, type ProviderId, type RefineResult, type Strength,
} from '@frameloom/shared';
import { directorRefine } from '../autopilot/director';
import { runImageTool } from '../autopilot/tools';

const SIZES = ['', 'extreme_close', 'close', 'medium_close', 'medium', 'wide', 'extreme_wide'];
const field = 'rounded-md border border-line bg-surface px-2 py-1';

export function CinemaPanel() {
  const [cinema, setCinema] = useState<CinemaSettings>({});
  const [cameraId, setCameraId] = useState('');
  const [raw, setRaw] = useState('');
  const [strength, setStrength] = useState<Strength>('standard');
  const [pinned, setPinned] = useState('');
  const [textProv, setTextProv] = useState<ProviderId>('anthropic');
  const [textModel, setTextModel] = useState('claude-opus-5-5');
  const [critiqueModel, setCritiqueModel] = useState('claude-haiku-4-5-20251001');
  const [result, setResult] = useState<RefineResult>();
  const [accepted, setAccepted] = useState<string>();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Controls are shown only for what the chosen target can do; a video-only control is hidden for an image target.
  const [target, setTarget] = useState<'image' | 'video'>('video');
  const presets = useMemo(() => visiblePresets(ALL_BUNDLED_PRESETS, { video: target === 'video', image: true, lipSync: false, firstLastFrame: false }), [target]);
  const cameras = presets.filter((p) => p.kind === 'camera');
  const set = (k: keyof CinemaSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setCinema((c) => ({ ...c, [k]: e.target.value }));
  const effective: CinemaSettings = { ...cinema, movement: cameras.find((c) => c.id === cameraId)?.prompt ?? cinema.movement };

  async function refine() {
    setBusy(true); setErr(''); setAccepted(undefined);
    try {
      const { result } = await directorRefine({
        raw, strength, providerId: textProv, model: textModel, critiqueModel, targetProvider: 'custom', targetModel: 'generic', kind: target,
        cinema: effective, pinned: pinned.split('\n').map((s) => s.trim()).filter(Boolean), characters: [],
      });
      setResult(result);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const diff = result ? wordDiff(raw, result.refined) : [];
  return (
    <section className="mt-4 grid gap-3" aria-label="Cinema">
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">Target<select value={target} onChange={(e) => setTarget(e.target.value as 'image' | 'video')} className={field}><option value="video">Video</option><option value="image">Image</option></select></label>
        {target === 'video' && <label className="grid gap-1">Camera movement<select value={cameraId} onChange={(e) => setCameraId(e.target.value)} className={field}><option value="">None</option>{cameras.map((p: Preset) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className="grid gap-1">Shot size<select value={cinema.angle ?? ''} onChange={(e) => setCinema((c) => ({ ...c, angle: e.target.value }))} className={field}>{SIZES.map((s) => <option key={s} value={s}>{s ? s.replace('_', ' ') : 'Auto'}</option>)}</select></label>
        <label className="grid gap-1">Lens<input value={cinema.lens ?? ''} onChange={set('lens')} placeholder="35mm" className={field} /></label>
        <label className="grid gap-1">Depth of field<input value={cinema.depthOfField ?? ''} onChange={set('depthOfField')} placeholder="shallow depth of field" className={field} /></label>
        <label className="grid gap-1">Lighting<input value={cinema.lighting ?? ''} onChange={set('lighting')} placeholder="soft window light" className={field} /></label>
        <label className="grid gap-1">Colour grade<input value={cinema.grade ?? ''} onChange={set('grade')} placeholder="muted teal and orange" className={field} /></label>
        {target === 'video' && <label className="grid gap-1">Motion intensity<input value={cinema.motionIntensity ?? ''} onChange={set('motionIntensity')} placeholder="subtle" className={field} /></label>}
      </div>

      <h3 className="font-semibold">Prompt Director</h3>
      <label className="grid gap-1">Your prompt<textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} className={field} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">Strength<select value={strength} onChange={(e) => setStrength(e.target.value as Strength)} className={field}><option value="off">Off</option><option value="light">Light polish</option><option value="standard">Standard</option><option value="full">Full rewrite</option></select></label>
        <label className="grid gap-1">Director provider<select value={textProv} onChange={(e) => setTextProv(e.target.value as ProviderId)} className={field}><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="custom">Custom endpoint</option></select></label>
        <label className="grid gap-1">Director model<input value={textModel} onChange={(e) => setTextModel(e.target.value)} className={field} /></label>
        <label className="grid gap-1">Check model<input value={critiqueModel} onChange={(e) => setCritiqueModel(e.target.value)} className={field} /></label>
      </div>
      <label className="grid gap-1">Pin wording (one phrase per line, kept exactly)<textarea value={pinned} onChange={(e) => setPinned(e.target.value)} rows={2} className={field} /></label>
      {err && <p role="alert" className="text-danger">{err}</p>}
      <button disabled={busy || !raw.trim()} onClick={() => void refine()} className="w-fit rounded-md bg-accent px-3 py-1.5 text-accent-ink disabled:opacity-50">{busy ? 'Refining' : 'Refine prompt'}</button>

      {result && (
        <div className="grid gap-2 rounded-lg border border-line bg-surface p-3" data-testid="refinement">
          <p data-testid="diff">
            {diff.map((d, i) => d.kind === 'same' ? <span key={i}>{d.text} </span> : d.kind === 'add' ? <ins key={i} className="text-ok no-underline">{d.text} </ins> : <del key={i} className="text-danger">{d.text} </del>)}
          </p>
          <p className="text-muted">{result.rationale}{result.cached ? ' (from cache)' : ''}</p>
          {result.negative && <p className="text-muted">Negative: {result.negative}</p>}
          {result.revertedToRaw && <p role="status" className="text-warn">The rewrite kept losing parts of your prompt, so your wording is used.</p>}
          {accepted === undefined
            ? <div className="flex gap-2"><button className="rounded-md bg-accent px-3 py-1 text-accent-ink" onClick={() => setAccepted(result.refined)}>Accept</button><button className="rounded-md border border-line px-3 py-1" onClick={() => setAccepted(raw)}>Keep mine</button></div>
            : <label className="grid gap-1">Final prompt (edit freely)<textarea data-testid="final" value={accepted} onChange={(e) => setAccepted(e.target.value)} rows={4} className={field} /></label>}
        </div>
      )}
      <ImageTools />
    </section>
  );
}

function ImageTools() {
  const [file, setFile] = useState<File>();
  const [angle, setAngle] = useState('low angle looking up');
  const [styleId, setStyleId] = useState('sty_noir');
  const [intensity, setIntensity] = useState(0.5);
  const [prov, setProv] = useState<ProviderId>('openai');
  const [model, setModel] = useState('');
  const [msg, setMsg] = useState('');
  const styles = ALL_BUNDLED_PRESETS.filter((p) => p.kind === 'style');
  const run = async (tool: 'angles' | 'stylize') => {
    if (!file) return setMsg('Choose a still first.');
    const style = styles.find((s) => s.id === styleId)!;
    try {
      setMsg('Working');
      const id = await runImageTool({ file, providerId: prov, model, prompt: tool === 'angles' ? anglesPrompt(angle) : stylizePrompt(style, intensity) });
      setMsg(`Saved result ${id}. It is in your library.`);
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="grid gap-2 rounded-lg border border-line p-3" aria-label="Image tools">
      <h3 className="font-semibold">Angles and Stylize</h3>
      <p className="text-muted">These need an image provider that accepts reference images. Results can differ from the original; check the face and setting.</p>
      <label className="grid gap-1">Still<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0])} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">Image provider<select value={prov} onChange={(e) => setProv(e.target.value as ProviderId)} className={field}><option value="openai">OpenAI</option><option value="custom">Custom endpoint</option></select></label>
        <label className="grid gap-1">Image model<input value={model} onChange={(e) => setModel(e.target.value)} className={field} /></label>
        <label className="grid gap-1">New camera angle<input value={angle} onChange={(e) => setAngle(e.target.value)} className={field} /></label>
        <label className="grid gap-1">Style<select value={styleId} onChange={(e) => setStyleId(e.target.value)} className={field}>{styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="col-span-2 grid gap-1">Intensity {Math.round(intensity * 100)}%<input type="range" min={0} max={1} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} /></label>
      </div>
      <div className="flex gap-2"><button className="rounded-md border border-line px-3 py-1" onClick={() => void run('angles')}>Re-render from angle</button><button className="rounded-md border border-line px-3 py-1" onClick={() => void run('stylize')}>Apply style</button></div>
      {msg && <p role="status" className="text-muted" data-testid="tool-msg">{msg}</p>}
    </div>
  );
}
