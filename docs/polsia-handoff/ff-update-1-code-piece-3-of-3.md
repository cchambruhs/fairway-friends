> **Fairway Friends update, part 1 (code): piece 3 of 3.** Do not apply anything until you have received all 3 pieces in this chat; then apply them together, following the ground rules in piece 1.

### `src/app/(setup)/page.tsx` — patch

```diff
--- a/src/app/(setup)/page.tsx
+++ b/src/app/(setup)/page.tsx
@@ -1,6 +1,6 @@
 // @polsia:user-owned — Fairway Friends public homepage.
 
-import { ArrowRight, ArrowUpRight, Disc3, MapPin, UserRound } from 'lucide-react';
+import { ArrowRight, Disc3, MapPin, UserRound } from 'lucide-react';
 import type { Metadata } from 'next';
 import Image from 'next/image';
 import Link from 'next/link';
@@ -11,7 +11,8 @@
 import { siteDescription, siteName } from '@/lib/brand';
 import './fairway-landing.css';
 
-const clubhouseUrl = 'https://fairway-friends-caleb.cchambruhs.chatgpt.site/';
+// Clubhouse lives in this app; never link to the legacy ChatGPT site (PRD v4 §2).
+const clubhouseUrl = '/dashboard/clubhouses';
 
 export const metadata: Metadata = {
   title: { absolute: `${siteName} | Disc Golf Player Profiles` },
@@ -68,8 +69,8 @@
               <AuthNav presentation="standard" />
             </div>
             <Button asChild className="ff-header-clubhouse">
-              <Link href={clubhouseUrl} target="_blank" rel="noreferrer">
-                Clubhouse <ArrowUpRight size={15} aria-hidden="true" />
+              <Link href={clubhouseUrl}>
+                Clubhouse <ArrowRight size={15} aria-hidden="true" />
               </Link>
             </Button>
             <ThemeToggle className="ff-theme-toggle" />
@@ -81,8 +82,8 @@
           <Link href="/statistics">Statistics</Link>
           <a href="#get-started">Get started</a>
           <Button asChild className="ff-mobile-clubhouse">
-            <Link href={clubhouseUrl} target="_blank" rel="noreferrer">
-              Clubhouse <ArrowUpRight size={14} aria-hidden="true" />
+            <Link href={clubhouseUrl}>
+              Clubhouse <ArrowRight size={14} aria-hidden="true" />
             </Link>
           </Button>
         </nav>
@@ -107,8 +108,8 @@
               </p>
               <div className="ff-hero-actions">
                 <Button asChild className="ff-button ff-button-primary">
-                  <Link href={clubhouseUrl} target="_blank" rel="noreferrer">
-                    Enter the clubhouse <ArrowUpRight size={16} aria-hidden="true" />
+                  <Link href={clubhouseUrl}>
+                    Enter the clubhouse <ArrowRight size={16} aria-hidden="true" />
                   </Link>
                 </Button>
                 <Button asChild variant="outline" className="ff-button ff-button-secondary">
@@ -181,9 +182,7 @@
                 </Link>
               </Button>
               <Button asChild variant="outline" className="ff-button ff-button-secondary">
-                <Link href={clubhouseUrl} target="_blank" rel="noreferrer">
-                  Open the clubhouse
-                </Link>
+                <Link href={clubhouseUrl}>Open the clubhouse</Link>
               </Button>
             </div>
           </div>
```

### `src/app/(dashboard)/dashboard/profile/import-history/page.tsx` — full file

```tsx
// @polsia:user-owned — signed-in historical UDisc CSV import workspace (JSON entry removed per PRD v4 §3).
import type { Metadata } from 'next';
import { UDiscExportImport } from '@/components/custom/udisc-export-import';

export const metadata: Metadata = {
  title: 'Import history',
  description: 'Import historical UDisc CSV exports into Fairway Friends.',
};

export default function ImportHistoryPage() {
  return (
    <div className="ff-rounds-page">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">PROFILE · IMPORT HISTORY</p>
        <h1>Import history</h1>
        <p>Review and add historical UDisc CSV exports.</p>
      </header>
      <section id="csv-import" aria-label="UDisc CSV import">
        <UDiscExportImport initialSourceUrl="" />
      </section>
    </div>
  );
}
```

