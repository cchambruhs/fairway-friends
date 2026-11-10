// @polsia:user-owned — converts scorecards exported from the legacy ChatGPT Fairway Friends site.
//
// Source: the legacy site's GET /api/data JSON ({ rounds: [...] }) and its bundled seed.json.
// Every value is copied from the source; nothing is invented. Fields the source lacks
// (location, finishing position) stay null. Validation is the same schema the live
// CardCast importer uses, so a legacy card that would not pass a fresh import is rejected.
import {
  type ImportedScorecardDraft,
  ImportedScorecardDraftSchema,
} from '@/lib/contracts/imported-scorecard';

export interface LegacyChatGptPlayer {
  username: string;
  name?: string | null;
  scores: Array<number | null>;
  total: number;
  relative?: number | null;
  complete?: boolean;
  holesPlayed?: number;
}

export interface LegacyChatGptRound {
  id: string;
  source?: string;
  url: string;
  course?: string | null;
  layout?: string | null;
  layoutKey?: string | null;
  /** Local wall-clock start, e.g. "2026-10-27T15:36" (no time zone in the source). */
  date?: string | null;
  pars: Array<number | null>;
  par?: number | null;
  players: LegacyChatGptPlayer[];
}

export type LegacyConversion =
  | { ok: true; card: ImportedScorecardDraft }
  | { ok: false; id: string; reason: string };

const COURSE_PATH = /^\/courses\/([A-Za-z0-9-]+)(?:\/|$)/;

/** UDisc course page derived from the source's own layout path, when it has one. */
export function legacyCourseUrl(layoutKey: string | null | undefined): string | null {
  const match = layoutKey ? COURSE_PATH.exec(layoutKey) : null;
  return match ? `https://udisc.com/courses/${match[1]}` : null;
}

export function convertLegacyChatGptRound(round: LegacyChatGptRound): LegacyConversion {
  const id = typeof round?.id === 'string' ? round.id : '(missing id)';
  if (round?.source && round.source !== 'udisc') {
    return { ok: false, id, reason: `Unsupported source "${round.source}".` };
  }
  const playedOn =
    typeof round.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(round.date)
      ? round.date.slice(0, 10)
      : null;
  const draft = {
    scorecardId: round.id,
    sourceUrl: round.url,
    courseName: round.course?.trim() || null,
    courseUrl: legacyCourseUrl(round.layoutKey),
    layoutName: round.layout?.trim() || null,
    playedOn,
    location: null,
    holeCount: Array.isArray(round.pars) ? round.pars.length : null,
    pars: Array.isArray(round.pars) ? round.pars : null,
    totalPar: typeof round.par === 'number' ? round.par : null,
    players: (round.players ?? []).map((player) => {
      const played = player.scores.filter((score) => score !== null).length;
      return {
        displayName: player.name?.trim() || null,
        username: player.username || null,
        holeScores: player.scores,
        totalScore: player.total,
        toPar: typeof player.relative === 'number' ? player.relative : null,
        position: null,
        holesPlayed: player.holesPlayed ?? played,
        didNotFinish: player.complete === undefined ? played < round.pars.length : !player.complete,
      };
    }),
  };
  const parsed = ImportedScorecardDraftSchema.safeParse(draft);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      id,
      reason: `${issue?.message ?? 'Invalid scorecard.'}${issue?.path.length ? ` (${issue.path.join('.')})` : ''}`,
    };
  }
  if (!sourceUrlMatchesId(parsed.data.sourceUrl, parsed.data.scorecardId)) {
    return { ok: false, id, reason: 'The scorecard id does not match its UDisc link.' };
  }
  return { ok: true, card: parsed.data };
}

function sourceUrlMatchesId(sourceUrl: string, scorecardId: string): boolean {
  try {
    const segments = new URL(sourceUrl).pathname.split('/').filter(Boolean);
    return segments.at(-1) === scorecardId;
  } catch {
    return false;
  }
}

/** Accepts either the live /api/data payload or the bundled seed.json. */
export function legacyRoundsFrom(payload: unknown): LegacyChatGptRound[] {
  if (payload && typeof payload === 'object' && 'rounds' in payload) {
    const rounds = (payload as { rounds: unknown }).rounds;
    if (Array.isArray(rounds)) return rounds as LegacyChatGptRound[];
  }
  throw new Error('Expected a JSON object with a "rounds" array.');
}
