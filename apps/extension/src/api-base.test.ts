import { describe, expect, it } from 'vitest';
import { safeBase } from './api-base';

describe('safeBase', () => {
  it('accepts https anywhere and http only on loopback, and strips paths', () => {
    expect(safeBase('https://api.example.com/some/path')).toBe('https://api.example.com');
    expect(safeBase('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(safeBase('http://localhost:9000/x')).toBe('http://localhost:9000');
  });
  it('rejects plain http on real hosts, other schemes, and junk', () => {
    for (const bad of ['http://api.example.com', 'ftp://x.com', 'javascript:alert(1)', 'not a url', '', undefined]) expect(safeBase(bad as string)).toBeUndefined();
  });
});
