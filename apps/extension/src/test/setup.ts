import 'fake-indexeddb/auto';

// Minimal browser surface for modules that touch chrome.* or localStorage. Tests override what they need.
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() },
  chrome: { runtime: { sendMessage: async () => ({}) }, alarms: { clearAll: async () => true, clear: async () => true, create: async () => undefined }, storage: {} },
});
