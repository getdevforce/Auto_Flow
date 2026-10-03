import {
  checkCharacters, checkStartRun, analyseScript, autoPick, createProvider, lockCharacter, lockLocation, needsApproval, newRun, platePrompts, portraitPrompt,
  reduce, sheetPrompt, SHEET_VIEWS, type AnalysedCharacter, type CharacterDraft, type Job, type LocationDraft, type ProviderId,
  type RunEvent, type RefView, type TextProvider,
} from '@frameloom/shared';
import { db, type RunRow } from '../db/db';
import { loadKey } from '../keys';
import { vault } from '../services';
import { CachingTextProvider } from './llm-cache';
import { track } from '../telemetry';
import { assertSupported } from '../config-store';
import { getEntitlements, refreshEntitlements, usage } from '../entitlements';
import { defaultSettings, driveProduction } from './shots';
import type { RunSettings } from '../db/db';

export const CANDIDATES_PER_CHARACTER = 3;

export interface AutopilotStart {
  project: string; script: string; autonomy: RunRow['autonomy'];
  textProvider: ProviderId; textModel: string; imageProvider: ProviderId; imageModel: string; budgetUsd: number;
  settings?: Partial<RunSettings>;
}

const evId = (run: RunRow, name: string) => `${run.id}:${name}`;

/** Apply a state machine event once. Event ids make redelivery after a crash a no-op. */
async function send(runId: string, type: RunEvent['type'], key: string, extra: object = {}): Promise<RunRow> {
  const run = (await db.runs.get(runId))!;
  const machine = reduce(run.machine ?? newRun(), { id: evId(run, key), type, ...extra } as RunEvent);
  await db.runs.update(runId, { machine, state: machine.state, pausedReason: machine.pauseReason ?? undefined });
  return (await db.runs.get(runId))!;
}

async function log(runId: string, text: string): Promise<void> {
  const run = (await db.runs.get(runId))!;
  await db.runs.update(runId, { decisions: [...(run.decisions ?? []), { at: Date.now(), text }] });
}

export async function startAutopilot(s: AutopilotStart): Promise<string> {
  await assertSupported();
  const ent = await refreshEntitlements();
  const u = await usage();
  const verdict = checkStartRun(ent, { autonomy: s.autonomy ?? 'checkpoints', runsThisMonth: u.runsThisMonth, project: s.project, existingProjects: u.projects });
  if (!verdict.ok) throw new Error(verdict.message);
  const id = crypto.randomUUID();
  await db.runs.put({
    id, name: s.project, project: s.project, state: 'draft', budgetUsd: s.budgetUsd, nameTemplate: '{project}/{seq}_{scene}_{shot}',
    createdAt: Date.now(), kind: 'autopilot', stage: 'analysis', autonomy: s.autonomy, script: s.script, machine: newRun(),
    textProvider: s.textProvider, textModel: s.textModel, imageProvider: s.imageProvider, imageModel: s.imageModel, approvals: {}, decisions: [],
    settings: defaultSettings({ directorModel: s.textModel, ...s.settings }),
  });
  await send(id, 'START', 'start');
  track('autopilot_started', { autonomy: s.autonomy });
  await chrome.runtime.sendMessage({ type: 'wake' });
  return id;
}

export async function setAutonomy(runId: string, level: NonNullable<RunRow['autonomy']>): Promise<void> {
  await db.runs.update(runId, { autonomy: level });
  await log(runId, `Autonomy changed to ${level}.`);
  await chrome.runtime.sendMessage({ type: 'wake' });
}

async function textProviderFor(run: RunRow): Promise<TextProvider> {
  if (!vault.isUnlocked) await vault.unlock();
  const id = run.textProvider as ProviderId;
  const provider = createProvider(id, await loadKey(id), (u, i) => fetch(u, i));
  return new CachingTextProvider(provider as unknown as TextProvider);
}

/** Pending approvals the UI should show. */
export function gateFor(run: RunRow): 'characters' | 'locations' | 'pilot_scene' | null {
  if (run.state !== 'awaiting_approval') return null;
  return run.stage === 'characters' || run.stage === 'locations' || run.stage === 'pilot_scene' ? run.stage : null;
}

export async function approve(runId: string, gate: 'characters' | 'locations', picks: Record<string, string>): Promise<void> {
  const run = (await db.runs.get(runId))!;
  const approvals = { ...run.approvals, [gate]: picks };
  await db.runs.update(runId, { approvals });
  await send(runId, 'APPROVED', `approved-${gate}`);
  track('gate_approved', { gate, autonomy: run.autonomy });
  await chrome.runtime.sendMessage({ type: 'wake' });
}

