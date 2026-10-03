import { db } from '../../src/db/db';

// Long-running and Blob-heavy work lives here because the service worker can be evicted and cannot create object URLs.
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.target !== 'offscreen') return false;
  if (msg.type === 'blob-url') {
    db.assets.get(msg.assetId).then((a) => respond(a ? URL.createObjectURL(a.blob) : null)).catch(() => respond(null));
    return true; // async response
  }
  if (msg.type === 'revoke') { URL.revokeObjectURL(msg.url); respond(true); }
  return false;
});
