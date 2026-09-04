# Implementation Plan - Fix Unhandled SoftException in React Native Bridgeless Mode

This plan addresses the `ReactNoCrashSoftException` occurring during reloads in Bridgeless mode. We will register a listener to suppress this specific noise in the logs.

## Proposed Changes

### [Component Name] Android Application Core

#### [MODIFY] [MainApplication.kt](file:///C:/Users/jayde/OneDrive/Desktop/farm-server-02/mobile/android/app/src/main/java/com/anonymous/farmmobile/MainApplication.kt)

- Register a `ReactSoftExceptionListener` in `onCreate`.
- The listener will check for `ReactNoCrashSoftException` with the specific message "ReactInstance task returned null".
- If matched, the exception will be ignored (not logged as an error).
- Otherwise, the exception will be logged using the default `FLog.e` to maintain visibility for other issues.

```kotlin
    ReactSoftExceptionLogger.addListener { category, cause ->
        if (cause is ReactNoCrashSoftException && cause.message?.contains("ReactInstance task returned null") == true) {
            return@addListener
        }
        FLog.e(category, "SoftException", cause)
    }
```

## Verification Plan

### Manual Verification
- Deploy the app to a device/emulator in debug mode.
- Trigger a JS reload (e.g., press 'r' in the terminal or use the dev menu).
- Verify that the "Unhandled SoftException" no longer appears in the Logcat or as a RedBox, while other functionality remains unaffected.
