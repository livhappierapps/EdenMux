---
name: Expo Go Platform Quirks
description: iOS vs Android vs web differences, safe area, keyboard, reanimated, haptics, back button
---

# Expo Go Platform Quirks

## iOS vs Android vs Web — Master Diff Table

| Feature | iOS | Android | Web |
|---|---|---|---|
| `KeyboardAvoidingView behavior` | `"padding"` ✅ | `"height"` ✅ (or omit) | N/A |
| `StatusBar` style | `barStyle` prop | `barStyle` + `backgroundColor` | Ignored |
| Hardware back button | N/A | ✅ via `BackHandler` | Browser back button |
| `expo-haptics` | Full support | Full support | Silent no-op (polyfilled) |
| `expo-secure-store` | Keychain (hardware-backed) | Keystore | localStorage (polyfilled) |
| `expo-speech` | System TTS | System TTS | Web Speech API |
| Safe area insets | Dynamic Island / notch / home bar | Notch / status bar | Simulated |
| Fast Refresh | ✅ | ✅ | ✅ |
| Hermes | ✅ | ✅ | V8/SpiderMonkey |
| Layout animations (Reanimated) | ✅ | ✅ | ❌ Silent no-op |
| `expo-notifications` push | Physical device | Physical device (SDK 53+: dev build) | Not supported |
| Background tasks | ❌ in Expo Go | ❌ in Expo Go | N/A |

---

## Keyboard Handling

**The #1 rule:** `KeyboardAvoidingView behavior` is different per platform.

```tsx
import { KeyboardAvoidingView, Platform } from 'react-native';

// Built-in (OK for simple screens):
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={0}
>

// Better option — react-native-keyboard-controller:
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

<KeyboardAvoidingView
  behavior="padding"   // ← works consistently on both platforms
  keyboardVerticalOffset={0}
>
```

**Chat UIs:** Use inverted FlatList instead of `scrollToEnd()`. Inverted FlatList automatically positions new messages at the bottom. `scrollToEnd()` has timing bugs with async state updates.

**Don't nest `KeyboardAvoidingView`** — only one should exist in the component tree.

**`InputAccessoryView`** (iOS sticky toolbar above keyboard): Does NOT render in Expo Go. Works only in development builds and production.

---

## Safe Area Insets

Never hardcode top/bottom padding for notches, Dynamic Island, or home bars.

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function MyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* content */}
    </View>
  );
}
```

**Safe inset values by device:**
- iPhone SE: `top: 20`
- iPhone 14 (notch): `top: 47`
- iPhone 15 Pro (Dynamic Island): `top: 59`
- Android (varies): `top: 24-48`

**Absolutely positioned headers:**
```tsx
// Header at top of screen:
const headerTop = insets.top;  // positions header below notch
// Content below header:
const contentPaddingTop = insets.top + 70;  // 70 = header visual height
// NEVER use hardcoded values like paddingTop: 100
```

**Web insets (Expo Go web platform):**
- Add `paddingTop: 67` minimum for web-only top bars
- Add `paddingBottom: 34` or make tab bar `84px` tall (50 + 34)
- Use `Platform.OS === 'web'` guard

---

## Android Back Button

The Android hardware back button is Android-only and must be explicitly handled.

```tsx
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

useFocusEffect(
  React.useCallback(() => {
    const onBackPress = () => {
      // Return true to prevent default back behavior
      if (someCondition) {
        doSomethingInstead();
        return true;  // consumed
      }
      return false;  // let system handle it
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [someCondition])
);
```

**Expo Router** handles back navigation automatically via file-based routing. `BackHandler` is for custom overrides (e.g., "confirm before exit" dialogs).

---

## react-native-reanimated on Web

Layout animations (`FadeIn`, `SlideInLeft`, etc.) are silently ignored on web. The component renders without animation — no crash, no error.

```tsx
import Animated, { FadeIn } from 'react-native-reanimated';
import { Platform } from 'react-native';

// Safe pattern:
<Animated.View entering={Platform.OS !== 'web' ? FadeIn.duration(300) : undefined}>
  {/* content */}
</Animated.View>
```

`useSharedValue`, `useAnimatedStyle`, and `withTiming`/`withSpring` DO work on web. It's only layout animations that don't.

---

## `Platform.OS` Values

```js
Platform.OS  // → 'ios' | 'android' | 'web'

// Platform.select shorthand:
const style = Platform.select({
  ios: { shadowColor: 'black', shadowOpacity: 0.2 },
  android: { elevation: 4 },
  default: {},  // web
});

// Native-only guard:
if (Platform.OS !== 'web') {
  // iOS or Android specific code
}
```

**`Platform.OS === 'web'`** is a valid type for Expo (even if TypeScript might complain on typed narrow checks). Always handle the web case.

---

## StatusBar

```tsx
import { StatusBar } from 'expo-status-bar';

// Expo's StatusBar works across platforms (prefers this over RN built-in)
<StatusBar style="light" backgroundColor="#000" translucent />
```

- iOS: `backgroundColor` is ignored (iOS doesn't have a separate status bar background)
- Android: `backgroundColor` sets the status bar color
- `translucent={true}` on Android: status bar overlaps content (you must add `paddingTop: insets.top`)

---

## expo-speech Platform Differences

```js
import * as Speech from 'expo-speech';

// iOS: Uses system AVSpeechSynthesizer (high quality voices)
// Android: Uses system TTS engine (quality varies by device)
// Web: Uses Web Speech API (quality varies by browser)

Speech.speak('Hello', {
  language: 'en-US',
  pitch: 1.0,     // 0.0 - 2.0
  rate: 0.9,      // 0.0 - 2.0 (iOS: 0-1, Android: 0-1, Web: 0.1-10)
  onDone: () => {},
  onError: (error) => {},
});

// Check if speech engine is available:
const available = await Speech.isSpeakingAsync();

// Stop all speech:
await Speech.stop();

// Get available voices (iOS/Web only):
const voices = await Speech.getAvailableVoicesAsync();
```

**Android rate normalization:** Android and iOS use different rate scales. `rate: 1.0` on iOS is normal speed; on Android it's also normal. `rate: 2.0` on Android sounds robotic and fast. Stick to 0.8-1.1 for best results.

---

## FlatList Boolean Props — Type Coercion Trap

FlatList props like `scrollEnabled` and `showsVerticalScrollIndicator` expect booleans. Passing a string (even truthy) causes a `TypeError`.

```tsx
// ❌ CRASHES: passes a string to boolean prop
<FlatList scrollEnabled={data || 'fallback'} />

// ✅ CORRECT: coerce with !!
<FlatList scrollEnabled={!!data} />
```