async function addJobs(run: RunRow, jobs: Array<Omit<Job, 'runId' | 'state' | 'attempts' | 'maxAttempts' | 'nextAt'>>): Promise<void> {
  await db.transaction('rw', db.jobs, async () => {
    for (const j of jobs) {
      if (await db.jobs.get(j.id)) continue; // idempotent: a resumed driver never duplicates (and re-pays for) a job
      await db.jobs.put({ ...j, runId: run.id, state: 'queued', attempts: 0, maxAttempts: 3, nextAt: 0 });
    }
  });
}

const imageJob = (run: RunRow, id: string, seq: number, input: Record<string, unknown>) => ({
  id: `${run.id}:${id}`, kind: 'image' as const, provider: run.imageProvider as string, model: run.imageModel as string, seq, estimateUsd: 0,
  input: { providerId: run.imageProvider, count: 1, download: false, ...input },
});

const jobsFor = (runId: string, prefix: string) => db.jobs.where('runId').equals(runId).filter((j) => j.id.startsWith(`${runId}:${prefix}`)).toArray();
const allDone = (jobs: Array<{ state: string }>) => jobs.length > 0 && jobs.every((j) => j.state === 'succeeded' || j.state === 'failed');

/**
 * Advances one autopilot run as far as it can without a human. Every branch checks what already exists, so calling
 * it again after a crash or restart continues from the same point and never repeats finished work.
 * Returns true if it did something (so the caller loops again).
 */
export async function drive(runId: string): Promise<boolean> {
  let run = (await db.runs.get(runId))!;
  if (run.kind !== 'autopilot' || !run.machine) return false;
  const state = run.machine.state;
  if (state === 'generating') return driveProduction(runId);

  if (state === 'analysing') {
    const provider = await textProviderFor(run);
    const { analysis } = await analyseScript({ provider, model: run.textModel as string, script: run.script as string });
    await db.analyses.put({ runId, analysis });
    const chars = checkCharacters(await getEntitlements(), analysis.characters.length);
    if (!chars.ok) throw new Error(chars.message); // pauses the run with the plan message; the user can upgrade and resume
    await log(runId, `Analysis found ${analysis.characters.length} character(s), ${analysis.locations.length} location(s), ${analysis.scenes.length} scene(s); coverage ${analysis.coverage.covered}/${analysis.coverage.expected}.`);
    await db.runs.update(runId, { stage: 'characters' });
    await send(runId, 'ANALYSIS_DONE', 'analysis-done');
    return true;
  }
  if (state !== 'building') return false;

  const analysis = (await db.analyses.get(runId))?.analysis;
  if (!analysis) return false;

  if (run.stage === 'characters') {
    const approved = run.approvals?.characters;
    if (!approved) {
      await addJobs(run, analysis.characters.flatMap((c, ci) => Array.from({ length: CANDIDATES_PER_CHARACTER }, (_, k) =>
        imageJob(run, `cand:${ci}:${k}`, ci * 10 + k, { purpose: 'portrait', entity: c.name, prompt: portraitPrompt(c) }))));
      const jobs = await jobsFor(runId, 'cand:');
      if (!allDone(jobs)) return false;
      if (needsApproval(run.autonomy ?? 'checkpoints', 'characters')) { await send(runId, 'GATE_REQUIRED', 'gate-characters'); track('gate_shown', { gate: 'characters', autonomy: run.autonomy }); return true; }
      const picks: Record<string, string> = {};
      for (const c of analysis.characters) {
        const mine = jobs.filter((j) => (j.input as { entity: string }).entity === c.name && j.state === 'succeeded');
        const pick = autoPick(mine.map((j) => ({ id: ((j.result as { assetIds: string[] }).assetIds)[0] as string })));
        if (pick) { picks[c.name] = pick.id; await log(runId, `Auto-approved a portrait for ${c.name}. ${pick.reason}`); }
      }
      await db.runs.update(runId, { approvals: { ...run.approvals, characters: picks } });
      return true;
    }
    // Approved: build the reference sheet, then lock.
    await addJobs(run, analysis.characters.flatMap((c, ci) => SHEET_VIEWS.map((v, vi) =>
      imageJob(run, `sheet:${ci}:${v}`, 1000 + ci * 10 + vi, { purpose: 'sheet', entity: c.name, view: v, prompt: sheetPrompt(c, v) }))));
    const sheets = await jobsFor(runId, 'sheet:');
    if (!allDone(sheets)) return false;
    for (const [ci, c] of analysis.characters.entries()) await lockAnalysedCharacter(run, c, ci, sheets);
    await log(runId, `Locked ${analysis.characters.length} character(s).`);
    await db.runs.update(runId, { stage: 'locations' });
    return true;
  }

  if (run.stage === 'locations') {
    const approved = run.approvals?.locations;
    if (!approved) {
      await addJobs(run, analysis.locations.flatMap((l, li) => platePrompts(l).map((p, pi) =>
        imageJob(run, `plate:${li}:${pi}`, 2000 + li * 10 + pi, { purpose: 'plate', entity: l.name, kind: p.kind, prompt: p.prompt }))));
      const jobs = await jobsFor(runId, 'plate:');
      if (!allDone(jobs)) return false;
      if (needsApproval(run.autonomy ?? 'checkpoints', 'locations')) { await send(runId, 'GATE_REQUIRED', 'gate-locations'); track('gate_shown', { gate: 'locations', autonomy: run.autonomy }); return true; }
      const picks: Record<string, string> = {};
      for (const l of analysis.locations) {
        const wide = jobs.find((j) => (j.input as { entity: string; kind: string }).entity === l.name && (j.input as { kind: string }).kind === 'wide' && j.state === 'succeeded');
        if (wide) { picks[l.name] = ((wide.result as { assetIds: string[] }).assetIds)[0] as string; await log(runId, `Auto-approved the wide plate for ${l.name}.`); }
      }
      await db.runs.update(runId, { approvals: { ...run.approvals, locations: picks } });
      return true;
    }
    for (const [li, l] of analysis.locations.entries()) await lockAnalysedLocation(run, l, li);
    await log(runId, `Locked ${analysis.locations.length} location(s). Every scene is now bound to an environment lock.`);
    await db.runs.update(runId, { stage: 'shot_planning' });
    return true;
  }
  return driveProduction(runId);
}

