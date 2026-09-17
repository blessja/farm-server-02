# Farm Mobile - Offline Tester Sheet

**Build/version:** __________  
**Tester:** __________  
**Device/OS:** __________  
**API URL:** __________  
**Date:** __________

For child-friendly, step-by-step instructions for every test, see `SIMPLE_OFFLINE_TEST_GUIDE.md`.

## Offline capability assessment

The mobile app is **partially offline-capable**. It is suitable for continuing selected farm operations after the device has first loaded data while online.

| Capability | Status | Notes |
| --- | --- | --- |
| Previously loaded blocks, rows, check-ins, clocks and totals | Supported | Stored in `AsyncStorage`; stale cached data remains visible if a refresh cannot reach the server. |
| Regular check-in / checkout | Supported | POST actions are saved to the local queue when a network error occurs. |
| Clock in / clock out | Supported | Saved to the local queue on a network error. |
| Fast piecework | Supported | Saved to the local queue on a network error. |
| Move worker / swap workers / add worker | Supported | These POST actions also use the local queue. |
| Queue survives app restart | Supported | The queue is stored in `AsyncStorage`. |
| Automatic retry when the connection returns | Partial | Retry runs when the app opens or becomes active. Keeping the app open while Wi-Fi returns does not itself trigger a retry; use **Sync** if needed. |
| First launch with no cached data | Not supported | Data screens require a successful backend request before their cache exists. |
| Login while offline | Not supported | Login requires the backend. With auth enabled, a cold start also verifies the token with the backend. |
| Guaranteed duplicate-safe replay | Not verified | Queued requests have no client idempotency key. A request whose server result is unknown should be checked before retrying. |

## Before testing

1. Use a non-production test farm/server and test workers.
2. Start with the device online. Sign in, open every tab needed for testing, select a block, and load its rows. This seeds the cache.
3. Record the starting number of current check-ins, clock records, and totals.
4. Simulate offline mode using Airplane Mode (preferred) or by disabling both Wi-Fi and mobile data.
5. For each case, enter **Pass**, **Fail**, **Blocked**, or **N/A** and include a short note or screenshot reference.

## Test cases

| ID | Area | Steps | Expected result | Result | Notes / evidence |
| --- | --- | --- | --- | --- | --- |
| OFF-01 | Cached dashboard | Seed cache online; enable Airplane Mode; open Home. | Previously loaded blocks/check-in counts remain visible; no crash. |  |  |
| OFF-02 | Cached DayWork data | While online load a block and its rows; go offline; reopen DayWork. | Cached block, row, and current-check-in data remain usable. |  |  |
| OFF-03 | Cached data after restart | Seed cache; force-close the app; enable Airplane Mode; reopen it. | Cached screen data may be available after sign-in/session bootstrap only if the app can get past auth; record actual result. |  |  |
| OFF-04 | First launch offline | Clear app storage or use a fresh install; enable Airplane Mode; launch. | App cannot load backend data or log in. This is an expected current limitation. |  |  |
| OFF-05 | Offline regular check-in | Seed a block/row; go offline; submit a valid DayWork check-in. | Success/queued message appears, form clears, and Queue count increases by 1. |  |  |
| OFF-06 | Offline regular checkout | Use a valid cached active worker; go offline; submit checkout. | Action is queued and Queue count increases by 1. |  |  |
| OFF-07 | Offline clock in | Go offline; submit a valid Clock In. | Action is queued and Queue count increases by 1. |  |  |
| OFF-08 | Offline clock out | Go offline; submit a valid Clock Out. | Action is queued and Queue count increases by 1. |  |  |
| OFF-09 | Offline fast piecework | Go offline; submit a valid Fast piecework action. | Action is queued and Queue count increases by 1. |  |  |
| OFF-10 | Offline move | Load an active assignment online; go offline; submit a worker move. | Action is queued and Queue count increases by 1. |  |  |
| OFF-11 | Offline swap | Load two valid assignments online; go offline; submit a worker swap. | Action is queued and Queue count increases by 1. |  |  |
| OFF-12 | Offline add worker | Go offline; add a new test worker. | Action is queued; confirm it is not treated as server-confirmed until sync completes. |  |  |
| OFF-13 | Queue persistence | Queue at least two actions; force-close and reopen the app while still offline. | Queue tab shows the same actions, payloads, and attempt counts. |  |  |
| OFF-14 | Manual sync | Queue an action offline; restore network; press **Sync queued actions now** or **Sync all**. | Each accepted action is removed from Queue and is visible on the backend after refresh. |  |  |
| OFF-15 | Resume sync | Queue an action offline; background the app; restore network; bring the app back to foreground. | Queue retry starts on app resume; verify action clears or shows a server error. |  |  |
| OFF-16 | Connection restored while open | Queue an action; restore network without backgrounding; wait 60 seconds. | Do not assume automatic sync. Use Sync if it remains queued; record actual behavior. |  |  |
| OFF-17 | Server validation error | Queue an action that becomes invalid before sync (for example, checkout an already checked-out worker); restore network and sync. | Item remains queued, attempt count increases, and Queue displays the backend error/status. |  |  |
| OFF-18 | Conflict resolution | Create a queued check-in conflict; restore network; sync; open Queue. | Conflict can be inspected, edited/retried, or removed. For check-ins, the multiple-workers override is available. |  |  |
| OFF-19 | Remove one action | Queue two actions; remove one in Queue. | Only the selected action is removed; the other remains. Confirm server state was not changed for the removed action. |  |  |
| OFF-20 | Clear queue | Queue test-only actions; use Clear all. | Queue becomes empty. Use only with test records because the actions will not sync. |  |  |
| OFF-21 | Clear cache safety | With queued test actions present, press Clear Cache. | Cached read data is cleared; confirm queued actions remain, because cache clearing does not clear the offline queue. |  |  |
| OFF-22 | Duplicate protection | Submit an action, interrupt connectivity during/after submit, then restore network and inspect Queue/server before retrying. | No duplicate server record should be created. Log outcome; current implementation has no idempotency key, so this is a release-risk check. |  |  |

## Sign-off

**Offline workflow accepted:** Yes / No  
**Critical defects found:** __________  
**Follow-up owner:** __________  
**Sign-off date:** __________