### `src/components/custom/account-experience.tsx` — patch

```diff
--- a/src/components/custom/account-experience.tsx
+++ b/src/components/custom/account-experience.tsx
@@ -5,6 +5,7 @@
 import { useRouter } from 'next/navigation';
 import { useEffect, useState } from 'react';
 import { toast } from 'sonner';
+import { AccountPublicNamePrivacy } from '@/components/custom/account-public-name-privacy';
 import { AccountThemePreference } from '@/components/custom/account-theme-preference';
 import { Button } from '@/components/ui/button';
 import { authClient, signOut, useIsAdmin, useSession } from '@/lib/auth-client';
@@ -79,6 +80,7 @@
           </div>
         </dl>
         <AccountThemePreference />
+        <AccountPublicNamePrivacy />
         {ownerMode ? (
           <section className="ff-profile-security" aria-labelledby="owner-security-title">
             <div>
```

### `src/components/custom/cardcast-import-form.tsx` — patch

```diff
--- a/src/components/custom/cardcast-import-form.tsx
+++ b/src/components/custom/cardcast-import-form.tsx
@@ -1,9 +1,10 @@
-// @polsia:user-owned — compact signed-in UDisc importer with optional JSON and CSV tools.
+// @polsia:user-owned — compact signed-in UDisc importer; CSV is an optional fallback (PRD v4 §3).
 'use client';
 
 import { Link2, LoaderCircle } from 'lucide-react';
 import Link from 'next/link';
 import { type FormEvent, useCallback, useEffect, useState } from 'react';
+import { UDiscExportImport } from '@/components/custom/udisc-export-import';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { apiFetch } from '@/lib/api-client';
@@ -201,7 +202,7 @@
             value={clubhouseIds.length ? clubhouseIds : ['personal']}
             size={Math.min(4, Math.max(2, clubhouses.length + 1))}
           >
-            <option value="personal">Personal only</option>
+            <option value="personal">No Clubhouse</option>
             {clubhouses.map((clubhouse) => (
               <option key={clubhouse.id} value={clubhouse.id}>
                 {clubhouse.name}
@@ -228,7 +229,9 @@
             </div>
           ) : null}
           {!destinationsLoading && !destinationsError && clubhouses.length === 0 ? (
-            <p className="ff-cardcast-hint">No memberships yet. This round will stay personal.</p>
+            <p className="ff-cardcast-hint">
+              No Clubhouse memberships yet. The round still goes into the public Complete History.
+            </p>
           ) : null}
         </div>
         <Button
@@ -266,9 +269,12 @@
         </p>
       ) : null}
 
-      <p className="ff-cardcast-alternatives">
-        <Link href="/dashboard/profile/import-history#csv-import">or paste a CSV instead</Link>
-      </p>
+      <details className="ff-cardcast-alternatives">
+        <summary>or paste a CSV instead</summary>
+        <div className="mt-3">
+          <UDiscExportImport initialSourceUrl="" />
+        </div>
+      </details>
     </section>
   );
 }
```

### `src/components/custom/dashboard/league-workspace.tsx` — patch

```diff
--- a/src/components/custom/dashboard/league-workspace.tsx
+++ b/src/components/custom/dashboard/league-workspace.tsx
@@ -831,14 +831,16 @@
                       <th>Player</th>
                       <th>Points</th>
                       <th>Wins</th>
+                      <th>2nds</th>
+                      <th>Avg place</th>
                       <th>Rounds</th>
                       <th>Avg to par</th>
                     </tr>
                   </thead>
                   <tbody>
-                    {league.standings.map((standing, index) => (
+                    {league.standings.map((standing) => (
                       <tr key={standing.playerKey}>
-                        <td>{index + 1}</td>
+                        <td>{standing.rank}</td>
                         <th scope="row">
                           {standing.userId ? (
                             <Link href={`/players/user/${encodeURIComponent(standing.userId)}`}>
@@ -848,8 +850,12 @@
                             standing.displayName
                           )}
                         </th>
-                        <td>{standing.points.toFixed(1)}</td>
+                        <td>{standing.points.toFixed(2)}</td>
                         <td>{standing.wins}</td>
+                        <td>{standing.seconds}</td>
+                        <td>
+                          {standing.averagePlace === null ? '—' : standing.averagePlace.toFixed(2)}
+                        </td>
                         <td>{standing.rounds}</td>
                         <td>
                           {standing.averageToPar === null
@@ -872,12 +878,14 @@
               <p className="ff-league-hint">
                 Fixed points by place:{' '}
                 {(settings?.fixedPoints ?? [...DEFAULT_FIXED_POINTS]).join(' / ')}. Tied players
-                split the average for the occupied places.
+                split the average for the occupied places. After the last listed place, each place
+                earns one fewer point (minimum 1).
               </p>
             ) : (
               <p className="ff-league-hint">
-                Field-size points are 100 × (N − R + 1) / N; tied players split the average for
-                their occupied places.
+                Field-size points are 25 × (N − P) / (N − 1), where N is the number of finishers and
+                P the place; a one-player round earns 25. Tied players split the average for their
+                occupied places.
               </p>
             )}
           </section>
```

