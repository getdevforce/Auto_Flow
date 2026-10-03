import { describe, expect, it } from 'vitest';
import { buildBundle, findSecretKey, validateBundle } from './project-export';

describe('project bundles', () => {
  it('builds a bundle from allowed tables only and round-trips through validation', () => {
    const b = buildBundle('Film', { runs: [{ id: 'r1', name: 'Film' }], kv: [{ key: 'vault', value: 'x' }], shots: [{ id: 's1' }] }, [{ id: 'a', mime: 'image/png', base64: 'AA==' }], new Date('2026-01-01T00:00:00Z'));
    expect(Object.keys(b.tables).sort()).toEqual(['runs', 'shots']);
    const v = validateBundle(JSON.parse(JSON.stringify(b)));
    expect(v.ok && v.bundle.project).toBe('Film');
  });
  it('refuses to export or import anything that looks like a credential', () => {
    expect(() => buildBundle('Film', { runs: [{ id: 'r', apiKey: 'sk-secret' }] })).toThrow('looks like a credential');
    expect(() => buildBundle('Film', { prompts: [{ nested: { passphrase: 'x' } }] })).toThrow();
    const sneaky = { format: 'frameloom-project', version: 1, exportedAt: 'x', project: 'p', tables: { runs: [{ id: 'r', meta: [{ token: 't' }] }] } };
    expect(validateBundle(sneaky)).toMatchObject({ ok: false, error: expect.stringContaining('credential') });
  });
  it('rejects wrong formats, unknown tables and non-objects', () => {
    expect(validateBundle({ hello: 1 })).toMatchObject({ ok: false });
    expect(validateBundle(null)).toMatchObject({ ok: false });
    expect(validateBundle({ format: 'frameloom-project', version: 1, exportedAt: 'x', project: 'p', tables: { kv: [{ key: 'a' }] } })).toMatchObject({ ok: false, error: expect.stringContaining('kv') });
  });
  it('finds secret-looking keys at any depth', () => {
    expect(findSecretKey({ a: [{ b: { Password: 1 } }] })).toBe('.a[0].b.Password');
    expect(findSecretKey({ prompt: 'my password is x', shots: [1] })).toBeNull(); // values are not scanned, only keys
  });
});
