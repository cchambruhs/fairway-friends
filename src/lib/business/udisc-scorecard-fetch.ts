// @polsia:user-owned — bounded server-side fetch of one public UDisc scorecard page.
import 'server-only';
import { parseUDiscScorecardHtml } from '@/lib/business/udisc-scorecard-parser';
import type { ImportedScorecardDraft } from '@/lib/contracts/imported-scorecard';
import { UDiscScorecardLinkSchema } from '@/lib/contracts/scorecard-import';

export const UDISC_FETCH_TIMEOUT_MS = 15_000;
export const UDISC_MAX_RESPONSE_BYTES = 2_000_000;

export class UDiscScorecardFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UDiscScorecardFetchError';
  }
}

export async function fetchUDiscScorecard(sourceUrl: string): Promise<ImportedScorecardDraft> {
  const validatedUrl = UDiscScorecardLinkSchema.safeParse(sourceUrl);
  if (!validatedUrl.success)
    throw new UDiscScorecardFetchError('Paste a valid public UDisc scorecard link.');

  let response: Response;
  try {
    response = await fetch(validatedUrl.data, {
      redirect: 'manual',
      signal: AbortSignal.timeout(UDISC_FETCH_TIMEOUT_MS),
      headers: { Accept: 'text/html' },
    });
  } catch {
    throw new UDiscScorecardFetchError(
      'UDisc could not be reached from the app server. Try again later.',
    );
  }

  if (!response.ok || (response.status >= 300 && response.status < 400)) {
    throw new UDiscScorecardFetchError('UDisc did not provide this public scorecard page.');
  }
  if (response.url && response.url !== validatedUrl.data) {
    throw new UDiscScorecardFetchError(
      'UDisc redirected the request; redirected pages are not imported.',
    );
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new UDiscScorecardFetchError('UDisc did not return an HTML scorecard page.');
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > UDISC_MAX_RESPONSE_BYTES) {
    if (response.body) void response.body.cancel().catch(() => undefined);
    throw new UDiscScorecardFetchError('The UDisc scorecard page is too large to import.');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new UDiscScorecardFetchError('UDisc returned an empty scorecard page.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let html = '';
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > UDISC_MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new UDiscScorecardFetchError('The UDisc scorecard page is too large to import.');
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
    html += decoder.decode();
  } catch (error) {
    if (error instanceof UDiscScorecardFetchError) throw error;
    throw new UDiscScorecardFetchError(
      'UDisc interrupted the scorecard download. Try again later.',
    );
  }

  try {
    return parseUDiscScorecardHtml(html, validatedUrl.data);
  } catch {
    throw new UDiscScorecardFetchError(
      'UDisc returned a page that does not contain a complete scorecard.',
    );
  }
}
