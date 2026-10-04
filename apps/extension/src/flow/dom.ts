import type { FlowSelectors, TeachTarget } from './types';

/**
 * Everything that touches Flow's page lives here, so a change in Flow's layout is fixed in one file.
 * Flow's real markup could not be inspected while this was written, so nothing here depends on a class name:
 * it looks for the prompt box and the Create button by role, label and position, and the user can point at
 * either one directly ("teach") when the guess is wrong.
 */

const visible = (el: Element): boolean => {
  const r = (el as HTMLElement).getBoundingClientRect();
  const s = getComputedStyle(el as HTMLElement);
  return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none';
};
const label = (el: Element) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''} ${el.getAttribute('title') ?? ''} ${(el as HTMLElement).innerText ?? ''}`.trim();

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function bySelector(sel?: string): HTMLElement | null {
  if (!sel) return null;
  try { return document.querySelector<HTMLElement>(sel); } catch { return null; }
}

export function findPromptBox(sel?: FlowSelectors): HTMLElement | null {
  const taught = bySelector(sel?.promptBox);
  if (taught && visible(taught)) return taught;
  const all = [...document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], input[type="text"], input:not([type])')]
    .filter((el) => visible(el) && el.getBoundingClientRect().width > 150);
  if (!all.length) return null;
  const hinted = all.filter((el) => /prompt|describe|create|generate|idea|what/i.test(label(el)));
  const pool = hinted.length ? hinted : all;
  // The prompt box is normally the lowest wide input on the page.
  return pool.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] ?? null;
}

export function setPromptText(box: HTMLElement, text: string): void {
  box.focus();
  if (box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) {
    const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(box, text); // the framework's own setter, so React-style state notices
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  document.execCommand('selectAll', false);
  if (!document.execCommand('insertText', false, text)) {
    box.textContent = text;
    box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }
}

const SUBMIT = /\b(create|generate|send|submit|run)\b/i;

export function findSubmit(box: HTMLElement, sel?: FlowSelectors): HTMLElement | null {
  const taught = bySelector(sel?.submit);
  if (taught && visible(taught)) return taught;
  const br = box.getBoundingClientRect();
  const buttons = [...document.querySelectorAll<HTMLElement>('button, [role="button"]')].filter((b) => visible(b) && !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true');
  const scored = buttons.map((b) => {
    const r = b.getBoundingClientRect();
    const dist = Math.hypot(r.left + r.width / 2 - (br.left + br.width / 2), r.top + r.height / 2 - (br.top + br.height / 2));
    return { b, score: (SUBMIT.test(label(b)) ? 1000 : 0) - dist };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored[0]?.b ?? null;
}

export function pressEnter(box: HTMLElement): void {
  for (const type of ['keydown', 'keypress', 'keyup']) box.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
}

/** Best effort: switch Flow between making pictures and making video. Returns false if nothing matching was found. */
export function selectMode(kind: 'image' | 'video', sel?: FlowSelectors): boolean {
  const taught = bySelector(kind === 'image' ? sel?.modeImage : sel?.modeVideo);
  if (taught) { taught.click(); return true; }
  const re = kind === 'image' ? /^(images?|text to image|create image|generate image)$/i : /^(videos?|text to video|create video|generate video)$/i;
  const el = [...document.querySelectorAll<HTMLElement>('button, [role="tab"], [role="menuitem"], [role="option"], [role="radio"]')].find((b) => visible(b) && re.test((b.innerText || '').replace(/\s+/g, ' ').trim()));
  if (!el) return false;
  el.click();
  return true;
}

export interface Media { key: string; kind: 'video' | 'image'; el: HTMLElement; url: string }

const minSize = (el: Element, n: number) => { const r = el.getBoundingClientRect(); return r.width >= n && r.height >= n; };

/** Pictures and clips big enough to be results, not icons or avatars. */
export function mediaOnPage(): Media[] {
  const out: Media[] = [];
  for (const v of document.querySelectorAll<HTMLVideoElement>('video')) {
    const url = v.currentSrc || v.src || v.querySelector('source')?.src || '';
    if (url && minSize(v, 120)) out.push({ key: url, kind: 'video', el: v, url });
  }
  for (const i of document.querySelectorAll<HTMLImageElement>('img')) {
    if (i.src && i.complete && i.naturalWidth >= 256 && minSize(i, 120) && !i.closest('video')) out.push({ key: i.currentSrc || i.src, kind: 'image', el: i, url: i.currentSrc || i.src });
  }
  return out;
}

const FAILURE = /(something went wrong|couldn.?t generate|could not generate|failed|violat|not allowed|can.?t create|unable to|try a different|policy)/i;

/** Text of alert-like elements. A new match after submitting means Flow refused or failed. */
export function alertTexts(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="alert"], [role="status"], [aria-live], [class*="toast" i], [class*="snackbar" i]')]
    .filter(visible).map((e) => e.innerText.trim()).filter((t) => t && FAILURE.test(t));
}

export interface WaitOptions { want: 'video' | 'image'; before: Set<string>; beforeAlerts: Set<string>; timeoutMs: number; isCancelled: () => boolean; pollMs?: number }
export type WaitResult = { ok: true; media: Media } | { ok: false; error: string };

export async function waitForNewMedia(o: WaitOptions): Promise<WaitResult> {
  const end = Date.now() + o.timeoutMs;
  let candidate: { key: string; since: number } | undefined;
  while (Date.now() < end) {
    if (o.isCancelled()) return { ok: false, error: 'Stopped.' };
    const bad = alertTexts().find((t) => !o.beforeAlerts.has(t));
    if (bad) return { ok: false, error: `Flow said: ${bad.slice(0, 200)}` };
    const fresh = mediaOnPage().filter((m) => !o.before.has(m.key));
    // A clip counts only once it has dimensions; a picture only once it has finished loading (mediaOnPage checks that).
    const hit = fresh.find((m) => m.kind === o.want && (m.kind === 'image' || (m.el as HTMLVideoElement).readyState >= 1))
      ?? (o.want === 'image' ? fresh.find((m) => m.kind === 'video' && (m.el as HTMLVideoElement).readyState >= 1) : undefined);
    if (hit) {
      // Wait until the same result has been stable for a moment, so a placeholder that gets replaced is not saved.
      if (candidate?.key === hit.key) { if (Date.now() - candidate.since > 2500) return { ok: true, media: hit }; }
      else candidate = { key: hit.key, since: Date.now() };
    } else candidate = undefined;
    await sleep(o.pollMs ?? 1500);
  }
  return { ok: false, error: 'Flow did not finish in time. Check the Flow tab; if it produced the result, run this item again.' };
}

export interface Fetched { b64: string; mime: string }

export async function fetchMedia(url: string): Promise<Fetched> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Could not read the result (HTTP ${res.status}).`);
  const blob = await res.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), mime: blob.type || (url.match(/\.(mp4|webm|png|jpe?g|webp)(\?|$)/i)?.[1] ?? 'application/octet-stream') };
}

