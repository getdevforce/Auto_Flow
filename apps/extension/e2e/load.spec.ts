import { expect, test } from '@playwright/test';
import { launchExtension, openSidePanel } from './helpers';

test('extension loads and the side panel renders', async () => {
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await expect(page.getByRole('heading', { name: 'Frameloom' })).toBeVisible();
  await ctx.close();
});

test('signs in against the real backend and loads remote config', async () => {
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await expect(page.getByTestId('config-status')).toContainText('Config v1 (network)');
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is wrong');
  await page.getByLabel('Password').fill('e2e-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('signed-in')).toContainText('e2e@example.com (free plan)');
  await ctx.close();
});
