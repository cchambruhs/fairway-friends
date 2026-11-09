import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmail }));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/business/player-identity.server', () => ({
  completePlayerRegistration: vi.fn(),
  findUDiscRecords: vi.fn(),
}));

import { authConfig } from '@/lib/auth-config';

describe('Fairway Friends password recovery configuration', () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ id: 'test-email-1' });
  });

  it('does not send signup or signin verification emails', () => {
    expect(authConfig.emailVerification?.sendOnSignUp).toBe(false);
    expect(authConfig.emailVerification?.sendOnSignIn).toBe(false);
  });

  it('uses one-hour verification links and signs in only after verification', () => {
    expect(authConfig.emailVerification?.expiresIn).toBe(60 * 60);
    expect(authConfig.emailVerification?.autoSignInAfterVerification).toBe(true);
  });

  it('sends the exact reset URL and expires tokens after one hour', async () => {
    const sender = authConfig.emailAndPassword?.sendResetPassword;
    expect(sender).toBeTypeOf('function');
    expect(authConfig.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(60 * 60);

    const user = {
      id: 'player_test',
      name: 'Test player',
      email: 'player@example.test',
      emailVerified: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      image: null,
    };
    const url =
      'https://fairway.example.test/api/auth/reset-password/token-123?callbackURL=%2Freset-password';

    if (!sender) throw new Error('Password reset sender is not configured.');
    await sender({ user, url, token: 'token-123' });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'player@example.test',
      subject: 'Reset your Fairway Friends password',
      html: expect.stringContaining(url.replaceAll('&', '&amp;')),
      text: expect.stringContaining(url),
    });
  });
});
