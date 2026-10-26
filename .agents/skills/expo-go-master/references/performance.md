---
name: Expo Go Performance
description: Bundle size, FlatList tuning, Expo Atlas, startup optimization, memory leaks, useEffect best practices
---

# Expo Go Performance

## Startup Time

### Metro Cache (`--clear` trade-off)

`--clear` wipes bundle cache = fresh build every restart (~15s). Without it = instant cached serve but risk of stale-asset crash. In development, `--clear` is always worth it. Production builds are pre-bundled so `--clear` doesn't apply.

### Slow First Load on Device

First connect after Metro starts always builds the full bundle. This is expected. Subsequent reconnects serve from cache (fast).

**Reduce initial bundle time:**
- Fewer total imports = faster bundle
- Use `expo-font` config plugin instead of `useFonts` for production (embeds fonts natively, no runtime fetch)
- Use `expo-splash-screen` to hide load time from users

---

## Bundle Size Analysis with Expo Atlas

```bash
npx expo export --platform android
npx expo-atlas dist/
# Or during dev:
EXPO_ATLAS=1 npx expo start
# Opens http://localhost:8888
```

Atlas shows a treemap of every module in your bundle. Look for:
- Large `node_modules` that could be replaced with lighter alternatives
- Duplicate packages (same lib bundled twice at different versions)
- Dev-only code that leaked into production

**Common bundle bloat offenders:**
- `moment.js` (→ use `date-fns` or native `Intl`)
- `lodash` (→ use lodash-es with tree shaking, or write the 3 lines yourself)
- `axios` (→ native `fetch` is built in)
- Icon libraries loading all icons (→ import individually)

---

## FlatList Performance Tuning

FlatList uses virtualization by default — only visible items + a buffer are rendered.

```tsx
<FlatList
  data={items}
  keyExtractor={item => item.id}
  renderItem={({ item }) => <ItemComponent item={item} />}
  
  // Performance props:
  windowSize={5}                    // Render 5 screen-heights worth of items (default: 21)
  maxToRenderPerBatch={10}          // Items per render batch (default: 10)
  initialNumToRender={10}           // Items rendered on first pass
  removeClippedSubviews={true}      // Unmount off-screen items (Android: big win)
  getItemLayout={(data, index) => ({ // Skip height measurement if items are fixed height
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
/>
```

**`keyExtractor` must return stable IDs.** Never use array index as key — causes React to re-render all items on any list change.

**`renderItem` must be stable.** Wrap with `React.memo` or define outside the component:
```tsx
// ❌ Recreated every render
<FlatList renderItem={({ item }) => <Item data={item} />} />

// ✅ Stable reference
const renderItem = useCallback(({ item }) => <Item data={item} />, []);
<FlatList renderItem={renderItem} />
```

**For inverted chat FlatList:**
```tsx
<FlatList
  inverted
  data={messages}
  // Don't use scrollToEnd() — inverted FlatList handles it automatically
  // New messages appear at bottom naturally
/>
```

---

## Memory Leak Prevention

The most common source of React Native memory leaks:

### 1. useEffect without cleanup

```tsx
// ❌ Memory leak — interval never cleared
useEffect(() => {
  const interval = setInterval(() => {
    fetchData();
  }, 5000);
}, []);

// ✅ Cleanup
useEffect(() => {
  const interval = setInterval(() => {
    fetchData();
  }, 5000);
  return () => clearInterval(interval);  // cleanup on unmount
}, []);
```

### 2. Async setState after unmount

```tsx
// ❌ Sets state on unmounted component
useEffect(() => {
  fetchData().then(data => setState(data));  // component might unmount before this
}, []);

// ✅ Abort controller
useEffect(() => {
  const controller = new AbortController();
  fetchData({ signal: controller.signal })
    .then(data => setState(data))
    .catch(e => { if (e.name !== 'AbortError') console.error(e); });
  return () => controller.abort();
}, []);
```

### 3. WebSocket not closed

```tsx
useEffect(() => {
  const ws = new WebSocket('wss://...');
  ws.onmessage = (e) => handleMessage(e);
  return () => {
    ws.close();  // Always close on unmount
  };
}, []);
```

### 4. Event listeners not removed

```tsx
useEffect(() => {
  const subscription = AppState.addEventListener('change', handleAppState);
  return () => subscription.remove();  // Required
}, []);
```

---

## Render Optimization

### Avoid Anonymous Functions in JSX

```tsx
// ❌ New function reference every render → re-renders all children
<FlatList renderItem={({ item }) => <Item data={item} onPress={() => doSomething(item)} />} />

// ✅ Stable references
const handlePress = useCallback((item) => doSomething(item), []);
const renderItem = useCallback(({ item }) => <Item data={item} onPress={handlePress} />, [handlePress]);
```

### React.memo for Expensive Components

```tsx
// Prevents re-render if props haven't changed
const ExpensiveList = React.memo(({ items }: { items: Item[] }) => {
  return <FlatList data={items} ... />;
});

// With custom comparison (shallow comparison is default):
const Item = React.memo(({ id, name }) => <Text>{name}</Text>, (prev, next) => prev.id === next.id);
```

### useMemo for Expensive Calculations

```tsx
// Memoize expensive derived values
const sortedItems = useMemo(
  () => items.sort((a, b) => b.timestamp - a.timestamp),
  [items]  // Only recompute when items changes
);
```

---

## Image Optimization

```tsx
// Local images (require) — always prefer
<Image source={require('./assets/logo.png')} />

// Remote images — specify dimensions
<Image source={{ uri: 'https://...' }} style={{ width: 100, height: 100 }} />

// expo-image (better performance, caching, blurhash)
import { Image } from 'expo-image';
<Image
  source="https://..."
  placeholder={{ blurhash: 'LGF5]+...' }}
  contentFit="cover"
  transition={200}
/>
```

**`expo-image` vs built-in `Image`:** `expo-image` provides memory+disk caching, blurhash placeholders, and better performance. Prefer it for remote images. For local bundled images, built-in `Image` is fine.

---

## Reducing Re-renders with Context

Context triggers re-renders for ALL consumers when value changes. Split contexts to avoid unnecessary re-renders:

```tsx
// ❌ One big context — theme change re-renders auth consumers
const AppContext = createContext({ theme, user, settings });

// ✅ Split contexts
const ThemeContext = createContext(theme);
const AuthContext = createContext({ user, login, logout });
const SettingsContext = createContext(settings);
```

**Alternative:** Use `useMemo` on context value:
```tsx
const value = useMemo(() => ({ user, login, logout }), [user]);
return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
```
