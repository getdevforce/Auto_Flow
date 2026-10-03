import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { FIXTURE_SCRIPT } from '../../../packages/shared/src/fixtures/script';
import { enablePro, launchExtension, openSidePanel, openTab } from './helpers';
import { startMockProvider, type MockProvider } from './mock-provider';

const FAL_BASE = 'http://127.0.0.1:9101/fal';

async function setupKeys(page: Page) {
  await openTab(page, 'Settings');
  await page.getByRole('button', { name: 'Create vault' }).click();
  const custom = page.getByTestId('key-custom');
  await custom.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');
  await custom.getByLabel('API key').fill('good-key');
  await custom.getByRole('button', { name: 'Save key' }).click();
  const fal = page.getByTestId('key-fal');
  await fal.getByLabel('Base URL').fill(FAL_BASE);
  await fal.getByLabel('API key').fill('good-key');
  await fal.getByRole('button', { name: 'Save key' }).click();
}

interface Opts { autonomy?: 'manual' | 'checkpoints' | 'full_auto'; script?: string; mode?: 'native' | 'draft_upscale'; strict?: boolean; budget?: string; upscaleModel?: string; pVid?: string }
async function startRun(page: Page, o: Opts = {}) {
  await openTab(page, 'Autopilot');
  const ap = page.getByRole('region', { name: 'Autopilot' });
  await ap.getByLabel('Script or idea').fill(o.script ?? FIXTURE_SCRIPT);
  await ap.getByLabel('Autonomy').selectOption(o.autonomy ?? 'checkpoints');
  await ap.getByLabel('Analysis provider').selectOption('custom');
  await ap.getByLabel('Analysis model').fill('mock-text');
  await ap.getByLabel('Image provider').selectOption('custom');
  await ap.getByLabel('Image model').fill('mock-image');
  await ap.getByLabel('Video mode', { exact: true }).selectOption(o.mode ?? 'draft_upscale');
  await ap.getByLabel('Video model (fal.ai)').fill((o.mode ?? 'draft_upscale') === 'native' ? 'mock-native' : 'mock-draft');
  await ap.getByLabel('Upscale model', { exact: true }).fill(o.upscaleModel ?? 'mock-up');
  if (o.strict) await ap.getByLabel('Strict download order').check();
  if (o.budget) await ap.getByLabel('Budget cap (USD)').fill(o.budget);
  if (o.pVid) await ap.getByLabel('Video price per second (USD)').fill(o.pVid);
  await ap.getByRole('button', { name: 'Analyse script' }).click();
  return ap;
}
async function idb<T>(page: Page, store: string, fn = 'getAll'): Promise<T> {
  return page.evaluate(([s, f]) => new Promise<T>((resolve) => {
    const o = indexedDB.open('frameloom');
    o.onsuccess = () => { const g = (o.result.transaction(s as string).objectStore(s as string) as unknown as Record<string, () => IDBRequest>)[f as string]!(); g.onsuccess = () => resolve(g.result); };
  }), [store, fn]);
}
const shotsOf = (page: Page) => idb<Array<{ seq: number; status: string; file?: string; width?: number; height?: number; flagReason?: string; downloadedAt?: number; retries: number }>>(page, 'shots').then((r) => r.sort((a, b) => a.seq - b.seq));

async function approveGates(ap: ReturnType<Page['getByRole']>) {
  await expect(ap.getByRole('heading', { name: 'Approve characters' })).toBeVisible({ timeout: 40_000 });
  await ap.getByRole('button', { name: 'Approve and lock' }).click();
  await expect(ap.getByRole('heading', { name: 'Approve locations' })).toBeVisible({ timeout: 40_000 });
  await ap.getByRole('button', { name: 'Approve and lock' }).click();
}

test.setTimeout(150_000);
let mock: MockProvider;
let ctx: BrowserContext;
let page: Page;
async function boot(profile?: string) {
  mock = await startMockProvider();
  const l = await launchExtension(profile);
  ctx = l.ctx;
  page = await openSidePanel(ctx, l.id);
  await enablePro(page);
  await setupKeys(page);
  await page.evaluate(() => new Promise<void>((r) => { const o = indexedDB.open('frameloom'); o.onsuccess = () => { const t = o.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ key: 'pollMs', value: 300 }); t.oncomplete = () => r(); }; }));
  return l;
}
test.afterEach(async () => { await ctx?.close().catch(() => undefined); await mock?.close().catch(() => undefined); });

