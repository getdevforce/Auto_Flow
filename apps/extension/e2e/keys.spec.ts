import { expect, test } from '@playwright/test';
import { launchExtension, openSidePanel } from './helpers';
import { startMockProvider } from './mock-provider';

test('stores keys encrypted, tests the connection against a mock provider, and removes them', async () => {
  const mock = await startMockProvider();
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);

  await page.getByRole('button', { name: 'Create vault' }).click();
  const row = page.getByTestId('key-custom');
  await row.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');

  await row.getByLabel('API key').fill('bad-key');
  await row.getByRole('button', { name: 'Save key' }).click();
  await row.getByRole('button', { name: 'Test connection' }).click();
  await expect(row.getByRole('status')).toContainText('Custom endpoint rejected the key. Check it in Settings > Keys.');
  await row.getByRole('button', { name: 'Remove' }).click();

  await row.getByLabel('Base URL').fill('http://127.0.0.1:9101/v1');
  await row.getByLabel('API key').fill('good-key');
  await row.getByRole('button', { name: 'Save key' }).click();
  await row.getByRole('button', { name: 'Test connection' }).click();
  await expect(row.getByRole('status')).toContainText('Connection works.');
  expect(mock.requests.at(-1)).toEqual({ url: '/v1/models', auth: 'Bearer good-key' });

  // The stored record must not contain the plaintext key.
  const stored = await page.evaluate(() => new Promise<string>((resolve) => {
    const open = indexedDB.open('frameloom');
    open.onsuccess = () => {
      const get = open.result.transaction('kv').objectStore('kv').get('vault');
      get.onsuccess = () => resolve(JSON.stringify(Array.from(get.result.value.secrets.custom.ct)));
    };
  }));
  expect(stored).not.toContain('good-key');
  await ctx.close();
  await mock.close();
});
