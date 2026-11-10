// @polsia:user-owned — signed-in historical UDisc CSV import workspace (JSON entry removed per PRD v4 §3).
import type { Metadata } from 'next';
import { UDiscExportImport } from '@/components/custom/udisc-export-import';

export const metadata: Metadata = {
  title: 'Import history',
  description: 'Import historical UDisc CSV exports into Fairway Friends.',
};

export default function ImportHistoryPage() {
  return (
    <div className="ff-rounds-page">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">PROFILE · IMPORT HISTORY</p>
        <h1>Import history</h1>
        <p>Review and add historical UDisc CSV exports.</p>
      </header>
      <section id="csv-import" aria-label="UDisc CSV import">
        <UDiscExportImport initialSourceUrl="" />
      </section>
    </div>
  );
}
