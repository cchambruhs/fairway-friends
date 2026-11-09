import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { type BrowserContext, expect, test } from '@playwright/test';
// biome-ignore lint/style/noRestrictedImports: browser tests seed and inspect the test database directly.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function createPlayerSession(
  context: BrowserContext,
  origin: string,
  email: string,
): Promise<{ id: string; email: string }> {
  const username = `account-${randomUUID()}`;
  const choiceResponse = await context.request.post(
    new URL('/api/player-identity/registration-choice', origin).toString(),
    {
      headers: { origin },
      data: { email, username, mode: 'create' },
    },
  );
  expect(choiceResponse.status(), await choiceResponse.text()).toBe(200);
  const signupUrl = new URL('/api/auth/sign-up/email', origin).toString();
  let response = await context.request.post(signupUrl, {
    headers: { origin },
    data: {
      name: 'Fairway Isolation Test',
      email,
      password: `Fairway-${randomUUID()}-Pass`,
    },
  });

  for (let attempt = 1; response.status() === 429 && attempt < 3; attempt += 1) {
    const retryAfter = Number(response.headers()['x-retry-after']) || 10;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    response = await context.request.post(signupUrl, {
      headers: { origin },
      data: {
        name: 'Fairway Isolation Test',
        email,
        password: `Fairway-${randomUUID()}-Pass`,
      },
    });
  }

  expect(response.status(), await response.text()).toBe(200);
  const sessionResponse = await context.request.get(
    new URL('/api/auth/get-session', origin).toString(),
    { headers: { origin } },
  );
  expect(sessionResponse.status()).toBe(200);
  const session = (await sessionResponse.json()) as {
    user?: { id: string; email: string };
  };
  expect(session.user?.email).toBe(email);
  if (!session.user) throw new Error('Player signup did not create a session.');
  return session.user;
}

