// @polsia:user-owned — separate official rating availability from Fairway Friends calculations.
'use client';

import { Activity, ArrowRight, Award } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PlayerStatisticsView } from '@/components/custom/player-statistics-view';
import { apiFetch } from '@/lib/api-client';
import {
  type PublicPlayerProfile,
  PublicPlayerProfileResponseSchema,
} from '@/lib/contracts/player-identity';

export function PlayerRatingsSummary() {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/api/player-statistics', { schema: PublicPlayerProfileResponseSchema })
      .then((response) => {
        if (active) setProfile(PublicPlayerProfileResponseSchema.parse(response).profile);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="ff-player-ratings" aria-labelledby="player-ratings-title">
      <header className="ff-player-ratings-heading">
        <p className="ff-profile-section-kicker">PLAYER RECORD</p>
        <h2 id="player-ratings-title">Ratings &amp; statistics</h2>
        <p>Official ratings and Fairway Friends saved-result statistics stay separate.</p>
      </header>

      <div className="ff-player-ratings-grid">
        <article className="ff-player-rating-card" aria-labelledby="official-rating-title">
          <div className="ff-player-rating-topline">
            <span className="ff-player-rating-icon ff-player-rating-icon-gold" aria-hidden="true">
              <Award size={19} />
            </span>
            <p className="ff-profile-section-kicker">OFFICIAL PDGA</p>
          </div>
          <h3 id="official-rating-title">Official PDGA rating</h3>
          <p className="ff-player-rating-value">Unavailable</p>
          <p className="ff-player-rating-description">
            No authorized, verified PDGA rating source is connected. A profile number or scorecard
            result is not used to calculate an official rating.
          </p>
          <div className="ff-player-rating-source">
            <span>Source status</span>
            <strong>No verified source connected</strong>
          </div>
        </article>

        <article className="ff-player-rating-card" aria-labelledby="fairway-stats-title">
          <div className="ff-player-rating-topline">
            <span className="ff-player-rating-icon" aria-hidden="true">
              <Activity size={19} />
            </span>
            <p className="ff-profile-section-kicker">UNOFFICIAL · FAIRWAY FRIENDS</p>
          </div>
          <h3 id="fairway-stats-title">Finalized saved results</h3>
          <p className="ff-player-rating-value">
            {loading
              ? 'Loading…'
              : failed
                ? 'Unavailable'
                : profile?.statistics.lifetimeRounds
                  ? `${profile.statistics.lifetimeRounds} finalized rounds`
                  : 'No finalized rounds yet'}
          </p>
          <p className="ff-player-rating-description">
            The calculations below use finalized scorecards linked to your exact player identity.
            They are not an official rating.
          </p>
          <Link className="ff-player-rating-link" href="/dashboard/rounds">
            View rounds &amp; scorecards <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </article>
      </div>

      {failed ? (
        <p className="ff-statistics-empty-note" role="alert">
          Your saved-result statistics could not be loaded. Try again from your profile later.
        </p>
      ) : loading ? (
        <p className="ff-statistics-empty-note" aria-live="polite">
          Loading finalized saved-result statistics…
        </p>
      ) : profile ? (
        <PlayerStatisticsView profile={profile} />
      ) : (
        <p className="ff-statistics-empty-note">Your player statistics are unavailable.</p>
      )}
    </section>
  );
}
