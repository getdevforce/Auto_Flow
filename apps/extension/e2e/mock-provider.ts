import http from 'node:http';

export interface MockProvider { close(): Promise<void>; requests: Array<{ url: string; auth?: string; body?: string }>; counts: Map<string, number> }

// 1x1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * OpenAI-compatible mock for e2e. Behaviour is driven by markers in the prompt:
 *   [429xN] rate limit the first N calls for that prompt, [POLICY] moderation reject, [500] always 500, [SLOW] delay 1.5s.
 */
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
