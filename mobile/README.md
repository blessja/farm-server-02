# Farm Mobile

Expo-based React Native starter for the backend in this repository.

## What is included

- `App.js`: app shell with a lightweight tab layout
- `src/api/client.js`: backend API client for the current Express routes
- `src/storage/offlineQueue.js`: local queue for write actions when the device is offline
- `src/storage/authStorage.js`: auth token storage backed by `expo-secure-store` with AsyncStorage fallback
- `src/screens/AuthScreen.js`: PIN-based login screen for optional mobile auth
- `src/screens/QueueScreen.js`: supervisor queue view for retrying or removing individual offline actions
- `src/components/ScannerInput.js`: scan-enabled input for worker IDs and row labels
- `src/screens/*`: starter screens for overview, blocks, regular row workflow, clocking, and fast piecework
- `src/config/env.js`: backend base URL wiring through `EXPO_PUBLIC_API_URL`

## Setup

1. Install mobile dependencies:

```bash
cd mobile
npm install
```

2. Create an environment file:

```bash
cp .env.example .env
```

3. Set `EXPO_PUBLIC_API_URL` to the backend URL reachable from your phone or emulator.

Examples:

- Android emulator to local machine: `http://10.0.2.2:8080`
- iOS simulator to local machine: `http://localhost:8080`
- Physical device on same Wi-Fi: `http://YOUR_LAN_IP:8080`

You can also set:

- `EXPO_PUBLIC_DEVICE_NAME=farm-foreman-phone`

4. Start the app:

```bash
npm start
```

## Current backend mappings

- `GET /api/blocks`
- `GET /api/block/:blockName/rows`
- `GET /api/block/:blockName`
- `GET /api/block/:blockName/row/:rowNumber`
- `GET /api/workers/current-checkins`
- `POST /api/checkin`
- `POST /api/checkout`
- `POST /api/clock/clockin`
- `POST /api/clock/clockout`
- `GET /api/clock/clocks`
- `POST /api/fast-piecework/fast-checkin`
- `GET /api/fast-piecework/fast-totals`
- `GET /api/workers/regular-piecework-totals`

## Recommended next steps

- Expand the offline queue to cover more admin mutations such as worker swaps and reset actions
- Add richer conflict-specific resolvers for flows beyond regular check-in, such as worker swaps and row resets
- Normalize backend response shapes to simplify UI state handling further

## Optional mobile authentication

Set these backend environment variables only if you want to require login from the mobile app:

```env
MOBILE_AUTH_ENABLED=true
MOBILE_AUTH_SECRET=replace-this-with-a-long-random-secret
MOBILE_AUTH_SUPERVISOR_PINS=Alice Mokoena:1234,Bongani Dlamini:5678
```

Behavior:

- `GET /auth/status` tells the mobile app whether auth is enabled
- `POST /auth/login` accepts a supervisor name and PIN and returns a 7-day bearer token
- `GET /auth/verify` lets the app confirm a stored token is still valid during startup
- all `/api/*` and `/sync/*` routes require `Authorization: Bearer <token>` only when `MOBILE_AUTH_ENABLED=true`
- the app header shows the currently signed-in supervisor name after login

Use `MOBILE_AUTH_SUPERVISOR_PINS` when each supervisor should have a different PIN. This is enforced entirely on the backend.

Example:

```env
MOBILE_AUTH_SUPERVISOR_PINS=Alice Mokoena:1234,Bongani Dlamini:5678
```

The mobile app does not store or hardcode supervisor names or pins. It only sends the entered supervisor name and PIN to the backend for validation.

If you still want one shared fallback PIN for any non-listed supervisor, you can also set:

```env
MOBILE_AUTH_PIN=9999
```

If `MOBILE_AUTH_ENABLED` is not set to `true`, the app continues without a login prompt.

## Offline queue behavior

These write actions are queued locally when the device cannot reach the backend:

- regular row check-in
- regular row checkout
- worker clock-in
- worker clock-out
- fast piecework submissions

The queue is stored in `AsyncStorage`, retried automatically when the app becomes active again, and can also be flushed from the dashboard manually.

The supervisor `Queue` tab adds:

- full list of queued actions
- one-tap retry for a single item
- conflict detection based on backend status and error details
- edit-and-retry flow for queued payloads when server state changed while the device was offline
- fast override for regular check-in conflicts by setting `allowMultipleWorkers=true`
- remove a bad queue entry without flushing the rest
- clear-all control when the queue needs to be reset

## Barcode and QR scanning

Worker ID and row fields now include a `Scan` action.

- scan worker badges or barcode stickers to fill worker IDs
- scan row labels to fill row numbers
- Expo camera permission is requested the first time a user opens the scanner

## Safer token storage

Mobile auth tokens are now stored in `expo-secure-store` when the device supports it.

- on iOS and Android, the token is stored in the platform secure keystore when available
- if secure storage is unavailable, the app falls back to `AsyncStorage`
- legacy tokens in `AsyncStorage` are still read so older installs can keep working
