// @polsia:user-owned — shared REST contract for each player's private profile.
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const profilePhotoUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'cdn.polsia.com';
    } catch {
      return false;
    }
  });

export const PlayerProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  hometown: optionalText(80),
  homeCourse: optionalText(100),
  bio: optionalText(280),
  pdgaNumber: optionalText(20),
  photoKey: z.string().max(512).nullable(),
  photoUrl: profilePhotoUrl.nullable(),
});

export const FavoriteDiscInputSchema = z.object({
  manufacturer: z.string().trim().min(1).max(80),
  mold: z.string().trim().min(1).max(80),
  plastic: z.string().trim().min(1).max(80),
  weightGrams: z.number().int().min(100).max(200),
});

export const FavoriteDiscSchema = FavoriteDiscInputSchema.extend({
  id: z.string().min(1),
  rank: z.number().int().min(1).max(5),
});

export const SavePlayerProfileSchema = PlayerProfileSchema.extend({
  favoriteDiscs: z.array(FavoriteDiscInputSchema).max(5),
}).superRefine((profile, context) => {
  if ((profile.photoKey === null) !== (profile.photoUrl === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Choose a profile photo using the upload field.',
      path: ['photoUrl'],
    });
  }
});

export const PlayerProfileResponseSchema = z.object({
  profile: PlayerProfileSchema.nullable(),
  favoriteDiscs: z.array(FavoriteDiscSchema).max(5),
});

export type FavoriteDiscInput = z.infer<typeof FavoriteDiscInputSchema>;
export type SavePlayerProfile = z.infer<typeof SavePlayerProfileSchema>;
export type PlayerProfileResponse = z.infer<typeof PlayerProfileResponseSchema>;
