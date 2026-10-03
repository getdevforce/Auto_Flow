/** Ensures the offscreen document exists (one at a time) and asks it for object URLs backed by stored assets. */
async function ensure(): Promise<void> {
  const has = await chrome.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] });
  if (has?.length) return;
  await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS' as chrome.offscreen.Reason], justification: 'Create object URLs for large video downloads' });
}

export async function blobUrlFor(assetId: string): Promise<string | null> {
  try {
    await ensure();
    return (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'blob-url', assetId })) as string | null;
  } catch {
    return null;
  }
}
