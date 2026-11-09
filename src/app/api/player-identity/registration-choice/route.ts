// @polsia:user-owned — reserve the mandatory player choice before Better Auth creates an account.
import 'server-only';
import { NextResponse } from 'next/server';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { findUDiscRecords } from '@/lib/business/player-identity.server';
import {
  PlayerRegistrationChoiceRequestSchema,
  PlayerRegistrationChoiceResponseSchema,
} from '@/lib/contracts/player-identity';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = PlayerRegistrationChoiceRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Enter a valid email and make a profile choice.' },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLocaleLowerCase('en-US');
  const username = parsed.data.username.trim().replace(/^@/u, '');
  const normalizedUsername = normalizeUDiscUsername(username);
  if (!normalizedUsername)
    return NextResponse.json({ error: 'Enter a valid UDisc username.' }, { status: 400 });

  const [records, identity, existingReservation] = await Promise.all([
    findUDiscRecords(prisma, normalizedUsername),
    prisma.uDiscIdentity.findUnique({ where: { normalizedUsername } }),
    prisma.playerRegistrationChoice.findUnique({ where: { normalizedUsername } }),
  ]);
  if (
    identity?.ownerUserId ||
    identity?.pendingClaimUserId ||
    (existingReservation &&
      existingReservation.email !== email &&
      existingReservation.expiresAt.getTime() > Date.now())
  ) {
    return NextResponse.json(
      { error: 'That UDisc username is already claimed or being claimed.' },
      { status: 409 },
    );
  }
  if (parsed.data.mode === 'claim' && !records.exists) {
    return NextResponse.json(
      { error: 'No saved player matches that exact username.' },
      { status: 409 },
    );
  }
  if (parsed.data.mode === 'create' && (records.exists || identity)) {
    return NextResponse.json(
      { error: 'A saved player already matches. Choose the claim option.' },
      { status: 409 },
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.playerRegistrationChoice.deleteMany({
        where: { email, normalizedUsername: { not: normalizedUsername } },
      });
      if (existingReservation && existingReservation.expiresAt.getTime() <= Date.now()) {
        await transaction.playerRegistrationChoice.deleteMany({
          where: { id: existingReservation.id },
        });
      }
      await transaction.playerRegistrationChoice.upsert({
        where: { email },
        create: {
          email,
          username,
          normalizedUsername,
          mode: parsed.data.mode,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
        update: {
          username,
          normalizedUsername,
          mode: parsed.data.mode,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      return NextResponse.json(
        { error: 'That UDisc username is being reserved by another signup.' },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json(PlayerRegistrationChoiceResponseSchema.parse({ ok: true }));
}
