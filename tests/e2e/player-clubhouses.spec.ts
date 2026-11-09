import { randomUUID } from 'node:crypto';
import { type APIResponse, type BrowserContext, expect, type Page, test } from '@playwright/test';
// biome-ignore lint/style/noRestrictedImports: browser tests seed and inspect the test database directly.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

type TestPlayer = { id: string; name: string; email: string };

function holeScoresFor(totalScore: number): number[] {
  const scores = Array.from({ length: 18 }, () => 3);
  let difference = totalScore - 54;
  for (let index = 0; index < scores.length && difference !== 0; index += 1) {
    if (difference > 0) {
      scores[index] = (scores[index] ?? 3) + 1;
      difference -= 1;
    } else if ((scores[index] ?? 3) > 1) {
      scores[index] = (scores[index] ?? 3) - 1;
      difference += 1;
    }
  }
  if (difference !== 0) throw new Error('The fixture score cannot fit into an 18-hole round.');
  return scores;
}

async function seedCard(
  scorecardId: string,
  input: {
    courseName: string;
    playedOn: string;
    players: Array<{ username: string; displayName: string; score: number; position: string }>;
    importedByUserId?: string;
    clubhouseId?: string | null;
    finalizedAt?: Date | null;
  },
): Promise<void> {
  await prisma.importedScorecard.create({
    data: {
      scorecardId,
      sourceUrl: `https://udisc.com/scorecards/${scorecardId}`,
      fingerprint: `ff-e2e-${scorecardId}`,
      courseName: input.courseName,
      layoutName: '18 holes',
      playedOn: new Date(`${input.playedOn}T00:00:00.000Z`),
      holeCount: 18,
      totalPar: 54,
      pars: Array.from({ length: 18 }, () => 3),
      ...(input.importedByUserId ? { importedByUserId: input.importedByUserId } : {}),
      ...(input.clubhouseId !== undefined ? { clubhouseId: input.clubhouseId } : {}),
      ...(input.finalizedAt !== undefined ? { finalizedAt: input.finalizedAt } : {}),
      players: {
        create: input.players.map((player, sourceOrder) => ({
          sourceOrder,
          displayName: player.displayName,
          username: player.username,
          holeScores: holeScoresFor(player.score),
          totalScore: player.score,
          toPar: player.score - 54,
          position: player.position,
        })),
      },
    },
  });
}

async function signupApi(
  context: BrowserContext,
  origin: string,
  options: { name: string; username: string; mode?: 'claim' | 'create' },
): Promise<TestPlayer> {
  const email = `player-${randomUUID()}@example.test`;
  const password = `Friends-${randomUUID()}-Pass`;
  const headers = { origin };
  const choice = await context.request.post(
    new URL('/api/player-identity/registration-choice', origin).toString(),
    {
      headers,
      data: { email, username: options.username, mode: options.mode ?? 'create' },
    },
  );
  expect(choice.status(), await choice.text()).toBe(200);

  const signupUrl = new URL('/api/auth/sign-up/email', origin).toString();
  let response = await context.request.post(signupUrl, {
    headers,
    data: { name: options.name, email, password },
  });
  for (let attempt = 0; response.status() === 429 && attempt < 3; attempt += 1) {
    await new Promise((resolve) =>
      setTimeout(resolve, (Number(response.headers()['x-retry-after']) || 10) * 1000),
    );
    response = await context.request.post(signupUrl, {
      headers,
      data: { name: options.name, email, password },
    });
  }
  expect(response.status(), await response.text()).toBe(200);
  const session = await context.request.get(new URL('/api/auth/get-session', origin).toString(), {
    headers,
  });
  const sessionBody = (await session.json()) as { user?: TestPlayer };
  expect(sessionBody.user?.email).toBe(email);
  if (!sessionBody.user) throw new Error('Signup did not open an authenticated player session.');
  return sessionBody.user;
}

async function post(
  context: BrowserContext,
  origin: string,
  path: string,
  body: unknown,
): Promise<APIResponse> {
  return context.request.post(new URL(path, origin).toString(), {
    headers: { origin },
    data: body,
  });
}

