import Dexie, { type Table } from 'dexie';
import type { VaultRecord, VaultStorage } from '../vault/vault';

interface KvRow { key: string; value: unknown }

/** Single local database. Tables are added per milestone; every schema change bumps the version. */
export class AppDb extends Dexie {
  kv!: Table<KvRow, string>;
  constructor(name = 'frameloom') {
    super(name);
    this.version(1).stores({ kv: 'key' });
  }
}

export const db = new AppDb();

export class DexieVaultStorage implements VaultStorage {
  constructor(private readonly d: AppDb = db) {}
  async load() { return (await this.d.kv.get('vault'))?.value as VaultRecord | undefined; }
  async save(record: VaultRecord) { await this.d.kv.put({ key: 'vault', value: record }); }
  async clear() { await this.d.kv.delete('vault'); }
}
