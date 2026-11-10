// @polsia:user-owned — client/server contract for private player preferences.
import { z } from 'zod';

export const PlayerThemeSchema = z.enum(['system', 'light', 'dark']);

export const PlayerPreferenceSchema = z.object({
  theme: PlayerThemeSchema,
});

export const UpdatePlayerPreferenceSchema = PlayerPreferenceSchema;

export type PlayerTheme = z.infer<typeof PlayerThemeSchema>;
export type PlayerPreference = z.infer<typeof PlayerPreferenceSchema>;

export const PublicNamePrivacySchema = z.object({
  hidePublicName: z.boolean(),
});

export type PublicNamePrivacy = z.infer<typeof PublicNamePrivacySchema>;
