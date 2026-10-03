import { runLoop } from '../src/background/runner';

export default defineBackground(() => {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

  const wake = () => { void runLoop(); };
  chrome.runtime.onStartup.addListener(wake);
  chrome.runtime.onInstalled.addListener(wake);
  chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'frameloom-tick') wake(); });
  chrome.runtime.onMessage.addListener((m) => { if (m?.type === 'wake') wake(); });
  // Also covers the worker restarting for any other reason (event delivery, update).
  wake();
});