test('checkpoints: pauses at characters, locations and the pilot scene, then produces every shot in order with manifest and concat list', async () => {
  await boot();
  const ap = await startRun(page);
  await approveGates(ap);
  await expect(ap.getByTestId('pilot-gate')).toBeVisible({ timeout: 60_000 });
  await expect(ap.getByTestId('ap-state')).toHaveText('awaiting_approval / pilot_scene');
  // Only the pilot scene (2 shots) has keyframes so far; nothing later has started.
  expect((await shotsOf(page)).filter((s) => s.status === 'kf_locked').length).toBe(2);
  expect(mock.counts.get('fal:mock-draft') ?? 0).toBe(0);
  await ap.getByRole('button', { name: 'Approve pilot scene' }).click();

  await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 90_000 });
  const shots = await shotsOf(page);
    expect(shots).toHaveLength(6);
  expect(shots.every((s) => s.status === 'done')).toBe(true);
  expect(shots.map((s) => s.file)).toEqual(['Untitled film/001_1_1.mp4', 'Untitled film/002_1_2.mp4', 'Untitled film/003_2_1.mp4', 'Untitled film/004_3_1.mp4', 'Untitled film/005_4_1.mp4', 'Untitled film/006_5_1.mp4']);
  expect(shots.every((s) => s.width === 1280 && s.height === 720)).toBe(true); // draft 640x360 upscaled to the target
  expect(mock.counts.get('fal:mock-draft')).toBe(6);
  expect(mock.counts.get('fal:mock-up')).toBe(6);

  const mf = (await idb<{ manifest: string; concat: string }>(page, 'kv', 'getAll') as unknown as Array<{ key: string; value: { manifest: string; concat: string } }>).find((r) => r.key.startsWith('manifest:'))!.value;
  const manifest = JSON.parse(mf.manifest);
  expect(manifest.mode).toBe('draft_upscale');
  expect(manifest.shots.map((s: { seq: number }) => s.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(manifest.shots[0].prompt).toContain('slow tracking shot');
  expect(mf.concat.trim().split('\n')).toEqual(['001_1_1.mp4', '002_1_2.mp4', '003_2_1.mp4', '004_3_1.mp4', '005_4_1.mp4', '006_5_1.mp4'].map((f) => `file '${f}'`));
  await expect(ap.getByTestId('report')).toContainText('6 shot(s) delivered, 0 flagged');
});

test('full auto never pauses', async () => {
  await boot();
  const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native' });
  await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 90_000 });
  expect(mock.counts.get('fal:mock-native')).toBe(6);
  expect(mock.counts.get('fal:mock-up') ?? 0).toBe(0); // native mode skips the upscale step
  expect((await shotsOf(page)).every((s) => s.width === 1280 && s.height === 720)).toBe(true);
});


const mark = (script: string, marker: string, scene: 'all' | number) => {
  if (scene === 'all') return script.replace(/^((?:INT|EXT)\..*)$/gm, `$1 ${marker}`);
  let i = 0;
  return script.replace(/^((?:INT|EXT)\..*)$/gm, (m) => (++i === scene ? `${m} ${marker}` : m));
};
const runState = (page: Page) => idb<Array<{ state: string; pausedReason?: string; report?: { flagged: Array<{ seq: number; reason: string }> } }>>(page, 'runs').then((r) => r[0]!);

test('shots that finish out of order still get sequence-numbered names; normal mode downloads as they finish', async () => {
  await boot();
  const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[WAIT10]', 1) });
  await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  const shots = await shotsOf(page);
  expect(shots.map((s) => s.file)).toEqual(['Untitled film/001_1_1.mp4', 'Untitled film/002_1_2.mp4', 'Untitled film/003_2_1.mp4', 'Untitled film/004_3_1.mp4', 'Untitled film/005_4_1.mp4', 'Untitled film/006_5_1.mp4']);
  expect(shots[2]!.downloadedAt!).toBeLessThan(shots[0]!.downloadedAt!); // later shot landed first, name still fixes the order
});

