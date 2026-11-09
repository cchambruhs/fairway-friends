// @polsia:user-owned — start a saved round with existing players and actual pars.
'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import {
  type SavedRoundOptions,
  SavedRoundOptionsSchema,
  SavedRoundResponseSchema,
} from '@/lib/contracts/saved-round';

const today = new Date().toISOString().slice(0, 10);

export function SavedRoundStart() {
  const router = useRouter();
  const [options, setOptions] = useState<SavedRoundOptions | null>(null);
  const [leagueId, setLeagueId] = useState('');
  const [layoutId, setLayoutId] = useState('custom');
  const [holeCount, setHoleCount] = useState(9);
  const [holePars, setHolePars] = useState<string[]>(Array.from({ length: 9 }, () => ''));
  const [courseName, setCourseName] = useState('');
  const [layoutName, setLayoutName] = useState('');
  const [playedOn, setPlayedOn] = useState(today);
  const [participantUserIds, setParticipantUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadOptions = useCallback(async (selectedLeagueId: string) => {
    setLoading(true);
    try {
      const suffix = selectedLeagueId ? `?leagueId=${encodeURIComponent(selectedLeagueId)}` : '';
      const result = await apiFetch(`/api/rounds/options${suffix}`, {
        schema: SavedRoundOptionsSchema,
      });
      setOptions(result);
      setParticipantUserIds((current) => {
        const eligible = new Set(result.players.map((player) => player.userId));
        const kept = current.filter((id) => eligible.has(id));
        return kept.includes(result.currentUserId) ? kept : [...kept, result.currentUserId];
      });
      setLoadError(false);
    } catch {
      setOptions(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions(leagueId);
  }, [loadOptions, leagueId]);

  const selectedLayout = options?.courseLayouts.find((layout) => layout.id === layoutId);
  const selectedLeague = options?.leagues.find((league) => league.id === leagueId);
  const isRequiredParticipant = !selectedLeague || selectedLeague.role === 'PLAYER';

  function toggleParticipant(userId: string, checked: boolean) {
    setParticipantUserIds((current) => {
      if (checked) return current.includes(userId) ? current : [...current, userId];
      return current.filter((id) => id !== userId);
    });
  }

  function changeHoleCount(value: number) {
    setHoleCount(value);
    setHolePars((current) => Array.from({ length: value }, (_, index) => current[index] ?? ''));
  }

  async function startRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!options) return;
    if (isRequiredParticipant && !participantUserIds.includes(options.currentUserId)) {
      toast.error('Include yourself as a participant to start this round.');
      return;
    }
    const payload = selectedLayout
      ? {
          layoutType: 'course' as const,
          courseLayoutId: selectedLayout.id,
          playedOn,
          leagueId: leagueId || null,
          participantUserIds,
        }
      : {
          layoutType: 'custom' as const,
          courseName: courseName.trim() || null,
          layoutName: layoutName.trim() || null,
          holePars: holePars.map((value) => Number(value)),
          playedOn,
          leagueId: leagueId || null,
          participantUserIds,
        };
    if (
      !selectedLayout &&
      (holePars.length < 1 ||
        holePars.some((value) => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 99))
    ) {
      toast.error('Enter an actual par for every hole in this layout.');
      return;
    }

    setSaving(true);
    try {
      const result = await apiFetch('/api/rounds', {
        method: 'POST',
        body: JSON.stringify(payload),
        schema: SavedRoundResponseSchema,
      });
      router.push(`/dashboard/rounds/${encodeURIComponent(result.item.id)}`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'The round could not be started.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ff-saved-round-start" aria-labelledby="start-round-title">
      <header>
        <div>
          <p className="ff-profile-section-kicker">START A ROUND</p>
          <h2 id="start-round-title">Build your scorecard</h2>
          <p>
            Pick actual Fairway Friends players and a saved layout, or enter the pars for a custom
            course layout.
          </p>
        </div>
      </header>

      {loadError ? (
        <div className="ff-saved-round-load-error" role="alert">
          <p>Round options could not be loaded.</p>
          <Button type="button" variant="outline" onClick={() => void loadOptions(leagueId)}>
            Try again
          </Button>
        </div>
      ) : loading || !options ? (
        <output aria-live="polite">Loading players, Leagues, and saved course layouts…</output>
      ) : (
        <form className="ff-saved-round-form" onSubmit={(event) => void startRound(event)}>
          <div className="ff-saved-round-form-grid">
            <label>
              League <span>(optional)</span>
              <select
                value={leagueId}
                onChange={(event) => {
                  setLeagueId(event.currentTarget.value);
                  setParticipantUserIds([options.currentUserId]);
                }}
              >
                <option value="">Casual round</option>
                {options.leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name} · {league.role.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date played
              <input
                type="date"
                value={playedOn}
                max={today}
                onChange={(event) => setPlayedOn(event.currentTarget.value)}
                required
              />
            </label>
          </div>

          <label>
            Course layout
            <select
              value={layoutId}
              onChange={(event) => {
                const nextLayout = options.courseLayouts.find(
                  (layout) => layout.id === event.currentTarget.value,
                );
                setLayoutId(nextLayout?.id ?? 'custom');
                if (nextLayout) {
                  setCourseName(nextLayout.courseName);
                  setLayoutName(nextLayout.layoutName);
                  setHoleCount(nextLayout.holes.length);
                  setHolePars(Array.from({ length: nextLayout.holes.length }, () => ''));
                }
              }}
            >
              <option value="custom">Custom layout</option>
              {options.courseLayouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.courseName} · {layout.layoutName} · {layout.holes.length} holes
                </option>
              ))}
            </select>
          </label>

          {selectedLayout ? (
            <div className="ff-saved-round-layout-preview">
              <strong>
                {selectedLayout.courseName} · {selectedLayout.layoutName}
              </strong>
              <span>
                {selectedLayout.location} · {selectedLayout.holes.length} holes · Par{' '}
                {selectedLayout.holes.reduce((sum, hole) => sum + hole.par, 0)}
              </span>
            </div>
          ) : (
            <div className="ff-saved-round-custom-layout">
              <div className="ff-saved-round-form-grid">
                <label>
                  Course <span>(optional)</span>
                  <input
                    maxLength={120}
                    value={courseName}
                    onChange={(event) => setCourseName(event.currentTarget.value)}
                    placeholder="Course name"
                  />
                </label>
                <label>
                  Layout <span>(optional)</span>
                  <input
                    maxLength={120}
                    value={layoutName}
                    onChange={(event) => setLayoutName(event.currentTarget.value)}
                    placeholder="Layout name"
                  />
                </label>
              </div>
              <div className="ff-saved-round-form-grid">
                <label>
                  Hole count
                  <select
                    value={holeCount === 9 || holeCount === 18 ? String(holeCount) : 'custom'}
                    onChange={(event) =>
                      changeHoleCount(
                        event.currentTarget.value === 'custom'
                          ? 12
                          : Number(event.currentTarget.value),
                      )
                    }
                  >
                    <option value="9">9 holes</option>
                    <option value="18">18 holes</option>
                    <option value="custom">Custom count</option>
                  </select>
                </label>
                {holeCount !== 9 && holeCount !== 18 ? (
                  <label>
                    Custom holes
                    <input
                      type="number"
                      min={1}
                      max={36}
                      value={holeCount}
                      onChange={(event) => changeHoleCount(Number(event.currentTarget.value) || 1)}
                    />
                  </label>
                ) : null}
              </div>
              <fieldset className="ff-saved-round-pars">
                <legend>Actual par for each hole</legend>
                <div>
                  {holePars.map((par, index) => (
                    <label key={`hole-${index + 1}`}>
                      <span>Hole {index + 1}</span>
                      <input
                        type="number"
                        aria-label={`Par for hole ${index + 1}`}
                        min={1}
                        max={99}
                        value={par}
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setHolePars((current) =>
                            current.map((value, row) => (row === index ? nextValue : value)),
                          );
                        }}
                        required
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          <fieldset className="ff-saved-round-players">
            <legend>Participants</legend>
            <p>Choose existing player profiles. No names or scores are created for you.</p>
            {options.players.length === 0 ? (
              <span>No registered player profiles are available for this selection.</span>
            ) : (
              <div>
                {options.players.map((player) => {
                  const checked = participantUserIds.includes(player.userId);
                  const self = player.userId === options.currentUserId;
                  return (
                    <label key={player.userId}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={self && isRequiredParticipant}
                        onChange={(event) =>
                          toggleParticipant(player.userId, event.currentTarget.checked)
                        }
                      />
                      <span>
                        {player.displayName}
                        {self ? ' · You' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <Button type="submit" disabled={saving || participantUserIds.length === 0 || !playedOn}>
            {saving ? 'Starting…' : 'Start round'}
          </Button>
        </form>
      )}
    </section>
  );
}
