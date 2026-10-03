import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchExtension, openSidePanel, openTab } from './helpers';
import { startMockProvider } from './mock-provider';

async function setupKey(page: Page) {
  await openTab(page, 'Settings');
  await page.getByRole('button', { name: 'Create vault' }).click();
  const row = page.getByTestId('key-custom');
  await row.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');
  await row.getByLabel('API key').fill('good-key');
  await row.getByRole('button', { name: 'Save key' }).click();
}

test('generated images land in the library with search, favorites, tags, albums and a storage readout', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setupKey(page);
  await openTab(page, 'Create');
  const create = page.getByRole('region', { name: 'Create' });
  await create.getByLabel(/^Prompts/).fill('a red door\n\na blue door');
  await create.getByLabel('Provider').selectOption('custom');
  await create.getByLabel('Model').fill('mock-image');
  await create.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('run-state')).toHaveText('completed', { timeout: 30_000 });

  await openTab(page, 'Library');
  const lib = page.getByRole('region', { name: 'Library' });
  await expect(lib.getByTestId('lib-item')).toHaveCount(2);
  await expect(lib.getByTestId('quota')).toContainText('2 item(s)');
  await lib.getByLabel('Search').fill('blue');
  await expect(lib.getByTestId('lib-item')).toHaveCount(1);
  await lib.getByLabel('Search').fill('purple');
  await expect(lib.getByText('No items match')).toBeVisible();
  await lib.getByLabel('Search').fill('');

  await lib.getByLabel('Add favorite').first().click();
  await lib.getByLabel('Favorites only').check();
  await expect(lib.getByTestId('lib-item')).toHaveCount(1);
  await lib.getByLabel('Favorites only').uncheck();

  await lib.getByLabel('Open a blue door').click();
  await lib.getByLabel('Tags (comma separated)').fill('hero, set');
  await lib.getByLabel('Tags (comma separated)').blur();
  await lib.getByLabel('New album name').fill('Doors');
  await lib.getByRole('button', { name: 'Create album' }).click();
  await lib.getByLabel('Album', { exact: true }).first().selectOption({ label: 'Doors' });
  await lib.getByLabel('Search').fill('hero');
  await expect(lib.getByTestId('lib-item')).toHaveCount(1);
  await ctx.close();
  await mock.close();
});

test('frames can be extracted from a video in the library (first, last, any time)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-vid-'));
  const file = path.join(dir, 'clip.webm');
  execFileSync('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10', '-t', '2', '-c:v', 'libvpx', '-y', file], { stdio: 'ignore' });
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await openTab(page, 'Library');
  const lib = page.getByRole('region', { name: 'Library' });
  await lib.getByLabel('Add a file').setInputFiles(file);
  await expect(lib.getByTestId('lib-item')).toHaveCount(1);
  await lib.getByRole('button', { name: /^Open/ }).click();
  await lib.getByRole('button', { name: 'First frame' }).click();
  await expect(lib.getByRole('status')).toContainText('Saved the first frame.', { timeout: 20_000 });
  await lib.getByRole('button', { name: 'Last frame' }).click();
  await expect(lib.getByRole('status')).toContainText('Saved the last frame.', { timeout: 20_000 });
  await lib.getByLabel('Frame time in seconds').fill('1');
  await lib.getByRole('button', { name: 'Extract frame' }).click();
  await expect(lib.getByRole('status')).toContainText('Saved the frame at 1s.', { timeout: 20_000 });
  await expect(lib.getByTestId('lib-item')).toHaveCount(4);
  const dims = await lib.locator('img').evaluateAll((imgs) => (imgs as HTMLImageElement[]).map((i) => [i.naturalWidth, i.naturalHeight]));
  expect(dims).toHaveLength(3);
  for (const d of dims) expect(d).toEqual([160, 90]);
  await ctx.close();
});

test('template browser loads published templates from the server, fills variables locally and hands the prompt to Create', async () => {
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await openTab(page, 'Prompts');
  const t = page.getByRole('region', { name: 'Templates' });
  await expect(t.getByTestId('template-card')).toHaveCount(2); // the draft is not listed
  await t.getByLabel('Search templates').fill('chase');
  await expect(t.getByTestId('template-card')).toHaveCount(1);
  await t.getByLabel('Search templates').fill('');
  await t.getByRole('button', { name: /Walk through a place/ }).click();
  const detail = t.getByTestId('template-detail');
  await detail.getByLabel('character').fill('Ada');
  await detail.getByLabel('location').fill('the dock');
  await detail.getByRole('button', { name: 'Use in Create' }).click();
  await openTab(page, 'Create');
  await expect(page.getByRole('region', { name: 'Create' }).getByLabel(/^Prompts/)).toHaveValue('Ada walks through the dock, quiet mood');
  await expect.poll(async () => (await (await fetch('http://127.0.0.1:8000/api/v1/templates/walk-through')).json()).use_count).toBe(1);
  await ctx.close();
});

test('personal prompts can be saved, reused and deleted', async () => {
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await openTab(page, 'Prompts');
  const t = page.getByRole('region', { name: 'Templates' });
  await expect(t.getByText('No saved prompts yet')).toBeVisible();
  await t.getByLabel('Title').fill('Dock walk');
  await t.getByLabel(/^Prompt \(use/).fill('{character} on the dock');
  await t.getByRole('button', { name: 'Save prompt' }).click();
  await expect(t.getByLabel('Saved prompts').getByText('Dock walk')).toBeVisible();
  await t.getByRole('button', { name: 'Use', exact: true }).click();
  await openTab(page, 'Create');
  await expect(page.getByRole('region', { name: 'Create' }).getByLabel(/^Prompts/)).toHaveValue('{character} on the dock');
  await openTab(page, 'Prompts');
  await t.getByRole('button', { name: 'Delete' }).click();
  await expect(t.getByText('No saved prompts yet')).toBeVisible();
  await ctx.close();
});
