---
name: Expo Go Storage Reference
description: AsyncStorage limits, SecureStore limits, MMKV alternative, data migration, common pitfalls
---

# Expo Go Storage Reference

## Storage Options Comparison

| Storage | Platform | Encrypted | Limit | Use For |
|---|---|---|---|---|
| `AsyncStorage` | iOS, Android, Web | ❌ No | Android: 6MB total, 2MB/item | User prefs, UI state, non-sensitive data |
| `expo-secure-store` | iOS, Android, Web* | ✅ Yes (Keychain/Keystore) | ~2KB per item | Auth tokens, secrets, small sensitive data |
| MMKV | iOS, Android | Optional | Disk-bound | High-frequency state, large datasets |
| SQLite (`expo-sqlite`) | iOS, Android | ❌ No | Disk-bound | Structured/relational data |

*Web: `expo-secure-store` polyfills to `localStorage` (not encrypted on web)

---

## AsyncStorage — Critical Limits

### Android Hard Limits

| Limit | Default Value | Adjustable? |
|---|---|---|
| Total database size | **6 MB** | Yes (see below) |
| Per-entry size | **2 MB** | No |

The 2MB per-entry limit cannot be changed. The total 6MB can be overridden by React Native config, but this doesn't help in Expo Go (no native customization).

**iOS:** No practical size limit (disk-bound). Doesn't have the same restrictions.

### Workarounds for Large Data on Android

```js
// Option 1: Chunk large values (for > 2MB items)
async function setLargeItem(key: string, value: string) {
  const CHUNK_SIZE = 500000; // 500KB chunks
  const chunks = Math.ceil(value.length / CHUNK_SIZE);
  await AsyncStorage.setItem(`${key}__chunks`, String(chunks));
  for (let i = 0; i < chunks; i++) {
    await AsyncStorage.setItem(`${key}__${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
}

async function getLargeItem(key: string): Promise<string | null> {
  const chunksStr = await AsyncStorage.getItem(`${key}__chunks`);
  if (!chunksStr) return null;
  const chunks = parseInt(chunksStr);
  const parts = await Promise.all(
    Array.from({ length: chunks }, (_, i) => AsyncStorage.getItem(`${key}__${i}`))
  );
  return parts.join('');
}
```

```js
// Option 2: Use MMKV (react-native-mmkv) — much better performance, no size limits
// Note: requires dev build (native module), NOT available in Expo Go
import { MMKV } from 'react-native-mmkv';
const storage = new MMKV();
storage.set('key', 'value');  // synchronous!
```

---

## expo-secure-store — Critical Limits

### Per-Item Size Limit (~2KB)

iOS Keychain items have a practical limit of ~2048 bytes. Larger values may be rejected.

**Workaround for large secure data:**
```js
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// Encrypt large data with AES, store in AsyncStorage, store key in SecureStore
async function setLargeSecure(key: string, value: string) {
  // Generate and store encryption key
  const encKey = await Crypto.randomUUID(); // use as seed
  await SecureStore.setItemAsync(`${key}_key`, encKey);
  
  // Store encrypted data in AsyncStorage
  // (Use your preferred symmetric encryption)
  const encrypted = btoa(value); // replace with real AES in production
  await AsyncStorage.setItem(key, encrypted);
}
```

### Platform Behavior

| Platform | Backend | Security Level |
|---|---|---|
| iOS | Keychain Services (`kSecClassGenericPassword`) | Hardware-backed on devices with Secure Enclave |
| Android | Android Keystore | Hardware-backed on API 23+ |
| Web | `localStorage` | NOT encrypted — plain text |

**`kSecAttrAccessible` equivalent on iOS:** SecureStore supports accessibility options:
- `SecureStore.AFTER_FIRST_UNLOCK` (default) — accessible after first unlock
- `SecureStore.ALWAYS` — accessible even when locked (less secure)

### Data Loss on Reinstall

- **iOS:** SecureStore data survives app reinstall IF `accessible` is set correctly and iCloud Keychain backup is enabled
- **Android:** SecureStore data is DELETED on app uninstall (no backup by default)
- **AsyncStorage:** DELETED on app uninstall on both platforms

**Migration pattern for reinstall:**
```js
// On first launch after reinstall, detect that SecureStore is empty
// and AsyncStorage is empty → fresh install → go to onboarding
const token = await SecureStore.getItemAsync('auth_token');
if (!token) {
  // New install or reinstall — show login
}
```

---

## AsyncStorage Best Practices

```js
import AsyncStorage from '@react-native-async-storage/async-storage';

// Always serialize objects (not just strings)
await AsyncStorage.setItem('prefs', JSON.stringify({ theme: 'dark', fontSize: 16 }));
const raw = await AsyncStorage.getItem('prefs');
const prefs = raw ? JSON.parse(raw) : defaultPrefs;

// Batch operations for performance (single transaction)
const pairs: [string, string][] = [
  ['key1', 'value1'],
  ['key2', JSON.stringify({ a: 1 })],
];
await AsyncStorage.multiSet(pairs);
const results = await AsyncStorage.multiGet(['key1', 'key2']);

// Remove all keys (nuclear clear)
await AsyncStorage.clear();

// Get all keys
const keys = await AsyncStorage.getAllKeys();
```

**Always catch AsyncStorage errors** — they can fail silently in low-memory or low-storage situations:
```js
try {
  await AsyncStorage.setItem(key, value);
} catch (e) {
  console.error('AsyncStorage write failed:', e);
  // Handle gracefully — don't crash the app
}
```

---

## Common Data Migration Pattern

When you change the storage schema (rename a key, add a field, change format):

```js
const SCHEMA_VERSION = 3;

async function migrate() {
  const version = parseInt(await AsyncStorage.getItem('schema_version') || '0');
  
  if (version < 2) {
    // Rename old_key → new_key
    const old = await AsyncStorage.getItem('old_key');
    if (old) {
      await AsyncStorage.setItem('new_key', old);
      await AsyncStorage.removeItem('old_key');
    }
  }
  
  if (version < 3) {
    // Add default value for new field
    const prefs = JSON.parse(await AsyncStorage.getItem('prefs') || '{}');
    if (!prefs.newField) {
      prefs.newField = 'default';
      await AsyncStorage.setItem('prefs', JSON.stringify(prefs));
    }
  }
  
  await AsyncStorage.setItem('schema_version', String(SCHEMA_VERSION));
}

// Call once on app startup (before rendering)
```

---

## When to Use Which Storage

```
Token/secret (< 2KB)     → expo-secure-store
Sensitive blob (> 2KB)   → encrypt with expo-crypto/AES, store in AsyncStorage
User preferences          → AsyncStorage
Terminal session history  → AsyncStorage (JSON array)
App settings              → AsyncStorage
Offline database          → expo-sqlite (SDK 54+ has full async support)
High-frequency counters   → MMKV (dev build required)
```
