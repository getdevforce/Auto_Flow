// Fails the build when the extension grows past its budget. ffmpeg core (lazy, offscreen only) and fonts are budgeted separately.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../.output/chrome-mv3/', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(dir);
const size = (pred) => files.filter(pred).reduce((s, f) => s + statSync(f).size, 0);

const budgets = {
  'side panel JS+CSS (loaded on open)': { actual: size((f) => /chunks\/(sidepanel|db|index)-.*\.js$|assets\/sidepanel-.*\.css$/.test(f)), max: 700_000 },
  'service worker (background.js)': { actual: size((f) => f.endsWith('background.js')), max: 400_000 },
  'all JS and CSS except ffmpeg': { actual: size((f) => /\.(js|css)$/.test(f) && !f.includes('/ffmpeg/')), max: 1_200_000 },
  'ffmpeg core (lazy, offscreen only)': { actual: size((f) => f.includes('/ffmpeg/')), max: 40_000_000 },
};
let failed = false;
for (const [name, { actual, max }] of Object.entries(budgets)) {
  const ok = actual <= max;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${(actual / 1024).toFixed(0)} KB of ${(max / 1024).toFixed(0)} KB`);
}
process.exit(failed ? 1 : 0);
