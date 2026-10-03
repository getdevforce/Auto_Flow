import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchExtension, openSidePanel, openTab } from './helpers';

const TABS = ['Autopilot', 'Create', 'Bible', 'Library', 'Prompts', 'Cinema', 'Settings'];

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('theme', t); } catch { /* ignore */ } }, theme);
}

test.describe('accessibility and visual regression', () => {
  test.use({ viewport: { width: 400, height: 900 } });

  for (const theme of ['light', 'dark'] as const) {
    test(`every tab passes axe and matches its screenshot in ${theme} theme`, async () => {
      test.setTimeout(120_000);
      const { ctx, id } = await launchExtension();
      const page = await openSidePanel(ctx, id);
      await setTheme(page, theme);
      // Stable output: no live config text, no animations.
      await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } [data-testid="config-status"] { visibility: hidden; }' });
      for (const t of TABS) {
        await openTab(page, t);
        await page.waitForTimeout(400);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
        expect(summary, `${t} / ${theme} accessibility`).toEqual([]);
        await expect(page).toHaveScreenshot(`${t.toLowerCase()}-${theme}.png`, { fullPage: true, maxDiffPixelRatio: 0.03 });
      }
      await ctx.close();
    });
  }

  test('the side panel is interactive in under one second', async () => {
    const { ctx, id } = await launchExtension();
    const page = await ctx.newPage();
    const start = Date.now();
    await page.goto(`chrome-extension://${id}/sidepanel.html`);
    await expect(page.getByRole('tab', { name: 'Autopilot' })).toBeVisible();
    const ms = Date.now() - start;
    console.log(`side panel ready in ${ms} ms`);
    expect(ms).toBeLessThan(1000);
    await ctx.close();
  });
});
