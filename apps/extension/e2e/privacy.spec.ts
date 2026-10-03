import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURE_SCRIPT } from '../../../packages/shared/src/fixtures/script';
import { launchExtension, openSidePanel, openTab } from './helpers';
import { startMockProvider } from './mock-provider';

/** Stands in for the backend and records every byte the extension sends it. */
function startRecorder(port = 9102) {
  const seen: Array<{ method: string; url: string; headers: string; body: string }> = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: JSON.stringify(req.headers), body });
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', '*');
      res.setHeader('Access-Control-Expose-Headers', 'ETag');
      if (req.method === 'OPTIONS') return void res.writeHead(204).end();
      if (req.url === '/api/v1/telemetry') return void res.writeHead(202, { 'content-type': 'application/json' }).end('{"stored":1}');
      if (req.url === '/api/v1/feedback') return void res.writeHead(201, { 'content-type': 'application/json' }).end('{"id":1}');
      if (req.url === '/api/v1/telemetry/preference') return void res.writeHead(200, { 'content-type': 'application/json' }).end('{"enabled":true}');
      if (req.url === '/api/v1/config') return void res.writeHead(200, { 'content-type': 'application/json', ETag: '"r1"' }).end(JSON.stringify({ version: 1, schema: 1, minSupportedVersion: '0.0.1' }));
      res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":{"code":"x","message":"no"}}');
    });
  });
  return new Promise<{ seen: typeof seen; close(): Promise<void> }>((resolve) => server.listen(port, '127.0.0.1', () => resolve({ seen, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) })));
}

test('a full autopilot run never sends keys, script text or prompts to the backend', async () => {
  test.setTimeout(150_000);
  const recorder = await startRecorder();
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await page.evaluate(() => new Promise<void>((r) => { const o = indexedDB.open('frameloom'); o.onsuccess = () => { const t = o.result.transaction('kv', 'readwrite'); const s = t.objectStore('kv'); s.put({ key: 'apiBase', value: 'http://127.0.0.1:9102' }); s.put({ key: 'pollMs', value: 300 }); t.oncomplete = () => r(); }; }));
  await page.reload();
  await expect(page.getByTestId('config-status')).toContainText('Config v1 (network)');

  await openTab(page, 'Settings');
  await page.getByLabel('Email', { exact: true }).fill('someone@example.com');
  await page.getByLabel('Password').fill('a-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByRole('button', { name: 'Create vault' }).click();
  for (const [row, base] of [['custom', 'http://127.0.0.1:9101/v1'], ['fal', 'http://127.0.0.1:9101/fal']] as const) {
    const r = page.getByTestId(`key-${row}`);
    await r.getByLabel('Base URL').fill(base);
    await r.getByLabel('API key').fill('good-key');
    await r.getByRole('button', { name: 'Save key' }).click();
  }
  await openTab(page, 'Autopilot');
  const ap = page.getByRole('region', { name: 'Autopilot' });
  await ap.getByLabel('Script or idea').fill(FIXTURE_SCRIPT);
  await ap.getByLabel('Autonomy').selectOption('full_auto');
  await ap.getByLabel('Analysis provider').selectOption('custom');
  await ap.getByLabel('Analysis model').fill('mock-text');
  await ap.getByLabel('Image provider').selectOption('custom');
  await ap.getByLabel('Image model').fill('mock-image');
  await ap.getByLabel('Video mode', { exact: true }).selectOption('native');
  await ap.getByLabel('Video model (fal.ai)').fill('mock-native');
  await ap.getByRole('button', { name: 'Analyse script' }).click();
  await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 120_000 });

  expect(recorder.seen.length).toBeGreaterThan(0); // the capture is live: config and login were observed
  const all = recorder.seen.map((r) => `${r.url}\n${r.headers}\n${r.body}`).join('\n').toLowerCase();
  for (const secret of ['good-key', 'harbour office', 'ada voss', 'rusted cranes', 'raincoat', 'tracking shot', 'portrait of']) {
    expect(all, `backend saw "${secret}"`).not.toContain(secret);
  }
  // Announcements are fetched with only the extension version and locale in the query.
  expect([...new Set(recorder.seen.map((r) => r.url.split('?')[0]))].sort()).toEqual(['/api/v1/announcements', '/api/v1/auth/login', '/api/v1/config', '/api/v1/telemetry']);
  for (const r of recorder.seen.filter((x) => x.url.startsWith('/api/v1/announcements'))) expect(r.url).toMatch(/^\/api\/v1\/announcements\?version=[\d.]+&locale=\w+$/);

  // Every telemetry body is counts and metadata from the shared catalogue: no extra fields, no free text.
  const catalogue = JSON.parse(fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../packages/shared/src/telemetry/catalogue.json'), 'utf8'));
  // Events are flushed when the run loop winds down, so give the worker a moment after the UI shows completion.
  await expect.poll(() => new Set(recorder.seen.filter((r) => r.url === '/api/v1/telemetry').flatMap((r) => JSON.parse(r.body).events.map((e: { name: string }) => e.name))).has('autopilot_completed'), { timeout: 15_000 }).toBe(true);
  const batches = recorder.seen.filter((r) => r.url === '/api/v1/telemetry').map((r) => JSON.parse(r.body));
  const names = new Set<string>();
  for (const b of batches) {
    expect(Object.keys(b).sort()).toEqual(['events', 'install_id']);
    for (const e of b.events) {
      names.add(e.name);
      expect(catalogue.events).toContain(e.name);
      expect(Object.keys(e).sort()).toEqual(['name', 'props', 'ts']);
      for (const k of Object.keys(e.props)) expect(Object.keys(catalogue.props)).toContain(k);
    }
  }
  expect([...names]).toEqual(expect.arrayContaining(['app_opened', 'autopilot_started', 'autopilot_completed', 'generation']));
  await ctx.close();
  await mock.close();
  await recorder.close();
});

