import http from 'node:http';
import { expect, test } from '@playwright/test';
import { FIXTURE_SCRIPT } from '../../../packages/shared/src/fixtures/script';
import { launchExtension, openSidePanel } from './helpers';
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

  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByLabel('Password').fill('a-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByRole('button', { name: 'Create vault' }).click();
  for (const [row, base] of [['custom', 'http://127.0.0.1:9101/v1'], ['fal', 'http://127.0.0.1:9101/fal']] as const) {
    const r = page.getByTestId(`key-${row}`);
    await r.getByLabel('Base URL').fill(base);
    await r.getByLabel('API key').fill('good-key');
    await r.getByRole('button', { name: 'Save key' }).click();
  }
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
  expect([...new Set(recorder.seen.map((r) => r.url))].sort()).toEqual(['/api/v1/auth/login', '/api/v1/config']);
  await ctx.close();
  await mock.close();
  await recorder.close();
});
