// @polsia:user-owned — starts or recovers the company owner's private account access.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { safeSameOriginPath } from '@/lib/business/auth-return-path';
import { createOwnerBootstrapProof, OWNER_BOOTSTRAP_HEADER } from '@/lib/business/owner-bootstrap';
import { OwnerAccessRequest, OwnerAccessResponse } from '@/lib/contracts/owner-access';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const parsedPayload = OwnerAccessRequest.safeParse(payload);
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const callbackURL = safeSameOriginPath(parsedPayload.data.callbackURL, '/admin');

  const ownerEmail = env.POLSIA_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return NextResponse.json({ error: 'owner_access_unavailable' }, { status: 503 });
  }

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session && session.user.email.toLowerCase() !== ownerEmail) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (session?.user.emailVerified && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    let owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (!owner) {
      const headers = new Headers(request.headers);
      headers.set('content-type', 'application/json');
      headers.set(
        OWNER_BOOTSTRAP_HEADER,
        createOwnerBootstrapProof(ownerEmail, env.BETTER_AUTH_SECRET),
      );
      const signup = await auth.handler(
        new Request(new URL('/api/auth/sign-up/email', env.BETTER_AUTH_URL), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: 'Fairway Friends Owner',
            email: ownerEmail,
            password: randomBytes(32).toString('base64url'),
            rememberMe: false,
          }),
        }),
      );
      owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
      if (!signup.ok && !owner) {
        return NextResponse.json({ error: 'owner_access_unavailable' }, { status: 503 });
      }
    }

    if (owner?.emailVerified) {
      if (session?.user.role === 'admin') {
        return NextResponse.json(OwnerAccessResponse.parse({ status: 'sent' }));
      }
      await auth.api.requestPasswordReset({
        headers: request.headers,
        body: {
          email: ownerEmail,
          redirectTo: `/reset-password?callbackURL=${encodeURIComponent(callbackURL)}`,
        },
      });
    } else {
      await auth.api.sendVerificationEmail({
        headers: request.headers,
        body: { email: ownerEmail, callbackURL },
      });
    }

    return NextResponse.json(OwnerAccessResponse.parse({ status: 'sent' }));
  } catch {
    return NextResponse.json({ error: 'owner_access_delivery_failed' }, { status: 502 });
  }
}
