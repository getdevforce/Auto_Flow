import type { FlowJob } from '@frameloom/shared';
import { alertTexts, fetchMedia, findPromptBox, findSubmit, mediaOnPage, pressEnter, selectMode, setPromptText, sleep, teach, waitForNewMedia, type Fetched } from '../src/flow/dom';
import { KEYS, flowStore, type FlowProgress, type FlowRun, type FlowSelectors, type TeachTarget } from '../src/flow/types';

// Flow lives on labs.google. The e2e build also matches the local stand-in page.
export default defineContentScript({
  matches: import.meta.env.WXT_E2E ? ['https://labs.google/*', 'http://127.0.0.1/flow-mock*'] : ['https://labs.google/*'],
  runAt: 'document_idle',
  main() {
    const w = window as unknown as { __frameloomFlow?: boolean };
    if (w.__frameloomFlow) return;
    w.__frameloomFlow = true;

    let myTab: number | undefined;
    let running = false;
    let lastKind: FlowJob['kind'] | undefined;
    let cancelled = false;

    const TIMEOUT: Record<FlowJob['kind'], number> = { character: 4 * 60_000, shot: 12 * 60_000 };
    const HINTS: Record<TeachTarget, string> = {
      promptBox: 'click the box where you type the prompt.',
      submit: 'click the button that starts generating (Create, Generate or the arrow).',
      modeImage: 'click the control that switches Flow to making pictures.',
      modeVideo: 'click the control that switches Flow to making video.',
    };

    const readRun = () => flowStore.get<FlowRun>(KEYS.run);
    async function patch(jobId: string, p: FlowProgress[string]): Promise<void> {
      const cur = (await flowStore.get<FlowProgress>(KEYS.progress)) ?? {};
      await flowStore.set(KEYS.progress, { ...cur, [jobId]: { ...cur[jobId], ...p } });
    }
    async function setRunState(state: FlowRun['state']): Promise<void> {
      const run = await readRun();
      if (run) await flowStore.set(KEYS.run, { ...run, state });
    }

    async function save(job: FlowJob, got: Fetched): Promise<string> {
      const r = (await chrome.runtime.sendMessage({ type: 'flow:save', file: job.file, mime: got.mime, b64: got.b64 })) as { ok: boolean; filename?: string; error?: string };
      if (!r?.ok) throw new Error(r?.error ?? 'Chrome refused the download.');
      return r.filename as string;
    }

    /** Reading the result from the page can be blocked by cross-origin rules; the worker is allowed to try with its own permissions. */
    async function readResult(url: string): Promise<Fetched> {
      try { return await fetchMedia(url); } catch (e) {
        if (!/^https?:/.test(url)) throw e;
        const r = (await chrome.runtime.sendMessage({ type: 'flow:fetch-url', url })) as { ok: boolean; b64?: string; mime?: string; error?: string };
        if (!r?.ok) throw new Error(r?.error ?? (e as Error).message);
        return { b64: r.b64 as string, mime: r.mime as string };
      }
    }

    class NeedsYou extends Error {}

    async function submitOnce(job: FlowJob, sel: FlowSelectors): Promise<void> {
      if (job.kind !== lastKind) { selectMode(job.kind === 'character' ? 'image' : 'video', sel); await sleep(900); lastKind = job.kind; }
      let box = findPromptBox(sel);
      for (let i = 0; !box && i < 20; i++) { await sleep(1500); box = findPromptBox(sel); }
      if (!box) throw new NeedsYou('Frameloom could not find the prompt box on this page. Open a Flow project, then use "Show Frameloom where the prompt box is" and resume.');
      const before = new Set(mediaOnPage().map((m) => m.key));
      const beforeAlerts = new Set(alertTexts());
      setPromptText(box, job.prompt);
      await sleep(500);
      const btn = findSubmit(box, sel);
      if (btn) btn.click(); else pressEnter(box);
      const res = await waitForNewMedia({ want: job.kind === 'character' ? 'image' : 'video', before, beforeAlerts, timeoutMs: TIMEOUT[job.kind], isCancelled: () => cancelled });
      if (!res.ok) throw new Error(res.error);
      const got = await readResult(res.media.url);
      await patch(job.id, { status: 'done', error: undefined, savedAs: await save(job, got) });
    }

    async function doJob(job: FlowJob): Promise<void> {
      await patch(job.id, { status: 'working', error: undefined });
      const sel = (await flowStore.get<FlowSelectors>(KEYS.selectors)) ?? {};
      let lastError = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        try { await submitOnce(job, sel); return; } catch (e) {
          if (e instanceof NeedsYou) { await patch(job.id, { status: 'queued', error: e.message }); await setRunState('paused'); throw e; }
          lastError = (e as Error).message;
          if (cancelled || /^Flow said:/.test(lastError)) break; // a refusal will not change on a second try; the user should see the wording
        }
      }
      await patch(job.id, { status: 'failed', error: lastError });
    }

    async function drive(): Promise<void> {
      myTab ??= ((await chrome.runtime.sendMessage({ type: 'flow:whoami' })) as { tabId?: number } | undefined)?.tabId;
      for (;;) {
        const run = await readRun();
        cancelled = !run || run.state !== 'running';
        if (!run || cancelled || run.tabId !== myTab) return;
        const progress = (await flowStore.get<FlowProgress>(KEYS.progress)) ?? {};
        const job = run.jobs.find((j) => !['done', 'failed'].includes(progress[j.id]?.status ?? 'queued'));
        if (!job) { await setRunState('done'); return; }
        try { await doJob(job); } catch (e) { if (e instanceof NeedsYou) return; throw e; }
        await sleep(2000); // gives Flow a moment between requests
      }
    }

    async function tick(): Promise<void> {
      if (running) return;
      running = true;
      try { await drive(); } catch (e) { console.warn('Frameloom flow driver stopped', e); } finally { running = false; }
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KEYS.run]) return;
      const next = changes[KEYS.run]!.newValue as FlowRun | undefined;
      cancelled = !next || next.state !== 'running';
      if (!cancelled) void tick();
    });

    chrome.runtime.onMessage.addListener((m: { type?: string; target?: TeachTarget }, sender, respond) => {
      if (sender.id !== chrome.runtime.id) return false;
      if (m.type === 'flow:wake') { void tick(); respond({ ok: true }); return false; }
      if (m.type === 'flow:teach' && m.target) {
        const target = m.target;
        void teach(target, HINTS[target]).then(async (selector) => {
          if (selector) await flowStore.set(KEYS.selectors, { ...((await flowStore.get<FlowSelectors>(KEYS.selectors)) ?? {}), [target]: selector });
          respond({ ok: !!selector, selector });
        });
        return true;
      }
      return false;
    });

    void tick(); // resumes after a page reload
  },
});
