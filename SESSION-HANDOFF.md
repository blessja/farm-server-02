# Session Handoff — 2026-10-11

Work log for the farm-server **double-count / stale check-in** work. Read this first in a new session.

The 2026-10-06 handoff below (block data integrity) is preserved as history and was committed for the first time with this session. The 2026-10-10 shared-row handoff lives in `SHARED-ROW-CHECKOUT-HANDOFF.md`.

## Objective

Stop production **double-counting** of worker vines caused by stale/silent check-ins — while **keeping the auto-checkout-on-check-in feature** (it is core). Also fix the rows already double-credited in `farm-managment`.

## Root cause (already proven this session)

- `checkInWorker` resets a completed row (`remaining_stock_count === 0`) back to full `row.stock_count`.
- The auto-checkout on the next move/check-in runs `checkOutWorker` with `stockCompleted` defaulting to `currentRemaining` → credits the **full row a second time**.
- No idempotency: the mobile offline queue (`queuedMutation`) re-sends check-ins after timeouts, re-triggering the loop (e.g. Sekayi B12 `10A→10B→10A` within 13s).

## What was done

### 1. Production repair — `scripts/repair-double-credits.js` (dry-run default, `--apply` to write, validates base via events, backs up first)

Applied to `farm-managment` and verified. Capped 10 rows / 9 workers to the row's declared base:

| worker | block / row | from → to |
|---|---|---|
| 4022 Mushandu Sekayi | B12 10A | 172 → 86 |
| 3007 Chaibva Knowledge | B18 44B | 86 → 54 |
| 3007 Chaibva Knowledge | B15 21A | 128 → 64 |
| 4014 Kanyinji Mildret | B17 3A | 146 → 73 |
| 4003 Shambare Precious | B17 3B | 146 → 73 |
| 5155 George Elizabeth | B17 24B | 146 → 73 |
| 4101 Maphupho Siwiselo | B17 71B | 94 → 47 |
| 2006 Moleta Fanie | B19 1B | 44 → 22 |
| 2014 Jors Sandick | B18 63A | 68 → 34 |
| 8 De Bruin David | B15 1A (2026-10-08 entry) | 71 → 67 |

`total_stock_count` recomputed with the exact `models/Worker.js` pre-save rule per worker (e.g. Sekayi 2482 → **2396**). `checkout_events` left intact as audit. Backups:
- `backups/double-credit-repair-farm-managment-2026-10-11T18-42-54-508Z.json`
- `backups/double-credit-repair-farm-managment-2026-10-11T18-50-41-465Z.json`

**Review list — NOT auto-fixed (22 entries):** mostly Block 16 / `2026-09-22` entries with **no checkout events** (old test/seed data, e.g. Van Wyk Jeandre 2006-style rows), plus `2052 De Vlam` Block 1 32A DOUBLE EYES 78 vs 73 (10-05) and `5010 Lambrechts` Block 1 1A PRUNING 8 vs 4 (09-21). Base not provable from events → excluded deliberately. Confirm before deciding what to do with them.

Re-run scan anytime: `node scripts/repair-double-credits.js farm-managment`

### 2. Server safeguards — `controllers/rowController.js`

- New helpers `creditedStockFor(...)` and `completedRowFor(...)`.
- `checkInWorker`: a row this worker **already completed today** is no longer reset to full (uses a remaining-0 event as the signal, which also covers partial→finish flows). Re-entering the row keeps it completed → the later auto-checkout credits 0.
- `checkOutWorker`: cumulative credit per (worker, block, row, job, work date) capped at `row.stock_count`; overshoot is clamped with `creditCapped` + `requestedVinesCompleted` in the response and a server `console.warn`. This is the backstop that makes replays harmless even when the reset guard misses.

### 3. Request idempotency — replays can't re-execute

- `models/ProcessedRequest.js` — unique `key`, TTL 48h, auto-created by Mongoose (no migration).
- `utils/idempotency.js` — route-wrapper: execute once per `requestId`; duplicate deliveries get the stored success response; error responses drop the claim so they can be retried; stale claims stolen after 15s.
- `routes/rowRoutes.js` — `/checkin`, `/checkout`, `/move-worker`, `/swap-workers` wrapped with `idempotent(...)`.
- `mobile/src/api/client.js` — `queuedMutation` / `queueAndPush` stamp `requestId` into the body once, so the offline replay reuses the same id (parse-checked only; no lint/test script for mobile).

### 4. Regression suite — `scripts/daywork-test.js` now **14/14 passing**

- `T5` updated 260 → 160 (documents that re-entering an already-completed row same-day must not re-credit).
- `T12` new: re-check-in to a completed row then move → no double credit.
- `T13` new: duplicate request with same `requestId` executed once (check-in + checkout).

Run: `node --test scripts/daywork-test.js` (isolated throwaway DB; real data untouched).

