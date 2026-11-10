import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
// biome-ignore lint/style/noRestrictedImports: browser tests seed and inspect the test database directly.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function createPlayerSession(context: BrowserContext, origin: string, name: string) {
  const email = `profile-${randomUUID()}@example.test`;
  const password = `Fairway-${randomUUID()}-Pass`;
  const choiceResponse = await context.request.post(
    new URL('/api/player-identity/registration-choice', origin).toString(),
    {
      headers: { origin },
      data: { email, username: `profile-${randomUUID()}`, mode: 'create' },
    },
  );
  expect(choiceResponse.status(), await choiceResponse.text()).toBe(200);
  const url = new URL('/api/auth/sign-up/email', origin).toString();
  let response = await context.request.post(url, {
    headers: { origin },
    data: { name, email, password },
  });

  for (let attempt = 0; response.status() === 429 && attempt < 3; attempt += 1) {
    const retryAfter = Number(response.headers()['x-retry-after']) || 10;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    response = await context.request.post(url, {
      headers: { origin },
      data: { name, email, password },
    });
  }

  const responseText = await response.text();
  expect(response.status(), responseText).toBe(200);
  const sessionResponse = await context.request.get(
    new URL('/api/auth/get-session', origin).toString(),
    { headers: { origin } },
  );
  const session = (await sessionResponse.json()) as { user?: { id: string; name: string } };
  expect(session.user?.name).toBe(name);
  if (!session.user) throw new Error('Player signup did not create a session.');
  return session.user;
}

const imageFixture = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=',
  'base64',
);

async function openWorkspacePage(page: Page, label: string) {
  const openMenu = page.getByRole('button', { name: 'Open workspace menu' });
  if (await openMenu.isVisible()) await openMenu.click();
  await page.getByRole('link', { name: label, exact: true }).click();
}

