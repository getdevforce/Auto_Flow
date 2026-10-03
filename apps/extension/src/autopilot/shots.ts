import {
  autoPick, buildConcatList, buildManifest, buildReport, compilePrompt, createProvider, decideFailure, needsApproval, planShots, probeMp4,
  releasable, renderName, scoreEnvironment, scoreIdentity, reduce, type CharacterVersion, type ErrorKind, type Job, type LocationVersion,
  type ManifestShot, type ProviderId, type RunEvent, type Shot, type ScriptAnalysis,
} from '@frameloom/shared';
import { splitScenes } from '@frameloom/shared';
import { db, type RunRow, type RunSettings, type ShotRow } from '../db/db';
import { blobUrlFor } from '../background/offscreen';
import type { ImageJobInput, UpscaleJobInput, VideoJobInput } from '../background/executor';
import { directorRefine, textProvider } from './director';

const PIPELINE_CAPS = { maxReferenceImages: 4, ratios: [] as string[], durationsSec: [] as number[], resolutions: [] as string[], firstLastFrame: false, identityTraining: false, lipSync: false, upscaleFactors: [] as number[] };

async function log(runId: string, text: string) {
  const r = (await db.runs.get(runId))!;
  await db.runs.update(runId, { decisions: [...(r.decisions ?? []), { at: Date.now(), text }] });
}
async function send(runId: string, type: RunEvent['type'], key: string) {
  const run = (await db.runs.get(runId))!;
  const machine = reduce(run.machine!, { id: `${runId}:${key}`, type } as RunEvent);
  await db.runs.update(runId, { machine, state: machine.state });
}

const open = (j?: Job) => !j || j.state === 'queued' || j.state === 'running' || j.state === 'polling';
const done = (s: ShotRow) => s.status === 'done' || s.status === 'flagged' || s.status === 'skipped';

async function ensureJob(run: RunRow, id: string, kind: Job['kind'], provider: string, model: string, seq: number, estimateUsd: number, input: unknown): Promise<void> {
  if (await db.jobs.get(id)) return; // idempotent: resuming never creates (and pays for) a duplicate
  await db.jobs.put({ id, runId: run.id, kind, provider, model, input, state: 'queued', seq, attempts: 0, maxAttempts: 3, nextAt: 0, estimateUsd });
}

async function versions(): Promise<{ chars: Map<string, CharacterVersion>; locs: Map<string, LocationVersion> }> {
  const chars = new Map<string, CharacterVersion>();
  for (const v of await db.characterVersions.toArray()) { const cur = chars.get(v.name); if (!cur || v.version > cur.version) chars.set(v.name, v); }
  const locs = new Map<string, LocationVersion>();
  for (const v of await db.locationVersions.toArray()) { const cur = locs.get(v.name); if (!cur || v.version > cur.version) locs.set(v.name, v); }
  return { chars, locs };
}

async function bytesOf(assetId: string) {
  const a = await db.assets.get(assetId);
  return a ? { bytes: new Uint8Array(await a.blob.arrayBuffer()), mime: a.mime } : undefined;
}

async function compileKeyframe(run: RunRow, shot: ShotRow, prompt: string) {
  const { chars, locs } = await versions();
  const plan = shot.plan;
  return compilePrompt({
    description: prompt, size: plan.size,
    characters: plan.characters.map((n) => chars.get(n)).filter((c): c is CharacterVersion => !!c),
    location: locs.get(plan.location), caps: PIPELINE_CAPS, ratio: run.settings!.ratio, maxPromptChars: 900,
  });
}

async function startKeyframe(run: RunRow, shot: ShotRow): Promise<void> {
  const s = run.settings!;
  const compiled = await compileKeyframe(run, shot, shot.refined ?? shot.original ?? shot.plan.action);
  const n = shot.kfAttempt + 1;
  const input: ImageJobInput = {
    providerId: run.imageProvider as ProviderId, prompt: compiled.prompt, negative: [shot.negative, compiled.negativePrompt].filter(Boolean).join(', ') || undefined,
    count: 1, download: false, purpose: 'keyframe', referenceAssetIds: compiled.references.map((r) => r.assetId),
  };
  await ensureJob(run, `${run.id}:kf:${shot.seq}:${n}`, 'image', run.imageProvider!, run.imageModel!, shot.seq, s.priceKeyframe, input);
  await db.shots.update(shot.id, { kfAttempt: n, status: 'keyframe' });
}