test('players can sign up, save appearance, sign in, and recover a password', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const email = `player-${randomUUID()}@example.test`;
  const initialPassword = `Fairway-${randomUUID()}-Pass`;
  const updatedPassword = `Friends-${randomUUID()}-Pass`;
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const landingHeader = page.getByRole('banner');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const accountMenu = landingHeader.getByRole('button', { name: 'Account menu' });
    await expect(accountMenu).toBeVisible();
    const accountMenuBox = await accountMenu.boundingBox();
    expect(accountMenuBox, `Account menu should fit at ${width}px.`).not.toBeNull();
    if (accountMenuBox) {
      expect(accountMenuBox.x).toBeGreaterThanOrEqual(0);
      expect(accountMenuBox.x + accountMenuBox.width).toBeLessThanOrEqual(width);
    }
    await accountMenu.click();
    for (const name of ['Sign in', 'Create account']) {
      const link = page.getByRole('menuitem', { name, exact: true });
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box, `${name} should have a visible box at ${width}px.`).not.toBeNull();
      if (box) {
        expect(box.x, `${name} should not be clipped at ${width}px.`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${name} should fit at ${width}px.`).toBeLessThanOrEqual(width);
      }
    }
    await page.keyboard.press('Escape');
    const clubhouseLink = page.getByRole('link', { name: 'Enter the clubhouse', exact: true });
    await expect(clubhouseLink).toBeVisible();
    const clubhouseBox = await clubhouseLink.boundingBox();
    expect(clubhouseBox, `The clubhouse CTA should fit at ${width}px.`).not.toBeNull();
    if (clubhouseBox) {
      expect(clubhouseBox.x).toBeGreaterThanOrEqual(0);
      expect(clubhouseBox.x + clubhouseBox.width).toBeLessThanOrEqual(width);
    }
  }
  await expect.poll(() => page.locator('html').getAttribute('class')).toContain('dark');

  await landingHeader.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Fairway Test Player');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(initialPassword);
  await page.getByLabel('UDisc username').fill(`account-${randomUUID()}`);
  await page
    .getByRole('group', { name: 'Choose your player profile' })
    .getByRole('button', { name: 'Search' })
    .click();
  await page.getByRole('button', { name: 'Create a new player profile' }).click();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Add a scorecard' })).toBeVisible();
  await page.goto('/dashboard/account');
  await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
  await expect(page.getByText(/verify your email/i)).toHaveCount(0);

  const session = await page.evaluate(async () => {
    const response = await fetch('/api/auth/get-session');
    return (await response.json()) as {
      user?: { id: string; email: string; emailVerified: boolean; role?: string };
    };
  });
  expect(session.user?.email).toBe(email);
  expect(session.user?.emailVerified).toBe(false);
  expect(session.user?.role).toBe('user');
  const userId = session.user?.id;
  if (!userId) throw new Error('Signup did not return the player session.');

  await page.getByRole('button', { name: 'Light' }).click();
  await expect.poll(() => page.locator('html').getAttribute('class')).toContain('light');
  const savedPreference = await prisma.playerPreference.findUnique({ where: { userId } });
  expect(savedPreference?.theme).toBe('light');

  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => page.locator('html').getAttribute('class')).toContain('dark');
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);

  const privateResponse = await page.evaluate(async () => {
    const response = await fetch('/api/player-preferences');
    return response.status;
  });
  expect(privateResponse).toBe(401);

  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(initialPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Add a scorecard' })).toBeVisible();
  await expect.poll(() => page.locator('html').getAttribute('class')).toContain('light');

  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  const recoveryEmail = page.getByLabel('Email address');
  await recoveryEmail.fill(email);
  await expect(recoveryEmail).toHaveValue(email);
  const recoveryButton = page.getByRole('button', { name: 'Send reset link' });
  const capturedEmailPath = '/tmp/fairway-friends-reset-email.json';
  rmSync(capturedEmailPath, { force: true });
  await recoveryButton.click();
  const resetFeedback = page.locator('.ff-auth-feedback');
  const resetError = page.locator('.ff-auth-error');
  await expect(resetFeedback.or(resetError)).toBeVisible();
  const resetMessage = await page.locator('.ff-auth-feedback, .ff-auth-error').textContent();
  expect(
    resetMessage,
    'Password recovery should confirm without revealing account existence.',
  ).toContain('a reset link is on its way');

  const deliveredEmail = JSON.parse(readFileSync(capturedEmailPath, 'utf8')) as {
    to: string;
    subject: string;
    html: string;
  };
  expect(deliveredEmail.to).toBe(email);
  expect(deliveredEmail.subject).toContain('Reset your Fairway Friends password');
  const href = /href="([^"]+)"/.exec(deliveredEmail.html)?.[1]?.replace(/&amp;/g, '&');
  if (!href) throw new Error('The reset email did not contain its secure link.');
  const resetLink = new URL(href);
  expect(resetLink.origin).toBe(origin);

  const resetRecord = await prisma.verification.findFirst({
    where: { identifier: { startsWith: 'reset-password:' }, value: userId },
    orderBy: { createdAt: 'desc' },
  });
  expect(resetRecord).not.toBeNull();
  if (!resetRecord) throw new Error('Password reset did not create a token.');
  expect(resetRecord.expiresAt.getTime()).toBeGreaterThan(Date.now());
  expect(resetRecord.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);

  const token = resetRecord.identifier.slice('reset-password:'.length);
  expect(resetLink.pathname).toContain(`/api/auth/reset-password/${token}`);
  await page.goto(resetLink.toString());
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByRole('textbox', { name: 'New password', exact: true }).fill(updatedPassword);
  await page
    .getByRole('textbox', { name: 'Confirm new password', exact: true })
    .fill(updatedPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('status')).toContainText('Your password has been updated');

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(initialPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByLabel('Password').fill(updatedPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Add a scorecard' })).toBeVisible();
  await page.goto('/dashboard/account');
  await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
});

test('public signup cannot grant the owner or another player admin access', async ({
  request,
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
  const email = `role-check-${randomUUID()}@example.test`;
  const response = await request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: {
      name: 'Public signup security check',
      email,
      password: `Fairway-${randomUUID()}-Pass`,
      role: 'admin',
      emailVerified: true,
    },
  });

  expect([200, 400]).toContain(response.status());
  if (response.status() === 200) {
    const sessionResponse = await request.get('/api/auth/get-session', { headers: { origin } });
    const session = (await sessionResponse.json()) as {
      user?: { email: string; emailVerified: boolean; role?: string };
    };
    expect(session.user?.email).toBe(email);
    expect(session.user?.emailVerified).toBe(false);
    expect(session.user?.role).toBe('user');
  } else {
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  }

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});

test('players can only read and change their own saved appearance preference', async ({
  browser,
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
  const contextA = page.context();
  const contextB = await browser.newContext();

  try {
    const playerA = await createPlayerSession(
      contextA,
      origin,
      `isolation-a-${randomUUID()}@example.test`,
    );
    const playerB = await createPlayerSession(
      contextB,
      origin,
      `isolation-b-${randomUUID()}@example.test`,
    );
    expect(playerA.id).not.toBe(playerB.id);

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
    const playerBPage = await contextB.newPage();
    await playerBPage.goto(new URL('/profile', origin).toString());
    await expect(playerBPage.getByRole('heading', { name: 'Account details' })).toBeVisible();

    const preferenceUrl = new URL('/api/player-preferences', origin);
    const playerAUpdate = await contextA.request.put(preferenceUrl.toString(), {
      headers: { origin },
      data: { theme: 'light' },
    });
    expect(playerAUpdate.status()).toBe(200);

    const playerBRead = await contextB.request.get(
      `${preferenceUrl.toString()}?userId=${encodeURIComponent(playerA.id)}`,
      { headers: { origin } },
    );
    expect(playerBRead.status()).toBe(200);
    expect(await playerBRead.json()).toEqual({ theme: 'system' });

    const playerBAttemptedUpdate = await contextB.request.put(preferenceUrl.toString(), {
      headers: { origin },
      data: { theme: 'dark', userId: playerA.id },
    });
    expect(playerBAttemptedUpdate.status()).toBe(200);
    expect(await playerBAttemptedUpdate.json()).toEqual({ theme: 'dark' });

    const [savedA, savedB] = await Promise.all([
      prisma.playerPreference.findUnique({ where: { userId: playerA.id } }),
      prisma.playerPreference.findUnique({ where: { userId: playerB.id } }),
    ]);
    expect(savedA?.theme).toBe('light');
    expect(savedB?.theme).toBe('dark');

    const playerARead = await contextA.request.get(
      `${preferenceUrl.toString()}?userId=${encodeURIComponent(playerB.id)}`,
      { headers: { origin } },
    );
    expect(playerARead.status()).toBe(200);
    expect(await playerARead.json()).toEqual({ theme: 'light' });
  } finally {
    await contextB.close();
  }
});
