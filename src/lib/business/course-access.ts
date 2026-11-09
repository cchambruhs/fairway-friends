// @polsia:user-owned — session and ownership checks for course route handlers.
import 'server-only';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { requireAuth, type SessionUser } from '@/lib/require-auth';

export async function coursePlayer(request: Request): Promise<SessionUser | Response> {
  try {
    return await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
}

export async function courseAdmin(): Promise<SessionUser | Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return session.user;
}

export function ownsCourseRecord(ownerId: string, userId: string): boolean {
  return ownerId === userId;
}
