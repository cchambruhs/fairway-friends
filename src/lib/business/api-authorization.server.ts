// @polsia:user-owned — route-handler authorization helpers using installed Better Auth.

import 'server-only';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

export async function requireAdminApi(request: Request) {
  try {
    const user = await requireAuth(request);
    if (user.role !== 'admin') {
      return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) } as const;
    }
    return { user } as const;
  } catch (response) {
    return { response: response as Response } as const;
  }
}

export async function requirePlayerApi(request: Request) {
  try {
    const user = await requireAuth(request);
    const identity = await prisma.uDiscIdentity.findFirst({
      where: { OR: [{ ownerUserId: user.id }, { pendingClaimUserId: user.id }] },
      select: { id: true },
    });
    if (!identity) {
      return {
        response: Response.json(
          { error: 'Choose a player profile before using the clubhouse.' },
          { status: 403 },
        ),
      } as const;
    }
    return { user } as const;
  } catch (response) {
    return { response: response as Response } as const;
  }
}
