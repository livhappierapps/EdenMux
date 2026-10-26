---
name: expo-go-master
description: Deep Expo Go reference — crashes, fixes, hacks, networking, debugging, library compatibility, platform quirks, and power-user tricks. Use whenever debugging Expo Go issues, setting up connection modes, investigating "Something went wrong" crashes, dealing with library compatibility, or optimizing the dev workflow. Triggers on: Expo Go, expo start, Metro bundler, QR scan, "something went wrong", fast refresh broken, white screen, SDK mismatch, tunnel mode, Replit Expo, Hermes debugger, FlatList performance, AsyncStorage limit, SecureStore, uuid crash, react-native-maps, RevenueCat Expo Go.
---

# Expo Go Master Reference

Deep-researched field guide for Expo Go — compiled from official docs, GitHub issues, Discord, Reddit, and dev blogs. Read this before debugging any Expo Go problem.

## Reference Files (read when relevant)

| File | What's Inside |
|---|---|
| `references/crashes-and-fixes.md` | Every major crash pattern: "Something went wrong", blank screen, font crash, Samsung first-launch, SDK mismatch |
| `references/networking-and-tunneling.md` | LAN / localhost / tunnel modes, Replit-specific env vars, WebSocket on device |
| `references/library-compatibility.md` | What works in Expo Go, what requires a dev build, version pins, known banned patterns |
| `references/debugging.md` | Hermes DevTools, dev menu shortcuts, performance monitor, element inspector, console.log tips |
| `references/platform-quirks.md` | iOS vs Android vs web differences, safe area, keyboard, reanimated, haptics |
| `references/storage.md` | AsyncStorage limits, SecureStore limits, MMKV, migration patterns |
| `references/performance.md` | Bundle size, FlatList tuning, Expo Atlas, startup optimization |

---

## The Most Important Things (read these first)

### Metro Cache = Most Crashes

The single biggest cause of Expo Go crashes is **stale Metro bundle cache**. Metro caches asset `httpServerLocation` values. When any asset is moved, renamed, or deleted, stale cache causes the device to request a path that no longer exists → ENOENT → 404 → "Something went wrong".

**Always use `--clear` in your start script.** There is no downside except ~15s rebuild on first connect.

```bash
npx expo start --localhost --clear
```

### UUID — Never Use the `uuid` Package

The `uuid` package requires `crypto.getRandomValues()` which is unavailable in Expo Go on iOS/Android. It crashes silently or throws at runtime.

```js
// ❌ CRASHES in Expo Go
import { v4 as uuidv4 } from 'uuid';

// ✅ Option 1 — expo-crypto (pin to ~15.0.x for SDK 54)
import * as Crypto from 'expo-crypto';
const id = Crypto.randomUUID();

// ✅ Option 2 — zero-dependency fallback
const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
```

### expo-file-system in SDK 54

The default import path changed in SDK 54. The legacy API moved to a sub-path.

```js
// ❌ BREAKS at runtime in SDK 54
import * as FileSystem from 'expo-file-system';

// ✅ CORRECT for SDK 54
import * as FileSystem from 'expo-file-system/legacy';
```

This affects `documentDirectory`, `cacheDirectory`, `readAsStringAsync`, `writeAsStringAsync`, `EncodingType`, and more.

### expo-av Removed in SDK 55

`expo-av` was fully removed in SDK 55. Use `expo-video` and `expo-audio` instead. Do not add it back.

---

## Developer Menu — How to Open

| Platform | Method |
|---|---|
| Any (with USB) | Press `M` in terminal where Expo CLI is running |
| iOS Simulator | `Cmd+D` or `Ctrl+Cmd+Z` |
| Android Emulator | `Cmd+M` (macOS) or `Ctrl+M` (Windows/Linux) |
| iOS device | Shake OR touch 3 fingers to screen |
| Android device | Shake device |

Dev menu options: Reload, Toggle Fast Refresh, Performance Monitor, Element Inspector, Open DevTools (Hermes).

---

## Terminal Keyboard Shortcuts

| Key | Action |
|---|---|
| `R` | Reload app on all connected devices |
| `M` | Open dev menu on connected device |
| `J` | Open Hermes JS debugger (Chrome DevTools) |
| `A` | Open on Android device/emulator |
| `I` | Open in iOS simulator |
| `W` | Open in web browser |
| `S` | Switch between Expo Go and dev build |
| `Shift+M` | More tools (performance monitor, element inspector) |
| `?` | Show all commands |

---

## Connection Modes — Quick Comparison

| Mode | Flag | Speed | Use When |
|---|---|---|---|
| Localhost | `--localhost` | ⚡ Fastest | Emulator/simulator only, or Replit/cloud env |
| LAN | (default) | 🚀 Fast | Device on same WiFi as dev machine |
| Tunnel | `--tunnel` | 🐢 Slow | Different networks, Replit without env vars, corporate firewalls |

For **Replit specifically**: use `--localhost` + `EXPO_PACKAGER_PROXY_URL` + `REACT_NATIVE_PACKAGER_HOSTNAME`. See `references/networking-and-tunneling.md`.

---

## What Expo Go Cannot Do (Requires Dev Build)

- **Background tasks** (`expo-task-manager`, `expo-background-fetch`) — silent no-ops in Expo Go
- **Background location** (`expo-location` background mode) — iOS requires dev build
- **Push notifications** — physical device required for token; Android SDK 53+ requires dev build
- **OTA updates** (`expo-updates`) — `Updates.reloadAsync()` throws in Expo Go
- **Any custom native module** not in the Expo SDK
- **In-app purchases** — RevenueCat runs in Preview API Mode (mocked), not real StoreKit/Play Billing

---

## Fast Fix Checklist

When something breaks in Expo Go, run through this before anything else:

1. `npx expo start --clear` — clears Metro cache
2. Delete Expo Go app from device, reinstall
3. Check SDK version matches (`expo --version` vs Expo Go app version)
4. Ensure device and dev machine on same WiFi (or use `--tunnel`)
5. Check for `console.error` or red screen — read the actual error
6. Shake device → Open DevTools → check Console tab
7. If all else fails: `rm -rf node_modules && npm install && npx expo start --clear`
