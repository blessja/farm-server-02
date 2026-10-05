# Session Handoff — 2026-10-02

Work log for the farm-server Block data integrity work. Read this first in a new session.

## Where things stand

Two production changes are done and verified. A full farm-wide audit found more
issues that are **not** fixed. Two mobile UI changes are done but **not verified
on a device**.

## Environment

- Two MongoDB databases on the same Atlas cluster, selected by `MONGO_DB` in `.env`:
  - `production` → `farm-managment` (real data). This is what `MONGO_DB=production` resolves to now.
  - `development` → `Glen-Oak` (safe to experiment with).
- `scripts/uriFor(dbName)` swaps the DB segment of `MONGO_URI`. Pass the db name as
  `argv[2]` to any diagnostic script: `node scripts/<name>.js farm-managment`.
- Dev DB (`Glen-Oak`) was audited and is clean. All findings below are production-only.

## Row numbering scheme (important, cost me a false alarm)

**Every block uses A/B row labels**, e.g. `1A`, `1B`, `2A`, not plain integers.
`total_rows` counts *base* rows, so a well-formed block has `total_rows * 2` entries
in `rows[]`.

My first completeness script only scanned base rows 34–97 and reported "no missing
rows" for Block 17 while `8B` and `27B` were actually absent. Always check the
**full 1..total_rows range**. `parseInt("1A")` returns 1 and collapses every label
onto its base number, which produced a bogus list of 91 "duplicate row_numbers".

## Block 17 — DONE

| | before | after |
|---|---|---|
| rows in array | 188 | 194 |
| stock sum | 11631 | 11890 |
| `total_stocks` | 11908 | 11890 |
| malformed entries | 1 | 0 |

Three fixes, each backup-first with majority write concern:

1. Removed a malformed entry at index 186 whose entire subdocument had been
   stringified into the `row_number` field key. Real `97B` was preserved.
2. Inserted 5 missing rows, untouched, sorted into position:
   `47B`=73, `95A`=14, `96A`=10, `96B`=10, `97A`=6.
3. Inserted 2 more, untouched, and corrected `total_stocks` 11908 → 11890:
   `8B`=73, `27B`=73. These matched 11890 exactly, which is what confirmed them.

Block 17's row subdocuments have **no `_id`** at all — the whole array was inserted
without them. A `_id`-based match silently matches nothing. All repair scripts
target the corrupt field key and go through the raw driver, because Mongoose
casting rejects the malformed key in transit.

## Farm-wide audit — NOT FIXED

`scripts/audit-all-blocks-rows.js` checks every base row 1..total_rows for both
halves. 8 of 19 blocks have missing rows. Full output is reproducible with that script.

### Reconciles cleanly — real deletions, safe to restore

Insert the A/B partner's count and the sum lands exactly on `total_stocks`:

| Block | Missing | Partner count | Sum after |
|---|---|---|---|
| 4 | 30B | 61 | 5280 ✓ |
| 5 | 3A | 79 | 5540 ✓ |

### Needs real counts from the farm owner — do not guess

| Block | Missing | Note |
|---|---|---|
| 3 | 1A | `total_stocks` already equals stored sum. Adding 63 overshoots to 1292. |
| 6 | 1A | Same. Would overshoot to 8180 vs 8152. |
| 10 | 1A, 30A, 30B | Base 30 absent entirely; last base is 29 though `total_rows` says 30. |
| 13 | 31B, 35A, 35B, 36A, 37A, 50A, 52B | 7 missing. Partner-match reaches 8548 vs 8748, short 200. |
| 18 | 6B, 20B, 51A, 51B, 52A, 53A | Partner-match reaches 6702 vs 6810, short 108. |
| 19 | 3A, 3B, 15A, 17B | Partner-match reaches 1580 vs 1656, short 76. |

For 3, 6, and 10 the declared `total_stocks` already matches the stored sum, so
those blocks look internally consistent and the rows may never have existed.

### Open questions for the farm owner

1. Real counts for Blocks 13, 18, 19 (17 rows total), or insert partner-matched
   and leave `total_stocks` to absorb the difference?
2. Investigate Block 15 and Block 9, or leave them?

### Unrelated defects found

- **Block 15**: all 118 rows at `stock_count: 0`, `total_stocks` claims 6284.
  Either never populated or wiped.
