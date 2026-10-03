import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDb, DexieVaultStorage } from '../db/db';
import { KeyVault, VaultError, type SessionKeyStore, type VaultRecord, type VaultStorage } from './vault';

class MemStorage implements VaultStorage {
  rec?: VaultRecord;
  async load() { return this.rec; }
  async save(r: VaultRecord) { this.rec = r; }
  async clear() { this.rec = undefined; }
}
const fast = 1000; // iterations: speed only in tests

describe('KeyVault passphrase mode', () => {
  it('round-trips keys and never stores plaintext', async () => {
    const s = new MemStorage();
    const v = new KeyVault(s, fast);
    await v.init('passphrase', 'correct horse');
    await v.setKey('anthropic', 'sk-ant-secret-123');
    expect(await v.getKey('anthropic')).toBe('sk-ant-secret-123');
    const raw = Array.from(s.rec!.secrets.anthropic!.ct).map((b) => String.fromCharCode(b)).join('');
    expect(raw).not.toContain('sk-ant');
    expect(await v.listProviders()).toEqual(['anthropic']);
  });

  it('rejects a wrong passphrase and unlocks with the right one', async () => {
    const s = new MemStorage();
    const a = new KeyVault(s, fast);
    await a.init('passphrase', 'right-passphrase');
    await a.setKey('p', 'secret');
    const b = new KeyVault(s, fast);
    await expect(b.unlock('wrong')).rejects.toMatchObject({ code: 'wrong_passphrase' });
    expect(b.isUnlocked).toBe(false);
    await b.unlock('right-passphrase');
    expect(await b.getKey('p')).toBe('secret');
  });

  it('requires a passphrase and blocks access while locked', async () => {
    const v = new KeyVault(new MemStorage(), fast);
    await expect(v.init('passphrase')).rejects.toMatchObject({ code: 'passphrase_required' });
    await v.init('passphrase', 'long-enough-1');
    v.lock();
    await expect(v.getKey('p')).rejects.toMatchObject({ code: 'locked' });
    await expect(v.unlock()).rejects.toMatchObject({ code: 'passphrase_required' });
  });

  it('uses a fresh IV for every write', async () => {
    const s = new MemStorage();
    const v = new KeyVault(s, fast);
    await v.init('passphrase', 'long-enough-1');
    await v.setKey('a', 'same');
    await v.setKey('b', 'same');
    expect(s.rec!.secrets.a!.iv).not.toEqual(s.rec!.secrets.b!.iv);
    expect(s.rec!.secrets.a!.ct).not.toEqual(s.rec!.secrets.b!.ct);
  });
});

describe('KeyVault device mode and lifecycle', () => {
  it('works without a passphrase and survives a restart via storage', async () => {
    const d = new AppDb('vault-test');
    const s = new DexieVaultStorage(d);
    const v1 = new KeyVault(s);
    await v1.init('device');
    await v1.setKey('openai', 'sk-1');
    const v2 = new KeyVault(new DexieVaultStorage(d));
    expect(await v2.mode()).toBe('device');
    await v2.unlock();
    expect(await v2.getKey('openai')).toBe('sk-1');
  });

  it('removes keys, reports missing ones, and wipes everything', async () => {
    const s = new MemStorage();
    const v = new KeyVault(s);
    await expect(v.listProviders()).rejects.toBeInstanceOf(VaultError);
    await v.init('device');
    await v.setKey('a', '1');
    await v.removeKey('a');
    await expect(v.getKey('a')).rejects.toMatchObject({ code: 'no_such_key' });
    await v.wipe();
    expect(await v.isInitialised()).toBe(false);
    expect(v.isUnlocked).toBe(false);
  });

  it('detects tampered ciphertext', async () => {
    const s = new MemStorage();
    const v = new KeyVault(s);
    await v.init('device');
    await v.setKey('a', 'secret');
    s.rec!.secrets.a!.ct[0] = (s.rec!.secrets.a!.ct[0]! + 1) % 256;
    await expect(v.getKey('a')).rejects.toBeDefined();
  });
});

describe('KeyVault session sharing and guards', () => {
  const memSession = (): SessionKeyStore & { value?: string } => { const s: SessionKeyStore & { value?: string } = { get: async () => s.value, set: async (v) => { s.value = v; }, clear: async () => { s.value = undefined; } }; return s; };

  it('lets a second context (the service worker) unlock without the passphrase after the panel did', async () => {
    const storage = new MemStorage();
    const session = memSession();
    const panel = new KeyVault(storage, fast, session);
    await panel.init('passphrase', 'a-good-passphrase');
    await panel.setKey('openai', 'sk-1');
    expect(session.value).toBeTruthy();
    const worker = new KeyVault(storage, fast, session);
    await worker.unlock(); // no passphrase
    expect(await worker.getKey('openai')).toBe('sk-1');
    // Locking clears the shared key, so the worker can no longer unlock on its own.
    panel.lock();
    await expect(new KeyVault(storage, fast, session).unlock()).rejects.toMatchObject({ code: 'passphrase_required' });
  });

  it('shares the key after a passphrase unlock and never stores it for device mode', async () => {
    const storage = new MemStorage();
    const session = memSession();
    await new KeyVault(storage, fast, session).init('passphrase', 'a-good-passphrase');
    session.value = undefined;
    await new KeyVault(storage, fast, session).unlock('a-good-passphrase');
    expect(session.value).toBeTruthy();
    const dev = memSession();
    await new KeyVault(new MemStorage(), fast, dev).init('device');
    expect(dev.value).toBeUndefined();
  });

  it('enforces a passphrase length floor and refuses to overwrite an existing vault', async () => {
    const v = new KeyVault(new MemStorage(), fast);
    await expect(v.init('passphrase', 'short')).rejects.toMatchObject({ code: 'weak_passphrase' });
    await v.init('device');
    await v.setKey('a', 'secret');
    await expect(v.init('device')).rejects.toMatchObject({ code: 'already_exists' });
    expect(await v.getKey('a')).toBe('secret');
  });
});