async function visitSignup(
  page: Page,
  origin: string,
  name: string,
  email: string,
  password: string,
  username: string,
) {
  await page.goto(new URL('/signup', origin).toString());
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('UDisc username').fill(username);
  const identityChoice = page.getByRole('group', { name: 'Choose your player profile' });
  await identityChoice.getByRole('button', { name: 'Search' }).click();
  await identityChoice.getByRole('button', { name: 'Claim existing player' }).click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\?)/u);
  await expect(page.getByText(/Your UDisc claim is pending admin review/u)).toBeVisible();
}

test('identity claims, profile history, Clubhouses, selection and scorecard assignment persist with authorization', async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
  const runId = randomUUID().replaceAll('-', '').slice(0, 12);
  const username = `MixedPlayer${runId}`;
  const normalizedUsername = username.toLocaleLowerCase('en-US');
  const nearMatch = `${username}x`;
  const deniedUsername = `DenyPlayer${runId}`;
  const ids = {
    first: `identity-first-${runId}`,
    second: `identity-second-${runId}`,
    near: `identity-near-${runId}`,
    denied: `identity-denied-${runId}`,
    movable: `assignment-movable-${runId}`,
    finalized: `assignment-final-${runId}`,
    legacy: `assignment-legacy-${runId}`,
  };
  const emails: string[] = [];
  const contexts: BrowserContext[] = [page.context()];
  const clubhouseIds: string[] = [];
  let claimant: TestPlayer | null = null;
  let administrator: TestPlayer | null = null;

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await seedCard(ids.first, {
      courseName: `Historic A ${runId}`,
      playedOn: '2026-02-01',
      players: [
        {
          username: `@${username.toLocaleUpperCase('en-US')}`,
          displayName: 'Historical Thrower',
          score: 50,
          position: 'T1',
        },
        { username: nearMatch, displayName: 'Similar Username', score: 60, position: '2' },
      ],
    });
    await seedCard(ids.second, {
      courseName: `Historic B ${runId}`,
      playedOn: '2026-03-01',
      players: [
        {
          username: username.toLocaleLowerCase('en-US'),
          displayName: 'Historical Thrower',
          score: 56,
          position: 'T1',
        },
        { username: `guest-${runId}`, displayName: 'Round Guest', score: 62, position: '2' },
      ],
    });
    await seedCard(ids.near, {
      courseName: `Similar Match ${runId}`,
      playedOn: '2026-03-10',
      players: [{ username: nearMatch, displayName: 'Similar Username', score: 40, position: '1' }],
    });
    await seedCard(ids.denied, {
      courseName: `Claim Review ${runId}`,
      playedOn: '2026-04-01',
      players: [
        {
          username: deniedUsername.toLocaleUpperCase('en-US'),
          displayName: 'Claim Review Player',
          score: 61,
          position: '1',
        },
      ],
    });

    const claimantEmail = `claim-${runId}@example.test`;
    emails.push(claimantEmail);
    await visitSignup(
      page,
      origin,
      'Claiming Player',
      claimantEmail,
      `Claim-${runId}-Pass`,
      `@${username.toLocaleUpperCase('en-US')}`,
    );
    const claimantSession = await page.request.get(
      new URL('/api/auth/get-session', origin).toString(),
      { headers: { origin } },
    );
    claimant = ((await claimantSession.json()) as { user?: TestPlayer }).user ?? null;
    expect(claimant?.email).toBe(claimantEmail);
    if (!claimant) throw new Error('The claim signup did not return a session.');

    const identity = await prisma.uDiscIdentity.findUnique({ where: { normalizedUsername } });
    const claim = await prisma.playerClaim.findFirst({ where: { claimantUserId: claimant.id } });
    expect(identity?.pendingClaimUserId).toBe(claimant.id);
    expect(identity?.ownerUserId).toBeNull();
    expect(claim?.status).toBe('PENDING');
    const historicalRows = await prisma.importedScorecardPlayer.findMany({
      where: { scorecard: { scorecardId: { in: [ids.first, ids.second] } } },
    });
    expect(historicalRows.filter((row) => row.identityId === identity?.id)).toHaveLength(0);
    const unauthorizedClaimList = await page.request.get(
      new URL('/api/admin/player-claims', origin).toString(),
      { headers: { origin } },
    );
    expect(unauthorizedClaimList.status()).toBe(403);
    const unauthorizedReview = await post(page.context(), origin, '/api/admin/player-claims', {
      claimId: claim?.id,
      decision: 'approve',
    });
    expect(unauthorizedReview.status()).toBe(403);

    const duplicateClaim = await post(
      page.context(),
      origin,
      '/api/player-identity/registration-choice',
      {
        email: `duplicate-${runId}@example.test`,
        username,
        mode: 'claim',
      },
    );
    expect(duplicateClaim.status()).toBe(409);

    const adminContext = await browser.newContext();
    contexts.push(adminContext);
    administrator = await signupApi(adminContext, origin, {
      name: 'Clubhouse Administrator',
      username: `administrator-${runId}`,
    });
    emails.push(administrator.email);
    await prisma.user.update({
      where: { id: administrator.id },
      data: { role: 'admin', emailVerified: true },
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(new URL('/admin/player-claims', origin).toString());
    await expect(adminPage.getByRole('heading', { name: 'Player claims' })).toBeVisible();
    await expect(adminPage.getByText(`@${normalizedUsername}`)).toBeVisible();
    await adminPage.getByRole('button', { name: 'Approve claim' }).click();
    await expect(adminPage.getByText('No claims are waiting for review.')).toBeVisible();

    const approved = await prisma.uDiscIdentity.findUnique({ where: { normalizedUsername } });
    const reviewedClaim = await prisma.playerClaim.findUnique({ where: { id: claim?.id ?? '' } });
    expect(approved?.ownerUserId).toBe(claimant.id);
    expect(approved?.pendingClaimUserId).toBeNull();
    expect(reviewedClaim?.status).toBe('APPROVED');
    expect(reviewedClaim?.reviewedByUserId).toBe(administrator.id);
    const linkedRows = await prisma.importedScorecardPlayer.findMany({
      where: { scorecard: { scorecardId: { in: [ids.first, ids.second, ids.near] } } },
    });
    expect(
      linkedRows
        .filter(
          (row) =>
            row.username !== null &&
            row.username.toLocaleLowerCase('en-US').replace(/^@/u, '') === normalizedUsername,
        )
        .every((row) => row.identityId === approved?.id),
    ).toBe(true);
    expect(linkedRows.find((row) => row.username === nearMatch)?.identityId).toBeNull();

    const publicProfileResponse = await page.request.get(
      new URL(`/api/players/user/${claimant.id}`, origin).toString(),
    );
    expect(publicProfileResponse.status()).toBe(200);
    const publicProfile = (await publicProfileResponse.json()) as {
      profile: {
        statistics: {
          lifetimeRounds: number;
          wins: number | null;
          averageScore: number | null;
          bestScore: number | null;
          savedCourseRecords: number;
        };
        rounds: Array<{ scorecardId: string }>;
      };
    };
    expect(publicProfile.profile.statistics).toEqual({
      lifetimeRounds: 2,
      wins: 2,
      averageScore: 53,
      bestScore: 50,
      bestPlacement: 1,
      roundsWithPlacement: 2,
      savedCourseRecords: 2,
    });
    expect(publicProfile.profile.rounds.map((round) => round.scorecardId).sort()).toEqual(
      [ids.first, ids.second].sort(),
    );
    await page.goto(new URL(`/players/udisc/${encodeURIComponent(username)}`, origin).toString());
    await expect(page.getByRole('heading', { name: 'Claiming Player' })).toBeVisible();
    await expect(page.getByText('Lifetime rounds').locator('..')).toContainText('2');
    const profileScorecard = page.locator('.ff-public-round-details').first();
    await profileScorecard.locator('summary').click();
    await expect(
      profileScorecard.getByRole('link', { name: 'Historical Thrower' }),
    ).toHaveAttribute(
      'href',
      new RegExp(`/players/udisc/%40${username.toLocaleUpperCase('en-US')}$`, 'u'),
    );

    const ownerClubA = await post(page.context(), origin, '/api/clubhouses', {
      name: `Oak Flight ${runId}`,
    });
    expect(ownerClubA.status()).toBe(201);
    const clubA = (await ownerClubA.json()) as { clubhouseId: string };
    clubhouseIds.push(clubA.clubhouseId);
    const clubARecord = await prisma.clubhouse.findUnique({ where: { id: clubA.clubhouseId } });
    expect(
      await prisma.clubhouseMembership.findUnique({
        where: { clubhouseId_userId: { clubhouseId: clubA.clubhouseId, userId: claimant.id } },
      }),
    ).toMatchObject({ role: 'OWNER' });

    const ownerClubB = await post(page.context(), origin, '/api/clubhouses', {
      name: `Pine Flight ${runId}`,
    });
    expect(ownerClubB.status()).toBe(201);
    const clubB = (await ownerClubB.json()) as { clubhouseId: string };
    clubhouseIds.push(clubB.clubhouseId);
    const clubBRecord = await prisma.clubhouse.findUnique({ where: { id: clubB.clubhouseId } });
    expect(clubBRecord?.id).toBe(clubB.clubhouseId);

    const inviteContext = await browser.newContext();
    contexts.push(inviteContext);
    const invitePlayer = await signupApi(inviteContext, origin, {
      name: 'Invite Player',
      username: `invite-${runId}`,
    });
    emails.push(invitePlayer.email);
    const invitePage = await inviteContext.newPage();
    await invitePage.goto(
      new URL(`/clubhouses/join/${clubARecord?.inviteToken}`, origin).toString(),
    );
    await expect(invitePage.getByRole('heading', { name: 'Play with this crew.' })).toBeVisible();
    await invitePage.getByRole('button', { name: 'Join this Clubhouse' }).click();
    await expect(invitePage).toHaveURL(
      new RegExp(`/dashboard/clubhouses/${clubA.clubhouseId}$`, 'u'),
    );
    const inviteMembership = await prisma.clubhouseMembership.findUnique({
      where: { clubhouseId_userId: { clubhouseId: clubA.clubhouseId, userId: invitePlayer.id } },
    });
    expect(inviteMembership?.role).toBe('MEMBER');

    const joinByCode = await post(inviteContext, origin, '/api/clubhouses/join', {
      kind: 'code',
      value: clubBRecord?.joinCode,
    });
    expect(joinByCode.status()).toBe(201);
    expect(
      await prisma.clubhouseMembership.count({
        where: {
          userId: invitePlayer.id,
          clubhouseId: { in: [clubA.clubhouseId, clubB.clubhouseId] },
        },
      }),
    ).toBe(2);
    expect(
      await prisma.userClubhouseSelection.findUnique({ where: { userId: invitePlayer.id } }),
    ).toMatchObject({ clubhouseId: clubA.clubhouseId });

    const requesterContext = await browser.newContext();
    contexts.push(requesterContext);
    const requester = await signupApi(requesterContext, origin, {
      name: 'Request Player',
      username: `request-${runId}`,
    });
    emails.push(requester.email);
    const joinRequest = await post(requesterContext, origin, '/api/clubhouses/join', {
      kind: 'request',
      clubhouseId: clubA.clubhouseId,
    });
    expect(joinRequest.status()).toBe(201);
    const requestBody = (await joinRequest.json()) as { requestId: string };
    const claimantIdentityState = await page.request.get(
      new URL('/api/player-identity', origin).toString(),
      { headers: { origin } },
    );
    expect(claimantIdentityState.status()).toBe(200);
    expect(
      (await claimantIdentityState.json()) as { identity: { status: string } | null },
    ).toMatchObject({ identity: { status: 'verified' } });
    await page.goto(new URL(`/dashboard/clubhouses/${clubA.clubhouseId}`, origin).toString());
    await expect(page.getByRole('heading', { name: `Oak Flight ${runId}` })).toBeVisible();
    await expect(page.getByText('Request Player')).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.locator('output')).toContainText('Membership approved.');
    await expect
      .poll(
        async () =>
          (await prisma.clubhouseJoinRequest.findUnique({ where: { id: requestBody.requestId } }))
            ?.status,
      )
      .toBe('APPROVED');
    expect(
      await prisma.clubhouseJoinRequest.findUnique({ where: { id: requestBody.requestId } }),
    ).toMatchObject({ status: 'APPROVED', reviewedByUserId: claimant.id });
    expect(
      await prisma.clubhouseMembership.findUnique({
        where: { clubhouseId_userId: { clubhouseId: clubA.clubhouseId, userId: requester.id } },
      }),
    ).toMatchObject({ role: 'MEMBER' });

    const deniedRequest = await post(requesterContext, origin, '/api/clubhouses/join', {
      kind: 'request',
      clubhouseId: clubB.clubhouseId,
    });
    expect(deniedRequest.status()).toBe(201);
    const deniedRequestBody = (await deniedRequest.json()) as { requestId: string };
    const denyAction = await post(
      page.context(),
      origin,
      `/api/clubhouses/${clubB.clubhouseId}/members`,
      { action: 'deny-request', requestId: deniedRequestBody.requestId },
    );
    expect(denyAction.status()).toBe(200);
    expect(
      await prisma.clubhouseJoinRequest.findUnique({ where: { id: deniedRequestBody.requestId } }),
    ).toMatchObject({ status: 'DENIED', reviewedByUserId: claimant.id });
    expect(
      await prisma.clubhouseMembership.findUnique({
        where: { clubhouseId_userId: { clubhouseId: clubB.clubhouseId, userId: requester.id } },
      }),
    ).toBeNull();

    const promoteInvite = await post(
      page.context(),
      origin,
      `/api/clubhouses/${clubA.clubhouseId}/members`,
      { action: 'set-role', userId: invitePlayer.id, role: 'Admin' },
    );
    expect(promoteInvite.status()).toBe(200);
    const adminCannotPromote = await post(
      inviteContext,
      origin,
      `/api/clubhouses/${clubA.clubhouseId}/members`,
      { action: 'set-role', userId: requester.id, role: 'Admin' },
    );
    expect(adminCannotPromote.status()).toBe(403);
    const adminCannotRemoveOwner = await post(
      inviteContext,
      origin,
      `/api/clubhouses/${clubA.clubhouseId}/members`,
      { action: 'remove-member', userId: claimant.id },
    );
    expect(adminCannotRemoveOwner.status()).toBe(403);
    expect(
      await prisma.clubhouseMembership.findUnique({
        where: { clubhouseId_userId: { clubhouseId: clubA.clubhouseId, userId: invitePlayer.id } },
      }),
    ).toMatchObject({ role: 'ADMIN' });

    const activeA = await post(page.context(), origin, '/api/clubhouses/select', {
      clubhouseId: clubA.clubhouseId,
    });
    expect(activeA.status()).toBe(200);
    expect(
      await prisma.userClubhouseSelection.findUnique({ where: { userId: claimant.id } }),
    ).toMatchObject({ clubhouseId: clubA.clubhouseId });
    const notMember = await post(page.context(), origin, '/api/clubhouses/select', {
      clubhouseId: 'not-a-member-house',
    });
    expect(notMember.status()).toBe(403);
    const activeB = await post(page.context(), origin, '/api/clubhouses/select', {
      clubhouseId: clubB.clubhouseId,
    });
    expect(activeB.status()).toBe(200);
    const persistedSelection = await page.request.get(
      new URL('/api/clubhouses', origin).toString(),
      { headers: { origin } },
    );
    expect(
      ((await persistedSelection.json()) as { activeClubhouseId: string }).activeClubhouseId,
    ).toBe(clubB.clubhouseId);
    const profileAfterSelection = await page.request.get(
      new URL(`/api/players/user/${claimant.id}`, origin).toString(),
    );
    expect(
      ((await profileAfterSelection.json()) as typeof publicProfile).profile.statistics,
    ).toEqual(publicProfile.profile.statistics);

    const administratorHouse = await post(
      (administrator ? contexts[1] : undefined) ?? page.context(),
      origin,
      '/api/clubhouses',
      { name: `Admin House ${runId}` },
    );
    expect(administratorHouse.status()).toBe(201);
    const adminHouse = (await administratorHouse.json()) as { clubhouseId: string };
    clubhouseIds.push(adminHouse.clubhouseId);
    const outsiderSelection = await post(page.context(), origin, '/api/clubhouses/select', {
      clubhouseId: adminHouse.clubhouseId,
    });
    expect(outsiderSelection.status()).toBe(403);

    await seedCard(ids.movable, {
      courseName: `Assignment ${runId}`,
      playedOn: '2026-05-01',
      importedByUserId: claimant.id,
      clubhouseId: clubA.clubhouseId,
      players: [
        {
          username: `unrelated-${runId}`,
          displayName: 'Unrelated Player',
          score: 60,
          position: '1',
        },
      ],
    });
    await seedCard(ids.finalized, {
      courseName: `Finalized ${runId}`,
      playedOn: '2026-05-02',
      importedByUserId: claimant.id,
      clubhouseId: clubA.clubhouseId,
      finalizedAt: new Date('2026-05-03T00:00:00.000Z'),
      players: [
        {
          username: `finalized-${runId}`,
          displayName: 'Finalized Player',
          score: 61,
          position: '1',
        },
      ],
    });
    await seedCard(ids.legacy, {
      courseName: `Legacy ${runId}`,
      playedOn: '2026-01-01',
      players: [
        { username: `legacy-${runId}`, displayName: 'Legacy Player', score: 63, position: '1' },
      ],
    });
    const movable = await prisma.importedScorecard.findUnique({
      where: { scorecardId: ids.movable },
    });
    const movablePatch = await page.request.patch(
      new URL(`/api/udisc-scorecards/${movable?.id}/clubhouse`, origin).toString(),
      { headers: { origin }, data: { clubhouseId: clubB.clubhouseId } },
    );
    expect(movablePatch.status()).toBe(200);
    const outsiderPatch = await requesterContext.request.patch(
      new URL(`/api/udisc-scorecards/${movable?.id}/clubhouse`, origin).toString(),
      { headers: { origin }, data: { clubhouseId: clubB.clubhouseId } },
    );
    expect(outsiderPatch.status()).toBe(403);
    const finalized = await prisma.importedScorecard.findUnique({
      where: { scorecardId: ids.finalized },
    });
    const blockedFinalizedPatch = await page.request.patch(
      new URL(`/api/udisc-scorecards/${finalized?.id}/clubhouse`, origin).toString(),
      { headers: { origin }, data: { clubhouseId: clubB.clubhouseId } },
    );
    expect(blockedFinalizedPatch.status()).toBe(403);
    const adminPatchFinalized = await adminContext.request.patch(
      new URL(`/api/udisc-scorecards/${finalized?.id}/clubhouse`, origin).toString(),
      { headers: { origin }, data: { clubhouseId: adminHouse.clubhouseId } },
    );
    expect(adminPatchFinalized.status()).toBe(200);
    const legacy = await prisma.importedScorecard.findUnique({
      where: { scorecardId: ids.legacy },
    });
    const adminLegacyQueue = await adminContext.request.get(
      new URL('/api/admin/legacy-scorecards', origin).toString(),
      { headers: { origin } },
    );
    expect(adminLegacyQueue.status()).toBe(200);
    const adminPatchLegacy = await adminContext.request.patch(
      new URL(`/api/udisc-scorecards/${legacy?.id}/clubhouse`, origin).toString(),
      { headers: { origin }, data: { clubhouseId: adminHouse.clubhouseId } },
    );
    expect(adminPatchLegacy.status()).toBe(200);
    const auditResponse = await page.request.get(
      new URL(`/api/udisc-scorecards/${movable?.id}/assignment-history`, origin).toString(),
      { headers: { origin } },
    );
    expect(auditResponse.status()).toBe(200);
    const audit = (await auditResponse.json()) as {
      items: Array<{
        oldClubhouseName: string;
        newClubhouseName: string;
        actorName: string;
        changedAt: string;
      }>;
    };
    expect(audit.items[0]).toMatchObject({
      oldClubhouseName: `Oak Flight ${runId}`,
      newClubhouseName: `Pine Flight ${runId}`,
      actorName: 'Claiming Player',
    });
    expect(Number.isNaN(Date.parse(audit.items[0]?.changedAt ?? ''))).toBe(false);
    expect(
      await prisma.scorecardAssignmentAudit.count({ where: { scorecardId: movable?.id } }),
    ).toBe(1);
    expect(await prisma.importedScorecard.count({ where: { scorecardId: ids.movable } })).toBe(1);
    expect(
      await prisma.importedScorecard.findUnique({
        where: { scorecardId: ids.movable },
        select: { clubhouseId: true, sourceUrl: true },
      }),
    ).toMatchObject({
      clubhouseId: clubB.clubhouseId,
      sourceUrl: `https://udisc.com/scorecards/${ids.movable}`,
    });
    expect(
      await prisma.importedScorecard.findUnique({
        where: { scorecardId: ids.finalized },
        select: { clubhouseId: true, finalizedAt: true },
      }),
    ).toMatchObject({
      clubhouseId: adminHouse.clubhouseId,
      finalizedAt: new Date('2026-05-03T00:00:00.000Z'),
    });

    const adminListClaims = await adminContext.request.get(
      new URL('/api/admin/player-claims', origin).toString(),
      { headers: { origin } },
    );
    expect(adminListClaims.status()).toBe(200);
    const deniedContext = await browser.newContext();
    contexts.push(deniedContext);
    const deniedPlayer = await signupApi(deniedContext, origin, {
      name: 'Denied Claim Player',
      username: deniedUsername,
      mode: 'claim',
    });
    emails.push(deniedPlayer.email);
    const deniedClaim = await prisma.playerClaim.findFirst({
      where: { claimantUserId: deniedPlayer.id },
    });
    expect(deniedClaim?.status).toBe('PENDING');
    const denyClaimResult = await post(adminContext, origin, '/api/admin/player-claims', {
      claimId: deniedClaim?.id,
      decision: 'deny',
    });
    expect(denyClaimResult.status()).toBe(200);
    expect(
      await prisma.playerClaim.findUnique({ where: { id: deniedClaim?.id ?? '' } }),
    ).toMatchObject({ status: 'DENIED', reviewedByUserId: administrator.id });
    expect(
      await prisma.uDiscIdentity.findUnique({
        where: { normalizedUsername: deniedUsername.toLocaleLowerCase('en-US') },
      }),
    ).toMatchObject({ ownerUserId: null, pendingClaimUserId: null });
    const deniedEntry = await prisma.importedScorecardPlayer.findFirst({
      where: { username: deniedUsername.toLocaleUpperCase('en-US') },
    });
    expect(deniedEntry?.identityId).toBeNull();
  } finally {
    const scorecardIds = Object.values(ids);
    await prisma.importedScorecard.deleteMany({ where: { scorecardId: { in: scorecardIds } } });
    await prisma.clubhouse.deleteMany({ where: { id: { in: clubhouseIds } } });
    await prisma.playerRegistrationChoice.deleteMany({ where: { email: { in: emails } } });
    if (claimant) {
      await prisma.playerClaim.deleteMany({ where: { claimantUserId: claimant.id } });
      await prisma.playerProfile.deleteMany({ where: { userId: claimant.id } });
      await prisma.clubhouseMembership.deleteMany({ where: { userId: claimant.id } });
      await prisma.userClubhouseSelection.deleteMany({ where: { userId: claimant.id } });
    }
    if (administrator) {
      await prisma.playerProfile.deleteMany({ where: { userId: administrator.id } });
      await prisma.clubhouseMembership.deleteMany({ where: { userId: administrator.id } });
      await prisma.userClubhouseSelection.deleteMany({ where: { userId: administrator.id } });
    }
    const testUsers = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const testUserIds = testUsers.map((user) => user.id);
    await prisma.playerClaim.deleteMany({ where: { claimantUserId: { in: testUserIds } } });
    await prisma.playerProfile.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    const identities = await prisma.uDiscIdentity.findMany({
      where: {
        normalizedUsername: {
          in: [
            normalizedUsername,
            nearMatch.toLocaleLowerCase('en-US'),
            deniedUsername.toLocaleLowerCase('en-US'),
            `administrator-${runId}`,
            `invite-${runId}`,
            `request-${runId}`,
          ],
        },
      },
      select: { id: true },
    });
    await prisma.playerClaim.deleteMany({
      where: { identityId: { in: identities.map((item) => item.id) } },
    });
    await prisma.uDiscIdentity.deleteMany({
      where: { id: { in: identities.map((item) => item.id) } },
    });
    await Promise.all(contexts.slice(1).map((context) => context.close()));
  }
});
