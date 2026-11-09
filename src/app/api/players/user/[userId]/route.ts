// @polsia:user-owned — public profile for a registered Fairway Friends player.
import 'server-only';
import { NextResponse } from 'next/server';
import { publicProfileForUser } from '@/lib/business/public-player-profile.server';
import { PublicPlayerProfileResponseSchema } from '@/lib/contracts/player-identity';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const { userId } = await params;
  const profile = await publicProfileForUser(userId);
  if (!profile) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  return NextResponse.json(PublicPlayerProfileResponseSchema.parse({ profile }));
}
