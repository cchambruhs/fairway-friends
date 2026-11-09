// @polsia:user-owned

import 'server-only';
import { DownloadAuthorization } from '@/modules/file-upload/proxy';

/**
 * Decides whether the visitor behind `request` may read the private file
 * `key`. Called first by GET /api/files/<key> (what `fileUrl(key)` renders);
 * anything but `Allow` answers 404, like an unknown file.
 *
 * The company API key only identifies the app, so this default denies every
 * download. Rename `_request`/`_key` and check that the file row belongs to
 * the session user, e.g. with better-auth and a `Document` model holding the key
 * (import { auth } from '@/lib/auth'; import { prisma } from '@/lib/db'):
 *
 *   const session = await auth.api.getSession({ headers: request.headers });
 *   if (!session?.user) {
 *     return DownloadAuthorization.Deny;
 *   }
 *   const owned = await prisma.document.findFirst({
 *     where: { fileKey: key, userId: session.user.id },
 *     select: { id: true },
 *   });
 *   return owned ? DownloadAuthorization.Allow : DownloadAuthorization.Deny;
 */
export async function authorizeDownload(
  _request: Request,
  _key: string,
): Promise<DownloadAuthorization> {
  return DownloadAuthorization.Deny;
}
