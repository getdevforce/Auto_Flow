import { expect, test, type Page } from '@playwright/test';
import { launchExtension, openSidePanel, openTab } from './helpers';
import { startMockProvider } from './mock-provider';

async function setup(page: Page) {
  await openTab(page, 'Settings');
  await page.getByRole('button', { name: 'Create vault' }).click();
  const row = page.getByTestId('key-custom');
  await row.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');
  await row.getByLabel('API key').fill('good-key');
  await row.getByRole('button', { name: 'Save key' }).click();
}

test('director shows a before/after diff, caches the result, and hides video controls for image targets', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setup(page);
  await openTab(page, 'Cinema');
  const cinema = page.getByRole('region', { name: 'Cinema' });
  await expect(cinema.getByLabel('Camera movement')).toBeVisible();
  await cinema.getByLabel('Target').selectOption('image');
  await expect(cinema.getByLabel('Camera movement')).toHaveCount(0);
  await cinema.getByLabel('Target').selectOption('video');

  await cinema.getByLabel('Camera movement').selectOption({ label: 'Tracking' });
  await cinema.getByLabel('Your prompt').fill('Then Ada walks across the dock');
  await cinema.getByLabel('Director provider').selectOption('custom');
  await cinema.getByLabel('Director model').fill('mock-text');
  await cinema.getByRole('button', { name: 'Refine prompt' }).click();
  await expect(cinema.getByTestId('diff')).toContainText('tracking shot');
  await expect(cinema.getByTestId('diff').locator('ins').first()).toBeVisible();
  await cinema.getByRole('button', { name: 'Accept' }).click();
  await expect(cinema.getByTestId('final')).toHaveValue(/slow tracking shot/);

  const before = mock.counts.get('chat') ?? 0;
  await cinema.getByRole('button', { name: 'Refine prompt' }).click();
  await expect(cinema.getByTestId('refinement')).toContainText('(from cache)');
  expect(mock.counts.get('chat')).toBe(before); // identical input is never paid for twice
  await ctx.close();
  await mock.close();
});

test('angles tool re-renders a still using it as a reference image', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await setup(page);
  await openTab(page, 'Cinema');
  const tools = page.getByLabel('Image tools');
  await tools.getByLabel('Still').setInputFiles({ name: 'still.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
  await tools.getByLabel('Image provider').selectOption('custom');
  await tools.getByLabel('Image model').fill('mock-image');
  await tools.getByRole('button', { name: 'Re-render from angle' }).click();
  await expect(tools.getByTestId('tool-msg')).toContainText('Saved result asset_');
  expect(mock.counts.get('edits')).toBe(1);
  await ctx.close();
  await mock.close();
});
