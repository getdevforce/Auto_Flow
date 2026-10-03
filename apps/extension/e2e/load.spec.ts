import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const extPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.output/chrome-mv3');

const sandboxChrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chromePath = process.env.CHROMIUM_PATH || (fs.existsSync(sandboxChrome) ? sandboxChrome : undefined);

test('extension loads and the side panel renders', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: chromePath,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--headless=new'],
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await expect(page.getByRole('heading', { name: 'Frameloom' })).toBeVisible();
  await ctx.close();
});
