// @polsia:user-owned — exact UDisc CardCast URL validation with no fetch behavior.
import { z } from 'zod';

const UDiscScorecardLinkMessage =
  'Use an HTTPS link in the form https://udisc.com/scorecards/{id}.';

export const UDiscScorecardLinkSchema = z
  .string()
  .min(1, 'Paste a UDisc CardCast scorecard link.')
  .max(2048, 'The link is too long.')
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: UDiscScorecardLinkMessage });
      return;
    }

    if (url.protocol !== 'https:') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use HTTPS for a UDisc CardCast link.',
      });
      return;
    }

    if (
      url.hostname !== 'udisc.com' ||
      url.port ||
      url.username ||
      url.password ||
      !value.startsWith('https://udisc.com/')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'This link is outside the supported udisc.com domain.',
      });
      return;
    }

    if (url.pathname === '/scorecards/') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The scorecard link is missing its ID.',
      });
      return;
    }

    if (
      !/^\/scorecards\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
      url.search ||
      url.hash ||
      url.href !== value
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'This UDisc path is unsupported. Use /scorecards/{id}.',
      });
    }
  });

export function udiscScorecardId(value: string): string | null {
  const match = /^https:\/\/udisc\.com\/scorecards\/([A-Za-z0-9_-]+)$/.exec(value);
  return match?.[1] ?? null;
}
