import { createApiClient } from '@frameloom/api-client';
import { safeBase } from './api-base';
import { loadRemoteConfig, type ConfigStore } from '@frameloom/shared';
import { db, DexieVaultStorage } from './db/db';
import { KeyVault } from './vault/vault';

// Overridable at build time (WXT exposes import.meta.env.WXT_*); local dev default matches `php artisan serve`.
// Set WXT_API_BASE when building for production (the build refuses to run without it). Dev falls back to the local server.
export const API_BASE: string = (import.meta.env?.WXT_API_BASE as string | undefined) ?? 'http://127.0.0.1:8000';

/** chrome.storage.session is memory-only and limited to extension contexts by default; absent in unit tests. */
// The typings only describe the callback form of get(); the promise form is what Chrome ships.
const st = () => chrome.storage?.session as unknown as { get(k: string): Promise<Record<string, string>>; set(o: Record<string, string>): Promise<void>; remove(k: string): Promise<void> } | undefined;
const sessionKey = {
  async get() { return ((await st()?.get('vaultKey')) as { vaultKey?: string } | undefined)?.vaultKey; },
  async set(v: string) { await st()?.set({ vaultKey: v }); },
  async clear() { await st()?.remove('vaultKey'); },
};

export const vault = new KeyVault(new DexieVaultStorage(), undefined, sessionKey);

const configStore: ConfigStore = {
  get: async () => (await db.kv.get('config'))?.value as never,
  set: async (c) => { await db.kv.put({ key: 'config', value: c }); },
};
/** Server URL: a runtime setting (self-hosting, dev) falling back to the build-time default. */
export async function getApiBase(): Promise<string> {
  const override = (await db.kv.get('apiBase'))?.value as string | undefined;
  return safeBase(override) ?? safeBase(API_BASE) ?? 'https://invalid.invalid';
}



export const fetchConfig = async (baseUrl?: string) =>
  loadRemoteConfig({ baseUrl: baseUrl ?? (await getApiBase()), fetch: (u, i) => fetch(u, i), store: configStore });

export interface Session { token: string; email: string; plan: string; installId: string }

export async function getInstallId(): Promise<string> {
  const row = await db.kv.get('installId');
  if (row) return row.value as string;
  const id = crypto.randomUUID();
  await db.kv.put({ key: 'installId', value: id });
  return id;
}
export const getSession = async () => (await db.kv.get('session'))?.value as Session | undefined;

export async function login(email: string, password: string, baseUrl?: string): Promise<Session> {
  baseUrl ??= await getApiBase();
  const installId = await getInstallId();
  const api = createApiClient(baseUrl);
  const { data, error } = await api.POST('/v1/auth/login', {
    body: { email, password, install_id: installId, device_name: 'Chrome extension', extension_version: '0.0.1' } as never,
  });
  if (error || !data) {
    const msg = (error as { error?: { message?: string } } | undefined)?.error?.message;
    throw new Error(msg ?? 'Could not reach the server. Check your connection and try again.');
  }
  const d = data as unknown as { token: string; user: { email: string; plan: string } };
  const session = { token: d.token, email: d.user.email, plan: d.user.plan, installId };
  await db.kv.put({ key: 'session', value: session });
  void import('./entitlements').then((m) => m.refreshEntitlements());
  return session;
}
export async function logout() { await db.kv.delete('session'); }
