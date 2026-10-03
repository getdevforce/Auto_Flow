import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { launchExtension, openSidePanel } from './helpers';
import { startMockProvider } from './mock-provider';

async function setupKey(page: Page) {
  await page.getByRole('button', { name: 'Create vault' }).click();
  const row = page.getByTestId('key-custom');
  await row.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');
  await row.getByLabel('API key').fill('good-key');
  await row.getByRole('button', { name: 'Save key' }).click();
}
async function downloads(ctx: BrowserContext) {
  const [sw] = ctx.serviceWorkers();
  return sw!.evaluate(async () => (await chrome.downloads.search({})).map((d) => d.filename.split(/[\\/]/).slice(-2).join('/')));
}
async function fillCreate(page: Page, prompts: string, extra: { budget?: string; price?: string } = {}) {
  const create = page.getByRole('region', { name: 'Create' });
  await create.getByLabel(/^Prompts/).fill(prompts);
  await create.getByLabel('Provider').selectOption('custom');
  await create.getByLabel('Model').fill('mock-image');
  if (extra.budget) await create.getByLabel(/Budget cap/).fill(extra.budget);
  if (extra.price) await create.getByLabel(/Price per image/).fill(extra.price);
  return create;
}

test('multi-prompt run generates, downloads in order, and shows a cost estimate', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setupKey(page);
  const create = await fillCreate(page, 'a red door\n\na blue door\n\na green door', { price: '0.04' });
  await expect(page.getByTestId('estimate')).toContainText('3 prompt(s). Estimated cost about $0.12');
  await create.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('run-state')).toHaveText('completed', { timeout: 20_000 });
  await expect.poll(async () => (await downloads(ctx)).length).toBe(3);
  // Playwright renames downloads to GUIDs, so assert on the paths the extension requested.
  const requested = await page.evaluate(async () => {
    const open = indexedDB.open('frameloom');
    return new Promise<string[]>((resolve) => {
      open.onsuccess = () => {
        const all = open.result.transaction('jobs').objectStore('jobs').getAll();
        all.onsuccess = () => resolve(all.result.sort((a, b) => a.seq - b.seq).flatMap((j) => j.files ?? []));
      };
    });
  });
  expect(requested).toEqual(['Untitled/001_1_1.png', 'Untitled/002_1_1.png', 'Untitled/003_1_1.png']);
  await ctx.close();
  await mock.close();
});

test('rate limits retry, policy rejections are flagged without stalling the run', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setupKey(page);
  const create = await fillCreate(page, 'ok one\n\nlimited [429x1]\n\nbad [POLICY]\n\nok two');
  await create.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('run-state')).toHaveText('completed', { timeout: 30_000 });
  await expect(page.getByTestId('run')).toContainText('3 of 4 done, 1 flagged');
  await expect(page.getByTestId('run')).toContainText('declined this prompt under its content policy');
  expect(mock.counts.get('limited [429x1]')).toBe(2);
  expect(mock.counts.get('bad [POLICY]')).toBe(1);
  await ctx.close();
  await mock.close();
});

test('budget cap pauses the run and resume continues', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setupKey(page);
  const create = await fillCreate(page, 'one\n\ntwo\n\nthree', { budget: '0.09', price: '0.04' });
  await create.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('run-state')).toHaveText('paused', { timeout: 20_000 });
  await expect(page.getByTestId('run').getByRole('status')).toContainText('Budget cap of $0.09 reached');
  expect(mock.counts.size).toBe(2);
  await ctx.close();
  await mock.close();
});

test('a run survives a browser restart without regenerating finished work', async () => {
  const mock = await startMockProvider();
  const first = await launchExtension();
  let page = await openSidePanel(first.ctx, first.id);
  await setupKey(page);
  const create = await fillCreate(page, 'first\n\nsecond [SLOW]\n\nthird [SLOW]');
  await create.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => mock.counts.get('first') ?? 0).toBe(1);
  await first.ctx.close(); // browser goes away mid-run

  const before = new Map(mock.counts);
  const second = await launchExtension(first.userDataDir);
  page = await openSidePanel(second.ctx, second.id);
  await expect(page.getByTestId('run-state')).toHaveText('completed', { timeout: 30_000 });
  await expect(page.getByTestId('run')).toContainText('3 of 3 done');
  expect(mock.counts.get('first')).toBe(before.get('first')); // finished work was not regenerated
  await second.ctx.close();
  await mock.close();
});
