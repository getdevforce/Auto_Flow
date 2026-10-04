import { runLoop } from '../src/background/runner';
import { extractFrame } from '../src/background/offscreen';
import { flushTelemetry } from '../src/telemetry';
import { brand } from '../src/brand';

const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

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
    // Only this extension's own pages and content scripts may drive the worker; there is no external messaging.
    if (sender.id !== chrome.runtime.id) return false;
    if (m?.type === 'wake') wake();
    if (m?.type === 'sw-extract-frame') {
      extractFrame(m.assetId, m.at, m.outId).then((assetId) => respond({ ok: true, assetId })).catch((e: Error) => respond({ ok: false, error: e.message }));
      return true;
    }
    if (m?.type === 'flow:whoami') { respond({ tabId: sender.tab?.id }); return false; }
    if (m?.type === 'flow:save') {
      const ext = EXT[String(m.mime).split(';')[0] as string] ?? 'bin';
      const filename = `${brand.productName}/${String(m.file).replace(/[^\w\-./ ]/g, '_')}.${ext}`;
      chrome.downloads.download({ url: `data:${m.mime};base64,${m.b64}`, filename, conflictAction: 'uniquify' })
        .then(() => respond({ ok: true, filename })).catch((e: Error) => respond({ ok: false, error: e.message }));
      return true;
    }
    if (m?.type === 'flow:fetch-url' && /^https:/.test(m.url)) {
      fetch(m.url, { credentials: 'include' }).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        respond({ ok: true, b64: btoa(bin), mime: r.headers.get('content-type') ?? 'application/octet-stream' });
      }).catch((e: Error) => respond({ ok: false, error: `Could not download the result: ${e.message}` }));
      return true;
    }
    return false;
  });
  // Also covers the worker restarting for any other reason (event delivery, update).
  wake();
});