### `src/components/custom/dashboard/player-identity-gate.tsx` — patch

```diff
--- a/src/components/custom/dashboard/player-identity-gate.tsx
+++ b/src/components/custom/dashboard/player-identity-gate.tsx
@@ -92,8 +92,8 @@
         <p className="ff-player-profile-kicker">PLAYER SETUP</p>
         <h1 className="text-2xl font-semibold">Choose your player profile, {displayName}</h1>
         <p className="mt-2 text-sm text-muted-foreground">
-          This choice is required before the workspace opens. Existing UDisc records need an app
-          admin’s approval before they are linked to your account.
+          This choice is required before the workspace opens. Claiming an unclaimed UDisc player
+          links all of its saved scorecards to your account immediately.
         </p>
         <div className="mt-6">
           <PlayerIdentityPicker value={choice} onChange={setChoice} />
@@ -135,8 +135,8 @@
     </div>
   ) : state?.identity?.status === 'pending' ? (
     <output className="ff-player-identity-notice" aria-live="polite">
-      Your UDisc claim is pending admin review. Existing player history remains unlinked to your
-      account until it is approved.
+      Your UDisc claim was made before instant claiming and is still pending. It is approved
+      automatically when the scorecard migration runs.
     </output>
   ) : null;
 
```

### `src/components/custom/player-identity-picker.tsx` — patch

```diff
--- a/src/components/custom/player-identity-picker.tsx
+++ b/src/components/custom/player-identity-picker.tsx
@@ -60,8 +60,8 @@
     <fieldset className="ff-identity-choice">
       <legend>Choose your player profile</legend>
       <p>
-        Search your exact UDisc username. Claims for saved players stay pending until an app admin
-        reviews them.
+        Search your exact UDisc username. If nobody has claimed that player yet, it becomes yours
+        right away, along with every saved scorecard it appears on.
       </p>
       <Label htmlFor="udisc-username-choice">UDisc username</Label>
       <div className="ff-identity-search-row">
```

### `tests/unit/league-scoring.test.ts` — full file

