// @polsia:user-owned — resumable mobile-first scorecard with server-authorized autosave and finalize.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { type SavedRoundItem, SavedRoundResponseSchema } from '@/lib/contracts/saved-round';

type DraftPlayer = Pick<SavedRoundItem['participants'][number], 'userId' | 'holeScores'>;

function draftsFromItem(item: SavedRoundItem): DraftPlayer[] {
  return item.participants.map((participant) => ({
    userId: participant.userId,
    holeScores: [...participant.holeScores],
  }));
}

function sameScores(left: readonly DraftPlayer[], right: readonly DraftPlayer[]): boolean {
  return (
    left.length === right.length &&
    left.every((player, index) => {
      const other = right[index];
      return (
        other?.userId === player.userId &&
        player.holeScores.length === other.holeScores.length &&
        player.holeScores.every((score, holeIndex) => score === other.holeScores[holeIndex])
      );
    })
  );
}

function signedToPar(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return 'E';
  return value > 0 ? `+${value}` : String(value);
}

export function SavedRoundEditor({ roundId }: { roundId: string }) {
  const [item, setItem] = useState<SavedRoundItem | null>(null);
  const [drafts, setDrafts] = useState<DraftPlayer[]>([]);
  const [currentHole, setCurrentHole] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const loadRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    setLoading(true);
    try {
      const result = await apiFetch(`/api/rounds/${encodeURIComponent(roundId)}`, {
        schema: SavedRoundResponseSchema,
      });
      if (requestId !== loadRequestId.current) return;
      setItem(result.item);
      setDrafts(draftsFromItem(result.item));
      setLoadError(false);
    } catch {
      if (requestId !== loadRequestId.current) return;
      setLoadError(true);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = item !== null && !sameScores(drafts, draftsFromItem(item));
  const allScoresComplete =
    item !== null &&
    drafts.length === item.participants.length &&
    drafts.every(
      (player) =>
        player.holeScores.length === item.holePars.length &&
        player.holeScores.every((score) => score !== null),
    );
  const activeHolePar = item?.holePars[currentHole] ?? null;
  const totalParThroughHole = useMemo(
    () => (item ? item.holePars.slice(0, currentHole + 1).reduce((sum, par) => sum + par, 0) : 0),
    [currentHole, item],
  );

  const persistScores = useCallback(
    async (scores: DraftPlayer[]): Promise<SavedRoundItem | null> => {
      if (!item) return null;
      setSaving(true);
      try {
        const response = await apiFetch(`/api/rounds/${encodeURIComponent(roundId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ revision: item.revision, participants: scores }),
          schema: SavedRoundResponseSchema,
        });
        setItem(response.item);
        setDrafts(draftsFromItem(response.item));
        toast.success('Scorecard saved');
        return response.item;
      } catch (reason) {
        toast.error(
          reason instanceof Error ? reason.message : 'Scorecard changes could not be saved.',
        );
        if (reason instanceof Error && reason.message.includes('(409)')) void load();
        return null;
      } finally {
        setSaving(false);
      }
    },
    [item, load, roundId],
  );

  useEffect(() => {
    if (!item?.viewer.canEdit || !isDirty || saving || finalizing) return;
    const timer = window.setTimeout(() => void persistScores(drafts), 650);
    return () => window.clearTimeout(timer);
  }, [drafts, finalizing, isDirty, item, persistScores, saving]);

  async function finalizeRound(): Promise<void> {
    if (!item?.viewer.canFinalize || !allScoresComplete || saving || finalizing) return;
    setFinalizing(true);
    try {
      const saved = isDirty ? await persistScores(drafts) : item;
      if (!saved) return;
      const response = await apiFetch(`/api/rounds/${encodeURIComponent(roundId)}/finalize`, {
        method: 'POST',
        body: JSON.stringify({ revision: saved.revision }),
        schema: SavedRoundResponseSchema,
      });
      setItem(response.item);
      setDrafts(draftsFromItem(response.item));
      toast.success(
        response.item.verificationStatus === 'LEAGUE_VERIFIED'
          ? 'League scorecard verified and finalized'
          : 'Casual scorecard finalized · unverified',
      );
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : 'The scorecard could not be finalized.',
      );
    } finally {
      setFinalizing(false);
    }
  }

  function changeScore(userId: string, value: string): void {
    const score = value === '' ? null : Number(value);
    if (score !== null && (!Number.isInteger(score) || score < 1 || score > 99)) return;
    setDrafts((current) =>
      current.map((player) =>
        player.userId === userId
          ? {
              ...player,
              holeScores: player.holeScores.map((saved, index) =>
                index === currentHole ? score : saved,
              ),
            }
          : player,
      ),
    );
  }

  if (loading) return <p aria-live="polite">Loading saved scorecard…</p>;
  if (loadError || !item) {
    return (
      <section className="ff-saved-round-error" role="alert">
        <h1>Scorecard unavailable</h1>
        <p>This saved round could not be opened with your current workspace access.</p>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Try again
        </Button>
        <Link href="/dashboard/rounds">Back to rounds</Link>
      </section>
    );
  }

  const currentPar = activeHolePar ?? 0;
  const scoreByUserId = new Map(
    drafts.map((player) => [player.userId, player.holeScores[currentHole] ?? null]),
  );
  const canChangeScores = item.viewer.canEdit && !saving && !finalizing;

  return (
    <div className="ff-saved-round-editor">
      <header className="ff-saved-round-editor-heading">
        <div>
          <p className="ff-profile-section-kicker">
            {item.leagueId ? 'LEAGUE SCORECARD' : 'CASUAL SCORECARD'}
          </p>
          <h1>{item.courseName ?? 'Saved round'}</h1>
          <p>
            {item.layoutName ?? `${item.holePars.length}-hole layout`} · Par {item.totalPar} ·{' '}
            {new Date(`${item.playedOn}T00:00:00`).toLocaleDateString()}
          </p>
        </div>
        <span
          className={`ff-saved-round-badge ${item.status === 'FINALIZED' ? 'is-finalized' : 'is-progress'}`}
        >
          {item.status === 'IN_PROGRESS'
            ? 'In progress · auto-saved'
            : item.verificationStatus === 'LEAGUE_VERIFIED'
              ? 'League verified · finalized'
              : 'Casual · finalized · unverified'}
        </span>
      </header>

      {item.status === 'FINALIZED' && item.viewer.canCorrect ? (
        <p className="ff-saved-round-notice">
          You have current permission to correct this finalized scorecard. Changes save to this same
          record and refresh player statistics.
        </p>
      ) : item.status === 'FINALIZED' ? (
        <p className="ff-saved-round-notice">
          This finalized scorecard is read-only for your current permissions.
        </p>
      ) : item.leagueId && !item.viewer.canEdit ? (
        <p className="ff-saved-round-notice">
          Your current League role does not allow score entry on this card.
        </p>
      ) : null}

      <section className="ff-saved-round-live" aria-labelledby="live-standings-title">
        <div className="ff-saved-round-live-heading">
          <div>
            <p className="ff-profile-section-kicker">LIVE TOTALS</p>
            <h2 id="live-standings-title">Standings</h2>
          </div>
          <p>
            Par {item.totalPar} overall · hole {currentHole + 1} par {currentPar} · par{' '}
            {totalParThroughHole} through this hole
          </p>
        </div>
        <ol>
          {item.participants.map((participant) => (
            <li key={participant.userId}>
              <span className="ff-saved-round-position">{participant.position}</span>
              <strong>{participant.displayName}</strong>
              <span>
                {participant.holesPlayed}/{item.holePars.length} holes
              </span>
              <b>{participant.totalStrokes || '—'}</b>
              <span>{signedToPar(participant.toPar)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="ff-saved-round-hole-card" aria-labelledby="active-hole-title">
        <div className="ff-saved-round-hole-heading">
          <Button
            type="button"
            variant="outline"
            disabled={currentHole === 0}
            onClick={() => setCurrentHole((hole) => Math.max(0, hole - 1))}
          >
            Previous hole
          </Button>
          <label>
            <span className="sr-only">Select hole</span>
            <select
              aria-label="Select hole"
              value={currentHole}
              onChange={(event) => setCurrentHole(Number(event.currentTarget.value))}
            >
              {item.holePars.map((par, index) => (
                <option key={`hole-option-${index + 1}`} value={index}>
                  Hole {index + 1} · Par {par}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={currentHole >= item.holePars.length - 1}
            onClick={() => setCurrentHole((hole) => Math.min(item.holePars.length - 1, hole + 1))}
          >
            Next hole
          </Button>
        </div>
        <header>
          <p className="ff-profile-section-kicker">HOLE {currentHole + 1}</p>
          <h2 id="active-hole-title">Par {currentPar}</h2>
          <p>
            Scores entered:{' '}
            {
              item.participants.filter(
                (participant) => scoreByUserId.get(participant.userId) !== null,
              ).length
            }
            /{item.participants.length}
          </p>
        </header>
        <div className="ff-saved-round-hole-scores">
          {item.participants.map((participant) => (
            <label key={participant.userId}>
              <span>{participant.displayName}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                aria-label={`${participant.displayName} score for hole ${currentHole + 1}`}
                placeholder="—"
                value={scoreByUserId.get(participant.userId) ?? ''}
                disabled={!canChangeScores}
                onChange={(event) => changeScore(participant.userId, event.currentTarget.value)}
              />
              <small>
                {scoreByUserId.get(participant.userId) === null
                  ? 'Not scored'
                  : `${(scoreByUserId.get(participant.userId) ?? currentPar) - currentPar > 0 ? '+' : ''}${(scoreByUserId.get(participant.userId) ?? currentPar) - currentPar} to par`}
              </small>
            </label>
          ))}
        </div>
        <p className="ff-saved-round-save-state" aria-live="polite">
          {saving
            ? 'Saving this scorecard…'
            : isDirty
              ? 'Changes will save automatically.'
              : 'All score changes are saved.'}
        </p>
      </section>

      <footer className="ff-saved-round-editor-footer">
        <Link href="/dashboard/rounds">Back to rounds</Link>
        {item.viewer.canFinalize && item.status === 'IN_PROGRESS' ? (
          <Button
            type="button"
            disabled={!allScoresComplete || saving || finalizing}
            onClick={() => void finalizeRound()}
          >
            {finalizing ? 'Finalizing…' : 'Finalize scorecard'}
          </Button>
        ) : null}
        {item.status === 'IN_PROGRESS' && !allScoresComplete ? (
          <span>Enter every player’s score for all {item.holePars.length} holes to finalize.</span>
        ) : null}
      </footer>
    </div>
  );
}
