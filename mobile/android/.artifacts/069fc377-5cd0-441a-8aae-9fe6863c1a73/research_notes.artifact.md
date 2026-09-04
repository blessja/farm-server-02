# Research Notes - ReactNoCrashSoftException in Bridgeless Mode

## Symptom
The application logs an `Unhandled SoftException` during JS reload in Bridgeless mode.
Stack trace:
```
com.facebook.react.bridge.ReactNoCrashSoftException: raiseSoftException(getOrCreateReloadTask()): Reload: ReactInstance task returned null. Stage: 4: Destroying ReactInstance. Reload reason: BridgelessDevSupportManager.handleReloadJS()
at com.facebook.react.runtime.ReactHostImpl.raiseSoftException(ReactHostImpl.kt:919)
...
```

## Analysis
1. **Cause**: The `ReactHostImpl` (part of React Native core) raises a soft exception during a reload if the `ReactInstance` task it retrieves is null.
2. **Timing**: This typically happens when a reload is triggered (e.g., via DevSupportManager) but the `ReactHost` hasn't fully initialized an instance yet, or the instance creation task was reset/null.
3. **Soft Exception**: By design, `ReactNoCrashSoftException` is not supposed to crash the app. However, React Native logs these to `FLog.e` as "Unhandled SoftException" if no listeners are registered to handle them.
4. **Environment**: The project uses React Native 0.86.2 (likely a very recent or dev version) and Expo 57. Bridgeless mode is enabled.

## Implementation Details in ReactHostImpl.kt
- `createReactInstanceTaskRef` is initialized with `Task.forResult(null)`.
- `getOrCreateReloadTask()` calls `createReactInstanceTaskRef.andReset`, which may return a task that results in `null` if the instance wasn't created yet.
- `taskUnwrapper` is then called for multiple stages (1 to 5), and in each stage, it checks if `reactInstance == null`. If so, it calls `raiseSoftException`.
- Stage 4 is "Destroying ReactInstance".

## Proposed Fix
Since the issue resides within the React Native library's `ReactHostImpl` and is essentially "log noise" about an expected state during specific reload transitions, the fix involves:
1. Registering a `ReactSoftExceptionListener` in `MainApplication.kt`.
2. Filtering out the specific soft exception message related to "ReactInstance task returned null" during reloads.
3. Ensuring other legitimate soft exceptions are still logged as before.

This prevents the "Unhandled SoftException" from cluttering logs and being picked up by error reporting tools as a crash/critical failure.
