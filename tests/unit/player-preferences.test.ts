import { describe, expect, it } from 'vitest';
import {
  PlayerPreferenceSchema,
  PlayerThemeSchema,
  UpdatePlayerPreferenceSchema,
} from '@/lib/contracts/player-preferences';

describe('player appearance preferences', () => {
  it('accepts device, light, and dark preferences', () => {
    expect(PlayerThemeSchema.options).toEqual(['system', 'light', 'dark']);
    expect(UpdatePlayerPreferenceSchema.parse({ theme: 'dark' })).toEqual({ theme: 'dark' });
  });

  it('rejects invalid or missing theme values', () => {
    expect(PlayerPreferenceSchema.safeParse({ theme: 'sepia' }).success).toBe(false);
    expect(UpdatePlayerPreferenceSchema.safeParse({}).success).toBe(false);
  });
});
