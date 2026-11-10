import { describe, expect, it } from 'vitest';
import {
  hiddenPlayerLabel,
  isPublicNameHidden,
  maskHiddenPublicNames,
} from '@/lib/business/public-name-privacy';

const players = [
  {
    identityOwnerUserId: 'u-dad',
    normalizedUsername: 'cchambruhs',
    displayName: 'Dad',
    username: 'cchambruhs',
  },
  {
    identityOwnerUserId: 'u-devin',
    normalizedUsername: 'devin47',
    displayName: 'Devin',
    username: 'devin47',
  },
  {
    identityOwnerUserId: null,
    normalizedUsername: 'mk3492',
    displayName: 'TG',
    username: 'mk3492',
  },
];

describe('public name hiding', () => {
  it('shows a hidden player as Player N by their place on the card', () => {
    const masked = maskHiddenPublicNames(players, new Set(['u-devin']));
    expect(masked[1]).toMatchObject({
      displayName: 'Player 2',
      username: null,
      normalizedUsername: null,
      identityOwnerUserId: null,
      hidden: true,
    });
  });

  it('leaves everyone else untouched', () => {
    const masked = maskHiddenPublicNames(players, new Set(['u-devin']));
    expect(masked[0]).toMatchObject({ displayName: 'Dad', username: 'cchambruhs', hidden: false });
    expect(masked[2]).toMatchObject({ displayName: 'TG', username: 'mk3492', hidden: false });
  });

  it('cannot hide an unclaimed player, because only an owner can opt out', () => {
    expect(isPublicNameHidden(null, new Set(['u-devin']))).toBe(false);
    expect(hiddenPlayerLabel(3)).toBe('Player 3');
  });

  it('never leaks the name anywhere in the masked record', () => {
    const masked = maskHiddenPublicNames(players, new Set(['u-dad']));
    expect(JSON.stringify(masked[0])).not.toMatch(/cchambruhs|Dad/);
  });
});
