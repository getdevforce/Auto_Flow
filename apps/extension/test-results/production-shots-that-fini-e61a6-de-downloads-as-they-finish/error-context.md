# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production.spec.ts >> shots that finish out of order still get sequence-numbered names; normal mode downloads as they finish
- Location: e2e/production.spec.ts:114:1

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 1791033753397
Received:   1791033753770
```

# Test source

```ts
  20  | interface Opts { autonomy?: 'manual' | 'checkpoints' | 'full_auto'; script?: string; mode?: 'native' | 'draft_upscale'; strict?: boolean; budget?: string; upscaleModel?: string; pVid?: string }
  21  | async function startRun(page: Page, o: Opts = {}) {
  22  |   const ap = page.getByRole('region', { name: 'Autopilot' });
  23  |   await ap.getByLabel('Script or idea').fill(o.script ?? FIXTURE_SCRIPT);
  24  |   await ap.getByLabel('Autonomy').selectOption(o.autonomy ?? 'checkpoints');
  25  |   await ap.getByLabel('Analysis provider').selectOption('custom');
  26  |   await ap.getByLabel('Analysis model').fill('mock-text');
  27  |   await ap.getByLabel('Image provider').selectOption('custom');
  28  |   await ap.getByLabel('Image model').fill('mock-image');
  29  |   await ap.getByLabel('Video mode', { exact: true }).selectOption(o.mode ?? 'draft_upscale');
  30  |   await ap.getByLabel('Video model (fal.ai)').fill((o.mode ?? 'draft_upscale') === 'native' ? 'mock-native' : 'mock-draft');
  31  |   await ap.getByLabel('Upscale model', { exact: true }).fill(o.upscaleModel ?? 'mock-up');
  32  |   if (o.strict) await ap.getByLabel('Strict download order').check();
  33  |   if (o.budget) await ap.getByLabel('Budget cap (USD)').fill(o.budget);
  34  |   if (o.pVid) await ap.getByLabel('Video price per second (USD)').fill(o.pVid);
  35  |   await ap.getByRole('button', { name: 'Analyse script' }).click();
  36  |   return ap;
  37  | }
  38  | async function idb<T>(page: Page, store: string, fn = 'getAll'): Promise<T> {
  39  |   return page.evaluate(([s, f]) => new Promise<T>((resolve) => {
  40  |     const o = indexedDB.open('frameloom');
  41  |     o.onsuccess = () => { const g = (o.result.transaction(s as string).objectStore(s as string) as unknown as Record<string, () => IDBRequest>)[f as string]!(); g.onsuccess = () => resolve(g.result); };
  42  |   }), [store, fn]);
  43  | }
  44  | const shotsOf = (page: Page) => idb<Array<{ seq: number; status: string; file?: string; width?: number; height?: number; flagReason?: string; downloadedAt?: number; retries: number }>>(page, 'shots').then((r) => r.sort((a, b) => a.seq - b.seq));
  45  | 
  46  | async function approveGates(ap: ReturnType<Page['getByRole']>) {
  47  |   await expect(ap.getByRole('heading', { name: 'Approve characters' })).toBeVisible({ timeout: 40_000 });
  48  |   await ap.getByRole('button', { name: 'Approve and lock' }).click();
  49  |   await expect(ap.getByRole('heading', { name: 'Approve locations' })).toBeVisible({ timeout: 40_000 });
  50  |   await ap.getByRole('button', { name: 'Approve and lock' }).click();
  51  | }
  52  | 
  53  | test.setTimeout(150_000);
  54  | let mock: MockProvider;
  55  | let ctx: BrowserContext;
  56  | let page: Page;
  57  | async function boot(profile?: string) {
  58  |   mock = await startMockProvider();
  59  |   const l = await launchExtension(profile);
  60  |   ctx = l.ctx;
  61  |   page = await openSidePanel(ctx, l.id);
  62  |   await setupKeys(page);
  63  |   await page.evaluate(() => new Promise<void>((r) => { const o = indexedDB.open('frameloom'); o.onsuccess = () => { const t = o.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ key: 'pollMs', value: 300 }); t.oncomplete = () => r(); }; }));
  64  |   return l;
  65  | }
  66  | test.afterEach(async () => { await ctx?.close().catch(() => undefined); await mock?.close().catch(() => undefined); });
  67  | 
  68  | test('checkpoints: pauses at characters, locations and the pilot scene, then produces every shot in order with manifest and concat list', async () => {
  69  |   await boot();
  70  |   const ap = await startRun(page);
  71  |   await approveGates(ap);
  72  |   await expect(ap.getByTestId('pilot-gate')).toBeVisible({ timeout: 60_000 });
  73  |   await expect(ap.getByTestId('ap-state')).toHaveText('awaiting_approval / pilot_scene');
  74  |   // Only the pilot scene (2 shots) has keyframes so far; nothing later has started.
  75  |   expect((await shotsOf(page)).filter((s) => s.status === 'kf_locked').length).toBe(2);
  76  |   expect(mock.counts.get('fal:mock-draft') ?? 0).toBe(0);
  77  |   await ap.getByRole('button', { name: 'Approve pilot scene' }).click();
  78  | 
  79  |   await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 90_000 });
  80  |   const shots = await shotsOf(page);
  81  |     expect(shots).toHaveLength(6);
  82  |   expect(shots.every((s) => s.status === 'done')).toBe(true);
  83  |   expect(shots.map((s) => s.file)).toEqual(['Untitled film/001_1_1.mp4', 'Untitled film/002_1_2.mp4', 'Untitled film/003_2_1.mp4', 'Untitled film/004_3_1.mp4', 'Untitled film/005_4_1.mp4', 'Untitled film/006_5_1.mp4']);
  84  |   expect(shots.every((s) => s.width === 1280 && s.height === 720)).toBe(true); // draft 640x360 upscaled to the target
  85  |   expect(mock.counts.get('fal:mock-draft')).toBe(6);
  86  |   expect(mock.counts.get('fal:mock-up')).toBe(6);
  87  | 
  88  |   const mf = (await idb<{ manifest: string; concat: string }>(page, 'kv', 'getAll') as unknown as Array<{ key: string; value: { manifest: string; concat: string } }>).find((r) => r.key.startsWith('manifest:'))!.value;
  89  |   const manifest = JSON.parse(mf.manifest);
  90  |   expect(manifest.mode).toBe('draft_upscale');
  91  |   expect(manifest.shots.map((s: { seq: number }) => s.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  92  |   expect(manifest.shots[0].prompt).toContain('slow tracking shot');
  93  |   expect(mf.concat.trim().split('\n')).toEqual(['001_1_1.mp4', '002_1_2.mp4', '003_2_1.mp4', '004_3_1.mp4', '005_4_1.mp4', '006_5_1.mp4'].map((f) => `file '${f}'`));
  94  |   await expect(ap.getByTestId('report')).toContainText('6 shot(s) delivered, 0 flagged');
  95  | });
  96  | 
  97  | test('full auto never pauses', async () => {
  98  |   await boot();
  99  |   const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native' });
  100 |   await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 90_000 });
  101 |   expect(mock.counts.get('fal:mock-native')).toBe(6);
  102 |   expect(mock.counts.get('fal:mock-up') ?? 0).toBe(0); // native mode skips the upscale step
  103 |   expect((await shotsOf(page)).every((s) => s.width === 1280 && s.height === 720)).toBe(true);
  104 | });
  105 | 
  106 | 
  107 | const mark = (script: string, marker: string, scene: 'all' | number) => {
  108 |   if (scene === 'all') return script.replace(/^((?:INT|EXT)\..*)$/gm, `$1 ${marker}`);
  109 |   let i = 0;
  110 |   return script.replace(/^((?:INT|EXT)\..*)$/gm, (m) => (++i === scene ? `${m} ${marker}` : m));
  111 | };
  112 | const runState = (page: Page) => idb<Array<{ state: string; pausedReason?: string; report?: { flagged: Array<{ seq: number; reason: string }> } }>>(page, 'runs').then((r) => r[0]!);
  113 | 
  114 | test('shots that finish out of order still get sequence-numbered names; normal mode downloads as they finish', async () => {
  115 |   await boot();
  116 |   const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[WAIT10]', 1) });
  117 |   await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  118 |   const shots = await shotsOf(page);
  119 |   expect(shots.map((s) => s.file)).toEqual(['Untitled film/001_1_1.mp4', 'Untitled film/002_1_2.mp4', 'Untitled film/003_2_1.mp4', 'Untitled film/004_3_1.mp4', 'Untitled film/005_4_1.mp4', 'Untitled film/006_5_1.mp4']);
> 120 |   expect(shots[2]!.downloadedAt!).toBeLessThan(shots[0]!.downloadedAt!); // later shot landed first, name still fixes the order
      |                                   ^ Error: expect(received).toBeLessThan(expected)
  121 | });
  122 | 
  123 | test('strict order holds a finished shot until every earlier one is downloaded', async () => {
  124 |   await boot();
  125 |   const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', strict: true, script: mark(FIXTURE_SCRIPT, '[WAIT10]', 1) });
  126 |   await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  127 |   const shots = await shotsOf(page);
  128 |   const times = shots.map((s) => s.downloadedAt!);
  129 |   expect(times).toEqual([...times].sort((a, b) => a - b));
  130 | });
  131 | 
  132 | test('a bad upscale is retried once, then the draft is kept and the shot is flagged', async () => {
  133 |   await boot();
  134 |   const ap = await startRun(page, { autonomy: 'full_auto', upscaleModel: 'mock-up-bad' });
  135 |   await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  136 |   const shots = await shotsOf(page);
  137 |   expect(shots.every((s) => s.status === 'done' && s.width === 640 && s.height === 360)).toBe(true);
  138 |   expect(shots[0]!.flagReason).toContain('kept the 360p draft');
  139 |   expect(mock.counts.get('fal:mock-up-bad')).toBe(12); // two attempts per shot
  140 |   await expect(ap.getByTestId('report')).toContainText('6 flagged');
  141 | });
  142 | 
  143 | test('policy rejection is flagged without retrying and without stalling the other shots', async () => {
  144 |   await boot();
  145 |   const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[POLICY]', 2) });
  146 |   await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  147 |   const shots = await shotsOf(page);
  148 |   expect(shots.map((s) => s.status)).toEqual(['done', 'done', 'flagged', 'done', 'done', 'done']);
  149 |   expect(shots[2]!.flagReason).toContain('declined the prompt');
  150 |   const promptCounts = [...mock.counts.entries()].filter(([k]) => k.startsWith('fal:prompt:') && k.includes('[POLICY]'));
  151 |   expect(promptCounts.map(([, n]) => n)).toEqual([1]); // exactly one attempt
  152 |   await expect(ap.getByTestId('report')).toContainText('5 shot(s) delivered, 1 flagged');
  153 |   await ap.getByTestId('shot-3').click();
  154 |   await expect(ap.getByTestId('shot-detail')).toContainText('declined the prompt');
  155 | });
  156 | 
  157 | test('a failing shot is retried, retried with a plainer prompt, then flagged; the run still completes', async () => {
  158 |   await boot();
  159 |   const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[VFAIL]', 2) });
  160 |   await expect(ap.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 120_000 });
  161 |   const shots = await shotsOf(page);
  162 |   expect(shots.map((s) => s.status)).toEqual(['done', 'done', 'flagged', 'done', 'done', 'done']);
  163 |   expect(shots[2]!.retries).toBeGreaterThanOrEqual(1);
  164 | });
  165 | 
  166 | test('circuit breaker pauses the run after consecutive failures across different shots, and resume continues', async () => {
  167 |   await boot();
  168 |   const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[VFAIL]', 'all') });
  169 |   await expect(ap.getByTestId('ap-state')).toHaveText(/^paused/, { timeout: 100_000 });
  170 |   expect((await runState(page)).pausedReason).toContain('consecutive failures');
  171 | });
  172 | 
  173 | test('budget cap pauses production before a job would exceed it', async () => {
  174 |   await boot();
  175 |   const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', budget: '0.12', pVid: '0.01' });
  176 |   await expect(ap.getByTestId('ap-state')).toHaveText(/^paused/, { timeout: 100_000 });
  177 |   expect((await runState(page)).pausedReason).toContain('Budget cap of $0.12 reached');
  178 |   expect(mock.counts.get('fal:mock-native')).toBe(2); // $0.05 each, a third would pass the cap
  179 | });
  180 | 
  181 | test('a run survives a browser restart mid-production without regenerating finished shots', async () => {
  182 |   const first = await boot();
  183 |   const ap = await startRun(page, { autonomy: 'full_auto', mode: 'native', script: mark(FIXTURE_SCRIPT, '[WAIT8]', 5) });
  184 |   await expect.poll(() => mock.counts.get('fal:mock-native') ?? 0, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  185 |   await ctx.close();
  186 |   const before = mock.counts.get('fal:mock-native') ?? 0;
  187 |   const second = await launchExtension(first.userDataDir);
  188 |   ctx = second.ctx;
  189 |   page = await openSidePanel(ctx, second.id);
  190 |   await expect(page.getByTestId('ap-state')).toHaveText('completed / finished', { timeout: 100_000 });
  191 |   const shots = await shotsOf(page);
  192 |   expect(shots.every((s) => s.status === 'done')).toBe(true);
  193 |   expect(mock.counts.get('fal:mock-native')! - before).toBeLessThanOrEqual(6 - 3 + 1); // only unfinished shots were submitted again, at most one in-flight overlap
  194 |   void ap;
  195 | });
  196 | 
```