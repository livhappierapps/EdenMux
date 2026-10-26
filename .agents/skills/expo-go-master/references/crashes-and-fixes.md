---
name: Expo Go Crashes and Fixes
description: Every major Expo Go crash pattern, root cause, and fix — compiled from GitHub issues and community reports
---

# Expo Go Crashes & Fixes

## "Something Went Wrong" — The Master Cause List

This error is a catch-all. The actual cause is almost always one of these:

### 1. Stale Metro Bundle Cache (Most Common)

**Symptom:** Crash immediately on app load. Works on first install, breaks after you move/rename/delete an asset or rebuild.

**Root Cause:** Metro caches `httpServerLocation` for every asset. When an asset is moved, the stale cache maps the old path. Metro strips its own `/assets/` prefix from device requests, so the wrong path resolves to a directory that doesn't exist → ENOENT → 404 → crash.

**Fix:**
```bash
# Add --clear to your start script — PERMANENT FIX
npx expo start --localhost --clear

# Nuclear clear (if --clear alone isn't enough)
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-map-*
npx expo start --clear
```

**Prevention:** Always run with `--clear`. The ~15s cold build is worth it.

### 2. SDK Version Mismatch

**Symptom:** "Project is incompatible with this version of Expo Go" banner, or silent crash.

**Root Cause:** Your project's `expo` package version doesn't match the Expo Go SDK version installed on the device.

**Fix:**
- Update Expo Go on device to latest from App Store / Play Store
- OR pin your project to a matching SDK: `npx expo install expo@~XX.0.0`
- Check compatibility: [expo.dev/go](https://expo.dev/go) lists which SDK each Expo Go version supports

**Important:** Expo Go always tracks the latest SDK. If you're on an older SDK, users need the old Expo Go — point them to `expo.dev/go` to download it.

### 3. Font Loading Crash / White Screen

**Symptom:** White screen forever, or app loads but all text shows system font or is invisible.

**Root Cause:** `SplashScreen.hideAsync()` called before fonts loaded. OR: fonts failed to load and `fontError` not handled, so app never renders.

**Fix — The Correct Pattern:**
```tsx
import { useFonts } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();  // ← MUST be outside component

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ /* fonts */ });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();  // ← hide when done OR errored
    }
  }, [fontsLoaded, fontError]);

  // ← MUST be AFTER useEffect (hooks can't be conditional)
  if (!fontsLoaded && !fontError) return null;

  return <YourApp />;
}
```

**Key rules:**
- `SplashScreen.preventAutoHideAsync()` must run before any component renders
- Gate on both `fontsLoaded || fontError` — never leave user stuck if font fails
- The `return null` must come after all hooks

### 4. Samsung Android — First Launch Crash (Android 12+)

**Symptom:** App crashes immediately on first open on Samsung devices (Galaxy A, S, M series) running Android 12+.

**Root Cause:** Samsung's "Secure Wi-Fi" or "Restrict background data" feature interferes with Metro's initial connection handshake.

**Fixes (try in order):**
1. Clear Expo Go app data: Settings → Apps → Expo Go → Storage → Clear Data
2. Disable Samsung's "Secure Wi-Fi" feature
3. Go to device Developer Options → disable "Don't keep activities"
4. Reinstall Expo Go
5. Connect to different WiFi (corporate/school networks block Metro ports)

### 5. Pixel / Android 13-15 Crash

**Symptom:** Expo Go crashes on Pixel 6a, 7, 8 running Android 13-15.

**Root Cause:** Various — often related to media permission changes in Android 13 (split photo/video permissions) or JSI/Hermes initialization.

**Fix:**
- Ensure you're on latest Expo Go (Play Store)
- Try tunnel mode: `npx expo start --tunnel`
- Check if crash reproduces in web: `npx expo start --web` — if web works, it's native-layer

### 6. Blank White Screen After Splash (No Error)

This is especially brutal because Metro shows no errors.

**Diagnosis checklist:**
```bash
# 1. Look for errors in Metro terminal output
# 2. Shake device → Open DevTools → Console tab
# 3. Try on web first: w key in terminal
# 4. Check if it's a provider error by temporarily removing providers
```

**Common causes:**
- `return null` in a component during initial render due to async state
- Context provider throwing during initialization
- `useEffect` dependency array issues causing infinite re-render
- Missing required props passed as undefined

**Quick isolation trick:** Comment out all context providers one by one until screen appears.

### 7. Fast Refresh / HMR Not Working

**Symptom:** Save a file, nothing updates. Or app reloads but doesn't pick up changes.

**Fixes (in order):**
1. `npx expo start -c` — stale cache is the #1 cause
2. Shake device → verify "Fast Refresh" is enabled in dev menu
3. Check file is actually saved (some editors buffer saves)
4. Ensure the file is in the module graph (imported somewhere)
5. Hooks that use `useRef` to capture values at render time won't re-run — that's expected

**Nuclear reset:**
```bash
rm -rf node_modules/.cache
rm -rf $TMPDIR/metro-*
npx expo start --clear
```

### 8. "Network response timed out" on QR Scan

**Symptom:** QR scans fine but Expo Go hangs, then times out.

**Causes and fixes:**
- Different WiFi networks → ensure device and machine on same network
- Corporate/school WiFi blocks port 8081 → use `--tunnel`
- VPN active on device → disable VPN
- Firewall on dev machine → allow port 8081 and 19000

### 9. Red Screen Errors — Reading Them

Red screen = JavaScript error. The stack trace is your friend.

| Error pattern | Meaning |
|---|---|
| `Cannot read property X of undefined` | Accessing state before it initializes; add `?.` optional chaining |
| `Element type is invalid` | Named vs default export mismatch, or wrong import path |
| `invariant Violation: Text strings must be rendered within a <Text>` | Whitespace or string literal directly inside a View |
| `useX must be used within a Provider` | Context hook called outside its provider tree |
| `TurboModuleRegistry.getEnforcing` | Native module not available in Expo Go (requires dev build) |

### 10. "expo-crypto randomUUID is not a function"

```js
// ❌ These all crash in Expo Go
import { v4 as uuidv4 } from 'uuid';
Crypto.randomUUID()  // old expo-crypto (<~15.x)

// ✅ Correct for SDK 54
import * as Crypto from 'expo-crypto';  // pinned to ~15.0.x
const id = Crypto.randomUUID();

// ✅ Zero-dependency fallback (always works)
const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
```
