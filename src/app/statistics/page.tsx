// @polsia:user-owned — public Global Stats route with server-rendered metadata.
import type { Metadata } from 'next';
import { GlobalStatsDashboard } from './statistics-dashboard';

export const metadata: Metadata = {
  title: 'Global Statistics',
  description:
    'Explore Fairway Friends global disc golf statistics from verified public scorecards.',
  alternates: { canonical: '/statistics' },
};

export default function StatisticsPage() {
  return <GlobalStatsDashboard />;
}
