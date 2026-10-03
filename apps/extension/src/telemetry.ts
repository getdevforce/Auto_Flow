import { TelemetryClient, type TelemetryEvent } from '@frameloom/shared';
import { db } from './db/db';
import { getApiBase, getInstallId, getSession } from './services';

const VERSION = '0.0.1';

export const isTelemetryEnabled = async (): Promise<boolean> => ((await db.kv.get('telemetryEnabled'))?.value as boolean | undefined) ?? true;

export const telemetry = new TelemetryClient({
  isEnabled: isTelemetryEnabled,
  load: async () => ((await db.kv.get('telemetryQueue'))?.value as TelemetryEvent[] | undefined) ?? [],
  save: async (q) => { await db.kv.put({ key: 'telemetryQueue', value: q }); },
  installId: getInstallId,
  async send(installId, events) {
    const session = await getSession();
    const res = await fetch(`${await getApiBase()}/api/v1/telemetry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json', 'X-Extension-Version': VERSION, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: JSON.stringify({ install_id: installId, events }),
    });
    // A 4xx means the batch itself is bad; retrying forever would block the queue, so drop it.
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429);
  },
});

/** Fire and forget. Telemetry must never break the feature that emitted it. */
export function track(name: string, props: Record<string, unknown> = {}): void {
  void telemetry.track(name, props).catch(() => undefined);
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  await db.kv.put({ key: 'telemetryEnabled', value: enabled });
  if (!enabled) await db.kv.put({ key: 'telemetryQueue', value: [] });
  // Tell the server too, so it drops anything that arrives from this install later.
  try {
    await fetch(`${await getApiBase()}/api/v1/telemetry/preference`, {
      method: 'PUT', headers: { 'content-type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ install_id: await getInstallId(), enabled }),
    });
  } catch { /* offline: the local switch already stops everything */ }
}

export async function flushTelemetry(): Promise<void> { await telemetry.flush().catch(() => undefined); }
