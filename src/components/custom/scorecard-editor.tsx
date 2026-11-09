// @polsia:user-owned — editable scorecard proposals, assignment search and review history.
'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  type ScorecardAssignmentHistory,
  ScorecardAssignmentHistorySchema,
} from '@/lib/contracts/clubhouses';
import type { ImportedScorecardItem } from '@/lib/contracts/imported-scorecard';
import {
  ScorecardAssignmentActionResponseSchema,
  ScorecardAssignmentUpdateSchema,
  type ScorecardDestinations,
  ScorecardDestinationsSchema,
  ScorecardEditActionResponseSchema,
  ScorecardEditApprovalSchema,
  type ScorecardEditBundle,
  ScorecardEditBundleSchema,
  ScorecardEditDraftSchema,
  ScorecardEditRejectResponseSchema,
  ScorecardEditRequestResponseSchema,
} from '@/lib/contracts/scorecard-governance';

type PlayerDraft = {
  id: string;
  displayName: string;
  username: string;
  scores: string;
};

type FormDraft = {
  courseName: string;
  courseUrl: string;
  layoutName: string;
  playedOn: string;
  location: string;
  holeCount: string;
  pars: string;
  totalPar: string;
  courseLayoutId: string;
  players: PlayerDraft[];
};

function itemToForm(item: ImportedScorecardItem): FormDraft {
  return {
    courseName: item.courseName ?? '',
    courseUrl: item.courseUrl ?? '',
    layoutName: item.layoutName ?? '',
    playedOn: item.playedOn ?? '',
    location: item.location ?? '',
    holeCount: String(item.holeCount ?? item.pars?.length ?? ''),
    pars: item.pars?.map((par) => par ?? '').join(', ') ?? '',
    totalPar: item.totalPar === null ? '' : String(item.totalPar),
    courseLayoutId: item.courseLayoutId ?? '',
    players: item.players.map((player) => ({
      id: player.id,
      displayName: player.displayName ?? '',
      username: player.username ?? '',
      scores: player.holeScores.join(', '),
    })),
  };
}

