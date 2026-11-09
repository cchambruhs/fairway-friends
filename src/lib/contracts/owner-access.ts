// @polsia:user-owned — shared contract for the company-owner access request.
import { z } from 'zod';

export const OwnerAccessRequest = z
  .object({ callbackURL: z.string().max(2048).optional() })
  .strict();
export const OwnerAccessResponse = z.object({ status: z.literal('sent') });

export type OwnerAccessResponse = z.infer<typeof OwnerAccessResponse>;
