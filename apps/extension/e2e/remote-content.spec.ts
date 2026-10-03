import http from 'node:http';
import { expect, test } from '@playwright/test';
import { launchExtension, openSidePanel, openTab } from './helpers';

function startConfigServer(config: Record<string, unknown>, announcements: unknown[], port: number) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (req.url?.startsWith('/api/v1/config')) return void res.writeHead(200, { 'content-type': 'application/json', ETag: `"${Date.now()}"` }).end(JSON.stringify(config));
    if (req.url?.startsWith('/api/v1/announcements')) return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: announcements }));
    if (req.url?.startsWith('/api/v1/telemetry')) return void res.writeHead(202, { 'content-type': 'application/json' }).end('{"stored":0}');
    res.writeHead(404).end();
  });
  return new Promise<{ close(): Promise<void> }>((resolve) => server.listen(port, '127.0.0.1', () => resolve({ close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) })));
}
const setBase = (page: import('@playwright/test').Page, base: string) => page.evaluate((b) => new Promise<void>((r) => { const o = indexedDB.open('frameloom'); o.onsuccess = () => { const t = o.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ key: 'apiBase', value: b }); t.oncomplete = () => r(); }; }), base);

test('remote presets, feature flags and announcements reach the panel; dismissals stick', async () => {
  const srv = await startConfigServer({
    version: 5, schema: 1, minSupportedVersion: '0.0.1',
    presets: { camera: [{ id: 'cam_remote', kind: 'camera', name: 'Remote orbit', prompt: 'orbit from the CMS', requires: ['video'] }], effects: [], styles: [] },
    featureFlags: { image_tools: { enabled: false } },
  }, [{ key: 'welcome', title: 'Welcome back', body: 'New presets are live.', dismissible: true }], 9104);
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setBase(page, 'http://127.0.0.1:9104');
  await page.reload();
  await expect(page.getByTestId('config-status')).toContainText('Config v5 (network)');
  await expect(page.getByTestId('announcement')).toContainText('Welcome back');

  await openTab(page, 'Cinema');
  const cinema = page.getByRole('region', { name: 'Cinema' });
  await expect(cinema.getByLabel('Camera movement').locator('option', { hasText: 'Remote orbit' })).toHaveCount(1);
  await expect(cinema.getByLabel('Camera movement').locator('option', { hasText: 'Tracking' })).toHaveCount(0); // CMS set replaces the bundled set
  await expect(page.getByLabel('Image tools')).toHaveCount(0); // flag off

  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByTestId('announcement')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('config-status')).toContainText('Config v5');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('announcement')).toHaveCount(0);
  await ctx.close();
  await srv.close();
});

test('an unsupported version is told to update and cannot start work', async () => {
  const srv = await startConfigServer({ version: 2, schema: 1, minSupportedVersion: '9.9.9', release: { message: 'Please update to version 9.9.9 to keep generating.' } }, [], 9105);
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setBase(page, 'http://127.0.0.1:9105');
  await page.reload();
  await expect(page.getByTestId('update-required')).toContainText('Please update to version 9.9.9');
  await openTab(page, 'Create');
  const create = page.getByRole('region', { name: 'Create' });
  await create.getByLabel(/^Prompts/).fill('a door');
  await create.getByRole('button', { name: 'Start' }).click();
  await expect(create.getByRole('alert')).toContainText('Please update to version 9.9.9');
  await ctx.close();
  await srv.close();
});
