import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { launchExtension, openSidePanel, openTab } from './helpers';
import { startMockProvider } from './mock-provider';

async function keys(page: Page, passphrase?: string) {
  await openTab(page, 'Settings');
  if (passphrase) await page.getByLabel(/Passphrase/).fill(passphrase);
  await page.getByRole('button', { name: 'Create vault' }).click();
  const row = page.getByTestId('key-custom');
  await row.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');
  await row.getByLabel('API key').fill('good-key');
  await row.getByRole('button', { name: 'Save key' }).click();
  await expect(row.getByRole('status')).toContainText('Saved');
}
async function runCreate(page: Page, prompt: string) {
  await openTab(page, 'Create');
  const c = page.getByRole('region', { name: 'Create' });
  await c.getByLabel(/^Prompts/).fill(prompt);
  await c.getByLabel('Provider').selectOption('custom');
  await c.getByLabel('Model').fill('mock-image');
  await c.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('run-state').first()).toHaveText('completed', { timeout: 30_000 });
}

test('a passphrase vault unlocked in the panel lets the background worker run jobs, and refuses a short passphrase', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await openTab(page, 'Settings');
  await page.getByLabel(/Passphrase/).fill('short');
  await page.getByRole('button', { name: 'Create vault' }).click();
  await expect(page.getByRole('alert')).toContainText('at least 10 characters');
  await page.getByLabel(/Passphrase/).fill('a-long-passphrase');
  await page.getByRole('button', { name: 'Create vault' }).click();
  const row = page.getByTestId('key-custom');
  await row.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');
  await row.getByLabel('API key').fill('good-key');
  await row.getByRole('button', { name: 'Save key' }).click();
  await runCreate(page, 'a red door'); // the service worker had no passphrase of its own
  expect(mock.counts.get('a red door')).toBe(1);
  await ctx.close();
  await mock.close();
});

test('theme and density apply and persist; the shortcut sheet opens with ? and tabs switch with Alt+number', async () => {
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await openTab(page, 'Settings');
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Density').selectOption('compact');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.keyboard.press('?');
  await expect(page.getByTestId('shortcut-sheet')).toContainText('Alt + 1 to 7');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shortcut-sheet')).toHaveCount(0);
  await page.keyboard.press('Alt+4');
  await expect(page.getByRole('tab', { name: 'Bible' })).toHaveAttribute('aria-selected', 'true');
  await ctx.close();
});

test('a project exports without any key, imports back after everything is deleted, and delete-all really clears the browser', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await keys(page);
  await runCreate(page, 'a blue door');
  await openTab(page, 'Settings');

  // Intercept the download the Export button triggers.
  const downloadUrl = page.evaluate(() => new Promise<string>((resolve) => {
    const orig = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = async (o: { url: string }) => { resolve(o.url); return 1; };
    void orig;
  }));
  await page.getByLabel('Include images and video (large)').check();
  await page.getByRole('button', { name: 'Export project' }).click();
  const url = await downloadUrl;
  const bundle = await page.evaluate(async (u) => (await fetch(u)).text(), url);
  expect(bundle).toContain('"format":"frameloom-project"');
  expect(bundle).toContain('a blue door');
  expect(bundle).not.toMatch(/vault|good-key|passphrase|deviceKey/i);

  // Delete everything.
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.waitForLoadState('load');
  await openTab(page, 'Settings');
  await expect(page.getByRole('button', { name: 'Create vault' })).toBeVisible(); // vault is gone
  await expect(page.getByText('No projects yet')).toBeVisible();

  // Import it back from a file.
  const file = '/tmp/frameloom-roundtrip.json';
  fs.writeFileSync(file, bundle);
  await page.getByLabel('Import a project file').setInputFiles(file);
  await expect(page.getByTestId('project-msg')).toContainText('Imported Untitled');
  await openTab(page, 'Library');
  await expect(page.getByTestId('lib-item')).toHaveCount(1);

  // A file with a credential-looking field is refused.
  fs.writeFileSync(file, JSON.stringify({ format: 'frameloom-project', version: 1, exportedAt: 'x', project: 'p', tables: { runs: [{ id: 'r', apiKey: 'sk-x' }] } }));
  await openTab(page, 'Settings');
  await page.getByLabel('Import a project file').setInputFiles(file);
  await expect(page.getByTestId('project-msg')).toContainText('looks like a credential');
  await ctx.close();
  await mock.close();
});