async function lockAnalysedCharacter(run: RunRow, c: AnalysedCharacter, ci: number, sheets: Job[]): Promise<void> {
  const portrait = run.approvals?.characters?.[c.name];
  const refs: CharacterDraft['refs'] = portrait ? [{ assetId: portrait, view: 'front' }] : [];
  for (const j of sheets) {
    const inp = j.input as { entity: string; view: RefView };
    const id = (j.result as { assetIds?: string[] } | undefined)?.assetIds?.[0];
    if (inp.entity === c.name && j.state === 'succeeded' && id) refs.push({ assetId: id, view: inp.view });
  }
  const t = { ...c.inferred, ...c.stated };
  const draft: CharacterDraft = {
    id: `char_${run.id.slice(0, 6)}_${ci}`, name: c.name, aliases: c.aliases, role: c.role, description: '',
    traits: { face: t.face ?? '', age: t.age ?? '', build: t.build ?? '', hair: t.hair ?? '', skin: t.skin ?? '', marks: t.marks ?? '' },
    variants: Object.fromEntries(c.ageStages.map((s) => [s.label, s.description])), negative: [], refs,
  };
  await db.characters.put(draft);
  const prior = await db.characterVersions.where('id').equals(draft.id).toArray();
  await db.characterVersions.put(lockCharacter(draft, prior));
}

async function lockAnalysedLocation(run: RunRow, l: { name: string; description: string; timeOfDay: string; interior: boolean | null }, li: number): Promise<void> {
  const jobs = await jobsFor(run.id, `plate:${li}:`);
  const chosen = run.approvals?.locations?.[l.name];
  const plates: LocationDraft['plates'] = [];
  if (chosen) plates.push({ assetId: chosen, kind: 'wide' });
  for (const j of jobs) {
    const id = (j.result as { assetIds?: string[] } | undefined)?.assetIds?.[0];
    if (id && id !== chosen && (j.input as { kind: string }).kind === 'alt' && j.state === 'succeeded') plates.push({ assetId: id, kind: 'alt' });
  }
  const draft: LocationDraft = {
    id: `loc_${run.id.slice(0, 6)}_${li}`, name: l.name, description: l.description, interior: l.interior ?? undefined,
    lighting: l.timeOfDay, palette: '', variants: {}, plates,
  };
  await db.locations.put(draft);
  const prior = await db.locationVersions.where('id').equals(draft.id).toArray();
  await db.locationVersions.put(lockLocation(draft, prior));
}
