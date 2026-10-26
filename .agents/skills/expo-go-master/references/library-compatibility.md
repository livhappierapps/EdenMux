---
name: Expo Go Library Compatibility
description: What works in Expo Go, what requires a dev build, version pins, and known incompatible patterns
---

# Expo Go Library Compatibility

## The Core Rule

Expo Go ships with a **fixed set of native modules** baked into the binary. You cannot add new native modules. You cannot modify existing ones. If a package requires a native module not in that list, it will either:
- Throw a `TurboModuleRegistry.getEnforcing` error
- Return undefined/null silently
- Crash with an unrelated-looking error

The workaround is always a **development build** (`npx expo run:ios` / `npx expo run:android` or EAS build).

---

## What DOES Work in Expo Go

Everything in the official Expo SDK list works: https://docs.expo.dev/versions/latest/

Key ones:
- `expo-file-system/legacy` (SDK 54 — use legacy path)
- `expo-secure-store` (polyfilled on web)
- `@react-native-async-storage/async-storage`
- `expo-crypto` (pin `~15.0.x` for SDK 54)
- `expo-speech` (device TTS)
- `expo-haptics` (polyfilled on web — silent fail, no crash)
- `expo-clipboard`
- `expo-image-picker` (camera/gallery with permission flow)
- `expo-camera`
- `expo-av` (SDK 54 and below; removed in SDK 55)
- `expo-video` / `expo-audio` (SDK 55+)
- `react-native-maps` (MUST pin to exactly `1.18.0`)
- `react-native-reanimated` (layout animations broken on web)
- `react-native-gesture-handler`
- `react-native-keyboard-controller` (pin `1.20.6` for this project)
- `@tanstack/react-query`
- `revenucat/react-native-purchases` (Preview API Mode in Expo Go — mocked)

---

## What Does NOT Work in Expo Go

| Feature | Package | Status | Workaround |
|---|---|---|---|
| Background tasks | `expo-task-manager` | Silent no-op | Dev build required |
| Background fetch | `expo-background-fetch` | Not available | Dev build required |
| Background location | `expo-location` (background) | iOS: dev build required | Dev build required |
| OTA updates | `expo-updates` | `reloadAsync()` throws | Dev build or release build |
| Real in-app purchases | `react-native-purchases` | Runs in mock mode | Dev build for real purchases |
| Push notification tokens | `expo-notifications` | Device required; Android SDK 53+ dev build | Physical device + dev build |
| Custom native modules | Any npm package with native code | Crashes | Dev build only |
| Stripe native SDK | `@stripe/stripe-react-native` | Crashes | Dev build only |
| Firebase Analytics | `@react-native-firebase/*` | Crashes | Dev build only |

---

## Version Pins (Critical)

These must be pinned to EXACT versions — do not use caret (`^`) ranges:

| Package | Pin | Why |
|---|---|---|
| `react-native-maps` | `1.18.0` | Other versions crash with TurboModule error in Expo Go |
| `react-native-keyboard-controller` | `1.20.6` (for SDK 54) | 1.21+ requires native build; Metro warning about 1.18.5 is wrong |
| `expo-crypto` | `~15.0.x` (SDK 54) | v15 is in the SDK 54 Expo Go binary; v16 is not |
| `expo-asset` | `~12.0.13` (SDK 54) | Must match SDK to avoid httpServerLocation calculation bugs |
| `babel-preset-expo` | `~54.0.10` (SDK 54) | Higher versions pull in different transforms |

**In package.json, pin like this:**
```json
"react-native-maps": "1.18.0",
"react-native-keyboard-controller": "1.20.6"
```
Note: no `^` or `~`. Exact version.

---

## expo-file-system — SDK 54 Breaking Change

```js
// ❌ WRONG — gives you the new "next" API, breaks everything
import * as FileSystem from 'expo-file-system';

// ✅ CORRECT for SDK 54
import * as FileSystem from 'expo-file-system/legacy';

// These are now only available via /legacy:
FileSystem.documentDirectory   // ← was top-level before
FileSystem.cacheDirectory
FileSystem.readAsStringAsync
FileSystem.writeAsStringAsync
FileSystem.EncodingType
FileSystem.getInfoAsync
FileSystem.makeDirectoryAsync
FileSystem.downloadAsync
```

---

## RevenueCat in Expo Go

RevenueCat's `react-native-purchases` automatically detects Expo Go and switches to **Preview API Mode**:

- `Purchases.configure()` runs without errors
- All `getOfferings()` / `purchaseProduct()` calls return mocked data
- No real StoreKit or Play Billing calls are made
- No crash, no error — silent mock behavior

**To test real purchases:** Must use a development build or production build. RevenueCat recommends using sandbox accounts in dev builds.

---

## react-native-maps

```json
// package.json — exact pin, no caret
"react-native-maps": "1.18.0"
```

```json
// app.json — DO NOT add to plugins array (causes crash)
// "plugins": ["react-native-maps"]  ← NEVER do this in Expo Go project
```

Version 1.18.0 is the only version tested to work in Expo Go with New Architecture compatibility. Later versions (1.18.1+, 1.20.x) crash with `Invariant Violation: TurboModuleRegistry.getEnforcing('RNMapsAirModule')`.

---

## expo-haptics on Web

`expo-haptics` doesn't crash on web — it's polyfilled to do nothing. But the old versions would throw. Always wrap in a Platform check if you care about web feedback:

```js
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Safe on all platforms including web:
if (Platform.OS !== 'web') {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}
```

---

## expo-av → expo-video / expo-audio Migration

`expo-av` was removed in SDK 55. For SDK 54, it still works. For SDK 55+:

```js
// SDK 54 (still works)
import { Audio } from 'expo-av';

// SDK 55+ (new packages)
import { useAudioPlayer } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
```

Background audio playback requires a dev build on iOS (background mode entitlement).

---

## TypeScript Path Aliases (`@/`)

Since SDK 49, Expo supports `@/` aliases natively — no babel plugin needed.

```json
// tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

Metro reads `tsconfig.json` / `jsconfig.json` `paths` directly. No need for `babel-plugin-module-resolver`.

**Caveat:** If you also have a custom `metro.config.js`, ensure it extends `expo/metro-config` so it inherits this path resolution.
