// @polsia:user-owned — admin-only soft removal keeps the imported source record for audit.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/business/api-authorization.server';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ scorecardId: string }> },
): Promise<Response> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authorization = await requireAdminApi(request);
  if ('response' in authorization && authorization.response) return authorization.response;
  const { scorecardId } = await params;
  const updated = await prisma.importedScorecard.updateMany({
    where: { id: scorecardId, deletedAt: null },
    data: {
      deletedAt: new Date(),
      deletedByUserId: authorization.user.id,
      revision: { increment: 1 },
    },
  });
  if (!updated.count)
    return NextResponse.json({ error: 'Active scorecard not found.' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    message: 'Scorecard removed from public statistics; its source and edit history were retained.',
  });
}
