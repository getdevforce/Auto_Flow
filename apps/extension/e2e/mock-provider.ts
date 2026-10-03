import http from 'node:http';

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
      if (req.url === '/v1/models') {
        return req.headers.authorization === 'Bearer good-key' ? json(200, { data: [] }) : json(401, { error: { message: 'bad key' } });
      }
      if (req.url === '/v1/chat/completions') {
        if (req.headers.authorization !== 'Bearer good-key') return json(401, { error: { message: 'bad key' } });
        const body = JSON.parse(raw);
        const prompt: string = body.messages.at(-1).content[0].text;
        counts.set('chat', (counts.get('chat') ?? 0) + 1);
        const content = prompt.includes('same person or place')
          ? { merges: [{ keep: 'Ben Okoro', absorb: ['Ben'], kind: 'character' }] }
          : analysisFor(prompt);
        return json(200, { choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }] });
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
