// @polsia:user-owned — private, read-only scorecard preview contract.
import { z } from 'zod';

export const HistoricalRoundPreviewResponseSchema = z
  .object({
    duplicate: z
      .object({
        roundId: z.string(),
        sourceUrl: z.string().nullable(),
      })
      .nullable(),
    currentProfile: z.object({
      displayName: z.string(),
      exists: z.boolean(),
    }),
  })
  .strict();

export type HistoricalRoundPreviewResponse = z.infer<typeof HistoricalRoundPreviewResponseSchema>;
