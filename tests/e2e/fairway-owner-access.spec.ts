import { readFileSync, rmSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
// biome-ignore lint/style/noRestrictedImports: browser tests seed and inspect the test database directly.
import { PrismaClient } from '@prisma/client';
import { signJWT } from 'better-auth/crypto';
import { z } from 'zod';

const prisma = new PrismaClient();
const CapturedEmail = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  html: z.string(),
});
const VerificationClaims = z.object({ email: z.string().email(), exp: z.number() });
const verificationEmailPath = '/tmp/fairway-friends-owner-verification-email.json';
const resetEmailPath = '/tmp/fairway-friends-reset-email.json';

test.beforeEach(async () => {
  const ownerEmail = process.env.POLSIA_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) throw new Error('The test environment needs its synthetic owner identity.');
  await prisma.user.deleteMany({ where: { email: ownerEmail } });
});

test.afterEach(async () => {
  const ownerEmail = process.env.POLSIA_OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail) await prisma.user.deleteMany({ where: { email: ownerEmail } });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

function capturedEmail(path: string) {
  return CapturedEmail.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function linkFromEmail(html: string): URL {
  const href = /href="([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
  if (!href) throw new Error('The captured email did not contain its secure link.');
  return new URL(href);
}

function tokenClaims(url: URL) {
  const token = url.searchParams.get('token');
  const payload = token?.split('.')[1];
  if (!payload) throw new Error('The email link did not contain a signed token.');
  return VerificationClaims.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
}

function relativeLuminance(color: string): number {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unexpected computed color: ${color}`);
  const [red, green, blue] = channels;
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error(`Unexpected computed color: ${color}`);
  }
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function authButtonColors(page: Page) {
  return page.locator('.ff-auth-submit').evaluate((element) => {
    const styles = getComputedStyle(element);
    return { foreground: styles.color, background: styles.backgroundColor };
  });
}

async function openAccountMenuIfVisible(page: Page) {
  const accountMenu = page.getByRole('button', { name: 'Account menu' });
  const isMobile = await page.evaluate(() => window.innerWidth < 768);
  if (isMobile) {
    await expect(accountMenu).toBeVisible();
    await accountMenu.click();
  } else if (await accountMenu.isVisible()) {
    await accountMenu.click();
  }
}

test('owner starts access privately, verifies, sets a password, and returns through /admin', async ({
  page,
  request,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const ownerEmail = process.env.POLSIA_OWNER_EMAIL?.trim().toLowerCase();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!ownerEmail || !secret)
    throw new Error('The test environment needs its synthetic owner identity and auth secret.');
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
  rmSync(verificationEmailPath, { force: true });
  rmSync(resetEmailPath, { force: true });

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Owner access', exact: true })).toHaveCount(0);

  const publicOwnerSignup = await request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: {
      name: 'Unverified public signup',
      email: ownerEmail,
      password: `Attacker-chosen-${Date.now()}`,
      role: 'admin',
      emailVerified: true,
    },
  });
  expect(publicOwnerSignup.status()).not.toBe(200);
  expect(await prisma.user.findUnique({ where: { email: ownerEmail } })).toBeNull();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin?callbackURL=%2Fprofile');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'First access' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.locator('html').getAttribute('class')).toContain('dark');
  const darkButtonColors = { foreground: 'rgb(16, 32, 21)', background: 'rgb(199, 243, 107)' };
  await expect.poll(() => authButtonColors(page)).toEqual(darkButtonColors);
  const actualDarkButtonColors = await authButtonColors(page);
  expect(
    contrastRatio(actualDarkButtonColors.foreground, actualDarkButtonColors.background),
  ).toBeGreaterThanOrEqual(4.5);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Sign in', 'Send owner setup link']) {
      const control = page.getByRole('button', { name, exact: true });
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box, `${name} should fit at ${width}px.`).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.locator('html').getAttribute('class')).toContain('light');
  const lightButtonColors = { foreground: 'rgb(244, 245, 239)', background: 'rgb(35, 74, 49)' };
  await expect.poll(() => authButtonColors(page)).toEqual(lightButtonColors);
  const actualLightButtonColors = await authButtonColors(page);
  expect(
    contrastRatio(actualLightButtonColors.foreground, actualLightButtonColors.background),
  ).toBeGreaterThanOrEqual(4.5);
  const journeyViewport =
    testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(journeyViewport);
  await page.screenshot({
    path: `/tmp/fairway-owner-entry-${testInfo.project.name}.png`,
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Send owner setup link' }).click();
  await expect(page.getByText(/fresh link is on its way/i)).toBeVisible();
  let ownerRecord = await prisma.user.findUnique({ where: { email: ownerEmail } });
  expect(ownerRecord?.emailVerified).toBe(false);
  expect(ownerRecord?.role).toBe('user');

  const firstEmail = capturedEmail(verificationEmailPath);
  expect(firstEmail.to).toBe(ownerEmail);
  expect(firstEmail.subject).toBe('Verify your email');
  const firstVerificationLink = linkFromEmail(firstEmail.html);
  expect(firstVerificationLink.origin).toBe(origin);
  expect(firstVerificationLink.searchParams.get('callbackURL')).toBe('/profile');
  const claims = tokenClaims(firstVerificationLink);
  expect(claims.email).toBe(ownerEmail);
  const secondsRemaining = claims.exp - Math.floor(Date.now() / 1000);
  expect(secondsRemaining).toBeGreaterThan(3500);
  expect(secondsRemaining).toBeLessThanOrEqual(3600);

  const expiredToken = await signJWT({ email: ownerEmail }, secret, -30);
  const expiredLink = new URL(firstVerificationLink);
  expiredLink.searchParams.set('token', expiredToken);
  await page.goto(expiredLink.toString());
  await expect(page).toHaveURL(/\/profile\?error=TOKEN_EXPIRED$/);
  await page.goto('/admin?callbackURL=%2Fprofile&error=TOKEN_EXPIRED');
  await expect(page.getByText(/link has expired or is invalid/i)).toBeVisible();
  await page.getByRole('button', { name: 'Resend owner link' }).click();
  await expect(page.getByText(/fresh link is on its way/i)).toBeVisible();
  const resentEmail = capturedEmail(verificationEmailPath);
  expect(resentEmail.to).toBe(ownerEmail);
  const resentLink = linkFromEmail(resentEmail.html);
  expect(tokenClaims(resentLink).email).toBe(ownerEmail);

  await page.goto(resentLink.toString());
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
  ownerRecord = await prisma.user.findUnique({ where: { email: ownerEmail } });
  expect(ownerRecord?.emailVerified).toBe(true);
  expect(ownerRecord?.role).toBe('admin');
  await expect(page.getByRole('button', { name: 'Set or reset password' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Fairway Friends' })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(
    page.locator('.ff-profile-actions').getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toBeEnabled();
  const lightAccountCard = await page
    .locator('.ff-profile-card')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.screenshot({
    path: `/tmp/fairway-owner-admin-account-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect.poll(() => page.locator('html').getAttribute('class')).toContain('dark');
  const darkAccountCard = await page
    .locator('.ff-profile-card')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(darkAccountCard).not.toBe(lightAccountCard);
  await page.screenshot({
    path: `/tmp/fairway-owner-admin-account-dark-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect.poll(() => page.locator('html').getAttribute('class')).toContain('light');

  await page.getByRole('button', { name: 'Set or reset password' }).click();
  await expect(page.getByRole('status')).toContainText('Check the owner inbox');
  const resetEmail = capturedEmail(resetEmailPath);
  expect(resetEmail.to).toBe(ownerEmail);
  expect(resetEmail.subject).toContain('Reset your Fairway Friends password');
  const resetLink = linkFromEmail(resetEmail.html);
  expect(resetLink.origin).toBe(origin);
  await page.goto(resetLink.toString());
  await expect(page).toHaveURL(/\/reset-password\?(?:callbackURL=[^&]+&)?token=/);
  const password = `Fairway-${Date.now()}-OwnerPass`;
  await page.getByRole('textbox', { name: 'New password', exact: true }).fill(password);
  await page.getByRole('textbox', { name: 'Confirm new password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('status')).toContainText('Your password has been updated');
  await page.getByRole('link', { name: 'Continue to your account' }).click();

  const ownerViewport =
    testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 900 };
  const ownerContext = await browser.newContext({ viewport: ownerViewport });
  try {
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/admin');
    await expect(ownerPage.getByLabel('Email address')).toBeVisible();
    await ownerPage.getByLabel('Email address').fill(ownerEmail);
    await ownerPage.getByLabel('Password').fill(password);
    await ownerPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(ownerPage).toHaveURL(/\/admin$/);
    await expect(ownerPage.getByRole('heading', { name: 'Account details' })).toBeVisible();

    await ownerPage.goto('/');
    if (testInfo.project.name === 'mobile') {
      await openAccountMenuIfVisible(ownerPage);
      await expect(
        ownerPage.getByRole('menuitem', { name: 'Owner access', exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        ownerPage.getByRole('banner').getByRole('link', { name: 'Owner access', exact: true }),
      ).toBeVisible();
    }

    await ownerPage.goto('/dashboard/account');
    await expect(ownerPage.getByRole('heading', { name: 'Account details' })).toBeVisible();
    await ownerPage
      .locator('.ff-profile-actions')
      .getByRole('button', { name: 'Sign out', exact: true })
      .click();
    await expect(ownerPage).toHaveURL(/\/login$/);
    await ownerPage.goto('/');
    await expect(ownerPage.getByRole('link', { name: 'Owner access', exact: true })).toHaveCount(0);
    if (testInfo.project.name === 'mobile') {
      const signInLink = ownerPage.getByRole('link', { name: 'Sign in', exact: true }).first();
      await expect(signInLink).toBeVisible();
      await expect(signInLink).toHaveAttribute('href', '/login');
    } else {
      await expect(
        ownerPage.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true }),
      ).toBeVisible();
    }
  } finally {
    await ownerContext.close();
  }

  const callbackContext = await browser.newContext({ viewport: ownerViewport });
  try {
    const callbackPage = await callbackContext.newPage();
    await callbackPage.goto('/admin?callbackURL=%2Fprofile');
    await expect(callbackPage.getByLabel('Email address')).toBeVisible();
    await callbackPage.getByLabel('Email address').fill(ownerEmail);
    await callbackPage.getByLabel('Password').fill(password);
    await callbackPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(callbackPage).toHaveURL(/\/profile$/);
    await expect(callbackPage.getByRole('heading', { name: 'Account details' })).toBeVisible();

    for (const width of [320, 390]) {
      await callbackPage.setViewportSize({ width, height: 844 });
      if (width <= 390) {
        const accountMenu = callbackPage.getByRole('button', { name: 'Account menu' });
        await expect(accountMenu).toBeVisible();
        const menuButtonBox = await accountMenu.boundingBox();
        expect(menuButtonBox, `Account menu should fit at ${width}px.`).not.toBeNull();
        if (menuButtonBox) {
          expect(menuButtonBox.x).toBeGreaterThanOrEqual(0);
          expect(menuButtonBox.x + menuButtonBox.width).toBeLessThanOrEqual(width);
        }
        await accountMenu.click();
      }
      for (const name of ['Account', 'Owner access']) {
        const navigationItem =
          width <= 390
            ? callbackPage.getByRole('menuitem', { name, exact: true })
            : callbackPage.getByRole('link', { name, exact: true });
        await expect(navigationItem).toBeVisible();
        const box = await navigationItem.boundingBox();
        expect(box, `${name} should fit at ${width}px.`).not.toBeNull();
        if (box) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
      }
      expect(
        await callbackPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (width <= 390) {
        await callbackPage.keyboard.press('Escape');
        await expect(
          callbackPage.getByRole('menuitem', { name: 'Account', exact: true }),
        ).toHaveCount(0);
      }
    }
    await callbackPage.setViewportSize(ownerViewport);
    await callbackPage.locator('main').click({ position: { x: 12, y: 12 } });
    await expect(callbackPage.getByRole('menuitem', { name: 'Account', exact: true })).toHaveCount(
      0,
    );
    await callbackPage.screenshot({
      path: `/tmp/fairway-owner-account-end-${testInfo.project.name}.png`,
      fullPage: true,
    });
  } finally {
    await callbackContext.close();
  }

  const customerContext = await browser.newContext();
  let playerEmail: string | undefined;
  try {
    const attemptedEmail = `spoof-${Date.now()}@example.test`;
    const customerAdminAttempt = await customerContext.request.post(
      new URL('/api/auth/sign-up/email', origin).toString(),
      {
        headers: { origin },
        data: {
          name: 'Forged Fairway Admin',
          email: attemptedEmail,
          password: `Player-${Date.now()}-Pass`,
          role: 'admin',
          emailVerified: true,
        },
      },
    );
    expect(customerAdminAttempt.status()).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: attemptedEmail } })).toBeNull();

    playerEmail = `player-${Date.now()}@example.test`;
    const playerPassword = `Player-${Date.now()}-Pass`;
    const playerChoice = await customerContext.request.post(
      new URL('/api/player-identity/registration-choice', origin).toString(),
      {
        headers: { origin },
        data: { email: playerEmail, username: `owner-flow-${Date.now()}`, mode: 'create' },
      },
    );
    expect(playerChoice.status(), await playerChoice.text()).toBe(200);
    const customerSignup = await customerContext.request.post(
      new URL('/api/auth/sign-up/email', origin).toString(),
      {
        headers: { origin },
        data: {
          name: 'Fairway Test Player',
          email: playerEmail,
          password: playerPassword,
        },
      },
    );
    expect(customerSignup.status()).toBe(200);
    const playerRecord = await prisma.user.findUnique({ where: { email: playerEmail } });
    expect(playerRecord?.role).toBe('user');
    expect(playerRecord?.emailVerified).toBe(false);
    await prisma.user.update({ where: { email: playerEmail }, data: { emailVerified: true } });

    const customerPage = await customerContext.newPage();
    await customerPage.goto('/');
    await expect(customerPage.getByRole('link', { name: 'Owner access', exact: true })).toHaveCount(
      0,
    );
    if (testInfo.project.name === 'mobile') {
      await openAccountMenuIfVisible(customerPage);
      await expect(
        customerPage.getByRole('menuitem', { name: 'Account', exact: true }),
      ).toBeVisible();
      await expect(
        customerPage.getByRole('menuitem', { name: 'Owner access', exact: true }),
      ).toHaveCount(0);
      await customerPage.keyboard.press('Escape');
    } else {
      await expect(customerPage.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
    }
    await customerPage.goto('/dashboard/account');
    await expect(
      customerPage.getByRole('heading', { name: 'Good to see you, Fairway Test Player.' }),
    ).toBeVisible();
    await customerPage
      .locator('.ff-profile-actions')
      .getByRole('button', { name: 'Sign out', exact: true })
      .click();
    await expect(customerPage).toHaveURL(/\/login$/);
    await customerPage.goto('/');
    const signInLink = customerPage.getByRole('link', { name: 'Sign in', exact: true }).first();
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute('href', '/login');
    await customerPage.goto('/login');
    await customerPage.getByLabel('Email address').fill(playerEmail);
    await customerPage.getByLabel('Password').fill(playerPassword);
    await customerPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(customerPage).toHaveURL(/\/dashboard$/);
    await expect(customerPage.getByRole('heading', { name: 'Add a scorecard' })).toBeVisible();

    await customerPage.goto('/admin');
    await expect(
      customerPage.getByRole('heading', { name: 'Admin access required' }),
    ).toBeVisible();
    await expect(
      customerPage.getByRole('link', { name: 'Go to your dashboard', exact: true }),
    ).toBeVisible();
    await expect(customerPage.getByText(ownerEmail, { exact: true })).toHaveCount(0);
    await expect(customerPage.getByRole('button', { name: 'Set or reset password' })).toHaveCount(
      0,
    );
    await expect(customerPage.getByRole('link', { name: 'Owner access', exact: true })).toHaveCount(
      0,
    );
  } finally {
    await customerContext.close();
    if (playerEmail) await prisma.user.deleteMany({ where: { email: playerEmail } });
  }
});
