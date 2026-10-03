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
    // The template browser is the only other backend client: it sends a slug, a star rating and search words, never filled prompts.
    expect(users.sort()).toEqual(['/services.ts', '/ui/TemplatesPanel.tsx']);
  });
  it('the template browser never sends prompt text or keys', () => {
    const src = readFileSync(join(__dirname, 'ui/TemplatesPanel.tsx'), 'utf8');
    expect(src).not.toMatch(/loadKey|apiKey|vault/);
    const bodies = [...src.matchAll(/\}, body:\s*([^,}]+) \}\)/g)].map((m) => m[1]!.trim());
    expect(bodies).toEqual(['JSON.stringify({ stars']); // the only request body is the star rating
  });

  it('provider keys are never passed into backend calls', () => {
    const src = readFileSync(join(__dirname, 'services.ts'), 'utf8');
    expect(src).not.toMatch(/loadKey|vault\.getKey|apiKey/);
  });
});
