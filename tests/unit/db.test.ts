// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { MAX_IDLE_CONNECTION_LIFETIME_SECONDS, withIdleConnectionLimit } = await import(
  // biome-ignore lint/style/noRestrictedImports: a node-environment unit test of the server singleton.
  '@/lib/db'
);

const limit = `max_idle_connection_lifetime=${MAX_IDLE_CONNECTION_LIFETIME_SECONDS}`;

describe('withIdleConnectionLimit', () => {
  test('stays below the 10 s sandbox freeze delay', () => {
    expect(MAX_IDLE_CONNECTION_LIFETIME_SECONDS).toBeLessThan(10);
  });

  test('adds the limit to a URL without a query string', () => {
    expect(withIdleConnectionLimit('postgresql://user:pass@db.example.test:5432/db')).toBe(
      `postgresql://user:pass@db.example.test:5432/db?${limit}`,
    );
  });

  test('appends the limit after existing parameters', () => {
    expect(
      withIdleConnectionLimit(
        'postgresql://user:pass@db.example.test:5432/db?sslmode=require&pgbouncer=true',
      ),
    ).toBe(
      `postgresql://user:pass@db.example.test:5432/db?sslmode=require&pgbouncer=true&${limit}`,
    );
    expect(
      withIdleConnectionLimit('postgresql://user:pass@db.example.test:5432/db?sslmode=require&'),
    ).toBe(`postgresql://user:pass@db.example.test:5432/db?sslmode=require&${limit}`);
  });

  test('keeps the encoded credentials as they are', () => {
    const encoded = 'postgresql://user:p%40ss%2Fword@db.example.test:5432/db';
    expect(withIdleConnectionLimit(encoded)).toBe(`${encoded}?${limit}`);
  });

  test('keeps a value the app already set', () => {
    const url = 'postgresql://user:pass@db.example.test:5432/db?MAX_IDLE_CONNECTION_LIFETIME=60';
    expect(withIdleConnectionLimit(url)).toBe(url);
  });

  test('leaves other URLs unchanged', () => {
    expect(withIdleConnectionLimit(undefined)).toBeUndefined();
    expect(withIdleConnectionLimit('')).toBe('');
    expect(withIdleConnectionLimit('prisma+postgres://accelerate.prisma-data.net/?api_key=k')).toBe(
      'prisma+postgres://accelerate.prisma-data.net/?api_key=k',
    );
    expect(withIdleConnectionLimit('postgresql://user:pass@db.example.test:5432/db#x')).toBe(
      'postgresql://user:pass@db.example.test:5432/db#x',
    );
  });
});
