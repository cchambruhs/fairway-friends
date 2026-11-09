import { describe, expect, it } from 'vitest';
import { safeSameOriginPath } from '@/lib/business/auth-return-path';
import {
  createOwnerBootstrapProof,
  isOwnerBootstrapRequest,
  OWNER_BOOTSTRAP_HEADER,
} from '@/lib/business/owner-bootstrap';

describe('trusted owner bootstrap proof', () => {
  it('accepts only a matching server proof for the normalized owner address', () => {
    const secret = 'synthetic-test-secret';
    const proof = createOwnerBootstrapProof(' Owner@Example.Test ', secret);
    const headers = new Headers({ [OWNER_BOOTSTRAP_HEADER]: proof });

    expect(isOwnerBootstrapRequest(headers, 'owner@example.test', secret)).toBe(true);
    expect(isOwnerBootstrapRequest(headers, 'other@example.test', secret)).toBe(false);
    expect(isOwnerBootstrapRequest(headers, 'owner@example.test', 'another-secret')).toBe(false);
    expect(isOwnerBootstrapRequest(new Headers(), 'owner@example.test', secret)).toBe(false);
  });
});

describe('auth return paths', () => {
  it('keeps local path, query, and fragment destinations', () => {
    expect(safeSameOriginPath('/profile?tab=security#password', '/admin')).toBe(
      '/profile?tab=security#password',
    );
  });

  it.each([
    'https://outside.example',
    '//outside.example/path',
    '/\\outside.example/path',
    '/api/auth/sign-out',
    '/_next/static/chunk.js',
    '/profile\nLocation: https://outside.example',
  ])('rejects unsafe return path %s', (value) => {
    expect(safeSameOriginPath(value, '/admin')).toBe('/admin');
  });
});
