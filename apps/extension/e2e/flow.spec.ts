import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_SCRIPT } from '../../../packages/shared/src/fixtures/script';
import { launchExtension, openSidePanel, openTab } from './helpers';
import { startMockProvider } from './mock-provider';

async function setup(page: Page) {
  await openTab(page, 'Settings');
  await page.getByRole('button', { name: 'Create vault' }).click();
  const row = page.getByTestId('key-custom');
  await row.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');
  await row.getByLabel('API key').fill('good-key');
  await row.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByTestId('key-custom')).toContainText('Saved');
}

test.setTimeout(240_000);
test('script in: characters and scenes found, prompts typed into Flow, results saved in order', async () => {
  const mock = await startMockProvider();
  const { ctx, id, userDataDir } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setup(page);

  await openTab(page, 'Flow');
  const flow = page.getByRole('region', { name: 'Script to Flow' });
  await flow.getByLabel('Project name').fill('Tea time');
  await flow.getByLabel('Script', { exact: true }).fill(FIXTURE_SCRIPT);
  await flow.getByLabel('Text provider').selectOption('custom');
  await flow.getByLabel('Model name').fill('mock-text');
  await flow.getByLabel('Look for every shot (optional)').fill('warm film grain');
  await flow.getByText('If it cannot find Flow').click();
  await flow.getByLabel('Flow address').fill('http://127.0.0.1:9101/flow-mock');
  await flow.getByRole('button', { name: 'Read script and prepare prompts' }).click();

  const plan = flow.getByRole('region', { name: 'Plan' });
  await expect(plan.getByRole('heading', { level: 3 })).toContainText('3 characters', { timeout: 30_000 });
  // Keep the test short: one character picture and the first shot. Items 0-2 are characters, 3 is scene 1 shot 1.
  const items = plan.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Remove' }) });
  const total = await items.count();
  for (let i = total - 1; i >= 4; i--) await items.nth(i).getByRole('button', { name: 'Remove' }).click();
  await items.nth(2).getByRole('button', { name: 'Remove' }).click();
  await items.nth(1).getByRole('button', { name: 'Remove' }).click();
  const prompt = plan.getByLabel(/^Prompt for Scene 1, shot 1$/);
  await expect(prompt).toHaveValue(/Ada Voss \(/);
  await expect(prompt).toHaveValue(/warm film grain/);

  const flowTab = ctx.waitForEvent('page');
  await plan.getByRole('button', { name: 'Open Flow and start' }).click();
  const flowPage = await flowTab;
  flowPage.on('console', (m) => console.log('FLOWPAGE', m.text()));
  flowPage.on('pageerror', (e) => console.log('FLOWERR', e.message));
  await expect(flowPage).toHaveURL(/flow-mock/);

  await expect(flow.getByTestId('flow-counts')).toContainText('0 failed', { timeout: 20_000 });
  await expect.poll(async () => (await flow.getByTestId('flow-counts').innerText()), { timeout: 150_000 }).toMatch(/^2 saved/);
  await expect(flow.getByRole('region', { name: 'Progress' })).toContainText('Progress (done)');

  const sent = await flowPage.evaluate(() => (window as unknown as { __prompts: Array<{ mode: string; text: string }> }).__prompts);
  expect(sent.map((s) => s.mode)).toEqual(['image', 'video']);
  expect(sent[1]!.text).toContain('warm film grain');

  const files = await flow.getByTestId('flow-job').allInnerTexts();
  expect(files.join('\n')).toMatch(/Frameloom\/Tea_time\/characters\/01_.*\.png/);
  expect(files.join('\n')).toMatch(/Frameloom\/Tea_time\/001_scene01_shot01\.webm/);
  await ctx.close();
  await mock.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

test('a refusal from Flow is shown with its wording and the run moves on', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await openTab(page, 'Flow');
  await page.evaluate(async () => {
    await chrome.storage.local.set({ flowRun: { id: 'r1', project: 'p', state: 'stopped', jobs: [
      { id: 'a', kind: 'shot', title: 'Blocked shot', prompt: 'a [BLOCK] scene', file: 'p/001', status: 'queued' },
    ] } });
  });
  const flowPage = await ctx.newPage();
  await flowPage.goto('http://127.0.0.1:9101/flow-mock');
  const tabId = await page.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1/flow-mock*' }))[0]!.id);
  await page.evaluate(async (t) => {
    const r = (await chrome.storage.local.get('flowRun')).flowRun;
    await chrome.storage.local.set({ flowProgress: {}, flowRun: { ...r, state: 'running', tabId: t } });
  }, tabId);
  const job = page.getByTestId('flow-job');
  await expect(job).toContainText('Flow said: Something went wrong', { timeout: 30_000 });
  await expect(job).toContainText('Failed');
  await ctx.close();
  await mock.close();
});
