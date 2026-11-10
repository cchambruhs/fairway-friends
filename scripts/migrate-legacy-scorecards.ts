// Migrates scorecards exported from the legacy ChatGPT Fairway Friends site into this database,
// and finishes any player claims left pending from before instant claiming.
//
//   npm run migrate:legacy -- --source path/to/data.json            (dry run, nothing saved)
//   npm run migrate:legacy -- --source path/to/data.json --commit   (saves)
//
// Options: --report <dir> (default ./migration-reports). Needs DATABASE_URL.
//
// Safety:
// - Every card goes through the same validation and the same write path as a live CardCast
//   import (persistImportedScorecard), so duplicates by UDisc id, link or score fingerprint
//   are linked, never re-created, and players are matched by UDisc username only.
// - The whole run is one transaction. A dry run rolls it back at the end; a failure rolls
//   everything back. Re-running a committed migration is safe: every card reports "existing".
// - After a commit, every migrated card is read back and its players counted.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// biome-ignore lint/style/noRestrictedImports: a one-off CLI migration, not app code; it needs its own client.
import { PrismaClient } from '@prisma/client';
import {
  convertLegacyChatGptRound,
  legacyRoundsFrom,
} from '../src/lib/business/legacy-chatgpt-scorecard';
import { persistImportedScorecard } from '../src/lib/business/persist-imported-scorecard.server';
import { linkIdentityHistory, SELF_CLAIM_NOTE } from '../src/lib/business/player-identity.server';

type Outcome =
  | { id: string; course: string | null; date: string | null; status: 'created' | 'existing' }
  | { id: string; status: 'rejected'; reason: string };

class DryRunRollback extends Error {}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const source = argument('--source');
  if (!source) throw new Error('Pass --source <path to the legacy /api/data JSON or seed.json>.');
  const commit = process.argv.includes('--commit');
  const reportDir = resolve(argument('--report') ?? 'migration-reports');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

  const rounds = legacyRoundsFrom(JSON.parse(readFileSync(resolve(source), 'utf8')));
  const prisma = new PrismaClient();
  const outcomes: Outcome[] = [];
  const claimsFinished: string[] = [];
  const claimsSkipped: Array<{ identity: string; reason: string }> = [];
  const before = await prisma.importedScorecard.count({ where: { deletedAt: null } });

  try {
    await prisma.$transaction(
      async (transaction) => {
        for (const round of rounds) {
          const converted = convertLegacyChatGptRound(round);
          if (!converted.ok) {
            outcomes.push({ id: converted.id, status: 'rejected', reason: converted.reason });
            continue;
          }
          const saved = await persistImportedScorecard(transaction, {
            card: converted.card,
            importedByUserId: null,
          });
          outcomes.push({
            id: converted.card.scorecardId,
            course: converted.card.courseName,
            date: converted.card.playedOn,
            status: saved.status === 'created' ? 'created' : 'existing',
          });
        }

        // Owner decision: unclaimed players may be claimed without admin review.
        const pending = await transaction.uDiscIdentity.findMany({
          where: { ownerUserId: null, pendingClaimUserId: { not: null } },
          select: { id: true, normalizedUsername: true, pendingClaimUserId: true },
        });
        for (const identity of pending) {
          const claimant = identity.pendingClaimUserId;
          if (!claimant) continue;
          const ownsAnother = await transaction.uDiscIdentity.findUnique({
            where: { ownerUserId: claimant },
            select: { id: true },
          });
          if (ownsAnother) {
            claimsSkipped.push({
              identity: identity.normalizedUsername,
              reason: 'Claimant already owns a different player.',
            });
            continue;
          }
          await transaction.uDiscIdentity.update({
            where: { id: identity.id },
            data: { ownerUserId: claimant, pendingClaimUserId: null },
          });
          await transaction.playerClaim.updateMany({
            where: { identityId: identity.id, claimantUserId: claimant, status: 'PENDING' },
            data: { status: 'APPROVED', reviewedAt: new Date(), reviewNote: SELF_CLAIM_NOTE },
          });
          await linkIdentityHistory(transaction, identity.id, identity.normalizedUsername);
          claimsFinished.push(identity.normalizedUsername);
        }

        if (!commit) throw new DryRunRollback();
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }

  // Read back every card that should now exist.
  const readBackFailures: string[] = [];
  if (commit) {
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') continue;
      const row = await prisma.importedScorecard.findUnique({
        where: { scorecardId: outcome.id },
        select: { _count: { select: { players: true } } },
      });
      const expected = rounds.find((round) => round.id === outcome.id)?.players.length ?? 0;
      if (!row) readBackFailures.push(`${outcome.id}: not found after save`);
      else if (outcome.status === 'created' && row._count.players !== expected)
        readBackFailures.push(
          `${outcome.id}: ${row._count.players} players saved, expected ${expected}`,
        );
    }
  }
  const after = await prisma.importedScorecard.count({ where: { deletedAt: null } });
  await prisma.$disconnect();

  const count = (status: Outcome['status']) => outcomes.filter((o) => o.status === status).length;
  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    source: resolve(source),
    ranAt: new Date().toISOString(),
    sourceCards: rounds.length,
    created: count('created'),
    alreadyInDatabase: count('existing'),
    rejected: count('rejected'),
    scorecardsBefore: before,
    scorecardsAfter: after,
    claimsFinished,
    claimsSkipped,
    readBackFailures,
  };

  mkdirSync(reportDir, { recursive: true });
  const stamp = summary.ranAt.replace(/[:.]/g, '-');
  const base = join(reportDir, `legacy-migration-${summary.mode}-${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify({ summary, outcomes }, null, 2));
  const lines = [
    `# Legacy scorecard migration (${summary.mode})`,
    '',
    `Run at ${summary.ranAt} from \`${summary.source}\`.`,
    '',
    '| Result | Cards |',
    '| --- | --- |',
    `| In source file | ${summary.sourceCards} |`,
    `| Newly added | ${summary.created} |`,
    `| Already in database | ${summary.alreadyInDatabase} |`,
    `| Rejected | ${summary.rejected} |`,
    `| Scorecards in database before → after | ${before} → ${after} |`,
    '',
    `Pending player claims finished: ${claimsFinished.length ? claimsFinished.map((u) => `@${u}`).join(', ') : 'none'}.`,
    ...(claimsSkipped.length
      ? ['', 'Claims not finished:', ...claimsSkipped.map((c) => `- @${c.identity}: ${c.reason}`)]
      : []),
    ...(readBackFailures.length
      ? ['', '**Read-back failures:**', ...readBackFailures.map((f) => `- ${f}`)]
      : commit
        ? ['', 'Every saved card was read back successfully.']
        : ['', 'Dry run: nothing was saved.']),
    '',
    '## Cards',
    '',
    '| UDisc id | Course | Date | Result |',
    '| --- | --- | --- | --- |',
    ...outcomes.map((o) =>
      o.status === 'rejected'
        ? `| ${o.id} | | | rejected: ${o.reason} |`
        : `| ${o.id} | ${o.course ?? ''} | ${o.date ?? ''} | ${o.status} |`,
    ),
  ];
  writeFileSync(`${base}.md`, `${lines.join('\n')}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}
`);
  process.stdout.write(`Report: ${base}.md
`);
  if (readBackFailures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
