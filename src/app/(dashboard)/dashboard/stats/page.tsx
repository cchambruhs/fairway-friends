// @polsia:user-owned — dashboard entry to the shared public statistics view.
import type { Metadata } from 'next';
import { PersonalPlayerStatistics } from '@/components/custom/dashboard/personal-player-statistics';

export const metadata: Metadata = {
  title: 'Statistics',
  description: 'Explore Fairway Friends scorecard and player statistics.',
};

export default function DashboardStatsPage() {
  return (
    <div className="ff-rounds-page">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">YOUR PERFORMANCE</p>
        <h1>Statistics</h1>
        <p>
          Unofficial stats use played holes only and saved results linked to your player identity.
        </p>
      </header>
      <PersonalPlayerStatistics />
    </div>
  );
}