- **Block 9**: `total_stocks` 3181 vs row sum 6319, off by −3138. Its `3A` holds 23
  against `3B`'s 66, the only mismatched pair in the block.
- **Stock sum drifts** with no missing rows: Block 1 (−19), 2 (−67), 8 (−50),
  12 (−268), 16 (−10).
- **Stray base beyond `total_rows`**: Block 4 has `45A`, Block 5 has `37A`, so
  `total_rows` is understated by one in both.
- Block 13 has two mismatched pairs: base 44 (A=97, B=96) and base 46 (A=96, B=97).

## Mobile changes — done, NOT verified on device

1. **Hours under total vines** (`src/components/TotalsGrid.js`): each worker's
   Total cell now shows their hours summed across day columns, under the vine
   total. Grand total gets the farm-wide sum. Only counts cells visible under the
   current filters, via the existing `rowKeys` guard, otherwise filtering to one
   block would pull in hours from filtered-out workers.
2. **Refresh button** (`App.js`): sits between Clear Cache and Logout. Clears
   cache and remounts the active screen. Necessary because `useAsyncData` caches
   with a 5-minute `staleTime` on the totals screens, so a remount alone would
   serve the stale copy and appear to do nothing. Queued offline writes are
   untouched by Refresh.

Verification was parse-only via `@babel/parser`. `mobile/package.json` has no test
or lint script. Both UI changes need a look on a real device.

Also wired the two header labels that were hardcoded English (`Clear Cache`,
`Logout`) into the existing i18n system, with Afrikaans strings added. Not asked
for, done for consistency with the file already carrying both languages.

## Scripts

**Worth keeping:**

- `audit-all-blocks-rows.js` — the main farm-wide completeness audit. Full 1..total_rows range.
- `audit-all-blocks-schemes.js` — per-block numbering scheme summary.
- `inspect-block-detail.js` — deep dive on named blocks. `node scripts/inspect-block-detail.js farm-managment "Block 13"`
- `audit-malformed-rows.js` — farm-wide malformed entry + duplicate check. Currently reports 0.
- `repair-block17-corrupt-row.js` — removes the stringified-subdocument corruption.
- `insert-block17-missing-rows.js`, `insert-block17-8B-27B.js` — the insert repairs.

All repair scripts are dry-run by default and need `--apply` to write. Each takes
a full JSON backup to `backups/` before writing, asserts preconditions against a
fresh read, and re-verifies after. Restore path is the backup file.

**Superseded and misleading — recommend deleting, user was asked twice and hasn't answered:**

`read-block17-details.js`, `read-block17-summary.js`, `read-block17-work.js` are
built on the integer-parsing bug that produced false duplicate reports.
`read-block17-ab.js` has the 34–97 scope bug. `read-block17.js` was my first pass,
superseded by `read-block17-completeness.js`.

## Conventions for any future production write

- Dry run first, then `--apply`.
- Full document backup to `backups/` before the write, majority write concern.
- Assert preconditions against a fresh read so a concurrent change turns the
  operation into a no-op rather than a wrong write.
- Put a guard in the update filter (e.g. the expected old field value) so
  `matchedCount` is a real signal. If `matchedCount != 1`, stop and report.
- Re-read after the write and verify, then report the rollback path.
- Inserted rows go in untouched: `remaining_stock_count: null`, empty worker
  fields, no `checkin_recorded_by`, sorted into position. That is what makes them
  behave as never-checked-out in the app.

## Git state

Last commit `58ef6f5 feat: add refresh functionality and localization support for
cache management`. Block 17 production changes were committed in
`ac5609f Add diagnostic scripts for Block 17 data integrity checks`.

Untracked: `scripts/audit-all-blocks-rows.js`, `scripts/audit-all-blocks-schemes.js`,
`scripts/inspect-block-detail.js`.

## My mistakes on this task, for the record

1. Reported 91 false duplicate `row_numbers` from `parseInt("1A")`.
2. Reported "no missing rows" for Block 17 because my check only scanned bases
   34–97. 8B and 27B were actually missing.
3. First repair script matched by `_id`, which matches nothing on Block 17 since
   those subdocuments have no `_id`. The dry run caught it; I had not checked.
4. A `BACKUP_DIR` path with one too many `..` wrote a backup outside the project.
   Cleaned up.
5. A computed object key missing brackets was a syntax error, caught before any write.

The dry-run-first habit caught three of these. It is the reason nothing was damaged.