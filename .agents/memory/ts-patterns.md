---
name: EdenMux TypeScript Patterns
description: Recurring TS errors and their proven fixes in this project. Check before debugging TS failures.
---

## RecordingOptions missing `web` property
`expo-av` `Audio.Recording.createAsync()` requires all three platform keys: `android`, `ios`, **and `web`**.
```ts
web: { mimeType: 'audio/webm', bitsPerSecond: 64000 }
```
**Why:** The `RecordingOptions` type in expo-av marks `web` as required. Omitting it is a TS error even though the app is Android-only.

## VoiceGateState ref narrowing false positive
Inside `runLoop`, after `if (voiceStateRef.current === 'muted') { continue; }`, TypeScript narrows the ref's perceived type to `'dormant' | 'capturing'` for the rest of the loop body. Any later comparison to `'muted'` triggers TS2367.
Fix: explicit cast at the comparison point.
```ts
if (uri && (voiceStateRef.current as VoiceGateState) !== 'muted') {
```
**Why:** TypeScript 5.x applies control-flow narrowing to ref `.current` reads. The ref can be mutated externally (toggle mute), so the narrowing is wrong — but the cast makes TS accept it while preserving runtime safety.

## deepMerge / AppConfig type clash (server/config.ts)
`AppConfig` has no index signature so it's not assignable to `Record<string, unknown>`. `deepMerge` takes `Record<string, unknown>`.
Fix at callsite — double cast through `unknown`:
```ts
const merged = deepMerge(
  DEFAULT_CONFIG as unknown as Record<string, unknown>,
  stored
) as unknown as AppConfig;
```
Keep `deepMerge` signature as `(base: Record<string,unknown>, override: Record<string,unknown>): Record<string,unknown>` — do NOT make it generic (the generic version has a return type conflict on the spread).
