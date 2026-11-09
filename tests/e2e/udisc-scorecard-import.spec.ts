import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type BrowserContext, expect, test } from '@playwright/test';
// biome-ignore lint/style/noRestrictedImports: browser tests seed and inspect the test database directly.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const duplicateMessage = 'This scorecard is already saved. No duplicate added.';
const syntheticPlayers: Array<{ id: string; email: string; username: string }> = [];

interface ScorecardFixture {
  sourceUrl: string;
  courseName: string;
  courseUrl: string;
  layoutName: string;
  playedOn: string;
  location: string;
  holeCount: number;
  pars: number[];
  totalPar: number;
  players: Array<{
    username: string;
    displayName: string;
    position: string;
    toPar: number;
    totalScore: number;
    holeScores: number[];
  }>;
}

const _fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/udisc-scorecard.json'), 'utf8'),
) as ScorecardFixture;

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.afterEach(async () => {
  const players = syntheticPlayers.splice(0);
  const userIds = players.map((player) => player.id);
  if (userIds.length === 0) return;
  const identities = await prisma.uDiscIdentity.findMany({
    where: { OR: [{ ownerUserId: { in: userIds } }, { pendingClaimUserId: { in: userIds } }] },
    select: { id: true },
  });
  const identityIds = identities.map((identity) => identity.id);
  await prisma.playerClaim.deleteMany({
    where: { OR: [{ claimantUserId: { in: userIds } }, { identityId: { in: identityIds } }] },
  });
  await prisma.importedScorecard.deleteMany({ where: { importedByUserId: { in: userIds } } });
  await prisma.clubhouse.deleteMany({ where: { createdByUserId: { in: userIds } } });
  await prisma.clubhouseMembership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userClubhouseSelection.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.playerProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.uDiscIdentity.deleteMany({ where: { id: { in: identityIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function createPlayerSession(
  context: BrowserContext,
  origin: string,
  emailPrefix: string,
  username = `import-${randomUUID()}`,
  mode: 'claim' | 'create' = 'create',
): Promise<{ id: string; email: string; username: string }> {
  const email = `${emailPrefix}-${randomUUID()}@example.test`;
  const password = `Fairway-${randomUUID()}-Pass`;
  const choiceResponse = await context.request.post(
    new URL('/api/player-identity/registration-choice', origin).toString(),
    {
      headers: { origin },
      data: { email, username, mode },
    },
  );
  expect(choiceResponse.status(), await choiceResponse.text()).toBe(200);
  const url = new URL('/api/auth/sign-up/email', origin).toString();
  let response = await context.request.post(url, {
    headers: { origin },
    data: { name: 'Scorecard Import Test', email, password },
  });
  for (let attempt = 0; response.status() === 429 && attempt < 3; attempt += 1) {
    const delaySeconds = Number(response.headers()['x-retry-after']) || 10;
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    response = await context.request.post(url, {
      headers: { origin },
      data: { name: 'Scorecard Import Test', email, password },
    });
  }
  expect(response.status(), await response.text()).toBe(200);
  const session = await context.request.get(new URL('/api/auth/get-session', origin).toString(), {
    headers: { origin },
  });
  expect(session.status()).toBe(200);
  const user = (await session.json()).user as { id: string; email: string } | undefined;
  expect(user?.email).toBe(email);
  if (!user) throw new Error('Scorecard importer signup did not create a session.');
  const player = { id: user.id, email, username };
  syntheticPlayers.push(player);
  return player;
}

test('signed-in players keep CardCast controls accessible and scorecard reads protected', async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
  const anonymousContext = await browser.newContext();
  try {
    await createPlayerSession(page.context(), origin, 'scorecard-controls');
    await page.goto(new URL('/dashboard', origin).toString());
    await expect(page.getByRole('heading', { name: 'Add a scorecard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Scorecard' })).toBeVisible();
    const details = page.locator('.ff-cardcast-advanced');
    await expect(details).toHaveJSProperty('open', false);
    await details.locator('summary').click();
    await expect(page.getByRole('heading', { name: 'Structured JSON' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Import UDisc scorecard CSVs' })).toBeVisible();
    await details.locator('summary').click();
    const urlInput = page.getByLabel('UDisc / CardCast URL');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const inputBox = await urlInput.boundingBox();
      const submitBox = await page.getByRole('button', { name: 'Submit Scorecard' }).boundingBox();
      expect(inputBox).not.toBeNull();
      expect(submitBox).not.toBeNull();
      if (inputBox && submitBox) {
        expect(inputBox.x).toBeGreaterThanOrEqual(0);
        expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(width);
        expect(submitBox.x).toBeGreaterThanOrEqual(0);
        expect(submitBox.x + submitBox.width).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
    await urlInput.fill('https://example.test/scorecards/not-udisc');
    await page.getByRole('button', { name: 'Submit Scorecard' }).click();
    await expect(page.locator('.ff-cardcast-live-status-invalid')).toBeVisible();
    const anonymousRead = await anonymousContext.request.get(
      new URL('/api/udisc-scorecards', origin).toString(),
      {
        headers: { origin },
      },
    );
    expect(anonymousRead.status()).toBe(401);
    const csrf = await page
      .context()
      .request.post(new URL('/api/udisc-scorecards', origin).toString(), {
        headers: { origin: 'https://outside.example.test' },
        data: { sourceUrl: liveScorecardUrl },
      });
    expect(csrf.status()).toBe(403);
  } finally {
    await anonymousContext.close();
  }
});

const liveScorecardUrl = 'https://udisc.com/scorecards/N78XJtdFmZ';
const liveScorecardId = 'N78XJtdFmZ';
const livePlayers = [
  {
    displayName: 'Dad',
    username: 'cchambruhs',
    position: 'T1',
    toPar: 2,
    totalScore: 59,
    holeScores: [3, 3, 3, 3, 3, 2, 4, 3, 4, 3, 5, 4, 4, 3, 3, 3, 3, 3],
  },
  {
    displayName: 'Mdub1807',
    username: 'mdub1807',
    position: 'T1',
    toPar: 2,
    totalScore: 59,
    holeScores: [2, 3, 3, 3, 3, 3, 3, 4, 4, 3, 5, 3, 4, 4, 3, 3, 3, 3],
  },
  {
    displayName: 'Connor',
    username: 'connorc3',
    position: '3',
    toPar: 3,
    totalScore: 60,
    holeScores: [4, 4, 4, 3, 4, 3, 3, 3, 3, 3, 4, 5, 3, 2, 2, 3, 4, 3],
  },
  {
    displayName: 'Z-Dub',
    username: 'zwayne93',
    position: '4',
    toPar: 5,
    totalScore: 62,
    holeScores: [3, 3, 3, 2, 3, 3, 3, 3, 5, 3, 4, 4, 4, 5, 3, 3, 4, 4],
  },
  {
    displayName: 'TG',
    username: 'mk3492',
    position: '5',
    toPar: 8,
    totalScore: 65,
    holeScores: [4, 4, 3, 2, 4, 3, 4, 3, 4, 3, 6, 4, 3, 4, 3, 3, 4, 4],
  },
  {
    displayName: 'Will',
    username: 'rashad032',
    position: '6',
    toPar: 12,
    totalScore: 69,
    holeScores: [3, 5, 4, 3, 2, 3, 4, 4, 5, 3, 5, 5, 3, 4, 4, 5, 3, 4],
  },
  {
    displayName: 'Byron',
    username: 'udiscba',
    position: '7',
    toPar: 13,
    totalScore: 70,
    holeScores: [4, 4, 3, 3, 3, 3, 4, 3, 6, 4, 4, 5, 4, 3, 3, 5, 5, 4],
  },
];

test('imports live N78XJtdFmZ source through the app server and reads it back from PostgreSQL', async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;

  // The verify database is disposable. Remove only this test's fixed source card so reruns
  // exercise a first import; leave the successfully saved row available for inspection.
  await prisma.importedScorecard.deleteMany({
    where: { OR: [{ scorecardId: liveScorecardId }, { sourceUrl: liveScorecardUrl }] },
  });

  const owner = await createPlayerSession(
    page.context(),
    origin,
    'scorecard-live-source',
    'cchambruhs',
    'claim',
  );
  const administratorContext = await browser.newContext();
  const administrator = await createPlayerSession(
    administratorContext,
    origin,
    'scorecard-live-admin',
  );
  await prisma.user.update({
    where: { id: administrator.id },
    data: { role: 'admin', emailVerified: true },
  });
  const pendingClaim = await prisma.playerClaim.findFirst({
    where: { claimantUserId: owner.id, status: 'PENDING' },
  });
  expect(pendingClaim).not.toBeNull();
  const claimApproval = await administratorContext.request.post(
    new URL('/api/admin/player-claims', origin).toString(),
    {
      headers: { origin },
      data: { claimId: pendingClaim?.id, decision: 'approve' },
    },
  );
  expect(claimApproval.status(), await claimApproval.text()).toBe(200);
  const clubhouseResponse = await page
    .context()
    .request.post(new URL('/api/clubhouses', origin).toString(), {
      headers: { origin },
      data: { name: 'Import assignment verification' },
    });
  expect(clubhouseResponse.status()).toBe(201);
  const clubhouseId = ((await clubhouseResponse.json()) as { clubhouseId: string }).clubhouseId;
  const selectionResponse = await page
    .context()
    .request.post(new URL('/api/clubhouses/select', origin).toString(), {
      headers: { origin },
      data: { clubhouseId },
    });
  expect(selectionResponse.status()).toBe(200);
  await page.goto(new URL('/dashboard', origin).toString());
  await expect(page.getByRole('heading', { name: 'Add a scorecard' })).toBeVisible();
  const urlInput = page.getByLabel('UDisc / CardCast URL');
  await urlInput.fill(liveScorecardUrl);
  await page.getByRole('button', { name: 'Submit Scorecard' }).click();
  await expect(page.locator('.ff-cardcast-live-status-success')).toContainText(
    'Saved and verified from database readback: Red Tail Ridge · Mar 22, 2026 · 7 players.',
    { timeout: 30_000 },
  );

  const saved = await prisma.importedScorecard.findUnique({
    where: { scorecardId: liveScorecardId },
    include: { players: { orderBy: { sourceOrder: 'asc' } } },
  });
  expect(saved).not.toBeNull();
  expect(saved?.sourceUrl).toBe(liveScorecardUrl);
  expect(saved?.importedByUserId).toBe(owner.id);
  expect(saved?.clubhouseId).toBe(clubhouseId);
  const ownerIdentity = await prisma.uDiscIdentity.findUnique({
    where: { normalizedUsername: 'cchambruhs' },
  });
  expect(ownerIdentity?.ownerUserId).toBe(owner.id);
  expect(saved?.players.find((player) => player.username === 'cchambruhs')?.identityId).toBe(
    ownerIdentity?.id,
  );
  expect(saved?.courseName).toBe('Red Tail Ridge');
  expect(saved?.courseUrl).toBe('https://udisc.com/courses/red-tail-ridge-9PTX');
  expect(saved?.layoutName).toBe('Blue');
  expect(saved?.playedOn?.toISOString().slice(0, 10)).toBe('2026-03-22');
  expect(saved?.location).toBe('Fort Branch, Indiana');
  expect(saved?.holeCount).toBe(18);
  expect(saved?.totalPar).toBe(57);
  expect(saved?.pars).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 4, 4, 3, 3, 3, 3, 3, 3]);
  expect(
    saved?.players.map(({ displayName, username, position, toPar, totalScore, holeScores }) => ({
      displayName,
      username,
      position,
      toPar,
      totalScore,
      holeScores,
    })),
  ).toEqual(livePlayers);
  expect(await prisma.importedScorecard.count({ where: { scorecardId: liveScorecardId } })).toBe(1);

  await page.goto(new URL('/dashboard/rounds', origin).toString());
  const scorecard = page.locator(`.ff-imported-scorecard:has(a[href="${liveScorecardUrl}"])`);
  await expect(scorecard).toBeVisible();
  await expect(scorecard).toContainText('Red Tail Ridge');
  await expect(scorecard).toContainText('Mar 22, 2026');
  await expect(scorecard).toContainText('Fort Branch, Indiana');
  await expect(scorecard).toContainText('Blue');
  await expect(scorecard).toContainText('18 holes');
  await expect(scorecard).toContainText('Par 57');
  const scoreTable = scorecard.getByRole('region', {
    name: 'Hole-by-hole scores for Red Tail Ridge',
  });
  await expect(scoreTable).toBeVisible();
  for (const player of livePlayers) {
    const row = scoreTable.getByRole('row', {
      name: new RegExp(`${player.displayName}@${player.username}`, 'u'),
    });
    await expect(row).toBeVisible();
    const cells = (await row.locator('td').allTextContents()).map((cell) => cell.trim());
    expect(cells).toEqual([
      ...player.holeScores.map(String),
      String(player.totalScore),
      `+${player.toPar}`,
      player.position,
    ]);
  }

  await page.reload();
  await expect(scorecard).toBeVisible();
  await expect(scoreTable.getByRole('row', { name: /Dad@cchambruhs/u })).toContainText('59');

  await page.goto(new URL('/dashboard', origin).toString());
  await page.getByLabel('UDisc / CardCast URL').fill(liveScorecardUrl);
  await page.getByRole('button', { name: 'Submit Scorecard' }).click();
  await expect(page.locator('.ff-cardcast-live-status-duplicate')).toHaveText(duplicateMessage);
  expect(await prisma.importedScorecard.count({ where: { scorecardId: liveScorecardId } })).toBe(1);
});
