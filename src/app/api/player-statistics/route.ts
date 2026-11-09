// @polsia:user-owned — signed-in player statistics from finalized saved scorecards.
import 'server-only';
import { NextResponse } from 'next/server';
import { requirePlayerApi } from '@/lib/business/api-authorization.server';
import { publicProfileForUser } from '@/lib/business/public-player-profile.server';
import { PublicPlayerProfileResponseSchema } from '@/lib/contracts/player-identity';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const authorization = await requirePlayerApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const profile = await publicProfileForUser(authorization.user.id, authorization.user.id);
  if (!profile)
    return NextResponse.json(
      { error: 'Player not found.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  return NextResponse.json(PublicPlayerProfileResponseSchema.parse({ profile }), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
