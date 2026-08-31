# Fix "Unable to load script" in React Native/Expo

The error `java.lang.RuntimeException: Unable to load script` occurs because the Android application cannot find or connect to the Metro bundler to fetch the JavaScript code.

## Analysis
- **Metro is not running:** A check on port 8081 showed no active process.
- **Physical Device:** A Samsung device (`R92Y70AJWAN`) is connected. Physical devices require port reversing to communicate with the host's Metro server via USB.
- **Debug Build:** The logs indicate the app is in debug mode (Bridgeless mode with Dev Support enabled).

## User Review Required
> [!IMPORTANT]
> You must start the Metro development server manually if it is not already running.
> Use the following command in your terminal (at the project root `mobile/`):
> ```bash
> npm start
> ```
> or
> ```bash
> npx expo start
> ```

## Proposed Changes

### 1. Connectivity Fix
I have already executed the following command to bridge the device to your computer's Metro server:
`adb reverse tcp:8081 tcp:8081`

### 2. Verification of Metro Port
If you have changed the default port (8081), please let me know. The current configuration expects the default.

### 3. Cleartext Traffic
The app is already configured to allow cleartext traffic in `app/src/debug/AndroidManifest.xml`, which is necessary for local development connections.

## Verification Plan

### Manual Verification
1.  **Start Metro:** Run `npm start` in the `mobile/` directory.
2.  **Reload App:** Shake the device or use the notification to trigger a "Reload" in the app.
3.  **Check Logs:** Verify that the "Unable to load script" error no longer appears in Logcat.

### Troubleshooting
If the error persists after starting Metro:
- Ensure the device is connected via USB and `adb devices` shows it as `device`.
- Check if a firewall is blocking port 8081 on your computer.
- Ensure your `node` environment is correctly set up (try running `node -v` in the terminal).
