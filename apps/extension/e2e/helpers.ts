import { chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const extPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.output/chrome-mv3');
const sandboxChrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chromePath = process.env.CHROMIUM_PATH || (fs.existsSync(sandboxChrome) ? sandboxChrome : undefined);

export async function launchExtension(userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-'))): Promise<{ ctx: BrowserContext; id: string; userDataDir: string }> {
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: chromePath,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--headless=new'],
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  return { ctx, id: new URL(sw.url()).host, userDataDir };
}

export async function openSidePanel(ctx: BrowserContext, id: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  return page;
}

export const openTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();
