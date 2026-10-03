import http from 'node:http';

/** Tiny OpenAI-compatible server for e2e. Records requests so tests can assert on what was sent. */
export function startMockProvider(port = 9101): Promise<{ close(): Promise<void>; requests: Array<{ url: string; auth?: string }> }> {
  const requests: Array<{ url: string; auth?: string }> = [];
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    requests.push({ url: req.url ?? '', auth: req.headers.authorization });
    if (req.url === '/v1/models') {
      if (req.headers.authorization === 'Bearer good-key') { res.writeHead(200, { 'content-type': 'application/json' }).end('{"data":[]}'); return; }
      res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":{"message":"bad key"}}');
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ requests, close: () => new Promise((r) => server.close(() => r())) })));
}