async function startVideo(run: RunRow, shot: ShotRow): Promise<void> {
  const s = run.settings!;
  const draft = s.mode === 'draft_upscale';
  const n = shot.videoAttempt + 1;
  const model = shot.videoModel ?? s.videoModel;
  const prompt = [shot.refined ?? shot.plan.action, shot.plan.movement && `Camera: ${shot.plan.movement}`].filter(Boolean).join('. ');
  const input: VideoJobInput = {
    providerId: s.videoProvider as ProviderId, model, prompt, negative: shot.negative, ratio: s.ratio, durationSec: shot.plan.durationSec,
    firstFrameAssetId: shot.kfAssetId, label: `shot ${shot.seq}`,
  };
  void draft;
  await ensureJob(run, `${run.id}:vid:${shot.seq}:${n}`, 'video', s.videoProvider, model, shot.seq, s.priceVideoPerSec * shot.plan.durationSec, input);
  await db.shots.update(shot.id, { videoAttempt: n, status: 'generating', videoModel: model });
}

async function suggestRewrite(run: RunRow, shot: ShotRow, reason: string): Promise<string | undefined> {
  try {
    const p = await textProvider(run.textProvider as ProviderId);
    return await p.complete({
      model: run.settings!.directorModel, maxTokens: 300, temperature: 0.3,
      prompt: `A video provider declined this shot description: "${shot.refined ?? shot.plan.action}". Reason: ${reason}\nRewrite it in clearer, less ambiguous wording that keeps the same story intent and characters. Do not try to hide the content from moderation; if the content itself is the problem, say so in one sentence instead. Reply with the rewrite only.`,
    });
  } catch { return undefined; }
}

async function fail(run: RunRow, shot: ShotRow, stage: 'keyframe' | 'video' | 'upscale', job: Job): Promise<boolean> {
  const s = run.settings!;
  const kind: ErrorKind = job.error?.kind ?? 'unknown';
  const decision = decideFailure({
    kind, attempts: job.attempts - 1, variantTried: shot.variantTried, fallbackChain: s.fallbackModels,
    fallbacksTried: shot.fallbacksTried, fallbackEnabled: s.fallbackEnabled && stage === 'video', message: job.error?.message ?? 'Unknown error',
  });
  await db.shots.update(shot.id, { retries: shot.retries + 1 });
  const fresh = (await db.shots.get(shot.id))!;
  if (decision.action === 'retry') {
    if (stage === 'keyframe') { await startKeyframe(run, fresh); } else if (stage === 'video') await startVideo(run, fresh); else await startUpscale(run, fresh);
  } else if (decision.action === 'retry_variant') {
    const plain = fresh.original ?? fresh.plan.action;
    await db.shots.update(shot.id, { variantTried: true, refined: plain, rationale: 'Retried with the original wording after the refined prompt failed.' });
    const next = (await db.shots.get(shot.id))!;
    if (stage === 'keyframe') await startKeyframe(run, next); else if (stage === 'video') await startVideo(run, next); else await startUpscale(run, next);
    await log(run.id, `Shot ${shot.seq}: retrying with a plainer prompt after ${kind}.`);
  } else if (decision.action === 'fallback_model') {
    await db.shots.update(shot.id, { fallbacksTried: [...fresh.fallbacksTried, decision.model], videoModel: decision.model });
    await startVideo(run, (await db.shots.get(shot.id))!);
    await log(run.id, `Shot ${shot.seq}: switched to fallback model ${decision.model}.`);
  } else {
    const suggestion = kind === 'policy_rejected' ? await suggestRewrite(run, fresh, decision.reason) : undefined;
    const reason = kind === 'transient' || kind === 'rate_limited' ? `Kept failing after ${fresh.retries} retries: ${decision.reason.replace(/\s*Retrying\.?$/, '')}` : decision.reason;
    await db.shots.update(shot.id, { status: 'flagged', flagReason: reason, suggestedRewrite: suggestion });
    await log(run.id, `Shot ${shot.seq} flagged: ${reason}`);
  }
  return true;
}

