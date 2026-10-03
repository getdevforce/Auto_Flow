import Dexie, { type Table } from 'dexie';
import type { CharacterDraft, CharacterVersion, Job, LocationDraft, LocationVersion } from '@frameloom/shared';
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
}
export interface AssetRow { id: string; jobId: string; mime: string; blob: Blob }
/** `files` records the requested download paths; the browser may rename them on collision or in automation. */
export interface JobRow extends Job { downloaded?: boolean; files?: string[] }

/** Single local database. Tables are added per milestone; every schema change bumps the version. */
export class AppDb extends Dexie {
  kv!: Table<KvRow, string>;
  runs!: Table<RunRow, string>;
  jobs!: Table<JobRow, string>;
  assets!: Table<AssetRow, string>;
  characters!: Table<CharacterDraft, string>;
  characterVersions!: Table<CharacterVersion, string>;
  locations!: Table<LocationDraft, string>;
  locationVersions!: Table<LocationVersion, string>;
  constructor(name = 'frameloom') {
    super(name);
    this.version(1).stores({ kv: 'key' });
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
