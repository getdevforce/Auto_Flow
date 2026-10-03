import { runLoop } from '../src/background/runner';
import { extractFrame } from '../src/background/offscreen';

export default defineBackground(() => {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

  const wake = () => { void runLoop(); };
  chrome.runtime.onStartup.addListener(wake);
  chrome.runtime.onInstalled.addListener(wake);
  chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'frameloom-tick') wake(); });
  chrome.runtime.onMessage.addListener((m, _sender, respond) => {
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