/** Short CSS path to an element, preferring stable attributes over positions. */
export function selectorFor(el: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== document.body && parts.length < 6; node = node.parentElement) {
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id) && document.querySelectorAll(`#${node.id}`).length === 1) { parts.unshift(`#${node.id}`); break; }
    const tag = node.tagName.toLowerCase();
    const aria = node.getAttribute('aria-label');
    if (aria && !aria.includes('"')) { parts.unshift(`${tag}[aria-label="${aria}"]`); break; }
    const same = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node!.tagName) : [];
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
  }
  return parts.join(' > ');
}

export function teach(target: TeachTarget, hint: string): Promise<string | null> {
  return new Promise((resolve) => {
    const bar = document.createElement('div');
    bar.setAttribute('data-frameloom-teach', '');
    bar.textContent = `Frameloom: ${hint} Press Esc to cancel.`;
    Object.assign(bar.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647', padding: '10px 14px', background: '#111', color: '#fff', font: '14px system-ui', textAlign: 'center' });
    document.body.appendChild(bar);
    const done = (v: string | null) => { document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); bar.remove(); resolve(v); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      if (bar.contains(t)) return;
      e.preventDefault(); e.stopPropagation();
      // A click on an icon inside a button should teach the button.
      done(selectorFor(t.closest('button, [role="button"], [role="tab"], textarea, [contenteditable], input') ?? t));
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    void target;
  });
}