```ts
import { describe, expect, it } from 'vitest';
import {
  accumulateLeaguePoints,
  awardLeaguePoints,
  compareLeagueStandings,
  fieldSizePointsForPlace,
  fixedPointsForPlace,
  sharedStandingRanks,
} from '@/lib/business/league-scoring';

const field = (...strokes: number[]) =>
  strokes.map((totalStrokes, index) => ({
    playerKey: String.fromCharCode(97 + index),
    totalStrokes,
  }));

describe('PRD v4 fixed placement points', () => {
  it('awards 25, 20, 16, 13, 11, 10, 9, 8, 7, 6 for places 1–10', () => {
    const awards = awardLeaguePoints(field(50, 51, 52, 53, 54, 55, 56, 57, 58, 59), 'FIXED');
    expect(awards.map((award) => award.points)).toEqual([25, 20, 16, 13, 11, 10, 9, 8, 7, 6]);
  });

  it('drops one point per place from 11th with a minimum of 1', () => {
    expect(fixedPointsForPlace(11, [25, 20, 16, 13, 11, 10, 9, 8, 7, 6])).toBe(5);
    expect(fixedPointsForPlace(15, [25, 20, 16, 13, 11, 10, 9, 8, 7, 6])).toBe(1);
    expect(fixedPointsForPlace(40, [25, 20, 16, 13, 11, 10, 9, 8, 7, 6])).toBe(1);
  });

  it('averages the points of every occupied place for a tie, rounded to two decimals', () => {
    expect(awardLeaguePoints(field(50, 50, 55), 'FIXED')).toEqual([
      { playerKey: 'a', place: 1, points: 22.5 },
      { playerKey: 'b', place: 1, points: 22.5 },
      { playerKey: 'c', place: 3, points: 16 },
    ]);
    // 2nd–4th tied: (20 + 16 + 13) / 3 = 16.333… → 16.33
    expect(awardLeaguePoints(field(48, 50, 50, 50), 'FIXED').map((a) => a.points)).toEqual([
      25, 16.33, 16.33, 16.33,
    ]);
  });

  it('gives a one-player round first-place points', () => {
    expect(awardLeaguePoints(field(54), 'FIXED')).toEqual([
      { playerKey: 'a', place: 1, points: 25 },
    ]);
  });
});

describe('PRD v4 field-size adjusted points', () => {
  it('uses 25 × (N − P) / (N − 1)', () => {
    expect(awardLeaguePoints(field(50, 52, 54, 56, 58), 'FIELD_SIZE').map((a) => a.points)).toEqual(
      [25, 18.75, 12.5, 6.25, 0],
    );
  });

  it('gives a lone finisher 25 and last place 0 when N > 1', () => {
    expect(fieldSizePointsForPlace(1, 1)).toBe(25);
    expect(fieldSizePointsForPlace(2, 2)).toBe(0);
  });

  it('averages tied places', () => {
    // N = 4; places 1 and 2 tied → (25 + 16.666…) / 2 = 20.83
    expect(awardLeaguePoints(field(50, 50, 55, 58), 'FIELD_SIZE')).toEqual([
      { playerKey: 'a', place: 1, points: 20.83 },
      { playerKey: 'b', place: 1, points: 20.83 },
      { playerKey: 'c', place: 3, points: 8.33 },
      { playerKey: 'd', place: 4, points: 0 },
    ]);
  });
});

describe('Season totals and tie-breaks', () => {
  it('sums every finalized round with no points for a missed round', () => {
    const totals = accumulateLeaguePoints(
      ['played', 'missed'],
      [
        awardLeaguePoints([{ playerKey: 'played', totalStrokes: 50 }], 'FIXED'),
        awardLeaguePoints([{ playerKey: 'played', totalStrokes: 52 }], 'FIXED'),
      ],
    );
    expect(totals.get('played')).toBe(50);
    expect(totals.get('missed')).toBe(0);
  });

  it('breaks equal points by wins, then second places, then average placement', () => {
    const base = { points: 40, wins: 1, seconds: 0, averagePlace: 2 };
    expect(compareLeagueStandings({ ...base, wins: 2 }, base)).toBeLessThan(0);
    expect(compareLeagueStandings({ ...base, seconds: 1 }, base)).toBeLessThan(0);
    expect(compareLeagueStandings({ ...base, averagePlace: 1.5 }, base)).toBeLessThan(0);
    expect(compareLeagueStandings(base, { ...base })).toBe(0);
  });

  it('shares a standing when every tie-break is equal', () => {
    const tied = { points: 40, wins: 1, seconds: 1, averagePlace: 2 };
    const sorted = [{ ...tied, points: 50 }, tied, { ...tied }, { ...tied, points: 10 }];
    expect(sharedStandingRanks(sorted)).toEqual([1, 2, 2, 4]);
  });
});
```

## Done when

- [ ] All four checks pass and the app is deployed
- [ ] Account page shows "Public scorecards" with a "Hide my name on public cards" switch
- [ ] Claiming an unclaimed UDisc username links it instantly, with no admin step
- [ ] Dashboard importer shows only the CardCast link field, plus a collapsed "or paste a CSV instead"
- [ ] League standings show points with 2 decimals, plus 2nds and Avg place columns
- [ ] Homepage Clubhouse buttons stay on fairwayleagueplay.com
