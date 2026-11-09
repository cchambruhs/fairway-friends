// @polsia:user-owned — authenticated, read-only duplicate and profile preview.
import 'server-only';
import { NextResponse } from 'next/server';
import {
  HistoricalRoundInputSchema,
  historicalRoundDuplicateKey,
  historicalRoundSourceId,
} from '@/lib/contracts/round-history';
import { HistoricalRoundPreviewResponseSchema } from '@/lib/contracts/round-history-preview';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
  const profile = await prisma.playerProfile.findUnique({
    where: { userId: user.id },
    select: { displayName: true },
  });
  return NextResponse.json(
    HistoricalRoundPreviewResponseSchema.parse({
      duplicate: null,
      currentProfile: {
        displayName: profile?.displayName ?? 'No player profile yet',
        exists: Boolean(profile),
      },
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }

  const parsed = HistoricalRoundInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'scorecard',
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const round = parsed.data;
  const sourceId = historicalRoundSourceId(round);
  const duplicateKey = historicalRoundDuplicateKey(round);
  const [source, duplicate, profile] = await Promise.all([
    sourceId
      ? prisma.historicalRoundSource.findUnique({
          where: { userId_sourceId: { userId: user.id, sourceId } },
          select: { roundId: true },
        })
      : Promise.resolve(null),
    prisma.historicalRound.findFirst({
      where: { userId: user.id, duplicateKey },
      select: { id: true, sourceUrl: true },
    }),
    prisma.playerProfile.findUnique({
      where: { userId: user.id },
      select: { displayName: true },
    }),
  ]);

  const sourceRound = source
    ? await prisma.historicalRound.findFirst({
        where: { id: source.roundId, userId: user.id },
        select: { id: true, sourceUrl: true },
      })
    : null;

  const found = sourceRound ?? duplicate;
  return NextResponse.json(
    HistoricalRoundPreviewResponseSchema.parse({
      duplicate: found ? { roundId: found.id, sourceUrl: found.sourceUrl } : null,
      currentProfile: {
        displayName: profile?.displayName ?? 'No player profile yet',
        exists: Boolean(profile),
      },
    }),
  );
}
