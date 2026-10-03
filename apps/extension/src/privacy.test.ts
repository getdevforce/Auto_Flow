import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
});

describe('privacy guard', () => {
  const files = walk(join(__dirname)).filter((f) => !f.endsWith('.test.ts'));
  it('only the account/config layer talks to the backend', () => {
    const users = files.filter((f) => /getApiBase|API_BASE|createApiClient/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(__dirname, ''));
    // The complete list of backend clients: config, entitlements, feedback, telemetry and the template browser. Any new one must be added here on purpose.
    expect(users.sort()).toEqual(['/config-store.ts', '/entitlements.ts', '/feedback.ts', '/services.ts', '/telemetry.ts', '/ui/TemplatesPanel.tsx']);
  });
  it('the template browser never sends prompt text or keys', () => {
    const src = readFileSync(join(__dirname, 'ui/TemplatesPanel.tsx'), 'utf8');
    expect(src).not.toMatch(/loadKey|apiKey|vault/);
    const bodies = [...src.matchAll(/\}, body:\s*([^,}]+) \}\)/g)].map((m) => m[1]!.trim());
    expect(bodies).toEqual(['JSON.stringify({ stars']); // the only request body is the star rating
  });

  it('provider keys, the vault and run content are never touched by any backend client', () => {
    for (const f of ['services.ts', 'config-store.ts', 'entitlements.ts', 'feedback.ts', 'telemetry.ts']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src, f).not.toMatch(/loadKey|vault\.getKey|apiKey|\.script|\.prompt|\.refined/);
    }
  });
});
