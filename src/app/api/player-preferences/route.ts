// @polsia:user-owned — authenticated, owner-scoped player appearance preference.
import 'server-only';
import { NextResponse } from 'next/server';
import {
  PlayerPreferenceSchema,
  UpdatePlayerPreferenceSchema,
} from '@/lib/contracts/player-preferences';
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
    select: { theme: true },
  });
  const parsed = PlayerPreferenceSchema.safeParse({ theme: preference?.theme ?? 'system' });
  return NextResponse.json(parsed.success ? parsed.data : { theme: 'system' });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let user: SessionUser;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }

  const input = UpdatePlayerPreferenceSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: 'Choose system, light, or dark.' }, { status: 400 });
  }

  await prisma.playerPreference.upsert({
    where: { userId: user.id },
    update: { theme: input.data.theme },
    create: { userId: user.id, theme: input.data.theme },
  });

  return NextResponse.json(input.data);
}
