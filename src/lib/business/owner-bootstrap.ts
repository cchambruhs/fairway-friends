// @polsia:user-owned — server-side proof for the trusted owner account bootstrap.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const OWNER_BOOTSTRAP_HEADER = 'x-fairway-owner-bootstrap';

export function createOwnerBootstrapProof(email: string, secret: string): string {
  return createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex');
}

export function isOwnerBootstrapRequest(
  headers: Headers | undefined,
  email: string,
  secret: string,
): boolean {
  const proof = headers?.get(OWNER_BOOTSTRAP_HEADER);
  if (!proof) return false;

  const expected = Buffer.from(createOwnerBootstrapProof(email, secret));
  const supplied = Buffer.from(proof);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
