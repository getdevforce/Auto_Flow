import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_SCRIPT } from '../../../packages/shared/src/fixtures/script';
import { launchExtension, openSidePanel } from './helpers';
import { startMockProvider } from './mock-provider';

async function setup(page: Page) {
  await page.getByRole('button', { name: 'Create vault' }).click();
  const row = page.getByTestId('key-custom');
  await row.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');
  await row.getByLabel('API key').fill('good-key');
  await row.getByRole('button', { name: 'Save key' }).click();
}
async function start(page: Page, autonomy: 'manual' | 'checkpoints' | 'full_auto') {
  const ap = page.getByRole('region', { name: 'Autopilot' });
  await ap.getByLabel('Script or idea').fill(FIXTURE_SCRIPT);
  await ap.getByLabel('Autonomy').selectOption(autonomy);
  await ap.getByLabel('Analysis provider').selectOption('custom');
  await ap.getByLabel('Analysis model').fill('mock-text');
  await ap.getByLabel('Image provider').selectOption('custom');
  await ap.getByLabel('Image model').fill('mock-image');
  await ap.getByRole('button', { name: 'Analyse script' }).click();
  return ap;
}

test('checkpoints mode: analyses, pauses at the characters gate and the locations gate, then locks everything', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setup(page);
  const ap = await start(page, 'checkpoints');

  await expect(ap.getByTestId('analysis-summary')).toContainText('3 character(s), 3 location(s), 5 scene(s). Coverage 5 of 5 scenes.');
  await expect(ap.getByTestId('ap-state')).toHaveText('awaiting_approval / characters', { timeout: 30_000 });
  await expect(ap.getByRole('heading', { name: 'Approve characters' })).toBeVisible();
  for (const n of ['Ada Voss', 'Ben Okoro', 'Mother']) await expect(ap.getByTestId(`gate-${n}`).getByRole('img')).toHaveCount(3);
  await ap.getByLabel('Ada Voss option 2').check();
  await ap.getByRole('button', { name: 'Approve and lock' }).click();

  await expect(ap.getByTestId('ap-state')).toHaveText('awaiting_approval / locations', { timeout: 30_000 });
  await expect(ap.getByRole('heading', { name: 'Approve locations' })).toBeVisible();
  await expect(ap.getByTestId('locks')).toContainText('@v1');
  await ap.getByRole('button', { name: 'Approve and lock' }).click();

  await expect(ap.getByTestId('ap-state')).toHaveText('generating / shot_planning', { timeout: 30_000 });
  await expect(ap.getByTestId('locks')).toContainText('loc_');
  expect(await page.evaluate(async () => {
    const open = indexedDB.open('frameloom');
    return new Promise<number>((r) => { open.onsuccess = () => { const g = open.result.transaction('characterVersions').objectStore('characterVersions').count(); g.onsuccess = () => r(g.result); }; });
  })).toBe(3);
  await ctx.close();
  await mock.close();
});

test('full auto never pauses and logs its decisions', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setup(page);
  const ap = await start(page, 'full_auto');
  await expect(ap.getByTestId('ap-state')).toHaveText('generating / shot_planning', { timeout: 40_000 });
  await expect(ap.getByLabel('Decision log')).toContainText('Auto-approved a portrait for Ada Voss');
  await expect(ap.getByLabel('Decision log')).toContainText('Auto-approved the wide plate for Dock');
  await ctx.close();
  await mock.close();
});

test('manual mode also waits at the characters gate', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setup(page);
  const ap = await start(page, 'manual');
  await expect(ap.getByTestId('ap-state')).toHaveText('awaiting_approval / characters', { timeout: 30_000 });
  await ctx.close();
  await mock.close();
});

test('analysis resumes after a browser restart without paying again for finished chunks', async () => {
  const mock = await startMockProvider();
  const first = await launchExtension();
  let page = await openSidePanel(first.ctx, first.id);
  await setup(page);
  const ap = await start(page, 'checkpoints');
  await expect(ap.getByTestId('analysis-summary')).toBeVisible({ timeout: 30_000 });
  const chatBefore = mock.counts.get('chat') ?? 0;
  await first.ctx.close();
  const second = await launchExtension(first.userDataDir);
  page = await openSidePanel(second.ctx, second.id);
  await expect(page.getByTestId('ap-state')).toHaveText('awaiting_approval / characters', { timeout: 30_000 });
  expect(mock.counts.get('chat')).toBe(chatBefore);
  await second.ctx.close();
  await mock.close();
});
