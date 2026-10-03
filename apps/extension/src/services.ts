import { createApiClient } from '@frameloom/api-client';
import { loadRemoteConfig, type ConfigStore } from '@frameloom/shared';
import { db, DexieVaultStorage } from './db/db';
import { KeyVault } from './vault/vault';

// Overridable at build time (WXT exposes import.meta.env.WXT_*); local dev default matches `php artisan serve`.
export const API_BASE: string = (import.meta.env?.WXT_API_BASE as string | undefined) ?? 'http://127.0.0.1:8000';

export const vault = new KeyVault(new DexieVaultStorage());

const configStore: ConfigStore = {
  get: async () => (await db.kv.get('config'))?.value as never,
  set: async (c) => { await db.kv.put({ key: 'config', value: c }); },
};
export const fetchConfig = (baseUrl = API_BASE) =>
  loadRemoteConfig({ baseUrl, fetch: (u, i) => fetch(u, i), store: configStore });

export interface Session { token: string; email: string; plan: string; installId: string }

export async function getInstallId(): Promise<string> {
  const row = await db.kv.get('installId');
  if (row) return row.value as string;
  const id = crypto.randomUUID();
  await db.kv.put({ key: 'installId', value: id });
  return id;
}
export const getSession = async () => (await db.kv.get('session'))?.value as Session | undefined;

export async function login(email: string, password: string, baseUrl = API_BASE): Promise<Session> {
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
  return session;
}
export async function logout() { await db.kv.delete('session'); }
