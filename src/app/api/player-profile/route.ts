// @polsia:user-owned — authenticated, per-player profile and favorite discs.
import 'server-only';
import { NextResponse } from 'next/server';
import {
  PlayerProfileResponseSchema,
  SavePlayerProfileSchema,
} from '@/lib/contracts/player-profile';
import { prisma } from '@/lib/db';
import { requireAuth, type SessionUser } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

async function signedInUser(request: Request): Promise<SessionUser | Response> {
  try {
    return await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
}

export async function GET(request: Request): Promise<Response> {
  const user = await signedInUser(request);
  if (user instanceof Response) return user;

  const stored = await prisma.playerProfile.findUnique({
    where: { userId: user.id },
    include: { favoriteDiscs: { orderBy: { rank: 'asc' } } },
  });
  const response = PlayerProfileResponseSchema.safeParse({
    profile: stored
      ? {
          displayName: stored.displayName,
          hometown: stored.hometown,
          homeCourse: stored.homeCourse,
          bio: stored.bio,
          pdgaNumber: stored.pdgaNumber,
          photoKey: stored.photoKey,
          photoUrl: stored.photoUrl,
        }
      : null,
    favoriteDiscs:
      stored?.favoriteDiscs.map((disc) => ({
        id: disc.id,
        manufacturer: disc.manufacturer,
        mold: disc.mold,
        plastic: disc.plastic,
        weightGrams: disc.weightGrams,
        rank: disc.rank,
      })) ?? [],
  });

  return NextResponse.json(response.success ? response.data : { profile: null, favoriteDiscs: [] });
}

export async function PUT(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await signedInUser(request);
  if (user instanceof Response) return user;

  const body = await request.json().catch(() => null);
  const input = SavePlayerProfileSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ errors: input.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = input.data;
  const saved = await prisma.$transaction(async (transaction) => {
    const profile = await transaction.playerProfile.upsert({
      where: { userId: user.id },
      update: {
        displayName: data.displayName,
        hometown: data.hometown,
        homeCourse: data.homeCourse,
        bio: data.bio,
        pdgaNumber: data.pdgaNumber,
        photoKey: data.photoKey,
        photoUrl: data.photoUrl,
      },
      create: {
        userId: user.id,
        displayName: data.displayName,
        hometown: data.hometown,
        homeCourse: data.homeCourse,
        bio: data.bio,
        pdgaNumber: data.pdgaNumber,
        photoKey: data.photoKey,
        photoUrl: data.photoUrl,
      },
    });

    await transaction.favoriteDisc.deleteMany({ where: { profileId: profile.id } });
    if (data.favoriteDiscs.length > 0) {
      await transaction.favoriteDisc.createMany({
        data: data.favoriteDiscs.map((disc, index) => ({
          profileId: profile.id,
          manufacturer: disc.manufacturer,
          mold: disc.mold,
          plastic: disc.plastic,
          weightGrams: disc.weightGrams,
          rank: index + 1,
        })),
      });
    }

    return transaction.playerProfile.findUniqueOrThrow({
      where: { id: profile.id },
      include: { favoriteDiscs: { orderBy: { rank: 'asc' } } },
    });
  });

  return NextResponse.json({
    profile: {
      displayName: saved.displayName,
      hometown: saved.hometown,
      homeCourse: saved.homeCourse,
      bio: saved.bio,
      pdgaNumber: saved.pdgaNumber,
      photoKey: saved.photoKey,
      photoUrl: saved.photoUrl,
    },
    favoriteDiscs: saved.favoriteDiscs.map((disc) => ({
      id: disc.id,
      manufacturer: disc.manufacturer,
      mold: disc.mold,
      plastic: disc.plastic,
      weightGrams: disc.weightGrams,
      rank: disc.rank,
    })),
  });
}
