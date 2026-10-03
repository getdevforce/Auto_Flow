/**
 * Encrypted store for provider API keys (AES-GCM via WebCrypto).
 *
 * Passphrase mode: PBKDF2-SHA256 (600k iterations) derives the key from the passphrase. Nothing that can decrypt is stored on
 * disk. After unlocking, the raw key is placed in chrome.storage.session (memory only, extension contexts only, cleared when the
 * browser closes) so the service worker can run jobs without asking again.
 * Device mode: a non-extractable CryptoKey sits in IndexedDB next to the ciphertext. Keys are not stored in plain text, but anyone
 * who can read this browser profile (or runs code as this user) can use the stored key to decrypt them. Non-extractable only stops
 * script from exporting the key bytes. Use a passphrase if that matters to you.
 */
export type VaultMode = 'device' | 'passphrase';

export interface VaultRecord {
  mode: VaultMode;
  salt?: Uint8Array;
  iterations?: number;
  deviceKey?: CryptoKey;
  verifier: Sealed;
  secrets: Record<string, Sealed>;
}
export interface Sealed { iv: Uint8Array; ct: Uint8Array }

/** Where the unlocked key is shared between extension contexts for the browser session. */
export interface SessionKeyStore { get(): Promise<string | undefined>; set(rawB64: string): Promise<void>; clear(): Promise<void> }

export const MIN_PASSPHRASE = 10;

export interface VaultStorage {
  load(): Promise<VaultRecord | undefined>;
  save(record: VaultRecord): Promise<void>;
  clear(): Promise<void>;
}

export type VaultErrorCode = 'not_initialised' | 'locked' | 'wrong_passphrase' | 'passphrase_required' | 'no_such_key' | 'weak_passphrase' | 'already_exists';
export class VaultError extends Error {
  constructor(public readonly code: VaultErrorCode, message: string) { super(message); this.name = 'VaultError'; }
}

const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_TEXT = 'frameloom-vault-v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

async function seal(key: CryptoKey, plain: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(plain)));
  return { iv, ct };
}
async function open(key: CryptoKey, s: Sealed): Promise<string> {
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.iv as BufferSource }, key, s.ct as BufferSource));
}
async function derive(passphrase: string, salt: Uint8Array, iterations: number, extractable = false): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'],
  );
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class KeyVault {
  private key: CryptoKey | null = null;
  constructor(private readonly storage: VaultStorage, private readonly iterations = PBKDF2_ITERATIONS, private readonly session?: SessionKeyStore) {}

  get isUnlocked(): boolean { return this.key !== null; }
  async isInitialised(): Promise<boolean> { return (await this.storage.load()) !== undefined; }
  async mode(): Promise<VaultMode | undefined> { return (await this.storage.load())?.mode; }

  /** Creates the vault. Refuses to overwrite an existing one: that would silently destroy saved keys. Use wipe() first. */
  async init(mode: VaultMode, passphrase?: string): Promise<void> {
    if (await this.isInitialised()) throw new VaultError('already_exists', 'A key vault already exists. Delete all local data first if you want to start over.');
    if (mode === 'passphrase') {
      if (!passphrase) throw new VaultError('passphrase_required', 'Choose a passphrase to protect your keys.');
      if (passphrase.length < MIN_PASSPHRASE) throw new VaultError('weak_passphrase', `Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await derive(passphrase, salt, this.iterations, !!this.session);
      await this.storage.save({ mode, salt, iterations: this.iterations, verifier: await seal(key, VERIFIER_TEXT), secrets: {} });
      this.key = key;
      await this.shareKey(key);
      return;
    }
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await this.storage.save({ mode, deviceKey: key, verifier: await seal(key, VERIFIER_TEXT), secrets: {} });
    this.key = key;
  }

  async unlock(passphrase?: string): Promise<void> {
    const rec = await this.requireRecord();
    let key: CryptoKey;
    if (rec.mode === 'device') {
      key = rec.deviceKey as CryptoKey;
    } else if (!passphrase) {
      // No passphrase given: another extension context (the side panel) may already have unlocked this browser session.
      const shared = await this.session?.get();
      if (!shared) throw new VaultError('passphrase_required', 'Enter your vault passphrase in Settings > Keys to unlock your keys for this browser session.');
      key = await crypto.subtle.importKey('raw', fromB64(shared) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } else {
      key = await derive(passphrase, rec.salt as Uint8Array, rec.iterations ?? PBKDF2_ITERATIONS, !!this.session);
    }
    try {
      if ((await open(key, rec.verifier)) !== VERIFIER_TEXT) throw new Error('mismatch');
    } catch {
      throw new VaultError('wrong_passphrase', 'That passphrase is wrong. Keys stay locked.');
    }
    this.key = key;
    if (rec.mode === 'passphrase' && passphrase) await this.shareKey(key);
  }

  private async shareKey(key: CryptoKey): Promise<void> {
    if (!this.session || !key.extractable) return;
    await this.session.set(toB64(new Uint8Array(await crypto.subtle.exportKey('raw', key))));
  }

  lock(): void { this.key = null; void this.session?.clear(); }

  async setKey(provider: string, secret: string): Promise<void> {
    const key = this.requireKey();
    const rec = await this.requireRecord();
    rec.secrets[provider] = await seal(key, secret);
    await this.storage.save(rec);
  }

  async getKey(provider: string): Promise<string> {
    const key = this.requireKey();
    const sealed = (await this.requireRecord()).secrets[provider];
    if (!sealed) throw new VaultError('no_such_key', `No key saved for ${provider}. Add one in Settings > Keys.`);
    return open(key, sealed);
  }

  async removeKey(provider: string): Promise<void> {
    const rec = await this.requireRecord();
    delete rec.secrets[provider];
    await this.storage.save(rec);
  }

  /** Provider ids with a saved key; safe to call while locked. */
  async listProviders(): Promise<string[]> { return Object.keys((await this.requireRecord()).secrets); }

  async wipe(): Promise<void> { this.key = null; await this.session?.clear(); await this.storage.clear(); }

  private requireKey(): CryptoKey {
    if (!this.key) throw new VaultError('locked', 'Keys are locked. Unlock them in Settings > Keys.');
    return this.key;
  }
  private async requireRecord(): Promise<VaultRecord> {
    const rec = await this.storage.load();
    if (!rec) throw new VaultError('not_initialised', 'No key vault yet. Add a provider key in Settings > Keys.');
    return rec;
  }
}
