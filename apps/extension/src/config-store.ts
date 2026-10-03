import { create } from 'zustand';
import { BUNDLED_CONFIG, ALL_BUNDLED_PRESETS, isFlagOn, isBelowMinimum, type Preset, type RemoteConfig } from '@frameloom/shared';
import { db } from './db/db';
import { fetchConfig, getApiBase, getInstallId, getSession } from './services';

export const EXTENSION_VERSION = '0.0.1';

export interface Announcement { key: string; title: string; body: string; dismissible: boolean }
interface ConfigState {
  config: RemoteConfig;
  source: string;
  announcements: Announcement[];
  load: () => Promise<void>;
}

export const useConfig = create<ConfigState>((set) => ({
  config: BUNDLED_CONFIG,
  source: 'bundled',
  announcements: [],
  async load() {
    const r = await fetchConfig();
    set({ config: r.config, source: r.source });
    try {
      const session = await getSession();
      const res = await fetch(`${await getApiBase()}/api/v1/announcements?version=${EXTENSION_VERSION}&locale=en`, { headers: session ? { Authorization: `Bearer ${session.token}` } : {} });
      if (res.ok) {
        const dismissed = ((await db.kv.get('dismissedAnnouncements'))?.value as string[] | undefined) ?? [];
        set({ announcements: ((await res.json()) as { data: Announcement[] }).data.filter((a) => !dismissed.includes(a.key)) });
      }
    } catch { /* offline: no announcements */ }
  },
}));

export async function dismissAnnouncement(key: string): Promise<void> {
  const cur = ((await db.kv.get('dismissedAnnouncements'))?.value as string[] | undefined) ?? [];
  await db.kv.put({ key: 'dismissedAnnouncements', value: [...new Set([...cur, key])] });
  useConfig.setState((s) => ({ announcements: s.announcements.filter((a) => a.key !== key) }));
}

/** Remote presets when the CMS has published any, else the bundled set. */
export function presetsOf(config: RemoteConfig): Preset[] {
  const remote = [...config.presets.camera, ...config.presets.effects, ...config.presets.styles];
  return remote.length ? remote : ALL_BUNDLED_PRESETS;
}

/** Flags default to on when the CMS has not defined them, so a missing config never hides a working feature. */
export async function flagOn(config: RemoteConfig, key: string, plan = 'free'): Promise<boolean> {
  const flag = config.featureFlags[key];
  if (flag === undefined) return true;
  return isFlagOn(flag, { installId: await getInstallId(), plan, key });
}

export const updateRequired = (config: RemoteConfig): boolean => isBelowMinimum(EXTENSION_VERSION, config.minSupportedVersion);

/** Reads the cached config straight from storage; used where React state is not available (service worker, run start). */
export async function cachedConfig(): Promise<RemoteConfig> {
  const row = (await db.kv.get('config'))?.value as { config?: RemoteConfig } | undefined;
  return row?.config ?? BUNDLED_CONFIG;
}

export async function assertSupported(): Promise<void> {
  const c = await cachedConfig();
  if (updateRequired(c)) throw new Error(c.release.message ?? `Version ${EXTENSION_VERSION} is no longer supported. Update the extension to keep generating.`);
}
