// @polsia:user-owned — responsive League discovery, details, and Leader controls.
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FileUploadField } from '@/components/custom/file-upload-field';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_FIXED_POINTS } from '@/lib/business/league-scoring';
import { type Course, CourseListResponseSchema } from '@/lib/contracts/courses';
import {
  LeagueActivationCheckoutSchema,
  LeagueActivationResultSchema,
  LeagueCreateResponseSchema,
  type LeagueDetail,
  LeagueDetailResponseSchema,
  LeagueIndexSchema,
  LeagueInvitationAcceptSchema,
  type LeagueInvitationPreview,
  LeagueInvitationPreviewSchema,
  LeagueInvitationResponseSchema,
  LeagueJoinResponseSchema,
  LeagueLogoResponseSchema,
  LeagueMutationResponseSchema,
  type LeagueSettings,
  type LeagueSummary,
} from '@/lib/contracts/leagues';
import { applyServerErrors } from '@/lib/forms';
import type { UploadedFile } from '@/modules/file-upload/client';

interface ApiFailureBody {
  error?: unknown;
  errors?: unknown;
}

type LeagueValidationFields = {
  name: string;
  schedule: string;
  participantCapacity: string;
  seasonStart: string;
  seasonEnd: string;
  fixedPoints: string;
  courses: string;
  form: string;
};

function apiFailure(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== 'object') {
    return { message: fallback };
  }
  const body = error.cause as ApiFailureBody;
  const serverMessage =
    body.error === 'payments_not_enabled'
      ? 'League checkout is not enabled for this company yet. The League remains unactivated.'
      : body.error === 'stripe_not_configured' || body.error === 'stripe_not_onboarded'
        ? 'The company Stripe account needs to be configured before activation can complete.'
        : body.error === 'stripe_billing_not_configured'
          ? 'Billing configuration is unavailable. The League remains unactivated.'
          : body.error === 'payment_verification_failed'
            ? 'Payment could not be verified. The League remains unactivated.'
            : body.error;
  return {
    message: typeof serverMessage === 'string' ? serverMessage : fallback,
  };
}

function seasonText(summary: Pick<LeagueSummary, 'seasonStart' | 'seasonEnd'>) {
  if (summary.seasonStart && summary.seasonEnd)
    return `${summary.seasonStart} — ${summary.seasonEnd}`;
  return 'Season dates not set';
}

function LeagueMark({ src, large = false }: { src: string | null; large?: boolean }) {
  return (
    <span className={`ff-league-logo${large ? ' ff-league-logo-large' : ''}`}>
      {src ? (
        <Image src={src} alt="League logo" width={112} height={112} unoptimized />
      ) : (
        <span aria-hidden="true" className="text-2xl font-bold">
          FF
        </span>
      )}
    </span>
  );
}

