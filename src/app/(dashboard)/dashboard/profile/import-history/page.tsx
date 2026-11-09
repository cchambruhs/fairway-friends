// @polsia:user-owned — signed-in UDisc export and structured scorecard import workspace.
import type { Metadata } from 'next';
import { StructuredScorecardJsonImport } from '@/components/custom/structured-scorecard-json-import';
import { UDiscExportImport } from '@/components/custom/udisc-export-import';

export const metadata: Metadata = {
  title: 'Import history',
  description:
    'Import historical UDisc CSV exports and structured scorecards into Fairway Friends.',
};

export default function ImportHistoryPage() {
  return (
    <div className="ff-rounds-page">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">PROFILE · IMPORT HISTORY</p>
        <h1>Import history</h1>
        <p>Review and add historical UDisc exports and structured scorecard records.</p>
      </header>
      <section id="csv-import" aria-label="UDisc CSV import">
        <UDiscExportImport initialSourceUrl="" />
      </section>
      <StructuredScorecardJsonImport />
    </div>
  );
}
