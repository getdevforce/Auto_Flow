import http from 'node:http';
import { buildMp4Stub } from '../../../packages/shared/src/media/mp4';

export interface MockProvider { close(): Promise<void>; requests: Array<{ url: string; auth?: string; body?: string }>; counts: Map<string, number> }

// 1x1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * OpenAI-compatible mock for e2e. Behaviour is driven by markers in the prompt:
 *   [429xN] rate limit the first N calls for that prompt, [POLICY] moderation reject, [500] always 500, [SLOW] delay 1.5s.
 */
const SCENES: Record<number, { chars: string[]; loc: string }> = {
  1: { chars: ['Ada Voss', 'Ben Okoro'], loc: 'Harbour Office' }, 2: { chars: ['Ada', 'Ben'], loc: 'Dock' },
  3: { chars: ['Young Ada', 'Mother'], loc: "Ada's Childhood Kitchen" }, 4: { chars: ['Ada'], loc: 'Dock' }, 5: { chars: ['Ada Voss', 'Ben'], loc: 'Harbour Office' },
};

/** Canned shot plan; markers in the scene text (e.g. [POLICY]) are copied into the shot action so tests can steer behaviour. */
function planScene(n: number, prompt: string) {
  const markers = [...prompt.matchAll(/\[(?:POLICY|VFAIL|WAIT\d+|BADUP|AUTH)\]/g)].map((m) => m[0]);
  const count = n === 1 ? 2 : 1;
  return { shots: Array.from({ length: count }, (_, k) => ({
    size: 'medium', lens: '35mm', movement: 'slow push in', durationSec: 5, characters: n === 3 ? ['Mother'] : ['Ada Voss'],
    action: `Ada Voss acts in scene ${n} shot ${k + 1} ${markers.join(' ')}`.trim(), transition: 'cut',
  })) };
}

