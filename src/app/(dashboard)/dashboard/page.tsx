// @polsia:user-owned — Fairway Friends member workspace overview.

import type { Metadata } from 'next';
import { CardCastImportForm } from '@/components/custom/cardcast-import-form';
import { DashboardOverview } from '@/components/custom/dashboard/dashboard-overview';

export const metadata: Metadata = {
  title: 'Player dashboard',
  description:
    'Import a UDisc round, follow recent scorecards and check your Fairway Friends stats.',
};

export default function DashboardPage() {
  return (
    <div className="ff-overview">
      <CardCastImportForm headingLevel="h1" />
      <DashboardOverview />
    </div>
  );
}
