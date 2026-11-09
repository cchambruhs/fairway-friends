// @polsia:user-owned — signed-in players' private historical scorecards.
import 'server-only';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { matchCurrentProfilePlayer } from '@/lib/business/round-history-player-match';
import {
  HistoricalRoundInputSchema,
  HistoricalRoundSaveResponseSchema,
  historicalRoundDuplicateKey,
  historicalRoundItem,
  historicalRoundSourceId,
} from '@/lib/contracts/round-history';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function playerJson(
  players: NonNullable<ReturnType<typeof HistoricalRoundInputSchema.parse>['players']>,
) {
  return players.map((player, index) => {
    const value: Prisma.InputJsonObject = {
      id: player.id ?? `player-${index + 1}`,
      name: player.name,
      matchedToCurrentProfile: player.matchedToCurrentProfile,
      ...(player.sourcePlayerId ? { sourcePlayerId: player.sourcePlayerId } : {}),
      ...(player.pdgaNumber ? { pdgaNumber: player.pdgaNumber } : {}),
      ...(player.holeScores ? { holeScores: player.holeScores } : {}),
      ...(player.holeScoreEntries ? { holeScoreEntries: player.holeScoreEntries } : {}),
      ...(player.totalScore !== undefined ? { totalScore: player.totalScore } : {}),
    };
    return value;
  });
}

async function existingRound(userId: string, sourceId: string | null, duplicateKey: string) {
  if (sourceId) {
    const source = await prisma.historicalRoundSource.findUnique({
      where: { userId_sourceId: { userId, sourceId } },
      select: { roundId: true },
    });
    if (source) {
      return prisma.historicalRound.findFirst({
        where: { id: source.roundId, userId },
      });
    }
  }
  return prisma.historicalRound.findFirst({ where: { userId, duplicateKey } });
}

async function validateExplicitProfileLink(
  userId: string,
  round: ReturnType<typeof HistoricalRoundInputSchema.parse>,
): Promise<{ round?: ReturnType<typeof HistoricalRoundInputSchema.parse>; error?: Response }> {
  const players = round.players ?? [];
  const explicitlyLinked = players.some((player) => player.matchedToCurrentProfile);
  if (round.entryMethod !== 'csv' && !explicitlyLinked) return { round };

  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
    select: { displayName: true, pdgaNumber: true },
  });
  if (!profile && explicitlyLinked) {
    return {
      error: NextResponse.json(
        { errors: { players: 'Create your player profile before linking a card player.' } },
        { status: 400 },
      ),
    };
  }

  const match = matchCurrentProfilePlayer(
    players,
    profile?.displayName ?? null,
    profile?.pdgaNumber ?? null,
  );
  const result = HistoricalRoundInputSchema.safeParse({
    ...round,
    ...(round.score === undefined && match.score !== undefined ? { score: match.score } : {}),
    players: match.players,
  });
  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.map(String).join('.') || 'scorecard';
      errors[field] ??= issue.message;
    }
    return { error: NextResponse.json({ errors }, { status: 400 }) };
  }
  return { round: result.data };
}

export async function GET(request: Request): Promise<Response> {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }

  const [rows, profile] = await Promise.all([
    prisma.historicalRound.findMany({
      where: { userId: user.id },
      orderBy: [{ playedOn: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.playerProfile.findUnique({
      where: { userId: user.id },
      select: { displayName: true },
    }),
  ]);
  return NextResponse.json({
    items: rows.map(historicalRoundItem),
    currentProfile: {
      userId: user.id,
      displayName: profile?.displayName ?? 'No player profile yet',
      exists: Boolean(profile),
    },
  });
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

  const input = HistoricalRoundInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    const errors: Record<string, string> = {};
    for (const issue of input.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && errors[field] === undefined) errors[field] = issue.message;
    }
    return NextResponse.json({ errors }, { status: 400 });
  }

  let data = input.data;
  const sourceId = historicalRoundSourceId(data);
  let duplicateKey = historicalRoundDuplicateKey(data);
  const existing = await existingRound(user.id, sourceId, duplicateKey);
  if (existing) {
    return NextResponse.json(
      HistoricalRoundSaveResponseSchema.parse({
        item: historicalRoundItem(existing),
        reused: true,
      }),
    );
  }

  const linked = await validateExplicitProfileLink(user.id, data);
  if (linked.error) return linked.error;
  data = linked.round ?? data;
  duplicateKey = historicalRoundDuplicateKey(data);
  const playerHoleCount = data.players?.reduce(
    (max, player) => Math.max(max, player.holeScores?.length ?? 0),
    0,
  );

  try {
    const saved = await prisma.$transaction(async (transaction) => {
      const row = await transaction.historicalRound.create({
        data: {
          userId: user.id,
          playedOn: data.playedOn ? new Date(`${data.playedOn}T00:00:00.000Z`) : null,
          courseName: data.courseName ?? null,
          layoutName: data.layoutName ?? null,
          score: data.score ?? null,
          totalPar: data.totalPar ?? null,
          holeCount: data.holeCount ?? data.holePars?.length ?? (playerHoleCount || null),
          holePars: data.holePars ?? Prisma.JsonNull,
          holeParEntries: data.holeParEntries ?? Prisma.JsonNull,
          roundMetadata: data.roundMetadata ?? Prisma.JsonNull,
          players: data.players ? playerJson(data.players) : Prisma.JsonNull,
          sourceUrl: data.sourceUrl ?? null,
          sourceId,
          sourceFileKey: data.sourceFileKey ?? null,
          sourceFileUrl: data.sourceFileUrl ?? null,
          duplicateKey,
          entryMethod: data.entryMethod,
          isHistorical: true,
          isVerified: false,
        },
      });
      if (sourceId) {
        await transaction.historicalRoundSource.create({
          data: { userId: user.id, sourceId, roundId: row.id },
        });
      }
      return row;
    });
    return NextResponse.json(
      HistoricalRoundSaveResponseSchema.parse({ item: historicalRoundItem(saved), reused: false }),
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueConflict(error)) {
      const repeated = await existingRound(user.id, sourceId, duplicateKey);
      if (repeated) {
        return NextResponse.json(
          HistoricalRoundSaveResponseSchema.parse({
            item: historicalRoundItem(repeated),
            reused: true,
          }),
        );
      }
      return NextResponse.json(
        { error: 'duplicate_round', message: 'This scorecard is already in your history.' },
        { status: 409 },
      );
    }
    throw error;
  }
}
