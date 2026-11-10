// @polsia:user-owned — owner-scoped "hide my name on public cards" setting.
import 'server-only';
import { NextResponse } from 'next/server';
import { PublicNamePrivacySchema } from '@/lib/contracts/player-preferences';
import { prisma } from '@/lib/db';
import { requireAuth, type SessionUser } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let user: SessionUser;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const preference = await prisma.playerPreference.findUnique({
    where: { userId: user.id },
    select: { hidePublicName: true },
  });
  return NextResponse.json(
    PublicNamePrivacySchema.parse({ hidePublicName: preference?.hidePublicName ?? false }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let user: SessionUser;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const input = PublicNamePrivacySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: 'Choose whether to hide your name.' }, { status: 400 });
  }
  await prisma.playerPreference.upsert({
    where: { userId: user.id },
    update: { hidePublicName: input.data.hidePublicName },
    create: { userId: user.id, hidePublicName: input.data.hidePublicName },
  });
  return NextResponse.json(input.data);
}
