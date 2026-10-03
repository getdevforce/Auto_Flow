import { runLoop } from '../src/background/runner';
import { extractFrame } from '../src/background/offscreen';
import { flushTelemetry } from '../src/telemetry';

export default defineBackground(() => {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

  const wake = () => { void runLoop(); };
  chrome.runtime.onStartup.addListener(wake);
  chrome.runtime.onInstalled.addListener(wake);
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === 'frameloom-tick') wake();
    if (a.name === 'frameloom-telemetry') void flushTelemetry();
  });
  void chrome.alarms.create('frameloom-telemetry', { periodInMinutes: 15 });
  chrome.runtime.onMessage.addListener((m, sender, respond) => {
    // Only this extension's own pages may drive the worker (defence in depth: there are no content scripts or external messaging).
    if (sender.id !== chrome.runtime.id) return false;
    if (m?.type === 'wake') wake();
    if (m?.type === 'sw-extract-frame') {
      extractFrame(m.assetId, m.at, m.outId).then((assetId) => respond({ ok: true, assetId })).catch((e: Error) => respond({ ok: false, error: e.message }));
      return true;
    }
    return false;
  });
  // Also covers the worker restarting for any other reason (event delivery, update).
  wake();
});
