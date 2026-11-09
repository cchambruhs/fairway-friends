// @polsia:user-owned — public exact-username profile and persisted round statistics.
import 'server-only';
import { NextResponse } from 'next/server';
import { publicProfileForUsername } from '@/lib/business/public-player-profile.server';
import { PublicPlayerProfileResponseSchema } from '@/lib/contracts/player-identity';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
): Promise<Response> {
  const { username } = await params;
  const profile = await publicProfileForUsername(username);
  if (!profile) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  return NextResponse.json(PublicPlayerProfileResponseSchema.parse({ profile }));
}
