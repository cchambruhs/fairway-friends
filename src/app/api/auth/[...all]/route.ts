// @polsia:framework-owned - DO NOT EDIT. Code installed by polsia/modules/better-auth@0.9.1. Drift = commit rejected.
//
// better-auth catch-all route handler. Mounts EVERY better-auth endpoint
// (sign-in, sign-up, sign-out, session, callbacks, ...) under /api/auth/*.
// Lives under /api, which proxy.ts's matcher excludes (no CSP/nonce, not proxied).
//
// toNextJsHandler returns native App Router GET/POST handlers — NO Server Actions,
// so the 'nextCookies()' plugin is intentionally absent: cookies are set on the
// route handler's own NextResponse, which Next.js does not discard.

import 'server-only';
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

const handler = toNextJsHandler(auth);

export const { POST } = handler;

// better-auth answers GET /verify-email with raw JSON ({"status":true,"user":null})
// when the link has no callbackURL, e.g. from a custom sender that rebuilt the
// link from the token. A browser opening the email link then never returns to
// the site, and an invalid token shows a JSON error. Default callbackURL to the
// home page for document navigations only: authClient.verifyEmail() fetches
// still receive the JSON they parse.
export function GET(request: Request) {
  const url = new URL(request.url);
  if (
    url.pathname.endsWith('/verify-email') &&
    !url.searchParams.get('callbackURL') &&
    isDocumentNavigation(request)
  ) {
    url.searchParams.set('callbackURL', '/');
    return handler.GET(new Request(url, { method: request.method, headers: request.headers }));
  }
  return handler.GET(request);
}

function isDocumentNavigation(request: Request) {
  const mode = request.headers.get('sec-fetch-mode');
  if (mode) return mode === 'navigate';
  return request.headers.get('accept')?.includes('text/html') ?? false;
}