function parseNumberList(raw: string): number[];
function parseNumberList(raw: string, nullable: true): Array<number | null>;
function parseNumberList(raw: string, nullable = false): Array<number | null> {
  const values = raw.split(',').map((value) => value.trim());
  while (values.at(-1) === '') values.pop();
  return values.map((value) => {
    if (value === '') {
      if (nullable) return null;
      throw new Error('Enter a saved score for every hole; unknown scores cannot be filled in.');
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error('Use whole numbers separated by commas.');
    return parsed;
  });
}

function dateLabel(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function snapshotSummary(
  snapshot: ScorecardEditBundle['editHistory'][number]['beforeSnapshot'],
): string {
  const playerSummary = snapshot.players
    .map(
      (player) =>
        `${player.username ? `@${player.username}` : (player.displayName ?? 'Unlinked player')}: ${player.totalScore}`,
    )
    .join(' · ');
  return `${snapshot.courseName ?? 'Course unavailable'} · ${snapshot.layoutName ?? 'Layout unavailable'} · ${dateLabel(snapshot.playedOn)} · ${playerSummary}`;
}

function SearchableAssignment({
  id,
  label,
  value,
  options,
  search,
  onSearch,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { id: string; name: string }[];
  search: string;
  onSearch: (value: string) => void;
  onChange: (value: string) => void;
}) {
  const visibleOptions = options.filter(
    (option) => option.id === value || option.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="ff-scorecard-destination-field">
      <label htmlFor={`${id}-search`}>{label} search</label>
      <input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={(event) => onSearch(event.currentTarget.value)}
        placeholder={`Search ${label.toLowerCase()}`}
      />
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">Unassigned</option>
        {value && !options.some((option) => option.id === value) ? (
          <option value={value} disabled>
            Current assignment
          </option>
        ) : null}
        {visibleOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
        {!visibleOptions.length && search ? (
          <option disabled value="__none__">
            No matching destinations
          </option>
        ) : null}
      </select>
    </div>
  );
}

export function ScorecardEditor({ scorecardId }: { scorecardId: string }) {
  const [bundle, setBundle] = useState<ScorecardEditBundle | null>(null);
  const [assignmentHistory, setAssignmentHistory] = useState<
    ScorecardAssignmentHistory['items'] | null
  >(null);
  const [destinations, setDestinations] = useState<ScorecardDestinations | null>(null);
  const [form, setForm] = useState<FormDraft | null>(null);
  const [clubhouseId, setClubhouseId] = useState('');
  const [leagueId, setLeagueId] = useState('');
  const [clubhouseSearch, setClubhouseSearch] = useState('');
  const [leagueSearch, setLeagueSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextBundle, nextDestinations, nextAssignmentHistory] = await Promise.all([
        apiFetch(`/api/udisc-scorecards/${encodeURIComponent(scorecardId)}/edits`, {
          schema: ScorecardEditBundleSchema,
        }),
        apiFetch('/api/scorecard-destinations', { schema: ScorecardDestinationsSchema }),
        apiFetch(`/api/udisc-scorecards/${encodeURIComponent(scorecardId)}/assignment-history`, {
          schema: ScorecardAssignmentHistorySchema,
        }).catch(() => null),
      ]);
      setBundle(nextBundle);
      setAssignmentHistory(nextAssignmentHistory?.items ?? null);
      setDestinations(nextDestinations);
      setForm(itemToForm(nextBundle.item));
      setClubhouseId(nextBundle.item.clubhouseId ?? '');
      setLeagueId(nextBundle.item.leagueId ?? '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Scorecard details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [scorecardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentHoleCount = useMemo(() => Number(form?.holeCount ?? 0), [form?.holeCount]);

  function update<K extends keyof FormDraft>(key: K, value: FormDraft[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updatePlayer(playerId: string, key: keyof PlayerDraft, value: string) {
    setForm((current) =>
      current
        ? {
            ...current,
            players: current.players.map((player) =>
              player.id === playerId ? { ...player, [key]: value } : player,
            ),
          }
        : current,
    );
  }

  function payload() {
    if (!form) throw new Error('Scorecard fields are not ready.');
    const pars = parseNumberList(form.pars, true);
    const holeScores = form.players.map((player) => parseNumberList(player.scores));
    const totalPar = form.totalPar.trim() ? Number(form.totalPar) : null;
    const input = {
      courseName: form.courseName.trim() || null,
      courseUrl: form.courseUrl.trim() || null,
      layoutName: form.layoutName.trim() || null,
      playedOn: form.playedOn || null,
      location: form.location.trim() || null,
      holeCount: form.holeCount.trim() ? Number(form.holeCount) : null,
      totalPar,
      pars: pars.length ? pars : null,
      courseLayoutId: form.courseLayoutId || null,
      players: form.players.map((player, index) => {
        const scores = holeScores[index] ?? [];
        const totalScore = scores.reduce((sum, score) => sum + score, 0);
        return {
          displayName: player.displayName.trim() || null,
          username: player.username.trim() || null,
          holeScores: scores,
          totalScore,
          toPar: totalPar === null ? null : totalScore - totalPar,
          position: null,
        };
      }),
    };
    return ScorecardEditDraftSchema.parse(input);
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !bundle?.canEdit) return;
    setBusy(true);
    try {
      const input = payload();
      const response = await apiFetch(
        `/api/udisc-scorecards/${encodeURIComponent(scorecardId)}/edits`,
        {
          method: 'POST',
          body: JSON.stringify(input),
          schema: ScorecardEditRequestResponseSchema,
        },
      );
      toast.success(response.message);
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Edit request could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignments() {
    if (!bundle?.item.canReassign) return;
    setBusy(true);
    try {
      const result = await apiFetch(
        `/api/udisc-scorecards/${encodeURIComponent(scorecardId)}/assignments`,
        {
          method: 'PATCH',
          body: JSON.stringify(
            ScorecardAssignmentUpdateSchema.parse({
              clubhouseId: clubhouseId || null,
              leagueId: leagueId || null,
            }),
          ),
          schema: ScorecardAssignmentActionResponseSchema,
        },
      );
      toast.success(
        result.message ??
          (result.pending
            ? 'Assignment change submitted for approval.'
            : 'Scorecard assignments saved.'),
      );
      await load();
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : 'Scorecard assignments could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function review(editId: string, role: 'submitter' | 'leagueLeader' | 'reject') {
    setBusy(true);
    try {
      if (role === 'reject') {
        await apiFetch(
          `/api/udisc-scorecards/${encodeURIComponent(scorecardId)}/edits/${encodeURIComponent(editId)}/reject`,
          {
            method: 'POST',
            body: JSON.stringify({}),
            schema: ScorecardEditRejectResponseSchema,
          },
        );
        toast.success('Edit rejected. The saved scorecard remains unchanged.');
      } else {
        const approval = ScorecardEditApprovalSchema.parse({ role });
        const result = await apiFetch(
          `/api/udisc-scorecards/${encodeURIComponent(scorecardId)}/edits/${encodeURIComponent(editId)}/approve`,
          {
            method: 'POST',
            body: JSON.stringify(approval),
            schema: ScorecardEditActionResponseSchema,
          },
        );
        toast.success(result.message);
      }
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Review action could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <main className="ff-scorecard-editor">
        <output className="block" aria-live="polite">
          Loading saved scorecard…
        </output>
      </main>
    );
  if (error || !bundle || !form || !destinations)
    return (
      <main className="ff-scorecard-editor">
        <div role="alert">
          <h1>Scorecard unavailable</h1>
          <p>{error ?? 'Scorecard details could not be loaded.'}</p>
          <Button type="button" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </main>
    );

  return (
    <main className="ff-scorecard-editor">
      <header className="ff-scorecard-editor-header">
        <div>
          <p className="ff-profile-section-kicker">SAVED UDISC SCORECARD</p>
          <h1>Edit Scorecard</h1>
          <p>
            {bundle.item.courseName ?? 'Course unavailable'} · {dateLabel(bundle.item.playedOn)} ·{' '}
            {bundle.item.players.length} players
          </p>
          <a href={bundle.item.sourceUrl} target="_blank" rel="noreferrer">
            Open original UDisc scorecard
          </a>
        </div>
        <Button asChild type="button" variant="outline">
          <Link href="/statistics">Back to Global Stats</Link>
        </Button>
      </header>

      {!bundle.canEdit ? (
        <p className="ff-scorecard-editor-notice">
          You can review this scorecard, but only its original submitter or an app admin can propose
          changes. Legacy submitters are not inferred.
        </p>
      ) : null}
      {bundle.item.finalizedAt ? (
        <p className="ff-scorecard-editor-notice">
          Finalized result. Score changes stay pending until the original submitter or an app admin
          and an authorized League Leader approve them.
        </p>
      ) : null}

      <section className="ff-scorecard-editor-panel" aria-labelledby="scorecard-assignment-title">
        <div className="ff-scorecard-editor-panel-heading">
          <div>
            <p className="ff-profile-section-kicker">DESTINATIONS</p>
            <h2 id="scorecard-assignment-title">Clubhouse and League</h2>
          </div>
          <span>
            Current: {bundle.item.clubhouseName ?? 'Unassigned'} ·{' '}
            {bundle.item.leagueName ?? 'Unassigned'}
          </span>
        </div>
        {bundle.item.canReassign ? (
          <div className="ff-scorecard-destination-grid">
            <SearchableAssignment
              id="scorecard-clubhouse"
              label="Clubhouse"
              value={clubhouseId}
              options={destinations.clubhouses}
              search={clubhouseSearch}
              onSearch={setClubhouseSearch}
              onChange={setClubhouseId}
            />
            <SearchableAssignment
              id="scorecard-league"
              label="League"
              value={leagueId}
              options={destinations.leagues}
              search={leagueSearch}
              onSearch={setLeagueSearch}
              onChange={setLeagueId}
            />
            <Button
              type="button"
              variant="outline"
              disabled={
                busy ||
                (clubhouseId === (bundle.item.clubhouseId ?? '') &&
                  leagueId === (bundle.item.leagueId ?? ''))
              }
              onClick={() => void saveAssignments()}
            >
              {busy ? 'Saving…' : 'Save assignments'}
            </Button>
            {!destinations.leagues.length ? (
              <p className="ff-scorecard-editor-hint">
                No eligible League is linked to your account.{' '}
                <Link href="/dashboard/leagues">Create a League</Link> or join one first.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="ff-scorecard-editor-hint">
            Assignment changes are limited to the original submitter or an app admin. Finalized
            results also require their League Leader.
          </p>
        )}
        <details className="ff-scorecard-audit">
          <summary>Assignment and reassignment history</summary>
          {assignmentHistory === null ? (
            <p>Assignment history could not be loaded.</p>
          ) : assignmentHistory.length === 0 ? (
            <p>No assignment changes have been recorded.</p>
          ) : (
            <ol>
              {assignmentHistory.map((entry) => (
                <li key={entry.id}>
                  {entry.actorName} moved it from {entry.oldClubhouseName} to{' '}
                  {entry.newClubhouseName} and from {entry.oldLeagueName ?? 'Unassigned'} to{' '}
                  {entry.newLeagueName ?? 'Unassigned'} ·{' '}
                  {new Intl.DateTimeFormat('en', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(entry.changedAt))}
                </li>
              ))}
            </ol>
          )}
        </details>
      </section>

      <form
        className="ff-scorecard-editor-panel ff-scorecard-edit-form"
        onSubmit={(event) => void submitEdit(event)}
      >
        <div className="ff-scorecard-editor-panel-heading">
          <div>
            <p className="ff-profile-section-kicker">EDIT PROPOSAL</p>
            <h2>Round details and scores</h2>
          </div>
          {bundle.item.hasVerifiedChanges ? (
            <span className="ff-scorecard-verified">Verified (!)</span>
          ) : null}
        </div>
        <fieldset disabled={!bundle.canEdit || busy}>
          <legend className="sr-only">Scorecard details</legend>
          <div className="ff-scorecard-form-grid">
            <label>
              Course name
              <input
                value={form.courseName}
                onChange={(event) => update('courseName', event.currentTarget.value)}
                maxLength={160}
              />
            </label>
            <label>
              Course URL
              <input
                type="url"
                value={form.courseUrl}
                onChange={(event) => update('courseUrl', event.currentTarget.value)}
                maxLength={2048}
              />
            </label>
            <label>
              Layout name
              <input
                value={form.layoutName}
                onChange={(event) => update('layoutName', event.currentTarget.value)}
                maxLength={120}
              />
            </label>
            <label>
              Location
              <input
                value={form.location}
                onChange={(event) => update('location', event.currentTarget.value)}
                maxLength={160}
              />
            </label>
            <label>
              Round date
              <input
                type="date"
                value={form.playedOn}
                onChange={(event) => update('playedOn', event.currentTarget.value)}
              />
            </label>
            <label>
              Hole count
              <input
                type="number"
                min={1}
                max={36}
                value={form.holeCount}
                onChange={(event) => update('holeCount', event.currentTarget.value)}
              />
            </label>
            <label className="ff-scorecard-full-field">
              Verified course layout
              <select
                id="scorecard-course-layout"
                value={form.courseLayoutId}
                onChange={(event) => update('courseLayoutId', event.currentTarget.value)}
              >
                <option value="">No course layout linked</option>
                {destinations.courseLayouts.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.courseName} · {layout.name}
                    {layout.holes.every((hole) => hole.lengthVerified)
                      ? ' · lengths verified'
                      : ' · lengths incomplete'}
                  </option>
                ))}
              </select>
              <small>
                Only layouts with administrator-verified hole lengths add to the distance estimate.
              </small>
            </label>
            <label className="ff-scorecard-full-field">
              Hole pars (comma separated; leave unknown holes blank)
              <input
                value={form.pars}
                onChange={(event) => update('pars', event.currentTarget.value)}
                placeholder="3, 3, 4, 3…"
              />
            </label>
            <label>
              Total par
              <input
                type="number"
                min={1}
                max={3564}
                value={form.totalPar}
                onChange={(event) => update('totalPar', event.currentTarget.value)}
              />
            </label>
          </div>

          <div className="ff-scorecard-player-edit-list">
            <div className="ff-scorecard-player-edit-heading">
              <h3>Players and hole scores</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          players: [
                            ...current.players,
                            { id: crypto.randomUUID(), displayName: '', username: '', scores: '' },
                          ],
                        }
                      : current,
                  )
                }
              >
                Add player
              </Button>
            </div>
            {form.players.map((player, index) => (
              <fieldset className="ff-scorecard-player-edit" key={player.id}>
                <legend>Player {index + 1}</legend>
                <div className="ff-scorecard-form-grid">
                  <label>
                    Display name
                    <input
                      value={player.displayName}
                      onChange={(event) =>
                        updatePlayer(player.id, 'displayName', event.currentTarget.value)
                      }
                      maxLength={160}
                    />
                  </label>
                  <label>
                    UDisc username
                    <input
                      value={player.username}
                      onChange={(event) =>
                        updatePlayer(player.id, 'username', event.currentTarget.value)
                      }
                      maxLength={160}
                    />
                  </label>
                  <label className="ff-scorecard-full-field">
                    Hole scores · {currentHoleCount || 'set hole count first'} holes
                    <input
                      value={player.scores}
                      onChange={(event) =>
                        updatePlayer(player.id, 'scores', event.currentTarget.value)
                      }
                      placeholder="3, 4, 3, 2…"
                    />
                  </label>
                </div>
                {form.players.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              players: current.players.filter(
                                (candidate) => candidate.id !== player.id,
                              ),
                            }
                          : current,
                      )
                    }
                  >
                    Remove player
                  </Button>
                ) : null}
              </fieldset>
            ))}
          </div>
        </fieldset>
        {bundle.canEdit ? (
          <Button type="submit" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit edit for approval'}
          </Button>
        ) : null}
        <p className="ff-scorecard-editor-hint">
          Score edits are proposals. Saved totals, player history and statistics do not change until
          every required approval is recorded.
        </p>
      </form>

      <section className="ff-scorecard-editor-panel" aria-labelledby="scorecard-edit-history-title">
        <div className="ff-scorecard-editor-panel-heading">
          <div>
            <p className="ff-profile-section-kicker">AUDIT TRAIL</p>
            <h2 id="scorecard-edit-history-title">Edit history</h2>
          </div>
        </div>
        {!bundle.editHistory.length ? (
          <p className="ff-scorecard-editor-hint">
            No edit proposals or approvals have been recorded for this scorecard.
          </p>
        ) : (
          <ol className="ff-scorecard-edit-history">
            {bundle.editHistory.map((edit) => (
              <li key={edit.id}>
                <header>
                  <strong>
                    {edit.status === 'APPROVED'
                      ? 'Verified (!) · Approved'
                      : edit.status === 'REJECTED'
                        ? 'Rejected · Scorecard unchanged'
                        : 'Pending approval'}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat('en', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(edit.proposedAt))}
                  </span>
                </header>
                <p>Proposed by {edit.proposedByName}</p>
                {edit.assignmentOnly ? (
                  <p>
                    Assignment proposed: {edit.proposedClubhouseName ?? 'Unassigned'} ·{' '}
                    {edit.proposedLeagueName ?? 'Unassigned'}
                  </p>
                ) : null}
                <details>
                  <summary>View before and proposed values</summary>
                  <div>
                    <h3>Before</h3>
                    <p>{snapshotSummary(edit.beforeSnapshot)}</p>
                    <h3>Proposed</h3>
                    <p>{snapshotSummary(edit.proposedSnapshot)}</p>
                  </div>
                </details>
                {edit.submitterApprovedAt ? (
                  <p>
                    Original submitter or app admin approved ·{' '}
                    {edit.submitterApprovedByName ?? 'Authorized reviewer'}
                  </p>
                ) : null}
                {edit.leagueApprovedAt ? (
                  <p>League Leader approved · {edit.leagueApprovedByName ?? 'League Leader'}</p>
                ) : null}
                {edit.rejectedByName ? (
                  <p>
                    Rejected by {edit.rejectedByName}
                    {edit.rejectedAt
                      ? ` · ${new Intl.DateTimeFormat('en', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(edit.rejectedAt))}`
                      : ' · review time unavailable'}
                  </p>
                ) : null}
                {edit.rejectionReason ? <p>Reason: {edit.rejectionReason}</p> : null}
                {edit.status === 'PENDING' ? (
                  <div className="ff-scorecard-review-actions">
                    {bundle.canApproveSubmitter && !edit.submitterApprovedAt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void review(edit.id, 'submitter')}
                      >
                        Approve as submitter / admin
                      </Button>
                    ) : null}
                    {bundle.canApproveLeague && !edit.leagueApprovedAt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void review(edit.id, 'leagueLeader')}
                      >
                        Approve as League Leader
                      </Button>
                    ) : null}
                    {bundle.canApproveSubmitter || bundle.canApproveLeague ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void review(edit.id, 'reject')}
                      >
                        Reject proposal
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