async function scoreKeyframe(run: RunRow, shot: ShotRow, assetId: string): Promise<number | undefined> {
  const s = run.settings!;
  if (!s.score) return undefined;
  try {
    const p = await textProvider(run.textProvider as ProviderId);
    const { chars, locs } = await versions();
    const cand = await bytesOf(assetId);
    if (!cand) return undefined;
    const scores: number[] = [];
    for (const name of shot.plan.characters.slice(0, 1)) {
      const refs = (await Promise.all((chars.get(name)?.refs ?? []).slice(0, 3).map((r) => bytesOf(r.assetId)))).filter((x): x is NonNullable<typeof x> => !!x);
      if (refs.length) scores.push((await scoreIdentity(p, s.checkModel, refs, cand, name)).score);
    }
    const plate = locs.get(shot.plan.location)?.plates[0];
    const plateBytes = plate ? await bytesOf(plate.assetId) : undefined;
    if (plateBytes) scores.push((await scoreEnvironment(p, s.checkModel, plateBytes, cand)).score);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
  } catch { return undefined; }
}

async function startUpscale(run: RunRow, shot: ShotRow): Promise<void> {
  const s = run.settings!;
  const n = shot.upAttempt + 1;
  const input: UpscaleJobInput = { providerId: s.upscaleProvider as ProviderId, model: s.upscaleModel, assetId: shot.draftAssetId!, factor: Math.max(1, Math.round(s.targetHeight / Number(s.draftRes.replace(/\D/g, '') || 360))), label: `shot ${shot.seq}` };
  await ensureJob(run, `${run.id}:up:${shot.seq}:${n}`, 'upscale', s.upscaleProvider, s.upscaleModel, shot.seq, s.priceUpscale, input);
  await db.shots.update(shot.id, { upAttempt: n, status: 'upscaling' });
}

/** One pass over a single shot. Returns true if it changed something. */
async function advance(run: RunRow, shot: ShotRow, phase: 'keyframes' | 'video'): Promise<boolean> {
  const s = run.settings!;
  if (phase === 'keyframes') {
    if (shot.status === 'planned') {
      const raw = shot.plan.action + (shot.plan.dialogue.length ? ` ${shot.plan.dialogue.map((d) => `${d.speaker} says "${d.line}"`).join(' ')}` : '');
      let refined = raw;
      let negative = '';
      let rationale = 'Refinement is off.';
      if (s.refineStrength !== 'off') {
        try {
          const { result } = await directorRefine({
            raw, strength: s.refineStrength, providerId: run.textProvider as ProviderId, model: s.directorModel, critiqueModel: s.checkModel,
            targetProvider: s.videoProvider, targetModel: s.videoModel, kind: 'video', cinema: { lens: shot.plan.lens, movement: shot.plan.movement },
            pinned: [], characters: shot.plan.characters,
          });
          refined = result.refined; negative = result.negative; rationale = result.rationale;
        } catch { rationale = 'Refinement failed; using the plan text.'; }
      }
      await db.shots.update(shot.id, { original: raw, refined, negative, rationale, status: 'refined' });
      return true;
    }
    if (shot.status === 'refined') { await startKeyframe(run, shot); return true; }
    if (shot.status === 'keyframe') {
      const job = await db.jobs.get(`${run.id}:kf:${shot.seq}:${shot.kfAttempt}`);
      if (open(job)) return false;
      if (job!.state === 'failed') return fail(run, shot, 'keyframe', job!);
      const assetId = ((job!.result as { assetIds: string[] }).assetIds)[0] as string;
      const score = await scoreKeyframe(run, shot, assetId);
      const assets = [...(shot.kfAssets ?? []), assetId];
      const scores = score === undefined ? shot.kfScores : [...shot.kfScores, score];
      if (score !== undefined && score < s.keyframeThreshold && shot.kfAttempt < s.keyframeAttempts) {
        await db.shots.update(shot.id, { kfAssets: assets, kfScores: scores });
        await startKeyframe(run, (await db.shots.get(shot.id))!);
        await log(run.id, `Shot ${shot.seq}: keyframe scored ${score.toFixed(2)} (heuristic), below ${s.keyframeThreshold}; trying again.`);
        return true;
      }
      const pick = autoPick(assets.map((id, i) => ({ id, score: scores.length === assets.length ? scores[i] : undefined })));
      const best = pick?.id ?? assetId;
      const bestScore = scores.length === assets.length ? Math.max(...scores) : score;
      const flagged = bestScore !== undefined && bestScore < s.keyframeThreshold;
      await db.shots.update(shot.id, { kfAssets: assets, kfScores: scores, kfAssetId: best, kfBestScore: bestScore, kfFlagged: flagged, status: 'kf_locked' });
      if (flagged) await log(run.id, `Shot ${shot.seq}: kept the best keyframe (score ${bestScore!.toFixed(2)}, heuristic) but it is below the threshold. Check it.`);
      return true;
    }
    return false;
  }

  // video phase
  if (shot.status === 'kf_locked') { await startVideo(run, shot); return true; }
  if (shot.status === 'generating') {
    const job = await db.jobs.get(`${run.id}:vid:${shot.seq}:${shot.videoAttempt}`);
    if (open(job)) return false;
    if (job!.state === 'failed') return fail(run, shot, 'video', job!);
    const assetId = ((job!.result as { assetIds: string[] }).assetIds)[0] as string;
    const cost = shot.costUsd + (job!.costUsd ?? 0);
    if (s.mode === 'draft_upscale') {
      await db.shots.update(shot.id, { draftAssetId: assetId, costUsd: cost });
      await startUpscale(run, (await db.shots.get(shot.id))!);
    } else {
      const info = probeMp4((await bytesOf(assetId))!.bytes);
      await db.shots.update(shot.id, { finalAssetId: assetId, costUsd: cost, status: 'finalising', width: info?.width, height: info?.height, durationSec: info?.durationSec });
    }
    return true;
  }
  if (shot.status === 'upscaling') {
    const job = await db.jobs.get(`${run.id}:up:${shot.seq}:${shot.upAttempt}`);
    if (open(job)) return false;
    if (job!.state === 'failed') {
      if (shot.upAttempt >= 2) return keepDraft(shot, `Upscale failed (${job!.error?.message}); kept the draft file.`, run.id);
      return fail(run, shot, 'upscale', job!);
    }
    const assetId = ((job!.result as { assetIds: string[] }).assetIds)[0] as string;
    const cost = shot.costUsd + (job!.costUsd ?? 0);
    const info = probeMp4((await bytesOf(assetId))!.bytes);
    const draftInfo = shot.draftAssetId ? probeMp4((await bytesOf(shot.draftAssetId))!.bytes) : null;
    const dimsOk = info && info.width === s.targetWidth && info.height === s.targetHeight;
    const durOk = info && draftInfo ? Math.abs(info.durationSec - draftInfo.durationSec) <= 0.5 : !!info;
    if (dimsOk && durOk) {
      await db.shots.update(shot.id, { finalAssetId: assetId, costUsd: cost, status: 'finalising', width: info!.width, height: info!.height, durationSec: info!.durationSec });
      return true;
    }
    await db.shots.update(shot.id, { costUsd: cost });
    if (shot.upAttempt < 2) { await startUpscale(run, (await db.shots.get(shot.id))!); await log(run.id, `Shot ${shot.seq}: upscale result was ${info ? `${info.width}x${info.height}` : 'unreadable'}, expected ${s.targetWidth}x${s.targetHeight}. Retrying once.`); return true; }
    return keepDraft((await db.shots.get(shot.id))!, `Upscale returned the wrong size twice; kept the ${s.draftRes} draft.`, run.id);
  }
  if (shot.status === 'finalising') { await db.shots.update(shot.id, { status: 'downloading' }); return true; }
  return false;
}