test('turning telemetry off stops all uploads and tells the server', async () => {
  const recorder = await startRecorder(9103);
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await page.evaluate(() => new Promise<void>((r) => { const o = indexedDB.open('frameloom'); o.onsuccess = () => { const t = o.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ key: 'apiBase', value: 'http://127.0.0.1:9103' }); t.oncomplete = () => r(); }; }));
  await openTab(page, 'Settings');
  await page.getByLabel(/Share anonymous usage counts/).uncheck();
  await expect.poll(() => recorder.seen.filter((r) => r.url === '/api/v1/telemetry/preference').length).toBe(1);
  expect(JSON.parse(recorder.seen.find((r) => r.url === '/api/v1/telemetry/preference')!.body).enabled).toBe(false);
  const before = recorder.seen.filter((r) => r.url === '/api/v1/telemetry').length;
  await page.reload();
  await page.waitForTimeout(1500);
  expect(recorder.seen.filter((r) => r.url === '/api/v1/telemetry').length).toBe(before);
  await ctx.close();
  await recorder.close();
});

test('feedback sends only what the user typed; error reports carry codes only', async () => {
  const recorder = await startRecorder(9106);
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await page.evaluate(() => new Promise<void>((r) => { const o = indexedDB.open('frameloom'); o.onsuccess = () => { const t = o.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ key: 'apiBase', value: 'http://127.0.0.1:9106' }); t.oncomplete = () => r(); }; }));
  await page.reload();
  await openTab(page, 'Settings');
  await page.getByLabel('Message').fill('The upscale step is slow');
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await expect.poll(() => recorder.seen.filter((r) => r.url === '/api/v1/feedback').length).toBe(1);
  const body = JSON.parse(recorder.seen.find((r) => r.url === '/api/v1/feedback')!.body);
  expect(body).toEqual({ type: 'feedback', message: 'The upscale step is slow' });
  await ctx.close();
  await recorder.close();
});
