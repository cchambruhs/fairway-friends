import { describe, expect, it } from 'vitest';
import {
  FavoriteDiscInputSchema,
  PlayerProfileResponseSchema,
  SavePlayerProfileSchema,
} from '@/lib/contracts/player-profile';

const profile = {
  displayName: 'Player supplied name',
  hometown: 'Player supplied town',
  homeCourse: null,
  bio: null,
  pdgaNumber: null,
  photoKey: null,
  photoUrl: null,
};

function disc(manufacturer: string) {
  return { manufacturer, mold: 'Mold', plastic: 'Plastic', weightGrams: 173 };
}

describe('private player profile contract', () => {
  it('accepts player-provided profile data with up to five ranked disc inputs', () => {
    const parsed = SavePlayerProfileSchema.parse({
      ...profile,
      favoriteDiscs: ['One', 'Two', 'Three', 'Four', 'Five'].map(disc),
    });
    expect(parsed.favoriteDiscs).toHaveLength(5);
    expect(parsed.favoriteDiscs[0]?.manufacturer).toBe('One');
  });

  it('rejects more than five discs and invalid disc weights or missing details', () => {
    expect(
      SavePlayerProfileSchema.safeParse({
        ...profile,
        favoriteDiscs: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map(disc),
      }).success,
    ).toBe(false);
    expect(FavoriteDiscInputSchema.safeParse({ ...disc('One'), weightGrams: 99 }).success).toBe(
      false,
    );
    expect(FavoriteDiscInputSchema.safeParse({ ...disc(''), mold: '' }).success).toBe(false);
  });

  it('requires the profile photo key and Polsia image URL to be saved together', () => {
    expect(
      SavePlayerProfileSchema.safeParse({
        ...profile,
        photoKey: 'qa/photo.png',
        favoriteDiscs: [],
      }).success,
    ).toBe(false);
    expect(
      SavePlayerProfileSchema.safeParse({
        ...profile,
        photoKey: 'qa/photo.png',
        photoUrl: 'https://images.example.test/photo.png',
        favoriteDiscs: [],
      }).success,
    ).toBe(false);
  });

  it('accepts an honest new-player empty state and a complete saved response', () => {
    expect(PlayerProfileResponseSchema.parse({ profile: null, favoriteDiscs: [] })).toEqual({
      profile: null,
      favoriteDiscs: [],
    });
    expect(
      PlayerProfileResponseSchema.safeParse({
        profile,
        favoriteDiscs: [
          { id: 'disc_1', ...disc('Player supplied maker'), rank: 1 },
          { id: 'disc_2', ...disc('Second maker'), rank: 2 },
        ],
      }).success,
    ).toBe(true);
  });
});