async function keepDraft(shot: ShotRow, reason: string, runId: string): Promise<boolean> {
  const info = shot.draftAssetId ? probeMp4((await bytesOf(shot.draftAssetId))!.bytes) : null;
  await db.shots.update(shot.id, { finalAssetId: shot.draftAssetId, flagReason: reason, status: 'downloading', width: info?.width, height: info?.height, durationSec: info?.durationSec });
  await log(runId, `Shot ${shot.seq}: ${reason}`);
  return true;
}

function manifestOf(shots: ShotRow[]): ManifestShot[] {
  return shots.map((s) => ({
    seq: s.seq, sceneIndex: s.plan.sceneIndex, shotIndex: s.plan.shotIndex, status: (s.status === 'done' ? 'done' : s.status === 'flagged' ? 'flagged' : s.status === 'skipped' ? 'skipped' : 'generating') as ManifestShot['status'],
    file: s.file, prompt: s.refined, originalPrompt: s.original, negativePrompt: s.negative, rationale: s.rationale,
    scores: s.kfBestScore !== undefined ? { identity: s.kfBestScore, heuristic: true } : undefined,
    costUsd: s.costUsd, flagReason: s.flagReason, durationSec: s.durationSec, width: s.width, height: s.height,
  }));
}

async function downloadText(filename: string, text: string) {
  await chrome.downloads.download({ url: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`, filename, conflictAction: 'overwrite' });
}

/** Writes manifest.json and concat.txt next to the videos and keeps both current as the run progresses. */
export async function writeManifest(run: RunRow): Promise<void> {
  const shots = await db.shots.where('runId').equals(run.id).sortBy('seq');
  const m = manifestOf(shots);
  const dir = renderName('{project}', { project: run.project, seq: 0 }, 'x').replace(/\.x$/, '');
  const manifestText = JSON.stringify(buildManifest(run.project, run.settings!.mode, m), null, 2);
  const concatText = buildConcatList(m);
  await downloadText(`${dir}/manifest.json`, manifestText);
  await downloadText(`${dir}/concat.txt`, concatText);
  // Kept locally too so the UI can show what was written.
  await db.kv.put({ key: `manifest:${run.id}`, value: { manifest: manifestText, concat: concatText } });
}

/** Downloads finished shots in the order the run's settings allow, then refreshes manifest and concat list. */
export async function downloadPass(run: RunRow): Promise<boolean> {
  const shots = await db.shots.where('runId').equals(run.id).sortBy('seq');
  const ids = releasable(shots.map((s) => ({ seq: s.seq, status: (s.status === 'downloading' ? 'generating' : s.status) as ManifestShot['status'], downloaded: s.downloaded, ready: s.status === 'downloading' && !!s.finalAssetId })), run.settings!.strictOrder);
  let changed = false;
  for (const seq of ids) {
    const shot = shots.find((s) => s.seq === seq)!;
    const filename = renderName(run.nameTemplate, { project: run.project, seq, scene: shot.plan.sceneIndex, shot: shot.plan.shotIndex }, 'mp4');
    const url = (await blobUrlFor(shot.finalAssetId!)) ?? undefined;
    if (!url) throw new Error('Could not prepare the video for download.');
    await chrome.downloads.download({ url, filename, conflictAction: 'uniquify' });
    await db.shots.update(shot.id, { status: 'done', downloaded: true, file: filename, downloadedAt: Date.now() });
    changed = true;
  }
  if (changed) await writeManifest((await db.runs.get(run.id))!);
  return changed;
}

export function defaultSettings(over: Partial<RunSettings> = {}): RunSettings {
  return {
    mode: 'draft_upscale', videoProvider: 'fal', videoModel: '', upscaleProvider: 'fal', upscaleModel: '', ratio: '16:9', maxDurationSec: 10,
    draftRes: '360p', targetRes: '720p', targetWidth: 1280, targetHeight: 720, strictOrder: false, refineStrength: 'standard',
    fallbackEnabled: false, fallbackModels: [], keyframeThreshold: 0.6, keyframeAttempts: 3, score: false,
    priceKeyframe: 0, priceVideoPerSec: 0, priceUpscale: 0, directorModel: 'claude-opus-5-5', checkModel: 'claude-haiku-4-5-20251001', ...over,
  };
}

/** S4 to S11 driver. Idempotent: every branch looks at what exists before creating anything. */
export async function driveProduction(runId: string): Promise<boolean> {
  const run = (await db.runs.get(runId))!;
  if (!run.settings || !run.machine) return false;
  const s = run.settings;
  const analysis = (await db.analyses.get(runId))?.analysis as ScriptAnalysis | undefined;
  if (!analysis) return false;
  let changed = false;

  if (run.stage === 'shot_planning' && run.machine.state === 'building') {
    if ((await db.shots.where('runId').equals(runId).count()) === 0) {
      const scenes = splitScenes(run.script!);
      const provider = await textProvider(run.textProvider as ProviderId);
      const plan: Shot[] = await planShots({
        provider, model: s.directorModel, analysis, maxDurationSec: s.maxDurationSec, allowedDurations: s.allowedDurations,
        sceneText: (i) => scenes.find((x) => x.index === i)?.text ?? '',
      });
      await db.shots.bulkPut(plan.map((p): ShotRow => ({
        id: `${runId}:${p.seq}`, runId, seq: p.seq, status: 'planned', plan: p, kfAttempt: 0, kfScores: [], videoAttempt: 0, upAttempt: 0, variantTried: false, fallbacksTried: [], costUsd: 0, retries: 0,
      })));
      await log(runId, `Planned ${plan.length} shot(s) across ${analysis.scenes.length} scene(s). Sequence numbers fixed 1 to ${plan.length}.`);
    }
    await db.runs.update(runId, { stage: 'keyframes', startedAt: run.startedAt ?? Date.now() });
    return true;
  }

  const fresh = (await db.runs.get(runId))!;
  const shots = await db.shots.where('runId').equals(runId).sortBy('seq');

  if (fresh.stage === 'keyframes' && fresh.machine!.state === 'building') {
    const firstScene = Math.min(...shots.map((x) => x.plan.sceneIndex));
    const gated = needsApproval(fresh.autonomy ?? 'checkpoints', 'pilot_scene') && !fresh.approvals?.pilot;
    for (const shot of shots) {
      if (gated && shot.plan.sceneIndex !== firstScene) continue; // hold everything after the pilot scene until approved
      if (await advance(fresh, shot, 'keyframes')) changed = true;
    }
    const after = await db.shots.where('runId').equals(runId).sortBy('seq');
    const pilot = after.filter((x) => x.plan.sceneIndex === firstScene);
    if (gated && pilot.every((x) => ['kf_locked', 'flagged', 'skipped'].includes(x.status))) {
      await send(runId, 'GATE_REQUIRED', 'gate-pilot');
      await db.runs.update(runId, { stage: 'pilot_scene' });
      return true;
    }
    if (after.every((x) => ['kf_locked', 'flagged', 'skipped'].includes(x.status))) {
      await db.runs.update(runId, { stage: 'video' });
      await send(runId, 'BUILD_DONE', 'production-start');
      return true;
    }
    return changed;
  }

  if (fresh.stage === 'pilot_scene' && fresh.machine!.state === 'building') {
    await db.runs.update(runId, { stage: 'keyframes' }); // approved: continue with the remaining scenes
    return true;
  }

  if (fresh.stage === 'video' && fresh.machine!.state === 'generating') {
    for (const shot of shots) if (await advance(fresh, shot, 'video')) changed = true;
    if (await downloadPass(fresh)) changed = true;
    const after = await db.shots.where('runId').equals(runId).toArray();
    if (after.every(done)) {
      await send(runId, 'GENERATION_DONE', 'generation-done');
      const m = manifestOf(after);
      const retries = after.reduce((t, x) => t + x.retries, 0);
      await db.runs.update(runId, { report: buildReport(m, retries, Date.now() - (fresh.startedAt ?? Date.now())), stage: 'finished' });
      await writeManifest((await db.runs.get(runId))!);
      await send(runId, 'FINISHED', 'finished');
      await log(runId, 'Run complete.');
      return true;
    }
  }
  return changed;
}

/** Shot actions from the progress UI. */
export async function skipShot(runId: string, seq: number) { await db.shots.update(`${runId}:${seq}`, { status: 'skipped', flagReason: 'Skipped by you.' }); await chrome.runtime.sendMessage({ type: 'wake' }); }

export async function regenerateShot(runId: string, seq: number, opts: { prompt?: string; model?: string; from?: 'keyframe' | 'video' } = {}) {
  const id = `${runId}:${seq}`;
  const shot = (await db.shots.get(id))!;
  const run = (await db.runs.get(runId))!;
  const patch: Partial<ShotRow> = { flagReason: undefined, suggestedRewrite: undefined, variantTried: false, fallbacksTried: [], downloaded: false, finalAssetId: undefined, draftAssetId: undefined, file: undefined };
  if (opts.prompt) { patch.refined = opts.prompt; patch.rationale = 'Prompt edited by you.'; }
  if (opts.model) patch.videoModel = opts.model;
  const fromVideo = (opts.from ?? (shot.kfAssetId ? 'video' : 'keyframe')) === 'video' && !!shot.kfAssetId;
  patch.status = fromVideo ? 'kf_locked' : 'refined';
  if (!fromVideo) { patch.kfAssets = []; patch.kfScores = []; patch.kfAssetId = undefined; }
  await db.shots.update(id, patch);
  // A finished run reopens at the right stage.
  if (['completed', 'finishing'].includes(run.state)) await db.runs.update(runId, { state: 'generating', stage: 'video', machine: { ...run.machine!, state: 'generating' } });
  await chrome.runtime.sendMessage({ type: 'wake' });
}

export async function approvePilot(runId: string) {
  await db.runs.update(runId, { approvals: { ...(await db.runs.get(runId))!.approvals, pilot: true } });
  const run = (await db.runs.get(runId))!;
  const machine = reduce(run.machine!, { id: `${runId}:approved-pilot`, type: 'APPROVED' });
  await db.runs.update(runId, { machine, state: machine.state });
  await chrome.runtime.sendMessage({ type: 'wake' });
}

// Re-exported for the UI's report view.
export { buildReport };
