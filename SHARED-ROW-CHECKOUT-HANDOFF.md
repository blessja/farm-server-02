# Shared-row checkout handoff

> **Status update (2026-10-10):** The shared-row balance feature described below is
> now implemented and merged — commits `00a08d8` (shared row balance) and `4f62dc4`,
> guarded by regression test `T3b` in `scripts/daywork-test.js` (three workers share
> one balance, checkout reduces it, remaining workers get `rowRemainingStocks`).
> The "current status / reported behavior still occurs" text below predates that
> implementation. Re-verify against the deployed build before trusting local tests.

## Objective

Continue fixing shared-row checkout behavior so that:

1. Checking out one worker reduces the row's shared vine balance.
2. Other active workers on that same row remain visible and keep their shared-row highlight.
3. A refresh does not restore stale balances or remove the shared-row styling.
4. The behavior works for both the checkout modal and inline checkout controls.

## Current status

The most recent source changes attempted to solve this, but the reported behavior still occurs in the deployed/mobile experience:

- Checking out one worker does not reduce the vines in the observed environment.
- After refresh, the shared-row background color can disappear.
- After refresh, the row balance may remain unchanged.
- The mobile code currently preserves a historical shared-worker count in `sharedWorkerCounts`, but that is only a presentation workaround and does not prove that the backend row balance was reduced.

This handoff is intentionally conservative: do not assume the source changes are deployed or that the latest backend response is being used.

## Critical files

- Backend checkout: `controllers/rowController.js`
- Current-checkins endpoint: `controllers/rowController.js`
- Mobile Working tab: `mobile/src/screens/CheckedInScreen.js`
- Mobile API wrapper: `mobile/src/api/client.js`
- Async data/cache hook: `mobile/src/hooks/useAsyncData.js`
- Regression test: `scripts/daywork-test.js`

## What the source currently intends

The checkout path calculates a shared row balance and updates the row-level `remaining_stock_count` together with every `active_jobs[].remaining_stock` entry.

The checkout response is intended to return the row-level value as both `remainingStocks` and `rowRemainingStocks`.

The mobile screen is intended to:

- Use `rowRemainingStocks` for the displayed remaining vines.
- Preserve the shared-row highlight using a historical worker-count map.
- Refresh current check-ins after checkout.
- Hide keep/free checkout controls for shared rows.

## Important findings to verify first

### 1. The deployed server may not contain the latest source

The backend source currently contains a row-level update path, but the production/deployed URL may still be running an older build.

Check the active deployment, build version, and response shape. Verify the exact response to a checkout request before changing anything else.

Do not infer correctness from the local source or a successful local test alone.

### 2. The row balance must be the source of truth

For a shared row, the authoritative values are:

- `row.remaining_stock_count`
- Every active job's `remaining_stock`

The selected worker's job should not be allowed to independently determine the row balance.

A checkout should therefore produce:

- `row.remaining_stock_count = previous row balance - vines completed`
- all active jobs' `remaining_stock` synchronized to that value
- remaining worker responses using the row-level value

### 3. Refresh must not erase the row's shared identity

The current mobile code derives shared state from live records and also stores a historical count map. That map must be reviewed for stale or cleanup behavior.

A refresh should never rely on the current number of visible workers to decide whether a row is shared. If one worker checks out, the remaining worker must continue to see the row as shared until the row itself is no longer active.

### 4. The checkout UI currently removes the checked-out worker locally

`removeCheckinLocally()` removes the selected worker from `checkinsState.data` immediately. This is expected for a normal checkout, but it can cause the UI to interpret the row as no longer shared if the worker-count logic only examines currently visible records.

The next agent should make the historical row identity independent from the removed worker record.

## Required reproduction

Use a real three-worker shared row, for example:

1. Check in Worker A to shared Row X with `allowMultipleWorkers: true`.
2. Check in Worker B to the same row.
3. Check in Worker C to the same row.
4. Record the row balance before checkout.
5. Check out Worker A with a known number of vines, such as 10.
6. Inspect the backend row state.
7. Call the current-checkins endpoint for Worker B and Worker C.
8. Refresh the Working tab.
9. Inspect the displayed balance and background color.

Expected result after checkout:

- Row balance decreases by exactly the completed vines.
- Worker B and Worker C receive the reduced shared balance.
- Worker B and Worker C remain visible when still active.
- Their row cards retain the shared-row highlight.
- A refresh does not restore the previous balance or remove the highlight.

## Commands to run

Run the backend regression suite from the workspace root:

```powershell
node --test scripts/daywork-test.js
```

Run the mobile web export:

```powershell
cd .\mobile
npx expo export --platform web --output-dir "$env:TEMP\farm-mobile-export-handoff"
```

To inspect the selected production database, use the repository's existing DB/environment configuration and avoid writing to production until the behavior has been validated on an isolated database.

## Current regression coverage

The test `T3b: three workers share one row balance and checkout updates every worker` checks:

- Three workers can share one row.
- The row starts with 100 vines.
- First checkout reduces the row to 90.
- The remaining worker receives `rowRemainingStocks: 90`.

The test currently passes locally, but that does not prove the deployed server or mobile experience is using the same code and response shape. The next agent must verify the real deployed path.

## Required next steps

1. Reproduce against an isolated database using the three-worker test.
2. Capture the actual checkout HTTP response and current-checkins response.
3. Confirm whether the deployed server is using the same `controllers/rowController.js` source.
4. Confirm whether the mobile app is using a stale cached `checkins` response.
5. Inspect the exact selected worker's `rowRemainingStocks`, `remainingStocks`, `vines`, and `stockCount` values.
6. Determine whether the backend writes `remaining_stock_count` when another worker remains active.
7. Remove the presentation-only historical worker-count workaround if the backend can provide a correct row identity.
8. Add a deterministic regression test for:
   - one worker checkout from a three-worker row
   - remaining worker balance after checkout
   - refresh response after checkout
   - shared-row styling after refresh
9. Deploy only after the isolated regression test and mobile export pass.

## Do not repeat these mistakes

- Do not treat `job.remaining_stock` as the row-wide balance.
- Do not use the number of currently visible workers as the permanent shared-row flag.
- Do not depend on the mobile UI's local removal of the checked-out worker to prove the backend changed the row.
- Do not claim success based only on a passing local Node test.
- Do not deploy until the deployed API response and mobile refresh behavior have been verified.

## Expected final acceptance criteria

- Three-worker row: checkout Worker A reduces the row balance.
- Worker B and Worker C see the reduced balance after the checkout and after refresh.
- The remaining workers retain the shared-row highlight.
- The final worker checkout removes the current-checkins entry and resets the row as intended.
- The mobile web export succeeds.
- The full backend regression suite passes with 0 failures.
