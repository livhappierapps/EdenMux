---
name: Expo Go Debugging
description: Hermes DevTools, dev menu, console.log, performance monitor, element inspector, profiling
---

# Expo Go Debugging

## The New Debugger: Hermes CDP (Not Remote JS)

**Remote JS Debugging is dead.** It was deprecated in React Native 0.73 and is incompatible with Hermes. The React Native Debugger standalone app also relies on the deprecated bridge.

**The modern path is direct Hermes inspection:**

1. Press `J` in the Metro terminal — opens Chrome DevTools connected directly to the Hermes engine on device
2. Or: Shake device → "Open DevTools"
3. Or: Dev menu → "Open JS Debugger"

This opens React Native DevTools which includes:
- Console (all `console.log` output)
- Sources (set breakpoints in your actual JS)
- Profiler (CPU sampling)
- Components inspector (React tree)

---

## console.log — Where It Goes

| Method | Output Location |
|---|---|
| `console.log` | Metro terminal AND Hermes DevTools console |
| `console.error` | Metro terminal (red) AND red screen on device |
| `console.warn` | Metro terminal (yellow) AND yellow banner on device |

**If console.log isn't showing:**
1. Is the Hermes debugger attached? (`J` to open it)
2. Are you in the right environment? Web console goes to browser devtools, not Metro
3. Try `console.error` to force a visible error — if that shows, log is working

**Logging in production builds:** `console.log` is a no-op in production by default. Use `console.error` for things you want to see in crash reports.

---

## Dev Menu Deep Dive

Open with: `M` in terminal (USB connected), shake, `Cmd+D` (iOS sim), `Ctrl+M` (Android emu)

| Option | What It Does |
|---|---|
| Reload | Force reload the JS bundle |
| Fast Refresh | Toggle hot reload on/off |
| Toggle Performance Monitor | Overlay showing RAM/FPS/JS heap |
| Toggle Element Inspector | Tap any component to inspect it |
| Open DevTools | Opens Hermes CDP debugger |
| Copy Link | Copy the exp:// URL of current session |
| Go Home | Navigate back to Expo Go home screen |

**`Shift+M` in terminal** = extra tools menu including "Open element inspector", "Toggle performance overlay", "Reload app" — useful without a connected device.

---

## Performance Monitor — Reading the Overlay

Open: Shake → "Toggle Performance Monitor"

| Metric | What It Tracks | Healthy Value |
|---|---|---|
| **RAM** | Total app process memory | < 200MB (warn > 300MB) |
| **JS Heap** | JavaScript heap usage | < 100MB |
| **Views** | Number of native views rendered | < 500 for most screens |
| **UI FPS** | Main thread frame rate | 60 fps (drops = layout/animation issue) |
| **JS FPS** | JS thread frame rate | 60 fps (drops = heavy JS work) |

**Diagnosing frame drops:**
- UI FPS drops → excessive re-renders, heavy styles, shadows on Android
- JS FPS drops → heavy computation in JS thread, large `JSON.parse`, crypto operations
- Both drop → memory pressure, too many native views

**Rule:** JS should never block the UI thread. Move heavy operations to `useMemo`, `useCallback`, or a worker pattern.

---

## Element Inspector

Open: Shake → "Toggle Element Inspector"

Tap any element on screen to see:
- Component tree (React component hierarchy)
- Computed style (all resolved styles)
- Box model (margin / border / padding / content dimensions)
- Source location in your code

**Debugging layout overflow:** Enable inspector → tap the element that's overflowing → look at its measured dimensions vs. its parent.

**Finding invisible elements:** Sometimes an element is rendered but transparent or off-screen. Inspector shows dimensions even if invisible.

---

## Breakpoints in Hermes

1. Press `J` in terminal to open DevTools
2. Go to Sources tab
3. Find your file (use `Ctrl+P` to search by filename)
4. Click line number to set breakpoint
5. Reload app with `R` in terminal
6. Execution pauses at breakpoint

**Conditional breakpoints:** Right-click line number → "Add conditional breakpoint" → enter condition expression.

**Logpoints:** Right-click → "Add logpoint" — logs a message without pausing execution. Great for production-like debugging.

---

## Profiling JS with Hermes

1. Open DevTools (`J`)
2. Go to Profiler tab
3. Click "Start" — use your app
4. Click "Stop"
5. View flame chart — look for wide bars (expensive functions)

**Most common hot spots:**
- `JSON.parse` / `JSON.stringify` on large objects
- Rendering large FlatLists without virtualization
- `useEffect` running on every render due to missing deps array
- Crypto operations on the JS thread

---

## Debugging Network Requests

React Native DevTools (Hermes) includes a Network tab showing all `fetch()` calls. To see WebSocket frames, use the WS-specific panel.

**Quick network debug:**
```js
// Wrap fetch for logging
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  console.log('[FETCH]', url, options?.method || 'GET');
  const res = await originalFetch(url, options);
  console.log('[FETCH RESP]', url, res.status);
  return res;
};
```

---

## Debugging with Flipper (Legacy)

Flipper was the pre-Hermes debugger. It's largely superseded by Hermes CDP. Expo Go does NOT support Flipper — it's for development builds only. Don't try to use it with Expo Go.

---

## When Expo Go Gives No Error at All

**Completely silent crash / white screen / blank:** This is the worst case. Try these:

1. **Add ErrorBoundary** around your root component — it'll catch React render errors
2. **Check Metro terminal** — look for any red text BEFORE the crash
3. **`console.error` at top of root component** — if you see it, React is running
4. **Isolate providers:** Comment out context providers one-by-one until screen appears
5. **Check imports:** `import Something from 'wrong/path'` silently returns `undefined` — React then throws "Element type is invalid"
6. **Check async state initialization:** Any context/state that starts `undefined` and is accessed before async init completes

**Error Boundary pattern:**
```tsx
// Always wrap your root in ErrorBoundary
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

When the boundary catches, it renders the fallback and you can read the error. Without it, the crash is silent.
