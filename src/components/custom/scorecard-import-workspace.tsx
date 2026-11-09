// @polsia:user-owned — honest UDisc import status and empty round history.

import { CardCastImportForm } from '@/components/custom/cardcast-import-form';
import { RoundHistoryWorkspace } from '@/components/custom/round-history-workspace';

export function ScorecardImportWorkspace({ sourceUrl = '' }: { sourceUrl?: string }) {
  return (
    <div className="ff-round-history-workspace">
      <CardCastImportForm initialShareUrl={sourceUrl} />
      <RoundHistoryWorkspace initialSourceUrl={sourceUrl} />
    </div>
  );
}