## Deploy note (IMPORTANT)

- The production **data** is fixed, but the double-count **safeguards only apply once this code is deployed** to Render. Commit/push, then deploy the server and ship the mobile update (which should also be checked on a real device per repo convention).
- No DB migrations needed; `ProcessedRequest` and its indexes are created lazily on first use.

## Render keep-alive plan (NOT implemented — documented only)

Free-tier Render sleeps after ~15 min idle; first cold-start request can take 30–60s. To keep the app warm **only during working hours** (so you don't burn the free 750 hours overnight):

1. Add a tiny `GET /health` returning 200 fast (existing `GET /` already works as a ping target).
2. Use a free external cron (cron-job.org) hitting `https://<app>.onrender.com/health` **every ≤10 min** (under the 15-min sleep threshold).
3. Restrict the schedule in cron-job.org to **Mon–Sat 05:30–20:30 SAST** (e.g. cron `*/10 5-20 * * 1-6`). UptimeRobot is the fallback but pings 24/7 (needs manual pause outside shifts).
4. Verify in Render logs that the instance stays warm in-window; accept the ~30–60s cold start if a >15-min gap slips through (lunch).

Owner previously declined a keepalive ping — this plan is optional, not wired in.

## Conventions carried over

- Dry run first, then `--apply`; full backup to `backups/`; precondition guards; re-read + verify; never inline `node -e` in PowerShell (write a script file).
- DB selection: `MONGO_DB` in `.env` (`farm-managment` = production, `Glen-Oak` = dev); scripts take db name as `argv[2]`.

---
---

# Session Handoff — 2026-10-06 (historical)

Work log for the farm-server Block data integrity work. Read this first in a new session.

Supersedes the 2026-10-02 handoff (history is compressed at the bottom).

## Where things stand

**Production block data is in the best shape it has ever been.** Farm-wide audit:

```
blocks audited:      17   (skipping Block 9, Block 17)
blocks with issues:  0
deferred (2026):     1    -> Block 13
blocks fully clean:  16
```

Everything the owner has given us a corrected file for has been applied and
verified. Three things are still open: **Block 13** (deferred), **Block 9**
(totals unresolved), and an **exclusion list that was cut off mid-sentence**.

## Environment

- Two MongoDB databases on the same Atlas cluster, selected by `MONGO_DB` in `.env`:
  - `production` → `farm-managment` (real data) — this is what `.env` resolves to now.
  - `development` → `Glen-Oak` (safe to experiment with).
- Diagnostic scripts take the db name as `argv[2]`: `node scripts/<name>.js farm-managment`.
- Dev DB (`Glen-Oak`) is clean and was **not** written to by any of this session's work
  (verified after the Block 15 write: dev still shows all zeros).
- **Caveat:** I can only confirm the local `.env`. I cannot see Render's env vars, so if
  the deployed server points at a different DB it would not see these changes.

### Trap: PowerShell + inline `node -e`

Inline `node -e "..."` in PowerShell mangles any regex ending in `\$` and gives
**silently wrong results** (e.g. `bases=0`, empty match lists). Always write a script
file, never inline. This cost a full false-negative pass on Block 12.

## Row scheme and invariants (check these before any write)

- **A/B labels** (`1A`, `1B`, …). `total_rows` counts *base* rows → healthy block has
  `total_rows * 2` rows. Never `parseInt("1A")`.
- **`total_stocks` must equal the sum of `rows[].stock_count`.** The app computes
  remaining as `total_stocks − sum(rows)`; a mismatch shows as a negative/garbage block
  total. This bit us twice: the owner's Block 12 and Block 15 files both carried
  `total_stocks` set to *half* the true total (4810 for a 9620 block, 3143 for a 6286
  block). Caught by the apply script's guard both times. When it comes up, confirm the
  real total with the owner before touching anything.
- `total_rows` is display-only (`controllers/workerController.js` lines 237/255) — safe
  to change.
- `row.stock_count` is static; the app only mutates `remaining_stock_count`. Rows that
  should behave as never-checked-out must be inserted untouched: `remaining_stock_count:
  null`, empty worker fields, no `checkin_recorded_by`, sorted into position.
- Read path a worker hits (`controllers/rowController.js` ~238–256): if
  `remaining_stock_count` is `>0` it resumes, if `===0` it restarts from `stock_count`,
  if `null`/undefined it uses `stock_count`. So `stock_count: 0` means a worker starts
  the row with 0 vines — that was Block 15's bug.

## Block-by-block status

| Block | Status | Notes |
|---|---|---|
| 1 | CLEAN | `44B` removed (owner-confirmed absent); sum 4663 = total |
| 2 | CLEAN | `57B` removed; sum 7845 = total |
| 3 | CLEAN | `1A` owner-confirmed absent |
| 4 | CLEAN | inserted `30B`=61; `total_rows` 44→45; `45B` owner-confirmed absent |
| 5 | CLEAN | inserted `3A`=79; `total_rows` 36→37; `37B` owner-confirmed absent |
| 6 | CLEAN | `1A` owner-confirmed absent |
| 7 | CLEAN | `37B` 94→92 and `total_stocks` 7760→**7758** (owner decision) |
| 8 | CLEAN | `total_stocks` 1338→1388 |
| 9 | **EXCLUDED** | `total_stocks` pre-split units + `3A=23` vs `3B=66`; owner to decide |
| 10 | CLEAN | `1A`, `30A`, `30B` owner-confirmed absent |
| 11 | CLEAN | untouched |
| 12 | **FIXED this session** | full row replacement from owner file |
| 13 | **DEFERRED** | not used for 2026; issues remain (see below) |
| 14 | CLEAN | untouched |
| 15 | **FIXED this session** | backfilled from owner file |
| 16 | CLEAN | `total_stocks` 8086→8096 |
| 17 | **EXCLUDED** | repaired earlier (`ac5609f`); excluded from this audit |
| 18 | CLEAN | inserted `6B,20B,51A,51B,52A,53A`=54; total 6810 |
| 19 | CLEAN | inserted `3A=38,3B=38,15A=43,17B=37`; total 1656 |

`CONFIRMED_ABSENT` in `scripts/audit-blocks-integrity.js` holds the owner-confirmed
missing rows (`Block 1:44B`, `2:57B`, `3:1A`, `4:45B`, `5:37B`, `6:1A`, `10:1A`,
`10:30A`, `10:30B`) — these print as CLEAN, not defects. `DEFERRED = ["Block 13"]`
prints `DEFERRED (not used for 2026)` plus an uncounted issues line and is excluded
from the clean/flagged tallies.

## Block 12 — DONE (this session)

Owner supplied `scripts/block-12.js` (a **restructured** block, not a patch).

| | before | after |
|---|---|---|
| rows | 166 (83 bases) | 144 (72 bases) |
| stock sum | 9888 | 9620 |
| `total_stocks` | 9620 | 9620 (unchanged) |
| `total_rows` | 83 | 72 |

Bases 73–83 were dropped (538 vines), bases 1–43 raised / 48–72 lowered (net +270),
bases 44–47 identical in both — which closed the gap to exactly 9620. The DB's
`__v = 2` showed it had never been edited since seeding, and `Glen-Oak` held a
byte-identical copy (so dev was never an independent source of truth).

Applied with `scripts/replace-block-rows.js`. Backup:
`backups/block12-replacerows-farm-managment-2026-10-06T18-22-01-733Z.json`.
Owner's `total_stocks: 4810` in the file was corrected to 9620 first.

## Block 15 — DONE (this session)

Owner supplied `scripts/block-15.js`, then iterated on it three times until the row
sum matched the total he wanted (**6286**).

| | before | after |
|---|---|---|
| stock sum | 0 (all 118 rows zero) | 6286 |
| `total_stocks` | 6284 | 6286 |
| `total_rows` | 59 | 59 (unchanged) |

Final shape: A=3143, B=3143, all 59 pairs mirror, bases 1–59 complete. Owner's
`total_stocks: 3143` was corrected to 6286 in the file before applying.

Backup: `backups/block15-replacerows-farm-managment-2026-10-06T18-50-15-581Z.json`.
Post-write read confirms 0 rows at `stock_count 0`, block remaining 0, and the app's
start-row path returning 67/69/71… for `1A`/`1B`/`2A`.

## Block 13 — DEFERRED, still broken

Not used for the 2026 season (owner's words). Issues left in place, reported but not
counted by the audit:

- 7 missing half-rows: `31B=102`, `35A`, `35B`, `36A=100`, `37A=99`, `50A=95`, `52B=92`
- base 35 entirely absent; bases 44 and 46 have mismatched A/B pairs
- sum 8060 vs `total_stocks` 8748 → gap **+688** (partner-matching reaches 8548, still 200 short)

## Open questions for the farm owner

1. **Real counts for Block 13** whenever it comes back into use (7 rows + base 35 + 2
   mismatched pairs + the 688 gap).
2. **Block 9**: is `total_stocks` 3181 the pre-split unit (correct value 6319, which
   matches the row sum) and should `3A` be 66 like `3B`?
3. **The exclusion list was cut off**: the original instruction was "skip 15 and 9 and
   17 and ___". Block 15 is now fixed and off the skip list; **Blocks 9 and 17 are
   still being skipped.** There may be a fourth block name we never received.
4. Mobile changes still need a look on a real device.

## Scripts

### Write tools (dry-run default, `--apply` to write)

- **`scripts/replace-block-rows.js <dbName> <file.json> ["Block N"] [--apply]`** — the
  current tool for replacing a whole block from an owner file. Validates before writing:
  labels well-formed, no duplicates, full `1..total_rows` coverage, A/B mirror, and
  `sum == total_stocks == file total`. Pre-state asserted against the `PRE` table at the
  top of the file (**add an entry there for any new block**), guard in the update filter
  (`_id` + old `total_stocks` + old `total_rows` + `rows: {$size}`), backup first,
  re-read verification after.
- `scripts/fix-block-totals.js <dbName> --apply ["Block N"]` — per-block totals/row
  corrections. Its PLAN still contains the 6 already-applied entries with now-stale
  preconditions; **pass a block filter** or those will fail the precondition assert.
- `scripts/insert-missing-rows.js` — the Block 4/5/18/19 inserts (already applied).

### Read-only analysis

- `scripts/audit-blocks-integrity.js <dbName> [blocks to skip…]` — the main audit.
- `scripts/compare-block-json.js <dbName> <file.json> ["Block N"]` — file vs DB
  diff: field-by-field, per-row deltas, affected bases.
- `scripts/shape-file-check.js <file.json>` — A/B sums, per-base table with
  delta-to-next, local anomalies (value vs mean of neighbours), largest rises/drops.
  Use this to sanity-check an owner file **before** applying it.
- `scripts/dump-row-values.js <file.json>` — every `row=stock_count` pair + sum.
- `scripts/api-read-check.js [dbName] [block]` — reads a block the way the app does
  (effective remaining, zero-vine rows, block-level remaining).
- `scripts/export-block-json.js`, `scripts/dump-block-pairs.js`,
  `scripts/check-shape-ascents.js`, `scripts/trace-block12-segments.js`,
  `scripts/check-planting-density.js` — Block 12 forensics, reusable.
- `scripts/diagnose-stock-gaps.js <dbName> "Block N"` — per-block gap diagnosis.

Repair scripts from earlier sessions (Block 17) are still in `scripts/` and are
dry-run-by-default. Known-superseded/broken Block 17 read scripts were listed in the
2026-10-02 handoff and are still un-deleted (owner has not answered twice now).

## Git state

Last commit `58ef6f5 feat: add refresh functionality and localization support for cache
management`. Block 17 work is in `ac5609f`.

Everything else is untracked: `SESSION-HANDOFF.md`, `exports/`, `backups/`, and all of
`scripts/audit-*`, `scripts/inspect-*`, `scripts/fix-*`, `scripts/diagnose-*`,
`scripts/insert-*`, plus this session's `compare-block-json.js`,
`replace-block-rows.js`, `shape-file-check.js`, `dump-row-values.js`,
`api-read-check.js`, `export-block-json.js`, `dump-block-pairs.js`,
`check-shape-ascents.js`, `trace-block12-segments.js`, `check-planting-density.js`.
No commits were made this session — the user has not asked for one.

## Conventions for any future production write

- Dry run first, then `--apply`.
- Full document backup to `backups/` before the write, majority write concern.
- Assert preconditions against a fresh read; guard the update filter so
  `matchedCount != 1` stops the operation.
- Re-read after the write and verify, then report the rollback path.
- Confirm the owner's intended `total_stocks` equals the row sum before writing.
- Never use inline `node -e` in PowerShell.

## Mobile changes — done, NOT verified on device

1. `mobile/src/components/TotalsGrid.js` — hours shown under each worker's vine total.
2. `mobile/src/App.js` — Refresh button between Clear Cache and Logout (clears the
   5-minute `staleTime` cache by remounting; queued offline writes untouched).
3. Header labels (`Clear Cache`, `Logout`) wired into i18n with Afrikaans strings.
4. `mobile/src/api/client.js` — login now has a 60s timeout + 1 retry (auth only),
   to survive Render cold starts. Root cause was the cold start; the owner declined a
   keepalive ping.

Verification for all four was parse-only (`@babel/parser`) — `mobile/package.json` has
no test or lint script. **Still needs a look on a real device.**

## Mistakes on this record

Earlier sessions (full detail in git history / the 2026-10-02 handoff): 91 false
duplicate `row_numbers` from `parseInt("1A")`; a 34–97 scan scope that missed Block
17's missing rows; a `_id`-based match that matched nothing on Block 17; a backup path
with one too many `..`.

This session:

1. Ran a regex through inline `node -e` in PowerShell and got silently wrong output
   (`bases=0`) — the fix was to always write script files.
2. Trusted the owner files' `total_stocks` at face value; both Block 12 (4810) and
   Block 15 (3143) were half the real total. The guard in the apply script caught both,
   which is the guard doing its job — but the check should happen at compare time.
3. Block 15 first came back at 6256 (owner overcorrected by 30 while trimming the
   tail), caught before writing.

Nothing was damaged. Dry-run-first plus the precondition guards are the reason.