export function LeagueWorkspace() {
  const router = useRouter();
  const [items, setItems] = useState<LeagueSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createForm = useForm<LeagueValidationFields>();
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [schedule, setSchedule] = useState('');
  const [seasonStart, setSeasonStart] = useState('');
  const [seasonEnd, setSeasonEnd] = useState('');
  const [capacity, setCapacity] = useState('16');
  const [scoringFormat, setScoringFormat] = useState<'FIXED' | 'FIELD_SIZE'>('FIXED');

  const load = useCallback(async () => {
    try {
      const response = await apiFetch('/api/leagues', { schema: LeagueIndexSchema });
      setItems(response.items);
      setLoadError(null);
    } catch (error) {
      setLoadError(apiFailure(error, 'Leagues could not be loaded.').message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createLeague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    createForm.clearErrors();
    try {
      const created = await apiFetch('/api/leagues', {
        method: 'POST',
        body: JSON.stringify({
          name,
          visibility,
          schedule,
          seasonStart,
          seasonEnd,
          participantCapacity: Number(capacity),
          scoringFormat,
          fixedPoints: [...DEFAULT_FIXED_POINTS],
          plainRules: '',
          courses: [],
        }),
        schema: LeagueCreateResponseSchema,
      });
      toast.success('League created. You are its League Leader.');
      router.push(`/dashboard/leagues/${created.id}`);
    } catch (error) {
      const applied = error instanceof Error && applyServerErrors(error.cause, createForm.setError);
      if (!applied) toast.error(apiFailure(error, 'League could not be created.').message);
    } finally {
      setBusy(false);
    }
  }

  async function joinLeague(league: LeagueSummary) {
    setBusy(true);
    try {
      await apiFetch(`/api/leagues/${encodeURIComponent(league.id)}/join`, {
        method: 'POST',
        body: '{}',
        schema: LeagueJoinResponseSchema,
      });
      toast.success(`You joined ${league.name}.`);
      router.push(`/dashboard/leagues/${league.id}`);
    } catch (error) {
      toast.error(apiFailure(error, 'This League could not be joined.').message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const memberLeagues = items?.filter((item) => item.isMember) ?? [];
  const publicLeagues = items?.filter((item) => !item.isMember) ?? [];

  return (
    <div className="ff-league-workspace">
      <header className="ff-league-intro">
        <div>
          <p className="ff-league-eyebrow">League play</p>
          <h1>Leagues</h1>
          <p>
            Bring your group together, choose the courses you play, and follow a season standings
            table.
          </p>
        </div>
        <span className="ff-league-pill">{memberLeagues.length} joined</span>
      </header>

      <form className="ff-league-create-card" onSubmit={createLeague}>
        <div>
          <p className="ff-league-eyebrow">Start with the essentials</p>
          <h2>Create a League</h2>
          <p>
            Creation is free. You become the League Leader and can add courses, invite players, and
            refine settings next.
          </p>
        </div>
        <div className="ff-league-form-grid">
          <label className="ff-league-field" htmlFor="create-league-name">
            League name
            <input
              id="create-league-name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              maxLength={100}
              required
            />
            {createForm.formState.errors.name?.message ? (
              <span className="ff-league-error">{createForm.formState.errors.name.message}</span>
            ) : null}
          </label>
          <label className="ff-league-field" htmlFor="create-league-visibility">
            Who can discover it?
            <select
              id="create-league-visibility"
              value={visibility}
              onChange={(event) => setVisibility(event.currentTarget.value as 'PUBLIC' | 'PRIVATE')}
            >
              <option value="PRIVATE">Private — invitation required</option>
              <option value="PUBLIC">Public — discoverable to players</option>
            </select>
          </label>
          <label className="ff-league-field" htmlFor="create-league-schedule">
            Schedule
            <input
              id="create-league-schedule"
              value={schedule}
              onChange={(event) => setSchedule(event.currentTarget.value)}
              placeholder="e.g. Saturday mornings"
              maxLength={240}
              required
            />
            {createForm.formState.errors.schedule?.message ? (
              <span className="ff-league-error">
                {createForm.formState.errors.schedule.message}
              </span>
            ) : null}
          </label>
          <label className="ff-league-field" htmlFor="create-league-capacity">
            Participant capacity
            <input
              id="create-league-capacity"
              type="number"
              inputMode="numeric"
              min={2}
              value={capacity}
              onChange={(event) => setCapacity(event.currentTarget.value)}
              required
            />
            <small>Starts at 16; change this to fit your group.</small>
            {createForm.formState.errors.participantCapacity?.message ? (
              <span className="ff-league-error">
                {createForm.formState.errors.participantCapacity.message}
              </span>
            ) : null}
          </label>
          <label className="ff-league-field" htmlFor="create-league-start">
            Season starts
            <input
              id="create-league-start"
              type="date"
              value={seasonStart}
              onChange={(event) => setSeasonStart(event.currentTarget.value)}
              required
            />
            {createForm.formState.errors.seasonStart?.message ? (
              <span className="ff-league-error">
                {createForm.formState.errors.seasonStart.message}
              </span>
            ) : null}
          </label>
          <label className="ff-league-field" htmlFor="create-league-end">
            Season ends
            <input
              id="create-league-end"
              type="date"
              value={seasonEnd}
              onChange={(event) => setSeasonEnd(event.currentTarget.value)}
              required
            />
            {createForm.formState.errors.seasonEnd?.message ? (
              <span className="ff-league-error">
                {createForm.formState.errors.seasonEnd.message}
              </span>
            ) : null}
          </label>
          <label className="ff-league-field" htmlFor="create-league-scoring">
            Championship scoring
            <select
              id="create-league-scoring"
              value={scoringFormat}
              onChange={(event) =>
                setScoringFormat(event.currentTarget.value as 'FIXED' | 'FIELD_SIZE')
              }
            >
              <option value="FIXED">Fixed placement points</option>
              <option value="FIELD_SIZE">Adjusted for field size</option>
            </select>
          </label>
        </div>
        {createForm.formState.errors.form?.message ? (
          <p className="ff-league-error">{createForm.formState.errors.form.message}</p>
        ) : null}
        <div className="ff-league-actions">
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create League'}
          </Button>
          <span className="ff-league-hint">
            No subscription, clubhouse, or prior membership is required.
          </span>
        </div>
      </form>

      {loadError ? (
        <p role="alert" className="ff-league-error">
          {loadError}
        </p>
      ) : null}
      {items === null && !loadError ? (
        <p className="ff-league-notice" aria-live="polite">
          Loading Leagues…
        </p>
      ) : null}

      <section className="ff-league-section" aria-labelledby="joined-leagues-heading">
        <div className="ff-league-section-heading">
          <div>
            <h2 id="joined-leagues-heading">Your Leagues</h2>
            <p>Settings, invitations, and standings for groups you belong to.</p>
          </div>
        </div>
        {memberLeagues.length ? (
          <div className="ff-league-card-grid">
            {memberLeagues.map((league) => (
              <article className="ff-league-card" key={league.id}>
                <div className="ff-league-card-top">
                  <div className="flex min-w-0 items-center gap-3">
                    <LeagueMark src={league.logoUrl} />
                    <div className="min-w-0">
                      <Link
                        className="ff-league-card-title"
                        href={`/dashboard/leagues/${league.id}`}
                      >
                        {league.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {league.role?.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                  <span className="ff-league-pill">{league.visibility.toLowerCase()}</span>
                </div>
                <div className="ff-league-meta">
                  <div>
                    <span>Season</span>
                    <strong>{seasonText(league)}</strong>
                  </div>
                  <div>
                    <span>Members</span>
                    <strong>
                      {league.memberCount} / {league.participantCapacity}
                    </strong>
                  </div>
                  <div>
                    <span>Schedule</span>
                    <strong>{league.schedule || 'Not set'}</strong>
                  </div>
                </div>
                <div
                  className="ff-league-progress"
                  role="progressbar"
                  aria-label={`${league.memberCount} of ${league.participantCapacity} League places filled`}
                  aria-valuemin={0}
                  aria-valuemax={league.participantCapacity}
                  aria-valuenow={league.memberCount}
                >
                  <span
                    style={{
                      width: `${Math.min(100, (league.memberCount / league.participantCapacity) * 100)}%`,
                    }}
                  />
                </div>
                <div className="ff-league-card-actions">
                  <Button asChild type="button" variant="outline">
                    <Link href={`/dashboard/leagues/${league.id}`}>Open League</Link>
                  </Button>
                  {league.activated ? (
                    <span className="ff-league-hint">Active</span>
                  ) : (
                    <span className="ff-league-hint">Activation available separately</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : items !== null ? (
          <p className="ff-league-empty">
            You have not joined a League yet. Create one above or join a public group below.
          </p>
        ) : null}
      </section>

      <section className="ff-league-section" aria-labelledby="public-leagues-heading">
        <div className="ff-league-section-heading">
          <div>
            <h2 id="public-leagues-heading">Discover public Leagues</h2>
            <p>Private Leagues stay out of discovery and require a current invitation link.</p>
          </div>
        </div>
        {publicLeagues.length ? (
          <div className="ff-league-card-grid">
            {publicLeagues.map((league) => (
              <article className="ff-league-discovery-card" key={league.id}>
                <div className="ff-league-card-top">
                  <div className="flex min-w-0 items-center gap-3">
                    <LeagueMark src={league.logoUrl} />
                    <div className="min-w-0">
                      <Link
                        className="ff-league-card-title"
                        href={`/dashboard/leagues/${league.id}`}
                      >
                        {league.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {league.schedule || 'Schedule not set'}
                      </p>
                    </div>
                  </div>
                  <span className="ff-league-pill">Public</span>
                </div>
                <div className="ff-league-meta">
                  <div>
                    <span>Season</span>
                    <strong>{seasonText(league)}</strong>
                  </div>
                  <div>
                    <span>Members</span>
                    <strong>
                      {league.memberCount} / {league.participantCapacity}
                    </strong>
                  </div>
                  <div>
                    <span>Places left</span>
                    <strong>{league.availablePlaces}</strong>
                  </div>
                </div>
                <div className="ff-league-card-actions">
                  <Button asChild type="button" variant="outline">
                    <Link href={`/dashboard/leagues/${league.id}`}>View details</Link>
                  </Button>
                  <Button
                    type="button"
                    disabled={busy || !league.canJoin}
                    onClick={() => void joinLeague(league)}
                  >
                    {league.isFull ? 'Full' : busy ? 'Joining…' : 'Join League'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : items !== null ? (
          <p className="ff-league-empty">No public Leagues are open right now.</p>
        ) : null}
      </section>
    </div>
  );
}

function parseFixedPoints(value: string) {
  return value.split(',').map((entry) => Number(entry.trim()));
}

export function LeagueDetailWorkspace({ leagueId }: { leagueId: string }) {
  const _router = useRouter();
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [courseOptions, setCourseOptions] = useState<Course[]>([]);
  const [settings, setSettings] = useState<LeagueSettings | null>(null);
  const [fixedPointsInput, setFixedPointsInput] = useState(DEFAULT_FIXED_POINTS.join(', '));
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedLayout, setSelectedLayout] = useState('');
  const [inviteRole, setInviteRole] = useState<'PLAYER' | 'SCOREKEEPER'>('PLAYER');
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settingsForm = useForm<LeagueValidationFields>();
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, courses] = await Promise.all([
        apiFetch(`/api/leagues/${encodeURIComponent(leagueId)}`, {
          schema: LeagueDetailResponseSchema,
        }),
        apiFetch('/api/courses', { schema: CourseListResponseSchema }),
      ]);
      const current = detail.league;
      setLeague(current);
      setCourseOptions(courses.items);
      setSettings({
        name: current.name,
        visibility: current.visibility,
        schedule: current.schedule ?? '',
        seasonStart: current.seasonStart ?? '',
        seasonEnd: current.seasonEnd ?? '',
        participantCapacity: current.participantCapacity,
        scoringFormat: current.scoringFormat,
        fixedPoints: current.fixedPoints ?? [...DEFAULT_FIXED_POINTS],
        plainRules: current.plainRules ?? '',
        courses: current.courses.map(({ courseId, layoutId }) => ({ courseId, layoutId })),
      });
      setFixedPointsInput((current.fixedPoints ?? [...DEFAULT_FIXED_POINTS]).join(', '));
      setError(null);
    } catch (reason) {
      const failure = apiFailure(reason, 'League details could not be loaded.');
      setError(failure.message);
    }
  }, [leagueId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setBusy('settings');
    settingsForm.clearErrors();
    try {
      await apiFetch(`/api/leagues/${encodeURIComponent(leagueId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...settings, fixedPoints: parseFixedPoints(fixedPointsInput) }),
        schema: LeagueMutationResponseSchema,
      });
      toast.success('League settings saved.');
      await load();
    } catch (reason) {
      const applied =
        reason instanceof Error && applyServerErrors(reason.cause, settingsForm.setError);
      if (!applied) toast.error(apiFailure(reason, 'League settings were not saved.').message);
    } finally {
      setBusy(null);
    }
  }

  async function saveLogo(file: UploadedFile | null) {
    setBusy('logo');
    try {
      await apiFetch(`/api/leagues/${encodeURIComponent(leagueId)}/logo`, {
        method: 'PATCH',
        body: JSON.stringify({ file: file ? { key: file.key, url: file.url } : null }),
        schema: LeagueLogoResponseSchema,
      });
      toast.success(file ? 'League logo updated.' : 'League logo removed.');
      await load();
    } catch (reason) {
      toast.error(apiFailure(reason, 'The saved League logo was left unchanged.').message);
    } finally {
      setBusy(null);
    }
  }

  async function createInvitation(action: 'issue' | 'rotate') {
    setBusy('invite');
    try {
      const invite = await apiFetch(`/api/leagues/${encodeURIComponent(leagueId)}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ action, role: inviteRole }),
        schema: LeagueInvitationResponseSchema,
      });
      setInvitationUrl(`${window.location.origin}/dashboard/leagues/invite/${invite.token}`);
      toast.success(action === 'rotate' ? 'Invitation link rotated.' : 'Invitation link issued.');
      await load();
    } catch (reason) {
      toast.error(apiFailure(reason, 'Invitation link could not be created.').message);
    } finally {
      setBusy(null);
    }
  }

  async function revokeInvitation(invitationId: string) {
    setBusy(`revoke-${invitationId}`);
    try {
      await apiFetch(
        `/api/leagues/${encodeURIComponent(leagueId)}/invitations/${encodeURIComponent(invitationId)}`,
        {
          method: 'DELETE',
          schema: LeagueMutationResponseSchema,
        },
      );
      toast.success('Invitation revoked.');
      await load();
    } catch (reason) {
      toast.error(apiFailure(reason, 'Invitation could not be revoked.').message);
    } finally {
      setBusy(null);
    }
  }

  async function updateMemberRole(userId: string, role: 'PLAYER' | 'SCOREKEEPER') {
    setBusy(`role-${userId}`);
    try {
      await apiFetch(`/api/leagues/${encodeURIComponent(leagueId)}/members`, {
        method: 'PATCH',
        body: JSON.stringify({ userId, role }),
        schema: LeagueMutationResponseSchema,
      });
      toast.success('League role updated.');
      await load();
    } catch (reason) {
      toast.error(apiFailure(reason, 'League role could not be updated.').message);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function joinPublicLeague() {
    setBusy('join');
    try {
      const result = await apiFetch(`/api/leagues/${encodeURIComponent(leagueId)}/join`, {
        method: 'POST',
        body: '{}',
        schema: LeagueJoinResponseSchema,
      });
      toast.success(
        result.joined
          ? `You joined ${result.leagueName}.`
          : `You already belong to ${result.leagueName}.`,
      );
      await load();
    } catch (reason) {
      toast.error(apiFailure(reason, 'This League could not be joined.').message);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function beginActivation(offerId: 'one' | 'five' | 'fifty') {
    setBusy(`activation-${offerId}`);
    try {
      const checkout = await apiFetch(`/api/leagues/${encodeURIComponent(leagueId)}/activation`, {
        method: 'POST',
        body: JSON.stringify({ offerId }),
        schema: LeagueActivationCheckoutSchema,
      });
      window.location.assign(checkout.url);
    } catch (reason) {
      toast.error(
        apiFailure(reason, 'Checkout is unavailable. The League remains unactivated.').message,
      );
      setBusy(null);
    }
  }

  function addCourse() {
    if (!settings || !selectedCourse || !selectedLayout) return;
    if (settings.courses.some((course) => course.layoutId === selectedLayout)) {
      settingsForm.setError('courses', {
        type: 'local',
        message: 'That course layout is already selected.',
      });
      return;
    }
    setSettings({
      ...settings,
      courses: [...settings.courses, { courseId: selectedCourse, layoutId: selectedLayout }],
    });
    setSelectedLayout('');
    settingsForm.clearErrors('courses');
  }

  if (!league) {
    return (
      <div className="ff-league-detail">
        {error ? (
          <p role="alert" className="ff-league-error">
            {error}
          </p>
        ) : (
          <p className="ff-league-notice" aria-live="polite">
            Loading League…
          </p>
        )}
        <Button asChild type="button" variant="outline">
          <Link href="/dashboard/leagues">Back to Leagues</Link>
        </Button>
      </div>
    );
  }

  const canManage = league.role === 'LEADER';
  const selectedCourseRecord = courseOptions.find((course) => course.id === selectedCourse);

  return (
    <div className="ff-league-detail">
      <div className="ff-league-actions">
        <Button asChild type="button" variant="ghost">
          <Link href="/dashboard/leagues">← All Leagues</Link>
        </Button>
      </div>
      <header className="ff-league-hero">
        <div className="flex min-w-0 items-start gap-4">
          <LeagueMark src={league.logoUrl} large />
          <div className="ff-league-hero-copy">
            <p className="ff-league-eyebrow">
              {league.visibility.toLowerCase()} League
              {league.role ? ` · ${league.role.replace('_', ' ').toLowerCase()}` : ''}
            </p>
            <h1>{league.name}</h1>
            <p>
              {league.schedule || 'Schedule not set'} · {seasonText(league)}
            </p>
          </div>
        </div>
        <span className="ff-league-pill">{league.activated ? 'Active' : 'Not activated'}</span>
      </header>

      <section className="ff-league-detail-grid" aria-label="League overview">
        <div>
          <span>Visibility</span>
          <strong>{league.visibility === 'PUBLIC' ? 'Public' : 'Private'}</strong>
        </div>
        <div>
          <span>Members</span>
          <strong>
            {league.memberCount} / {league.participantCapacity}
          </strong>
        </div>
        <div>
          <span>Places available</span>
          <strong>{league.availablePlaces}</strong>
        </div>
        <div>
          <span>Schedule</span>
          <strong>{league.schedule || 'Not set'}</strong>
        </div>
        <div>
          <span>Season</span>
          <strong>{seasonText(league)}</strong>
        </div>
        <div>
          <span>Championship</span>
          <strong>
            {league.scoringFormat === 'FIXED' ? 'Fixed points' : 'Field-size adjusted'}
          </strong>
        </div>
      </section>

      {!league.isMember ? (
        <section className="ff-league-section">
          <div className="ff-league-section-heading">
            <div>
              <h2>Join this public League</h2>
              <p>
                {league.isFull
                  ? 'The participant limit has been reached.'
                  : `${league.availablePlaces} places remain.`}
              </p>
            </div>
          </div>
          <p>{league.plainRules || 'No League rules have been published yet.'}</p>
          <Button
            type="button"
            disabled={busy === 'join' || !league.canJoin}
            onClick={() => void joinPublicLeague()}
          >
            {league.isFull ? 'League full' : busy === 'join' ? 'Joining…' : 'Join League'}
          </Button>
        </section>
      ) : (
        <>
          <section className="ff-league-section">
            <div className="ff-league-section-heading">
              <div>
                <h2>Courses and layouts</h2>
                <p>Only active directory courses with playable layouts can be selected.</p>
              </div>
              <Button asChild type="button" variant="outline">
                <Link href="/dashboard/courses">Course directory</Link>
              </Button>
            </div>
            {league.courses.length ? (
              <ul className="ff-league-course-list">
                {league.courses.map((course) => (
                  <li key={course.layoutId}>
                    <strong>
                      {course.courseName} · {course.layoutName}
                    </strong>
                    <span>
                      {course.location} · {course.holes} holes
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ff-league-empty">No courses selected yet.</p>
            )}
            <div className="ff-league-actions">
              <Button asChild type="button">
                <Link href="/dashboard/rounds">Record League scores</Link>
              </Button>
            </div>
          </section>

          {league.plainRules ? (
            <section className="ff-league-section">
              <div className="ff-league-section-heading">
                <div>
                  <h2>League rules</h2>
                  <p>Plain-language notes from the League Leader.</p>
                </div>
              </div>
              <p className="whitespace-pre-wrap break-words leading-relaxed">{league.plainRules}</p>
            </section>
          ) : null}

          <section className="ff-league-section">
            <div className="ff-league-section-heading">
              <div>
                <h2>Championship standings</h2>
                <p>
                  Completed and finalized rounds within the season count by default. Missed rounds
                  add zero points.
                </p>
              </div>
            </div>
            {league.standings.length ? (
              <div className="ff-league-table-wrap">
                <table className="ff-league-table">
                  <thead>
                    <tr>
                      <th>Place</th>
                      <th>Player</th>
                      <th>Points</th>
                      <th>Wins</th>
                      <th>2nds</th>
                      <th>Avg place</th>
                      <th>Rounds</th>
                      <th>Avg to par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {league.standings.map((standing) => (
                      <tr key={standing.playerKey}>
                        <td>{standing.rank}</td>
                        <th scope="row">
                          {standing.userId ? (
                            <Link href={`/players/user/${encodeURIComponent(standing.userId)}`}>
                              {standing.displayName}
                            </Link>
                          ) : (
                            standing.displayName
                          )}
                        </th>
                        <td>{standing.points.toFixed(2)}</td>
                        <td>{standing.wins}</td>
                        <td>{standing.seconds}</td>
                        <td>
                          {standing.averagePlace === null ? '—' : standing.averagePlace.toFixed(2)}
                        </td>
                        <td>{standing.rounds}</td>
                        <td>
                          {standing.averageToPar === null
                            ? '—'
                            : `${standing.averageToPar > 0 ? '+' : ''}${standing.averageToPar.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="ff-league-empty">
                No finalized League rounds have contributed points yet. Members with no rounds
                currently have zero points.
              </p>
            )}
            <p className="ff-league-hint">Tie-break order: {league.tieBreakers.join(' → ')}.</p>
            {league.scoringFormat === 'FIXED' ? (
              <p className="ff-league-hint">
                Fixed points by place:{' '}
                {(settings?.fixedPoints ?? [...DEFAULT_FIXED_POINTS]).join(' / ')}. Tied players
                split the average for the occupied places. After the last listed place, each place
                earns one fewer point (minimum 1).
              </p>
            ) : (
              <p className="ff-league-hint">
                Field-size points are 25 × (N − P) / (N − 1), where N is the number of finishers and
                P the place; a one-player round earns 25. Tied players split the average for their
                occupied places.
              </p>
            )}
          </section>

          <section className="ff-league-section">
            <div className="ff-league-section-heading">
              <div>
                <h2>League roster</h2>
                <p>
                  {league.memberCount} of {league.participantCapacity} participant places used ·{' '}
                  {league.availablePlaces} available.
                </p>
              </div>
            </div>
            <ul className="ff-league-member-list">
              {league.members.map((member) => (
                <li className="ff-league-roster-row" key={member.userId}>
                  <div>
                    <span className="ff-league-member-name">{member.displayName}</span>
                    <small>{member.role.replace('_', ' ').toLowerCase()}</small>
                  </div>
                  {canManage && member.role !== 'LEADER' ? (
                    <label className="ff-league-field">
                      League role
                      <select
                        aria-label={`Role for ${member.displayName}`}
                        value={member.role}
                        disabled={busy === `role-${member.userId}`}
                        onChange={(event) =>
                          void updateMemberRole(
                            member.userId,
                            event.currentTarget.value as 'PLAYER' | 'SCOREKEEPER',
                          )
                        }
                      >
                        <option value="PLAYER">Player</option>
                        <option value="SCOREKEEPER">Scorekeeper</option>
                      </select>
                    </label>
                  ) : (
                    <span className="ff-league-pill">{member.role.replace('_', ' ')}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {canManage && settings ? (
        <>
          <section className="ff-league-section">
            <div className="ff-league-section-heading">
              <div>
                <h2>Manage League</h2>
                <p>Update the saved setup. Invalid changes leave the current settings in place.</p>
              </div>
            </div>
            <form className="grid gap-4" onSubmit={saveSettings}>
              <div className="ff-league-form-grid">
                <label className="ff-league-field" htmlFor="manage-name">
                  League name
                  <input
                    id="manage-name"
                    value={settings.name}
                    onChange={(event) =>
                      setSettings({ ...settings, name: event.currentTarget.value })
                    }
                    maxLength={100}
                    required
                  />
                  {settingsForm.formState.errors.name?.message ? (
                    <span className="ff-league-error">
                      {settingsForm.formState.errors.name.message}
                    </span>
                  ) : null}
                </label>
                <label className="ff-league-field" htmlFor="manage-visibility">
                  Visibility
                  <select
                    id="manage-visibility"
                    value={settings.visibility}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        visibility: event.currentTarget.value as 'PUBLIC' | 'PRIVATE',
                      })
                    }
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                </label>
                <label className="ff-league-field" htmlFor="manage-schedule">
                  Schedule
                  <input
                    id="manage-schedule"
                    value={settings.schedule}
                    onChange={(event) =>
                      setSettings({ ...settings, schedule: event.currentTarget.value })
                    }
                    maxLength={240}
                    required
                  />
                  {settingsForm.formState.errors.schedule?.message ? (
                    <span className="ff-league-error">
                      {settingsForm.formState.errors.schedule.message}
                    </span>
                  ) : null}
                </label>
                <label className="ff-league-field" htmlFor="manage-capacity">
                  Participant capacity
                  <input
                    id="manage-capacity"
                    type="number"
                    min={2}
                    value={settings.participantCapacity}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        participantCapacity: Number(event.currentTarget.value),
                      })
                    }
                    required
                  />
                  {settingsForm.formState.errors.participantCapacity?.message ? (
                    <span className="ff-league-error">
                      {settingsForm.formState.errors.participantCapacity.message}
                    </span>
                  ) : null}
                </label>
                <label className="ff-league-field" htmlFor="manage-start">
                  Season starts
                  <input
                    id="manage-start"
                    type="date"
                    value={settings.seasonStart}
                    onChange={(event) =>
                      setSettings({ ...settings, seasonStart: event.currentTarget.value })
                    }
                    required
                  />
                  {settingsForm.formState.errors.seasonStart?.message ? (
                    <span className="ff-league-error">
                      {settingsForm.formState.errors.seasonStart.message}
                    </span>
                  ) : null}
                </label>
                <label className="ff-league-field" htmlFor="manage-end">
                  Season ends
                  <input
                    id="manage-end"
                    type="date"
                    value={settings.seasonEnd}
                    onChange={(event) =>
                      setSettings({ ...settings, seasonEnd: event.currentTarget.value })
                    }
                    required
                  />
                  {settingsForm.formState.errors.seasonEnd?.message ? (
                    <span className="ff-league-error">
                      {settingsForm.formState.errors.seasonEnd.message}
                    </span>
                  ) : null}
                </label>
                <label className="ff-league-field" htmlFor="manage-scoring">
                  Championship scoring
                  <select
                    id="manage-scoring"
                    value={settings.scoringFormat}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        scoringFormat: event.currentTarget.value as 'FIXED' | 'FIELD_SIZE',
                      })
                    }
                  >
                    <option value="FIXED">Fixed placement points</option>
                    <option value="FIELD_SIZE">Adjusted for field size</option>
                  </select>
                </label>
                <label className="ff-league-field" htmlFor="manage-points">
                  Fixed points by placement
                  <input
                    id="manage-points"
                    value={fixedPointsInput}
                    onChange={(event) => setFixedPointsInput(event.currentTarget.value)}
                    aria-describedby="points-help"
                  />
                  <small id="points-help">
                    Comma-separated points, default 100, 90, 80, 70, etc.
                  </small>
                  {settingsForm.formState.errors.fixedPoints?.message ? (
                    <span className="ff-league-error">
                      {settingsForm.formState.errors.fixedPoints.message}
                    </span>
                  ) : null}
                </label>
              </div>
              <label className="ff-league-field" htmlFor="manage-rules">
                Plain-language rules
                <textarea
                  id="manage-rules"
                  value={settings.plainRules}
                  onChange={(event) =>
                    setSettings({ ...settings, plainRules: event.currentTarget.value })
                  }
                  maxLength={10000}
                />
              </label>
              {settingsForm.formState.errors.courses?.message ? (
                <p className="ff-league-error">{settingsForm.formState.errors.courses.message}</p>
              ) : null}
              <div className="ff-league-inline-form">
                <label className="ff-league-field" htmlFor="select-course">
                  Course
                  <select
                    id="select-course"
                    value={selectedCourse}
                    onChange={(event) => {
                      setSelectedCourse(event.currentTarget.value);
                      setSelectedLayout('');
                    }}
                  >
                    <option value="">Choose a course</option>
                    {courseOptions.map((course) => (
                      <option value={course.id} key={course.id}>
                        {course.name} · {course.location}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ff-league-field" htmlFor="select-layout">
                  Playable layout
                  <select
                    id="select-layout"
                    value={selectedLayout}
                    onChange={(event) => setSelectedLayout(event.currentTarget.value)}
                    disabled={!selectedCourseRecord}
                  >
                    <option value="">Choose a layout</option>
                    {selectedCourseRecord?.layouts
                      .filter((layout) => layout.holes.length > 0)
                      .map((layout) => (
                        <option value={layout.id} key={layout.id}>
                          {layout.name} · {layout.holes.length} holes
                        </option>
                      ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCourse}
                  disabled={!selectedCourse || !selectedLayout}
                >
                  Add course
                </Button>
              </div>
              {settings.courses.length ? (
                <ul className="ff-league-course-list">
                  {settings.courses.map((selection) => {
                    const course = courseOptions.find((item) => item.id === selection.courseId);
                    const layout = course?.layouts.find((item) => item.id === selection.layoutId);
                    return (
                      <li key={selection.layoutId}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <strong>
                              {course?.name ?? 'Selected course'} ·{' '}
                              {layout?.name ?? 'Selected layout'}
                            </strong>
                            <span>{course?.location ?? 'Directory course'}</span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setSettings({
                                ...settings,
                                courses: settings.courses.filter(
                                  (item) => item.layoutId !== selection.layoutId,
                                ),
                              })
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <div className="ff-league-actions">
                <Button type="submit" disabled={busy === 'settings'}>
                  {busy === 'settings' ? 'Saving…' : 'Save League settings'}
                </Button>
              </div>
            </form>
          </section>

          <section className="ff-league-section">
            <div className="ff-league-section-heading">
              <div>
                <h2>League logo</h2>
                <p>
                  Upload, replace, or remove the saved logo. A failed upload keeps the current
                  image.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <LeagueMark src={league.logoUrl} large />
              <div className="grid min-w-0 flex-1 gap-3">
                <FileUploadField
                  label="Upload a logo"
                  accept="image/jpeg,image/png,image/webp"
                  hint="JPEG, PNG or WebP"
                  onUploaded={(file) => void saveLogo(file)}
                />
                {league.logoUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy === 'logo'}
                    onClick={() => void saveLogo(null)}
                  >
                    Remove logo
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="ff-league-section">
            <div className="ff-league-section-heading">
              <div>
                <h2>Invitation links</h2>
                <p>
                  Recipients sign in and accept before membership is added. Rotating revokes every
                  active link.
                </p>
              </div>
            </div>
            <div className="ff-league-inline-form">
              <label className="ff-league-field" htmlFor="invite-role">
                Invitation role
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.currentTarget.value as 'PLAYER' | 'SCOREKEEPER')
                  }
                >
                  <option value="PLAYER">Player</option>
                  <option value="SCOREKEEPER">Scorekeeper</option>
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={busy === 'invite'}
                onClick={() => void createInvitation('issue')}
              >
                Issue link
              </Button>
              <Button
                type="button"
                disabled={busy === 'invite'}
                onClick={() => void createInvitation('rotate')}
              >
                Rotate links
              </Button>
            </div>
            {invitationUrl ? (
              <div className="ff-league-notice">
                <strong>Share this invitation:</strong>
                <div className="mt-2 break-all font-mono text-xs">{invitationUrl}</div>
                <Button
                  className="mt-3"
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(invitationUrl)
                      .then(() => toast.success('Invitation link copied.'))
                      .catch(() => toast.error('Copy is unavailable in this browser.'))
                  }
                >
                  Copy link
                </Button>
              </div>
            ) : null}
            {league.invitations.length ? (
              <ul className="ff-league-invitation-list">
                {league.invitations.map((invite) => (
                  <li className="ff-league-invitation-row" key={invite.id}>
                    <div>
                      <strong>
                        {invite.role === 'SCOREKEEPER'
                          ? 'Scorekeeper invitation'
                          : 'Player invitation'}
                      </strong>
                      <small>Issued {new Date(invite.createdAt).toLocaleDateString()}</small>
                      <small className="block break-all font-mono">
                        /dashboard/leagues/invite/{invite.token}
                      </small>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy === `revoke-${invite.id}`}
                      onClick={() => void revokeInvitation(invite.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ff-league-empty">No active invitation links.</p>
            )}
          </section>

          {!league.activated ? (
            <section className="ff-league-section">
              <div className="ff-league-section-heading">
                <div>
                  <h2>Activate League</h2>
                  <p>
                    Activation is separate from free creation and available only to the League
                    Leader.
                  </p>
                </div>
              </div>
              <div className="ff-league-activation-grid">
                {league.activationOffers.map((offer) => (
                  <article className="ff-league-activation-card" key={offer.id}>
                    <h3>League activation</h3>
                    <div className="ff-league-offer-price">${offer.amountUsd}</div>
                    <p>
                      One-time activation offer. Your configured participant capacity remains{' '}
                      {league.participantCapacity}.
                    </p>
                    <Button
                      type="button"
                      disabled={busy === `activation-${offer.id}`}
                      onClick={() => void beginActivation(offer.id)}
                    >
                      {busy === `activation-${offer.id}`
                        ? 'Opening checkout…'
                        : `Continue for $${offer.amountUsd}`}
                    </Button>
                  </article>
                ))}
              </div>
              <p className="ff-league-hint">
                Tier capacity allocations and upgrade prices have not been configured; none are
                assumed here. Checkout requires the company Stripe account to be enabled and
                onboarded.
              </p>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function LeagueInvitationWorkspace({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<LeagueInvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch(`/api/leagues/invitations/${encodeURIComponent(token)}`, {
      schema: LeagueInvitationPreviewSchema,
    })
      .then((value) => {
        if (active) setPreview(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(apiFailure(reason, 'This invitation is invalid or revoked.').message);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function accept() {
    setBusy(true);
    try {
      const result = await apiFetch(
        `/api/leagues/invitations/${encodeURIComponent(token)}/accept`,
        {
          method: 'POST',
          body: '{}',
          schema: LeagueInvitationAcceptSchema,
        },
      );
      toast.success(
        result.joined
          ? `You joined ${result.leagueName}.`
          : `You already belong to ${result.leagueName}.`,
      );
      router.push(`/dashboard/leagues/${result.leagueId}`);
    } catch (reason) {
      toast.error(apiFailure(reason, 'This invitation could not be accepted.').message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ff-league-section mx-auto mt-8 w-full max-w-2xl">
      <p className="ff-league-eyebrow">League invitation</p>
      <h1 className="text-2xl font-bold">
        {preview ? `Join ${preview.leagueName}` : 'Accept an invitation'}
      </h1>
      {preview ? (
        <>
          <p>
            Accept this invitation to join as a{' '}
            {preview.role === 'SCOREKEEPER' ? 'Scorekeeper' : 'Player'}.
          </p>
          <Button type="button" disabled={busy} onClick={() => void accept()}>
            {busy ? 'Accepting…' : 'Accept invitation'}
          </Button>
        </>
      ) : error ? (
        <p role="alert" className="ff-league-error">
          {error}
        </p>
      ) : (
        <p aria-live="polite">Checking invitation…</p>
      )}
      <Button asChild type="button" variant="outline">
        <Link href="/dashboard/leagues">Back to Leagues</Link>
      </Button>
    </section>
  );
}

export function LeagueActivationConfirmationWorkspace({
  leagueId,
  sessionId,
}: {
  leagueId: string;
  sessionId: string | null;
}) {
  const [status, setStatus] = useState<'checking' | 'active' | 'error'>('checking');
  const [message, setMessage] = useState('Confirming payment with the billing service…');

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      setMessage('No checkout session was returned. The League remains unactivated.');
      return;
    }
    let active = true;
    apiFetch(`/api/leagues/${encodeURIComponent(leagueId)}/activation/confirm`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
      schema: LeagueActivationResultSchema,
    })
      .then((result) => {
        if (!active) return;
        setStatus('active');
        setMessage(
          result.alreadyActivated
            ? 'This League is already active.'
            : 'Payment confirmed. Your League is now active.',
        );
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setStatus('error');
        setMessage(
          apiFailure(reason, 'Payment could not be confirmed. The League remains unactivated.')
            .message,
        );
      });
    return () => {
      active = false;
    };
  }, [leagueId, sessionId]);

  return (
    <section className="ff-league-section mx-auto mt-8 w-full max-w-2xl">
      <p className="ff-league-eyebrow">League activation</p>
      <h1 className="text-2xl font-bold">
        {status === 'active'
          ? 'League active'
          : status === 'error'
            ? 'Activation not confirmed'
            : 'Checking checkout'}
      </h1>
      <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite">
        {message}
      </p>
      <Button asChild type="button" variant="outline">
        <Link href={`/dashboard/leagues/${encodeURIComponent(leagueId)}`}>Return to League</Link>
      </Button>
    </section>
  );
}