test('a player can save and revisit a private profile, photo, and ranked disc bag', async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
  const providerErrorFixturePath = '/tmp/fairway-upload-mint-provider-error.png.json';
  const blockedFixturePath = '/tmp/fairway-upload-mint-blocked.png.json';
  rmSync(providerErrorFixturePath, { force: true });
  rmSync(blockedFixturePath, { force: true });
  const player = await createPlayerSession(page.context(), origin, 'Profile Test Player');

  await page.route(/^https:\/\/[^/]+\.r2\.cloudflarestorage\.com\//, async (route) => {
    await route.fulfill({
      status: route.request().method() === 'OPTIONS' ? 204 : 200,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'PUT, OPTIONS',
        'access-control-allow-headers': '*',
        'access-control-max-age': '0',
        etag: '"qa-upload"',
      },
      body: '',
    });
  });
  await page.route('https://cdn.polsia.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: imageFixture });
  });

  const initial = await page.request.get(new URL('/api/player-profile', origin).toString(), {
    headers: { origin },
  });
  expect(initial.status()).toBe(200);
  expect(await initial.json()).toEqual({ profile: null, favoriteDiscs: [] });

  const csrf = await page.request.put(new URL('/api/player-profile', origin).toString(), {
    headers: { origin: 'https://outside.example.test' },
    data: {
      displayName: 'CSRF attempt',
      hometown: null,
      homeCourse: null,
      bio: null,
      pdgaNumber: null,
      photoKey: null,
      photoUrl: null,
      favoriteDiscs: [],
    },
  });
  expect(csrf.status()).toBe(403);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Add a scorecard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import scorecard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently imported' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View all rounds' })).toBeVisible();
  await openWorkspacePage(page, 'Player profile');
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  await expect(page.getByRole('heading', { name: 'Make it yours.' })).toBeVisible();
  await expect(
    page.getByText(
      'Fairway Friends has no round records available for this profile, so no statistics are shown.',
    ),
  ).toBeVisible();

  await openWorkspacePage(page, 'Account');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await openWorkspacePage(page, 'Player profile');

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const openMenu = page.getByRole('button', { name: 'Open workspace menu' });
    if (await openMenu.isVisible()) await openMenu.click();
    for (const selector of [
      page.getByRole('link', { name: 'Player profile', exact: true }),
      page.getByRole('link', { name: 'Account', exact: true }),
      page.getByRole('button', { name: 'Save profile' }),
    ]) {
      const box = await selector.boundingBox();
      expect(box, `A workspace action should have a visible box at ${width}px.`).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
    }
    const closeMenu = page.getByRole('button', { name: 'Close workspace menu' });
    if (await closeMenu.isVisible()) await closeMenu.click();
    await expect(page.getByText('Choose photo', { exact: true })).toBeVisible();
    const uploadLabel = page.locator(
      '.ff-profile-photo-control > div:first-child > label:last-of-type',
    );
    const uploadBox = await uploadLabel.boundingBox();
    expect(uploadBox, `The photo upload control should fit at ${width}px.`).not.toBeNull();
    if (uploadBox) expect(uploadBox.x + uploadBox.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByLabel('Player name').fill('First saved name');
  await page.getByLabel('Hometown').fill('Player supplied town');
  await page.getByLabel('Home course').fill('Player supplied course');
  await page.getByLabel('PDGA number').fill('Player supplied ID');
  await page.getByLabel('About you').fill('A short note supplied by this test player.');
  await page.getByLabel('Profile photo').setInputFiles({
    name: 'player-photo.png',
    mimeType: 'image/png',
    buffer: imageFixture,
  });
  await expect(page.getByText('player-photo.png')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Profile photo of First saved name' })).toBeVisible();
  expect(
    JSON.parse(readFileSync('/tmp/fairway-upload-mint-player-photo.png.json', 'utf8')),
  ).toEqual({
    filename: 'player-photo.png',
    mime_type: 'image/png',
    size: imageFixture.length,
  });
  expect(JSON.parse(readFileSync('/tmp/fairway-upload-confirm.json', 'utf8'))).toEqual({
    upload_id: 'qa-upload-481',
  });

  await page.getByRole('button', { name: 'Add a favorite disc' }).click();
  await page.getByRole('button', { name: 'Add a favorite disc' }).click();
  const first = page.getByRole('group', { name: 'Rank 1' });
  const second = page.getByRole('group', { name: 'Rank 2' });
  await first.getByLabel('Manufacturer').fill('First maker');
  await first.getByLabel('Mold').fill('First mold');
  await first.getByLabel('Plastic').fill('First plastic');
  await first.getByLabel('Weight (g)').fill('171');
  await second.getByLabel('Manufacturer').fill('Preferred maker');
  await second.getByLabel('Mold').fill('Preferred mold');
  await second.getByLabel('Plastic').fill('Preferred plastic');
  await second.getByLabel('Weight (g)').fill('174');
  await page.getByRole('button', { name: 'Move rank 2 up' }).click();

  await page.getByRole('button', { name: 'Add a favorite disc' }).click();
  await page.getByRole('button', { name: 'Add a favorite disc' }).click();
  await page.getByRole('button', { name: 'Add a favorite disc' }).click();
  await expect(page.getByRole('button', { name: 'Add a favorite disc' })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove rank 5' }).click();
  await page.getByRole('button', { name: 'Remove rank 4' }).click();
  await page.getByRole('button', { name: 'Remove rank 3' }).click();

  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Your player profile is saved.')).toBeVisible();

  let stored = await prisma.playerProfile.findUnique({
    where: { userId: player.id },
    include: { favoriteDiscs: { orderBy: { rank: 'asc' } } },
  });
  expect(stored?.displayName).toBe('First saved name');
  expect(stored?.hometown).toBe('Player supplied town');
  expect(stored?.photoKey).toBe('qa/player-photo.png');
  expect(stored?.photoUrl).toBe('https://cdn.polsia.com/qa/player-photo.png');
  expect(stored?.favoriteDiscs.map(({ manufacturer, rank }) => [manufacturer, rank])).toEqual([
    ['Preferred maker', 1],
    ['First maker', 2],
  ]);

  await page.reload();
  await expect(page.getByLabel('Player name')).toHaveValue('First saved name');
  await expect(page.getByLabel('Hometown')).toHaveValue('Player supplied town');
  await expect(page.getByLabel('Manufacturer').nth(0)).toHaveValue('Preferred maker');
  await expect(page.getByLabel('Manufacturer').nth(1)).toHaveValue('First maker');
  await expect(page.getByRole('img', { name: 'Profile photo of First saved name' })).toBeVisible();

  await page.getByLabel('Profile photo').setInputFiles({
    name: 'provider-error.png',
    mimeType: 'image/png',
    buffer: imageFixture,
  });
  await expect(page.getByText('The upload was rejected.', { exact: true })).toBeVisible();
  expect(JSON.parse(readFileSync(providerErrorFixturePath, 'utf8'))).toEqual({
    filename: 'provider-error.png',
    mime_type: 'image/png',
    size: imageFixture.length,
  });
  await expect(page.getByRole('img', { name: 'Profile photo of First saved name' })).toBeVisible();

  await page.getByLabel('Player name').fill('Updated saved name');
  const saveProfile = page.getByRole('button', { name: 'Save profile' });
  await saveProfile.scrollIntoViewIfNeeded();
  await saveProfile.click({ timeout: 10_000 });
  await expect(page.getByText('Your player profile is saved.')).toBeVisible();
  stored = await prisma.playerProfile.findUnique({
    where: { userId: player.id },
    include: { favoriteDiscs: { orderBy: { rank: 'asc' } } },
  });
  expect(stored?.displayName).toBe('Updated saved name');
  expect(stored?.favoriteDiscs).toHaveLength(2);
  expect(await prisma.playerProfile.count({ where: { userId: player.id } })).toBe(1);

  const otherContext = await browser.newContext();
  const anonymousContext = await browser.newContext();
  try {
    const anonymousUpload = await anonymousContext.request.post(
      new URL('/api/upload', origin).toString(),
      {
        headers: { origin },
        data: { filename: 'blocked.png', mime_type: 'image/png', size: imageFixture.length },
      },
    );
    expect(anonymousUpload.status()).toBe(401);
    expect(existsSync(blockedFixturePath)).toBe(false);

    await createPlayerSession(otherContext, origin, 'Second Test Player');
    const otherResponse = await otherContext.request.get(
      new URL('/api/player-profile', origin).toString(),
      { headers: { origin } },
    );
    expect(otherResponse.status()).toBe(200);
    expect(await otherResponse.json()).toEqual({ profile: null, favoriteDiscs: [] });

    const anonymousResponse = await anonymousContext.request.get(
      new URL('/api/player-profile', origin).toString(),
      { headers: { origin } },
    );
    expect(anonymousResponse.status()).toBe(401);
  } finally {
    await otherContext.close();
    await anonymousContext.close();
  }
});
