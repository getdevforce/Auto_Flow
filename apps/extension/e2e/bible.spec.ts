import { expect, test } from '@playwright/test';
import { launchExtension, openSidePanel, openTab } from './helpers';

test('characters lock into immutable versions; edits mint a new version', async () => {
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await openTab(page, 'Bible');
  await expect(page.getByText('No characters yet')).toBeVisible();
  await page.getByLabel('New character name').fill('Ada Voss');
  await page.getByRole('button', { name: 'Add' }).click();
  const card = page.getByTestId('char-Ada Voss');
  await card.getByLabel('hair').fill('short black bob');
  await card.getByLabel('hair').blur();
  await card.getByRole('button', { name: 'Lock character' }).click();
  await expect(card.getByTestId('locked-as')).toHaveText(/locked: char_[a-z0-9]+@v1/);
  const first = (await card.getByTestId('locked-as').textContent())!;
  expect(first).toMatch(/locked: char_[a-z0-9]+@v1/);

  await card.getByRole('button', { name: 'Lock character' }).click(); // unchanged: same version
  await expect(card.getByTestId('locked-as')).toHaveText(first);

  await card.getByLabel('hair').fill('long red hair');
  await card.getByLabel('hair').blur();
  await card.getByRole('button', { name: 'Lock character' }).click();
  await expect(card.getByTestId('locked-as')).toHaveText(first.replace('@v1', '@v2'));
  await ctx.close();
});