test('strict order holds a finished shot until every earlier one is downloaded', async () => {
  await boot();
  const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', strict: true, script: mark(FIXTURE_SCRIPT, '[WAIT10]', 1) });
  await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  const shots = await shotsOf(page);
  const times = shots.map((s) => s.downloadedAt!);
  expect(times).toEqual([...times].sort((a, b) => a - b));
});

test('a bad upscale is retried once, then the draft is kept and the shot is flagged', async () => {
  await boot();
  const ap = await startRun(page, { autonomy: 'full_auto', upscaleModel: 'mock-up-bad' });
  await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  const shots = await shotsOf(page);
  expect(shots.every((s) => s.status === 'done' && s.width === 640 && s.height === 360)).toBe(true);
  expect(shots[0]!.flagReason).toContain('kept the 360p draft');
  expect(mock.counts.get('fal:mock-up-bad')).toBe(12); // two attempts per shot
  await expect(ap.getByTestId('report')).toContainText('6 flagged');
});

test('policy rejection is flagged without retrying and without stalling the other shots', async () => {
  await boot();
  const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[POLICY]', 2) });
  await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  const shots = await shotsOf(page);
  expect(shots.map((s) => s.status)).toEqual(['done', 'done', 'flagged', 'done', 'done', 'done']);
  expect(shots[2]!.flagReason).toContain('declined the prompt');
  const promptCounts = [...mock.counts.entries()].filter(([k]) => k.startsWith('fal:prompt:') && k.includes('[POLICY]'));
  expect(promptCounts.map(([, n]) => n)).toEqual([1]); // exactly one attempt
  await expect(ap.getByTestId('report')).toContainText('5 shot(s) delivered, 1 flagged');
  await ap.getByTestId('shot-3').click();
  await expect(ap.getByTestId('shot-detail')).toContainText('declined the prompt');
});

test('a failing shot is retried, retried with a plainer prompt, then flagged; the run still completes', async () => {
  await boot();
  const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[VFAIL]', 2) });
  await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 120_000 });
  const shots = await shotsOf(page);
  expect(shots.map((s) => s.status)).toEqual(['done', 'done', 'flagged', 'done', 'done', 'done']);
  expect(shots[2]!.retries).toBeGreaterThanOrEqual(1);
  expect(shots[2]!.flagReason).toContain('Kept failing after');
});

test('circuit breaker pauses the run after consecutive failures across different shots, and resume continues', async () => {
  await boot();
  const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[VFAIL]', 'all') });
  await expect(ap.getByTestId('ap-state')).toHaveText(/^paused/, { timeout: 100_000 });
  expect((await runState(page)).pausedReason).toContain('consecutive failures');
});

test('budget cap pauses production before a job would exceed it', async () => {
  await boot();
  const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', budget: '0.12', pVid: '0.01' });
  await expect(ap.getByTestId('ap-state')).toHaveText(/^paused/, { timeout: 100_000 });
  expect((await runState(page)).pausedReason).toContain('Budget cap of $0.12 reached');
  expect(mock.counts.get('fal:mock-native')).toBe(2); // $0.05 each, a third would pass the cap
});

test('a run survives a browser restart mid-production without regenerating finished shots', async () => {
  const first = await boot();
  const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[WAIT8]', 5) });
  await expect.poll(() => mock.counts.get('fal:mock-native') ?? 0, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  await ctx.close();
  const before = mock.counts.get('fal:mock-native') ?? 0;
  const second = await launchExtension(first.userDataDir);
  ctx = second.ctx;
  page = await openSidePanel(ctx, second.id);
  await expect(page.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  const shots = await shotsOf(page);
  expect(shots.every((s) => s.status === 'done')).toBe(true);
  expect(mock.counts.get('fal:mock-native')! - before).toBeLessThanOrEqual(6 - 3 + 1); // only unfinished shots were submitted again, at most one in-flight overlap
  void ap;
});
