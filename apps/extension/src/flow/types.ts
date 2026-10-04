import type { FlowJob } from '@frameloom/shared';

/** What the side panel hands to the Flow tab. Stored in chrome.storage.local so a reload or a closed panel loses nothing. */
export interface FlowRun {
  id: string;
  project: string;
  state: 'running' | 'paused' | 'stopped' | 'done';
  /** Tab that drives Flow. The content script only works when it runs in this tab. */
  tabId?: number;
  jobs: FlowJob[];
}

/** Written only by the content script, so the two sides never overwrite each other. */
export type FlowProgress = Record<string, { status: FlowJob['status']; error?: string; savedAs?: string }>;

/** CSS selectors the user pointed at, used before any guessing. */
export interface FlowSelectors { promptBox?: string; submit?: string; modeImage?: string; modeVideo?: string }
export type TeachTarget = keyof FlowSelectors;

export const FLOW_URL = 'https://labs.google/fx/tools/flow';
export const KEYS = { run: 'flowRun', progress: 'flowProgress', selectors: 'flowSelectors' } as const;

export const flowStore = {
  async get<T>(key: string): Promise<T | undefined> { return (await chrome.storage.local.get(key))[key] as T | undefined; },
  set(key: string, value: unknown) { return chrome.storage.local.set({ [key]: value }); },
};
