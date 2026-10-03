import http from 'node:http';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_SCRIPT } from '../../../packages/shared/src/fixtures/script';
import { launchExtension, openSidePanel, openTab } from './helpers';
import { startMockProvider } from './mock-provider';

/** Stand-in backend: login plus a configurable plan, so limits can be tested without editing a real database. */
function startPlanServer(limits: Record<string, unknown>, port = 9107) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const json = (s: number, b: unknown, h: Record<string, string> = {}) => void res.writeHead(s, { 'content-type': 'application/json', ...h }).end(JSON.stringify(b));
    if (req.url === '/api/v1/config') return json(200, { version: 1, schema: 1, minSupportedVersion: '0.0.1' }, { ETag: '"c"' });
    if (req.url === '/api/v1/auth/login') return json(200, { token: 'tok', user: { email: 'p@example.com', plan: 'free' }, device_id: 1 });
    if (req.url === '/api/v1/entitlements') return json(200, { plan: 'free', limits, bonus_runs: 0, subscription: null });
    if (req.url?.startsWith('/api/v1/announcements')) return json(200, { data: [] });
    if (req.url?.startsWith('/api/v1/telemetry')) return json(202, { stored: 0 });
    res.writeHead(404).end();
  });
  return new Promise<{ close(): Promise<void> }>((resolve) => server.listen(port, '127.0.0.1', () => resolve({ close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) })));
}

async function boot(limits: Record<string, unknown>) {
  const plan = await startPlanServer(limits);
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await page.evaluate(() => new Promise<void>((r) => { const o = indexedDB.open('frameloom'); o.onsuccess = () => { const t = o.result.transaction('kv', 'readwrite'); const s = t.objectStore('kv'); s.put({ key: 'apiBase', value: 'http://127.0.0.1:9107' }); s.put({ key: 'pollMs', value: 300 }); t.oncomplete = () => r(); }; }));
  await page.reload();
  await openTab(page, 'Settings');
  await page.getByLabel('Email', { exact: true }).fill('p@example.com');
  await page.getByLabel('Password').fill('whatever-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('plan-usage')).toBeVisible();
  await page.getByRole('button', { name: 'Create vault' }).click();
  for (const [row, base] of [['custom', 'http://127.0.0.1:9101/v1'], ['fal', 'http://127.0.0.1:9101/fal']] as const) {
    const r = page.getByTestId(`key-${row}`);
    await r.getByLabel('Base URL').fill(base);
    await r.getByLabel('API key').fill('good-key');
    await r.getByRole('button', { name: 'Save key' }).click();
  }
  return { ctx, page, mock, plan };
}

async function fillRun(page: Page, autonomy: 'manual' | 'checkpoints' | 'full_auto', project = 'Film') {
  await openTab(page, 'Autopilot');
  const ap = page.getByRole('region', { name: 'Autopilot' });
  await ap.getByLabel('Script or idea').fill(FIXTURE_SCRIPT);
  await ap.getByLabel('Autonomy').selectOption(autonomy);
  await ap.getByLabel('Project').fill(project);
  await ap.getByLabel('Analysis provider').selectOption('custom');
  await ap.getByLabel('Analysis model').fill('mock-text');
  await ap.getByLabel('Image provider').selectOption('custom');
  await ap.getByLabel('Image model').fill('mock-image');
  await ap.getByLabel('Video mode', { exact: true }).selectOption('native');
  await ap.getByLabel('Video model (fal.ai)').fill('mock-native');
  await ap.getByRole('button', { name: 'Analyse script' }).click();
  return ap;
}

test.describe('plan limits', () => {
  test.setTimeout(150_000);

  test('shows plan usage, blocks full auto without the feature, and trims shots to the plan limit', async () => {
    const { ctx, page, mock, plan } = await boot({ runs_per_month: 1, shots_per_run: 2, projects: 5, characters: 6, devices: 1, features: [] });
    await expect(page.getByTestId('plan-usage')).toContainText('free plan: 0 of 1 Autopilot runs this month, up to 2 shots per run');

    let ap = await fillRun(page, 'full_auto');
    await expect(ap.getByRole('alert')).toContainText('Full auto is not part of the free plan');

    ap = await fillRun(page, 'checkpoints');
    await expect(ap.getByRole('heading', { name: 'Approve characters' })).toBeVisible({ timeout: 40_000 });
    await ap.getByRole('button', { name: 'Approve and lock' }).click();
    await expect(ap.getByRole('heading', { name: 'Approve locations' })).toBeVisible({ timeout: 40_000 });
    await ap.getByRole('button', { name: 'Approve and lock' }).click();
    await expect(ap.getByTestId('pilot-gate')).toBeVisible({ timeout: 60_000 });
    await ap.getByRole('button', { name: 'Approve pilot scene' }).click();
    await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 90_000 });
    await expect(ap.getByLabel('Decision log')).toContainText('Your free plan allows 2 shots per run');
    await expect(ap.getByTestId('report')).toContainText('2 shot(s) delivered');
    expect(mock.counts.get('fal:mock-native')).toBe(2); // only the allowed shots were generated and paid for

    // The monthly run allowance is now used up.
    await ap.getByRole('button', { name: 'Start another' }).click();
    ap = await fillRun(page, 'checkpoints', 'Film');
    await expect(ap.getByRole('alert')).toContainText('used all 1 Autopilot runs this month');
    await ctx.close();
    await mock.close();
    await plan.close();
  });

  test('stops a script with more characters than the plan allows, and the Bible respects the character limit', async () => {
    const { ctx, page, mock, plan } = await boot({ runs_per_month: 5, shots_per_run: 12, projects: 5, characters: 2, devices: 1, features: ['full_auto'] });
    const ap = await fillRun(page, 'full_auto');
    await expect(ap.getByRole('status')).toContainText('The script has 3 characters; the free plan allows 2', { timeout: 40_000 });
    await openTab(page, 'Bible');
    const bible = page.getByRole('region', { name: 'Story Bible' });
    for (const n of ['A', 'B']) {
      await bible.getByLabel('New character name').fill(n);
      await bible.getByRole('button', { name: 'Add' }).click();
      await expect(bible.getByTestId(`char-${n}`)).toBeVisible();
    }
    await bible.getByLabel('New character name').fill('C');
    await bible.getByRole('button', { name: 'Add' }).click();
    await expect(bible.getByRole('status')).toContainText('Your plan allows 2 characters');
    await ctx.close();
    await mock.close();
    await plan.close();
  });
});