/** Canned analysis for the fixture script, keyed on the scene numbers present in the prompt. */
function analysisFor(prompt: string) {
  const idx = [...prompt.matchAll(/### Scene (\d+)/g)].map((m) => Number(m[1]));
  const names = [...new Set(idx.flatMap((i) => SCENES[i]?.chars ?? []))];
  return {
    characters: names.map((name) => ({ name, confidence: 0.8, stated: name.includes('Ada') ? { hair: 'short black bob' } : {} })),
    locations: [...new Set(idx.map((i) => SCENES[i]?.loc).filter(Boolean))].map((name) => ({ name, interior: true, confidence: 0.8 })),
    scenes: idx.map((index) => ({ index, slugline: `scene ${index}`, characters: SCENES[index]?.chars ?? [], location: SCENES[index]?.loc ?? '' })),
  };
}

const falJobs = new Map<string, { model: string; prompt: string; polls: number; wait: number }>();
let falSeq = 0;
const BASE = 'http://127.0.0.1:9101';

/** Minimal fal.ai-style queue: submit, status, result and a file endpoint serving an MP4 stub of the right size. */
function fal(req: http.IncomingMessage, res: http.ServerResponse, raw: string, counts: Map<string, number>, json: (s: number, b: unknown, h?: Record<string, string>) => void) {
  const url = req.url as string;
  // Result files are served from a CDN without the API key, as the real service does.
  const isFile = /^\/fal\/_file\//.test(url);
  if (!isFile && req.headers.authorization !== 'Key good-key') return json(401, { error: 'bad key' });
  // Both URL layouts: the ones returned at submit time and fal's documented /{model}/requests/{id}[/status] layout.
  const status = /^\/fal\/_status\/(.+)$/.exec(url) ?? /^\/fal\/.+\/requests\/([^/]+)\/status$/.exec(url);
  const result = /^\/fal\/_result\/(.+)$/.exec(url) ?? /^\/fal\/.+\/requests\/([^/]+)$/.exec(url);
  const file = /^\/fal\/_file\/(.+)\.mp4$/.exec(url);
  if (status) {
    const j = falJobs.get(status[1] as string);
    if (!j) return json(404, { detail: 'not found' });
    j.polls++;
    return json(200, { status: j.polls <= j.wait ? 'IN_QUEUE' : 'COMPLETED' });
  }
  if (result) return json(200, { video: { url: `${BASE}/fal/_file/${result[1]}.mp4` } });
  if (file) {
    const j = falJobs.get(file[1] as string)!;
    const bad = j.model.includes('up-bad');
    const dims = j.model.includes('up') ? (bad ? [960, 540] : [1280, 720]) : j.model.includes('draft') ? [640, 360] : [1280, 720];
    res.writeHead(200, { 'content-type': 'video/mp4' }).end(Buffer.from(buildMp4Stub(dims[0]!, dims[1]!, 5)));
    return;
  }
  if (req.method === 'POST') {
    const model = url.slice('/fal/'.length);
    const body = raw ? JSON.parse(raw) : {};
    const prompt: string = body.prompt ?? '';
    counts.set(`fal:${model}`, (counts.get(`fal:${model}`) ?? 0) + 1);
    counts.set(`fal:prompt:${prompt}`, (counts.get(`fal:prompt:${prompt}`) ?? 0) + 1);
    if (prompt.includes('[POLICY]')) return json(400, { detail: 'blocked by safety policy' });
    if (prompt.includes('[VFAIL]')) return json(500, { detail: 'boom' });
    const id = `job${++falSeq}`;
    const wait = Number(/\[WAIT(\d+)\]/.exec(prompt)?.[1] ?? 0);
    falJobs.set(id, { model, prompt, polls: 0, wait });
    return json(200, { request_id: id, status_url: `${BASE}/fal/_status/${id}`, response_url: `${BASE}/fal/_result/${id}` });
  }
  res.writeHead(404).end();
}

export function startMockProvider(port = 9101): Promise<MockProvider> {
  const requests: MockProvider['requests'] = [];
  const counts = new Map<string, number>();
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      requests.push({ url: req.url ?? '', auth: req.headers.authorization, body: raw });
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
        res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
      if (req.url?.startsWith('/fal/')) return fal(req, res, raw, counts, json);
      if (req.url === '/v1/models') {
        return req.headers.authorization === 'Bearer good-key' ? json(200, { data: [] }) : json(401, { error: { message: 'bad key' } });
      }
      if (req.url === '/v1/chat/completions') {
        if (req.headers.authorization !== 'Bearer good-key') return json(401, { error: { message: 'bad key' } });
        const body = JSON.parse(raw);
        const prompt: string = body.messages.at(-1).content[0].text;
        counts.set('chat', (counts.get('chat') ?? 0) + 1);
        const rawShot = /Raw shot description:\n([\s\S]*?)(\n\n|$)/.exec(prompt)?.[1];
        const sceneNo = /^Scene (\d+)/m.exec(prompt)?.[1];
        const content = rawShot !== undefined
          ? { refined: `${rawShot}, 35mm lens, slow tracking shot, tense mood`, negative: 'blur', rationale: 'Filled in lens, camera and mood.' }
          : sceneNo ? planScene(Number(sceneNo), prompt)
          : prompt.includes('same person or place')
          ? { merges: [{ keep: 'Ben Okoro', absorb: ['Ben'], kind: 'character' }] }
          : analysisFor(prompt);
        return json(200, { choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }] });
      }
      if (req.url === '/v1/images/edits') {
        counts.set('edits', (counts.get('edits') ?? 0) + 1);
        return json(200, { data: [{ b64_json: PNG }] });
      }
      if (req.url === '/v1/images/generations') {
        if (req.headers.authorization !== 'Bearer good-key') return json(401, { error: { message: 'bad key' } });
        const prompt: string = JSON.parse(raw).prompt ?? '';
        const n = (counts.get(prompt) ?? 0) + 1;
        counts.set(prompt, n);
        const rl = /\[429x(\d+)\]/.exec(prompt);
        if (rl && n <= Number(rl[1])) return json(429, { error: { message: 'slow down' } }, { 'retry-after': '1' });
        if (prompt.includes('[POLICY]')) return json(400, { error: { code: 'moderation_blocked', message: 'rejected by moderation' } });
        if (prompt.includes('[500]')) return json(500, { error: { message: 'boom' } });
        const respond = () => json(200, { data: [{ b64_json: PNG }] });
        return prompt.includes('[SLOW]') ? void setTimeout(respond, 1500) : respond();
      }
      res.writeHead(404).end();
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ requests, counts, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) })));
}
