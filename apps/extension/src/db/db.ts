import Dexie, { type Table } from 'dexie';
import type { Shot, Autonomy, CharacterDraft, CharacterVersion, Job, LocationDraft, LocationVersion, Run, ScriptAnalysis } from '@frameloom/shared';
import type { VaultRecord, VaultStorage } from '../vault/vault';

interface KvRow { key: string; value: unknown }

export interface RunRow {
  id: string;
  name: string;
  /** Project folder used in download paths. */
  project: string;
  /** Mirrors the shared run state machine. */
  state: string;
  budgetUsd: number;
  nameTemplate: string;
  createdAt: number;
  pausedReason?: string;
  report?: unknown;
  // Autopilot only
  kind?: 'create' | 'autopilot';
  machine?: Run;
  stage?: string;
  autonomy?: Autonomy;
  script?: string;
  textProvider?: string;
  textModel?: string;
  imageProvider?: string;
  imageModel?: string;
  /** Approved asset per entity name, per gate. */
  settings?: RunSettings;
  startedAt?: number;
  approvals?: { characters?: Record<string, string>; locations?: Record<string, string>; pilot?: boolean };
  /** Shown to the user so full-auto decisions stay reviewable. */
  decisions?: Array<{ at: number; text: string }>;
}
export interface RunSettings {
  mode: 'native' | 'draft_upscale';
  videoProvider: string; videoModel: string; upscaleProvider: string; upscaleModel: string;
  ratio: string; maxDurationSec: number; allowedDurations?: number[];
  draftRes: string; targetRes: string; targetWidth: number; targetHeight: number;
  strictOrder: boolean; refineStrength: 'off' | 'light' | 'standard' | 'full';
  fallbackEnabled: boolean; fallbackModels: string[];
  keyframeThreshold: number; keyframeAttempts: number; score: boolean;
  priceKeyframe: number; priceVideoPerSec: number; priceUpscale: number;
  /** Director model for refinement; scoring uses the cheap model. */
  directorModel: string; checkModel: string;
}
export interface ShotRow {
  id: string; runId: string; seq: number; status: string; plan: Shot;
  original?: string; refined?: string; negative?: string; rationale?: string;
  kfAttempt: number; kfScores: number[]; kfAssets?: string[]; kfAssetId?: string; suggestedRewrite?: string; kfBestScore?: number; kfFlagged?: boolean;
  videoAttempt: number; upAttempt: number; variantTried: boolean; fallbacksTried: string[]; videoModel?: string;
  draftAssetId?: string; finalAssetId?: string; flagReason?: string; downloaded?: boolean; downloadedAt?: number; file?: string;
  costUsd: number; width?: number; height?: number; durationSec?: number; retries: number;
}
export interface AnalysisRow { runId: string; analysis: ScriptAnalysis }
export interface LlmCacheRow { hash: string; text: string }
export interface AssetRow { id: string; jobId: string; mime: string; blob: Blob }
/** `files` records the requested download paths; the browser may rename them on collision or in automation. */
export interface JobRow extends Job { downloaded?: boolean; files?: string[] }

/** Single local database. Tables are added per milestone; every schema change bumps the version. */
export class AppDb extends Dexie {
  kv!: Table<KvRow, string>;
  runs!: Table<RunRow, string>;
  jobs!: Table<JobRow, string>;
  assets!: Table<AssetRow, string>;
  shots!: Table<ShotRow, string>;
  analyses!: Table<AnalysisRow, string>;
  llmCache!: Table<LlmCacheRow, string>;
  characters!: Table<CharacterDraft, string>;
  characterVersions!: Table<CharacterVersion, string>;
  locations!: Table<LocationDraft, string>;
  locationVersions!: Table<LocationVersion, string>;
  constructor(name = 'frameloom') {
    super(name);
    this.version(1).stores({ kv: 'key' });
    this.version(5).stores({
      kv: 'key', runs: 'id, state, createdAt', jobs: 'id, runId, state, seq', assets: 'id, jobId',
      characters: 'id, name', characterVersions: 'versionId, id', locations: 'id, name', locationVersions: 'versionId, id',
      analyses: 'runId', llmCache: 'hash', shots: 'id, runId, seq, status',
    });
    this.version(4).stores({
      kv: 'key', runs: 'id, state, createdAt', jobs: 'id, runId, state, seq', assets: 'id, jobId',
      characters: 'id, name', characterVersions: 'versionId, id', locations: 'id, name', locationVersions: 'versionId, id',
      analyses: 'runId', llmCache: 'hash',
    });
    this.version(3).stores({
      kv: 'key', runs: 'id, state, createdAt', jobs: 'id, runId, state, seq', assets: 'id, jobId',
      characters: 'id, name', characterVersions: 'versionId, id', locations: 'id, name', locationVersions: 'versionId, id',
    });
    this.version(2).stores({ kv: 'key', runs: 'id, state, createdAt', jobs: 'id, runId, state, seq', assets: 'id, jobId' });
  }
}

export const db = new AppDb();

export class DexieVaultStorage implements VaultStorage {
  constructor(private readonly d: AppDb = db) {}
  async load() { return (await this.d.kv.get('vault'))?.value as VaultRecord | undefined; }
  async save(record: VaultRecord) { await this.d.kv.put({ key: 'vault', value: record }); }
  async clear() { await this.d.kv.delete('vault'); }
}
