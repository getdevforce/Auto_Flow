import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURE_SCRIPT } from '../../../packages/shared/src/fixtures/script';
import { launchExtension, openSidePanel } from './helpers';
import { startMockProvider } from './mock-provider';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test.skip(!hasFfmpeg, 'needs a system ffmpeg to create a real draft clip');

test('local ffmpeg.wasm resize turns a real 640x360 draft into 1280x720 when no upscaler is configured', async () => {
  test.setTimeout(240_000);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fl-vid-')), 'draft.mp4');
  execFileSync('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=10', '-t', '1', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-y', file], { stdio: 'ignore' });
  const mock = await startMockProvider(9101, { realMp4: fs.readFileSync(file) });
  const { ctx, id } = await launchExtension();
  const page = await openSidePanel(ctx, id);
  await page.evaluate(() => new Promise<void>((r) => { const o = indexedDB.open('frameloom'); o.onsuccess = () => { const t = o.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ key: 'pollMs', value: 300 }); t.oncomplete = () => r(); }; }));
  await page.getByRole('button', { name: 'Create vault' }).click();
  for (const [row, base] of [['custom', 'http://127.0.0.1:9101/v1'], ['fal', 'http://127.0.0.1:9101/fal']] as const) {
    const r = page.getByTestId(`key-${row}`);
    await r.getByLabel('Base URL').fill(base);
    await r.getByLabel('API key').fill('good-key');
    await r.getByRole('button', { name: 'Save key' }).click();
  }
  const ap = page.getByRole('region', { name: 'Autopilot' });
  // One scene only keeps the wasm run short.
  await ap.getByLabel('Script or idea').fill(FIXTURE_SCRIPT.split('EXT. DOCK - NIGHT')[0]!);
  await ap.getByLabel('Autonomy').selectOption('full_auto');
  await ap.getByLabel('Analysis provider').selectOption('custom');
  await ap.getByLabel('Analysis model').fill('mock-text');
  await ap.getByLabel('Image provider').selectOption('custom');
  await ap.getByLabel('Image model').fill('mock-image');
  await ap.getByLabel('Video model (fal.ai)').fill('mock-draft-real');
  await ap.getByLabel('Upscaler').selectOption('local');
  await ap.getByRole('button', { name: 'Analyse script' }).click();
  await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 200_000 });
  const shots = await page.evaluate(() => new Promise<Array<{ width: number; height: number; status: string; flagReason?: string }>>((r) => { const o = indexedDB.open('frameloom'); o.onsuccess = () => { const g = o.result.transaction('shots').objectStore('shots').getAll(); g.onsuccess = () => r(g.result); }; }));
  expect(shots.length).toBeGreaterThan(0);
  for (const s of shots) { expect(s).toMatchObject({ status: 'done', width: 1280, height: 720 }); expect(s.flagReason).toBeUndefined(); }
  expect(mock.counts.get('fal:mock-up') ?? 0).toBe(0); // no remote upscaler was used
  await ctx.close();
  await mock.close();
});
