// @polsia:user-owned — review-first manual and CSV scorecard history.
'use client';

import { CalendarDays, History, Plus, Trophy, X } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';
import {
  type HistoricalRoundInput,
  HistoricalRoundInputSchema,
  type HistoricalRoundItem,
  HistoricalRoundListSchema,
  HistoricalRoundSaveResponseSchema,
  ROUND_HISTORY_UPDATED_EVENT,
} from '@/lib/contracts/round-history';

interface ErrorBody {
  errors?: Record<string, string>;
  message?: string;
}

interface PlayerDraft {
  id: string;
  name: string;
  totalScore: string;
  holeScores: string;
  matchedToCurrentProfile: boolean;
}

function errorBody(error: unknown): ErrorBody | null {
  if (!(error instanceof Error)) {
    return null;
  }
  if (typeof error.cause !== 'object' || error.cause === null) return { message: error.message };
  return error.cause as ErrorBody;
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function parseNumberList(value: string): number[] | undefined {
  if (!value.trim()) return undefined;
  return value.split(',').map((part) => (part.trim() ? Number(part.trim()) : Number.NaN));
}

function optionalNumber(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([first], [second]) => first.localeCompare(second));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function matchesReadback(
  item: HistoricalRoundItem,
  input: HistoricalRoundInput,
  reused = false,
): boolean {
  const linked = input.players?.find((player) => player.matchedToCurrentProfile);
  const score = input.score ?? linked?.totalScore ?? null;
  const playerHoleCount = input.players?.reduce(
    (maximum, player) => Math.max(maximum, player.holeScores?.length ?? 0),
    0,
  );
  const holeCount = input.holeCount ?? input.holePars?.length ?? (playerHoleCount || null);
  return (
    item.playedOn === (input.playedOn ?? null) &&
    item.courseName === (input.courseName ?? null) &&
    item.layoutName === (input.layoutName ?? null) &&
    item.score === score &&
    item.totalPar === (input.totalPar ?? null) &&
    item.holeCount === holeCount &&
    item.sourceUrl === (input.sourceUrl ?? null) &&
    (reused || item.entryMethod === 'manual') &&
    item.historyStatus === 'historical' &&
    item.verificationStatus === 'unverified' &&
    stableJson(item.holePars) === stableJson(input.holePars ?? null) &&
    stableJson(item.holeParEntries) === stableJson(input.holeParEntries ?? null) &&
    stableJson(item.roundMetadata) === stableJson(input.roundMetadata ?? null) &&
    item.players.length === (input.players?.length ?? 0) &&
    item.players.every((saved, index) => {
      const player = input.players?.[index];
      return Boolean(
        player &&
          saved.name === player.name &&
          saved.sourcePlayerId === (player.sourcePlayerId ?? null) &&
          saved.pdgaNumber === (player.pdgaNumber ?? null) &&
          saved.totalScore === (player.totalScore ?? null) &&
          saved.matchedToCurrentProfile === player.matchedToCurrentProfile &&
          stableJson(saved.holeScores) === stableJson(player.holeScores ?? null) &&
          stableJson(saved.holeScoreEntries) === stableJson(player.holeScoreEntries ?? null),
      );
    })
  );
}

export function RoundHistoryWorkspace({ initialSourceUrl = '' }: { initialSourceUrl?: string }) {
  const [rounds, setRounds] = useState<HistoricalRoundItem[] | null>(null);
  const [currentProfile, setCurrentProfile] = useState({
    userId: '',
    displayName: 'No player profile yet',
    exists: false,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playedOn, setPlayedOn] = useState('');
  const [courseName, setCourseName] = useState('');
  const [layoutName, setLayoutName] = useState('');
  const [score, setScore] = useState('');
  const [totalPar, setTotalPar] = useState('');
  const [holeCount, setHoleCount] = useState('');
  const [holePars, setHolePars] = useState('');
  const [playedTime, setPlayedTime] = useState('');
  const [location, setLocation] = useState('');
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [players, setPlayers] = useState<PlayerDraft[]>([
    { id: 'player-1', name: '', totalScore: '', holeScores: '', matchedToCurrentProfile: false },
  ]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<HistoricalRoundInput | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const nextPlayerId = useRef(2);
  const reviewHeadingRef = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await apiFetch('/api/round-history', { schema: HistoricalRoundListSchema });
      setRounds(response.items);
      setCurrentProfile(response.currentProfile);
    } catch {
      setRounds(null);
      setLoadError('Round history could not be loaded. Please try again.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onHistoryUpdated = () => void refresh();
    window.addEventListener(ROUND_HISTORY_UPDATED_EVENT, onHistoryUpdated);
    return () => window.removeEventListener(ROUND_HISTORY_UPDATED_EVENT, onHistoryUpdated);
  }, [refresh]);

  useEffect(() => {
    if (initialSourceUrl) setSourceUrl(initialSourceUrl);
  }, [initialSourceUrl]);

  useEffect(() => {
    if (review) {
      document.getElementById('round-review-title')?.focus({ preventScroll: true });
      reviewHeadingRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [review]);

  function previewRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const playerInputs = players
      .filter(
        (player) => player.name.trim() || player.totalScore.trim() || player.holeScores.trim(),
      )
      .map((player) => ({
        id: player.id,
        name: player.name,
        totalScore: optionalNumber(player.totalScore),
        holeScores: parseNumberList(player.holeScores),
        matchedToCurrentProfile: player.matchedToCurrentProfile,
      }));
    const input = HistoricalRoundInputSchema.safeParse({
      playedOn: playedOn || undefined,
      courseName: courseName.trim() || undefined,
      layoutName: layoutName.trim() || undefined,
      score: optionalNumber(score),
      totalPar: optionalNumber(totalPar),
      holeCount: optionalNumber(holeCount),
      holePars: parseNumberList(holePars),
      players: playerInputs.length ? playerInputs : undefined,
      sourceUrl: sourceUrl || undefined,
      ...(playedTime.trim() || location.trim()
        ? {
            roundMetadata: {
              ...(location.trim() ? { location: location.trim() } : {}),
              ...(playedTime.trim() ? { played_time: playedTime.trim() } : {}),
            },
          }
        : {}),
    });
    if (!input.success) {
      const errors: Record<string, string> = {};
      for (const issue of input.error.issues) {
        const field = String(issue.path[0] ?? 'scorecard');
        if (errors[field] === undefined) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setReview(input.data);
  }

  async function confirmSave() {
    if (!review) return;
    setIsSaving(true);
    setFieldErrors({});
    try {
      const result = await apiFetch('/api/round-history', {
        method: 'POST',
        body: JSON.stringify(review),
        schema: HistoricalRoundSaveResponseSchema,
      });
      const history = await apiFetch('/api/round-history', { schema: HistoricalRoundListSchema });
      const saved = history.items.find((item) => item.id === result.item.id);
      if (!saved || !matchesReadback(saved, review, result.reused)) {
        throw new Error(
          'Persistent round history did not match this preview. Your entries are still available.',
        );
      }
      setRounds(history.items);
      setReview(null);
      window.dispatchEvent(new Event(ROUND_HISTORY_UPDATED_EVENT));
      const unmatched = saved.players
        .filter((player) => !player.matchedToCurrentProfile)
        .map((player) => player.name);
      toast.success(
        [
          result.reused
            ? `Existing scorecard verified · ${saved.id}`
            : `Historical scorecard saved · ${saved.id}`,
          ...(unmatched.length ? [`Unlinked: ${unmatched.join(', ')}`] : []),
        ].join(' · '),
      );
    } catch (error) {
      const body = errorBody(error);
      if (body?.errors) {
        setFieldErrors(body.errors);
      } else {
        toast.error(
          body?.message ?? 'The scorecard could not be saved. Your entries are still here.',
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  function addPlayer() {
    const id = `player-${nextPlayerId.current}`;
    nextPlayerId.current += 1;
    setPlayers((current) => [
      ...current,
      { id, name: '', totalScore: '', holeScores: '', matchedToCurrentProfile: false },
    ]);
  }

  function updatePlayer(id: string, update: Partial<PlayerDraft>) {
    setPlayers((current) =>
      current.map((player) => (player.id === id ? { ...player, ...update } : player)),
    );
  }

  return (
    <div className="ff-round-history-workspace">
      <section className="ff-round-panel" aria-labelledby="manual-round-title">
        <div className="ff-round-section-heading">
          <span className="ff-round-section-icon">
            <CalendarDays aria-hidden="true" />
          </span>
          <div>
            <p className="ff-course-eyebrow">MANUAL SCORECARD</p>
            <h2 id="manual-round-title">Enter a past round</h2>
          </div>
        </div>
        <p className="ff-round-panel-intro">
          Add only the details you know. Review the full card before saving; unmatched cardmates
          stay unlinked and this entry remains historical and unverified.
        </p>

        {review ? (
          <section
            className="ff-round-review"
            aria-labelledby="round-review-title"
            ref={reviewHeadingRef}
          >
            <div className="ff-round-review-heading">
              <div>
                <p className="ff-course-eyebrow">CHECK BEFORE SAVING</p>
                <h3 id="round-review-title" tabIndex={-1}>
                  Scorecard preview
                </h3>
              </div>
              <Button type="button" variant="outline" onClick={() => setReview(null)}>
                Edit details
              </Button>
            </div>
            <dl className="ff-round-review-details">
              <div>
                <dt>Date</dt>
                <dd>{review.playedOn || 'Not entered'}</dd>
              </div>
              <div>
                <dt>Course</dt>
                <dd>{review.courseName || 'Not entered'}</dd>
              </div>
              <div>
                <dt>Layout</dt>
                <dd>{review.layoutName || 'Not entered'}</dd>
              </div>
              <div>
                <dt>Hole count</dt>
                <dd>{review.holeCount ?? review.holePars?.length ?? 'Not entered'}</dd>
              </div>
              <div>
                <dt>Your total</dt>
                <dd>{review.score ?? 'Not entered'}</dd>
              </div>
              <div>
                <dt>Total par</dt>
                <dd>{review.totalPar ?? 'Not entered'}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{review.roundMetadata?.location ?? 'Not entered'}</dd>
              </div>
              <div>
                <dt>Played time</dt>
                <dd>{review.roundMetadata?.played_time ?? 'Not entered'}</dd>
              </div>
            </dl>
            {review.holePars ? (
              <p>
                <strong>Hole pars:</strong> {review.holePars.join(', ')}
              </p>
            ) : null}
            {review.roundMetadata ? (
              <p>
                <strong>Round metadata:</strong> {JSON.stringify(review.roundMetadata)}
              </p>
            ) : null}
            {review.players?.length ? (
              <ul className="ff-round-review-players">
                {review.players.map((player) => (
                  <li key={player.id ?? player.name}>
                    <span>{player.name}</span>
                    <span>
                      {player.matchedToCurrentProfile
                        ? `Linked to ${currentProfile.displayName}`
                        : 'Unlinked'}
                      {player.totalScore !== undefined ? ` · ${player.totalScore} strokes` : ''}
                    </span>
                    {player.holeScores ? (
                      <small>Holes: {player.holeScores.join(', ')}</small>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {review.sourceUrl ? (
              <p className="ff-round-source-review">
                Source URL: <code>{review.sourceUrl}</code>
              </p>
            ) : null}
            <p className="ff-round-unverified-note">
              Historical · Unverified ·{' '}
              {review.sourceUrl ? 'Original source URL retained' : 'No source link'}
            </p>
            {Object.keys(fieldErrors).length ? (
              <Alert variant="destructive" role="alert">
                <AlertTitle>Could not save this scorecard</AlertTitle>
                <AlertDescription>{Object.values(fieldErrors).join(' ')}</AlertDescription>
              </Alert>
            ) : null}
            <div className="ff-round-form-footer">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setReview(null)}
              >
                Edit details
              </Button>
              <Button type="button" disabled={isSaving} onClick={() => void confirmSave()}>
                {isSaving ? 'Saving…' : 'Confirm and save'}
              </Button>
            </div>
          </section>
        ) : (
          <form className="ff-round-form" onSubmit={previewRound} noValidate>
            <div className="ff-round-form-grid">
              <div className="ff-round-field">
                <Label htmlFor="round-played-on">
                  Round date <span>(optional)</span>
                </Label>
                <Input
                  id="round-played-on"
                  type="date"
                  value={playedOn}
                  onChange={(event) => setPlayedOn(event.currentTarget.value)}
                />
              </div>
              <div className="ff-round-field">
                <Label htmlFor="round-course">
                  Course <span>(optional)</span>
                </Label>
                <Input
                  id="round-course"
                  type="text"
                  maxLength={120}
                  autoComplete="off"
                  value={courseName}
                  onChange={(event) => setCourseName(event.currentTarget.value)}
                />
              </div>
              <div className="ff-round-field">
                <Label htmlFor="round-score">
                  Your total score <span>(optional)</span>
                </Label>
                <Input
                  id="round-score"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={3564}
                  step={1}
                  value={score}
                  onChange={(event) => setScore(event.currentTarget.value)}
                />
              </div>
              <div className="ff-round-field">
                <Label htmlFor="round-layout">
                  Layout <span>(optional)</span>
                </Label>
                <Input
                  id="round-layout"
                  type="text"
                  maxLength={120}
                  autoComplete="off"
                  value={layoutName}
                  onChange={(event) => setLayoutName(event.currentTarget.value)}
                />
              </div>
              <div className="ff-round-field">
                <Label htmlFor="round-hole-count">
                  Hole count <span>(9, 18, or custom)</span>
                </Label>
                <Input
                  id="round-hole-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={36}
                  step={1}
                  value={holeCount}
                  onChange={(event) => setHoleCount(event.currentTarget.value)}
                />
              </div>
              <div className="ff-round-field">
                <Label htmlFor="round-location">
                  Course location <span>(optional)</span>
                </Label>
                <Input
                  id="round-location"
                  type="text"
                  maxLength={120}
                  autoComplete="off"
                  placeholder="City, state"
                  value={location}
                  onChange={(event) => setLocation(event.currentTarget.value)}
                />
              </div>
              <div className="ff-round-field">
                <Label htmlFor="round-played-time">
                  Local time <span>(optional; no timezone added)</span>
                </Label>
                <Input
                  id="round-played-time"
                  type="text"
                  maxLength={80}
                  placeholder="12:08 PM"
                  value={playedTime}
                  onChange={(event) => setPlayedTime(event.currentTarget.value)}
                />
              </div>
              <div className="ff-round-field">
                <Label htmlFor="round-total-par">
                  Total par <span>(optional)</span>
                </Label>
                <Input
                  id="round-total-par"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  step={1}
                  value={totalPar}
                  onChange={(event) => setTotalPar(event.currentTarget.value)}
                />
              </div>
              <div className="ff-round-field ff-round-field-wide">
                <Label htmlFor="round-hole-pars">
                  Hole pars <span>(comma-separated, optional)</span>
                </Label>
                <Input
                  id="round-hole-pars"
                  inputMode="numeric"
                  placeholder="Example: 3, 3, 4, 3 …"
                  value={holePars}
                  onChange={(event) => setHolePars(event.currentTarget.value)}
                />
              </div>
              <div className="ff-round-field ff-round-field-wide">
                <Label htmlFor="round-source-url">
                  Original UDisc scorecard URL <span>(optional)</span>
                </Label>
                <Input
                  id="round-source-url"
                  type="url"
                  inputMode="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.currentTarget.value)}
                  aria-invalid={Boolean(fieldErrors.sourceUrl)}
                />
              </div>
            </div>

            <div className="ff-round-players-heading">
              <div>
                <h3>Players on the card</h3>
                <p>Match only yourself to your signed-in profile. Other names remain unlinked.</p>
              </div>
              <Button type="button" variant="outline" onClick={addPlayer}>
                <Plus aria-hidden="true" /> Add player
              </Button>
            </div>
            <div className="ff-round-player-list">
              {players.map((player, index) => (
                <fieldset className="ff-round-player-editor" key={player.id}>
                  <legend>Player {index + 1}</legend>
                  <div className="ff-round-form-grid">
                    <div className="ff-round-field">
                      <Label htmlFor={`${player.id}-name`}>Player name</Label>
                      <Input
                        id={`${player.id}-name`}
                        maxLength={80}
                        value={player.name}
                        onChange={(event) =>
                          updatePlayer(player.id, { name: event.currentTarget.value })
                        }
                      />
                    </div>
                    <div className="ff-round-field">
                      <Label htmlFor={`${player.id}-total`}>
                        Player total <span>(optional)</span>
                      </Label>
                      <Input
                        id={`${player.id}-total`}
                        type="number"
                        min={1}
                        max={3564}
                        step={1}
                        value={player.totalScore}
                        onChange={(event) =>
                          updatePlayer(player.id, { totalScore: event.currentTarget.value })
                        }
                      />
                    </div>
                    <div className="ff-round-field ff-round-field-wide">
                      <Label htmlFor={`${player.id}-holes`}>
                        Hole scores <span>(comma-separated, optional)</span>
                      </Label>
                      <Input
                        id={`${player.id}-holes`}
                        inputMode="numeric"
                        placeholder="Example: 3, 4, 3, 2 …"
                        value={player.holeScores}
                        onChange={(event) =>
                          updatePlayer(player.id, { holeScores: event.currentTarget.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="ff-round-player-actions">
                    <label className="ff-round-match-self">
                      <input
                        type="checkbox"
                        checked={player.matchedToCurrentProfile}
                        disabled={
                          !currentProfile.exists ||
                          (player.matchedToCurrentProfile === false &&
                            players.some((item) => item.matchedToCurrentProfile))
                        }
                        onChange={(event) =>
                          updatePlayer(player.id, {
                            matchedToCurrentProfile: event.currentTarget.checked,
                          })
                        }
                      />
                      {currentProfile.exists
                        ? `This is me (${currentProfile.displayName})`
                        : 'Create your player profile before linking this player'}
                    </label>
                    {!currentProfile.exists ? (
                      <Link href="/dashboard/profile">Create player profile</Link>
                    ) : null}
                    {players.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setPlayers((current) => current.filter((item) => item.id !== player.id))
                        }
                      >
                        <X aria-hidden="true" /> Remove
                      </Button>
                    ) : null}
                  </div>
                </fieldset>
              ))}
            </div>

            {Object.keys(fieldErrors).length ? (
              <Alert variant="destructive" role="alert">
                <AlertTitle>Review the scorecard details</AlertTitle>
                <AlertDescription>{Object.values(fieldErrors).join(' ')}</AlertDescription>
              </Alert>
            ) : null}
            <div className="ff-round-form-footer">
              <p>
                Your round is saved only to your account. Other profiles stay private, and this app
                has no league membership or verification workflow, so no league history is updated.
              </p>
              <Button type="submit">Review scorecard</Button>
            </div>
          </form>
        )}
      </section>

      <section className="ff-round-panel" aria-labelledby="round-history-title">
        <div className="ff-round-history-heading">
          <div className="ff-round-section-heading">
            <span className="ff-round-section-icon">
              <History aria-hidden="true" />
            </span>
            <div>
              <p className="ff-course-eyebrow">YOUR SAVED ROUNDS</p>
              <h2 id="round-history-title">Player history</h2>
            </div>
          </div>
          <span className="ff-round-history-count">{rounds?.length ?? '—'} rounds</span>
        </div>
        {loadError ? (
          <div className="ff-round-empty" role="alert">
            <p>{loadError}</p>
            <Button type="button" variant="outline" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : rounds === null ? (
          <p className="ff-round-loading">Loading your round history…</p>
        ) : rounds.length === 0 ? (
          <div className="ff-round-empty">
            <Trophy aria-hidden="true" />
            <p className="ff-round-empty-title">No historical rounds yet</p>
            <p>Confirmed JSON, manual, and CSV scorecards will appear here.</p>
          </div>
        ) : (
          <ul className="ff-round-history-list">
            {rounds.map((round) => (
              <li className="ff-round-history-card" key={round.id}>
                <div className="ff-round-history-main">
                  <div>
                    <p className="ff-round-date">
                      {round.playedOn ? displayDate(round.playedOn) : 'Date not entered'}
                    </p>
                    <h3>{round.courseName || 'Course not entered'}</h3>
                    {round.layoutName ? (
                      <p className="ff-round-layout">{round.layoutName}</p>
                    ) : null}
                    {round.roundMetadata?.location || round.roundMetadata?.played_time ? (
                      <p className="ff-round-layout">
                        {[round.roundMetadata.location, round.roundMetadata.played_time]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="ff-round-score">
                    <span className="ff-round-score-number">{round.score ?? '—'}</span>
                    <span>score</span>
                    {round.totalPar !== null ? <span>Par {round.totalPar}</span> : null}
                  </div>
                </div>
                {round.players.length ? (
                  <ul className="ff-round-saved-players">
                    {round.players.map((player) => (
                      <li key={`${round.id}-${player.id}`}>
                        <strong>{player.name}</strong>
                        {player.matchedToCurrentProfile ? (
                          <span> · your profile</span>
                        ) : (
                          <span> · unlinked</span>
                        )}
                        {player.totalScore !== null ? (
                          <span> · {player.totalScore} strokes</span>
                        ) : null}
                        {player.holeScores ? (
                          <small>Holes: {player.holeScores.join(', ')}</small>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {round.holePars ? (
                  <p className="ff-round-saved-pars">Pars: {round.holePars.join(', ')}</p>
                ) : null}
                <ul className="ff-round-badges" aria-label="Historical, unverified round">
                  <li>Historical</li>
                  <li>Unverified</li>
                  <li>
                    {round.entryMethod === 'csv'
                      ? 'CSV entry'
                      : round.entryMethod === 'json'
                        ? 'JSON import'
                        : 'Manual entry'}
                  </li>
                </ul>
                {round.sourceUrl ? (
                  <p className="ff-round-source-link">
                    Source:{' '}
                    <a href={round.sourceUrl} target="_blank" rel="noreferrer">
                      {round.sourceUrl}
                    </a>
                  </p>
                ) : null}
                {round.sourceId ? (
                  <p className="ff-round-layout">Source ID: {round.sourceId}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
