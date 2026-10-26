---
name: Expo Go Networking and Tunneling
description: Connection modes, Replit env vars, WebSocket on device, LAN/tunnel tricks
---

# Expo Go Networking & Tunneling

## The Three Connection Modes

```
npx expo start            → LAN mode (default)
npx expo start --localhost → Localhost mode (emulators/cloud IDEs)
npx expo start --tunnel   → Tunnel mode (ngrok, works anywhere)
```

### Localhost Mode (`--localhost`)

- Metro binds to `127.0.0.1` only
- Device connects over WAN via a proxy URL
- **Required for cloud IDEs** (Replit, Gitpod, GitHub Codespaces)
- Fastest when paired with `EXPO_PACKAGER_PROXY_URL`

### LAN Mode (default)

- Metro binds to your machine's local IP
- Phone must be on same WiFi network
- Fastest for local dev on a physical device
- Fails on: corporate/school WiFi with client isolation, different subnets

### Tunnel Mode (`--tunnel`)

- Metro traffic routed through ngrok (auto-installed as `@expo/ngrok`)
- Works on any network, anywhere
- **Significantly slower** — every reload goes through ngrok servers
- Fast Refresh over HTTPS tunnel can break WebSocket SSL termination
- Use as last resort or for demos

**Fast Refresh note for tunnel:** `npx expo start --tunnel` starts an HTTP tunnel so Fast Refresh works in Expo Go. Dev builds start an HTTPS tunnel, which can break WS fast refresh — workaround: use `--tunnel` flag in the dev build start command too.

---

## Replit-Specific Setup

This is the pattern that works in Replit where Metro runs in a cloud container:

```bash
EXPO_PACKAGER_PROXY_URL=https://$REPLIT_DEV_DOMAIN \
REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_DEV_DOMAIN \
EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN:5000 \
npx expo start --localhost --clear
```

| Env Var | Purpose |
|---|---|
| `EXPO_PACKAGER_PROXY_URL` | Tells Expo Go what URL to use as the Metro bundle server |
| `REACT_NATIVE_PACKAGER_HOSTNAME` | Overrides the hostname Metro embeds in the bundle for asset requests |
| `EXPO_PUBLIC_DOMAIN` | Your app's API domain (available in client bundle as `process.env.EXPO_PUBLIC_DOMAIN`) |

**Expo Go URL on Replit:**
```
exp://<REPLIT_DEV_DOMAIN>         (no port suffix)
exp://<REPLIT_DEV_DOMAIN>/--/path  (deep link to specific route)
```

**Deep linking to a specific screen from Expo Go:**
```
exp://your-repl-domain.replit.dev/--/mdb
exp://your-repl-domain.replit.dev/--/settings
```

---

## WebSocket on a Physical Device

**The Problem:** `localhost` on a physical device points to the device, not your server.

```js
// ❌ Only works on emulator/simulator
const ws = new WebSocket('ws://localhost:5000/ws');

// ✅ Option 1 — Use your machine's LAN IP
const ws = new WebSocket('ws://192.168.1.42:5000/ws');

// ✅ Option 2 — Use Replit's domain (cloud IDE)
const BASE = process.env.EXPO_PUBLIC_DOMAIN || 'localhost:5000';
const proto = BASE.startsWith('localhost') ? 'ws' : 'wss';
const ws = new WebSocket(`${proto}://${BASE}/ws/shell`);

// ✅ Option 3 — Dynamic (best for teams)
import Constants from 'expo-constants';
const host = Constants.expoConfig?.hostUri?.split(':')[0] || 'localhost';
const ws = new WebSocket(`ws://${host}:5000/ws`);
```

**Key:** `Constants.expoConfig.hostUri` is the Metro server address — the same IP your phone is already connected to. Strip the port and use it for your backend WS.

---

## QR Code Not Working

**Checklist:**
1. Camera permission granted in device settings?
2. Same WiFi network? (Android requires location permission for WiFi scanning)
3. Port 8081 open in firewall?
4. Router has "AP isolation" or "client isolation" enabled? → Use `--tunnel`
5. VPN active on device? → Disable it
6. Scan failure on iOS: use Camera app, not QR scanner app

**Manual URL entry (bypass QR):**
Open Expo Go → tap address bar at top → type `exp://YOUR_IP:8081`

---

## `EXPO_PUBLIC_*` Environment Variables

Client-side env vars must be prefixed with `EXPO_PUBLIC_`. They're **inlined at build time** by Metro — this is a compile-time substitution, not a runtime lookup.

```bash
# .env.development
EXPO_PUBLIC_API_URL=https://myapi.com
EXPO_PUBLIC_DOMAIN=my-repl.replit.dev:5000

# In code:
const apiUrl = process.env.EXPO_PUBLIC_API_URL;  // ✅ inlined
const secret = process.env.SECRET_KEY;             // ❌ undefined on client
```

**Gotcha:** Changing `.env` files requires Metro restart. Fast Refresh doesn't pick up env var changes because they're baked into the bundle at start time.

**.env file loading priority (highest to lowest):**
1. `.env.development.local`
2. `.env.local`
3. `.env.development`
4. `.env`

---

## ngrok Manual Tunnel (Alternative to `--tunnel`)

For more control than `npx expo start --tunnel`:

```bash
# Terminal 1 — start metro on localhost
npx expo start --localhost

# Terminal 2 — expose port 8081 via ngrok
ngrok http 8081

# Then in Terminal 1 — set proxy URL to ngrok URL
export EXPO_PACKAGER_PROXY_URL=https://abc123.ngrok-free.app
# Restart expo start
```

Expo Go URL: `exp://abc123.ngrok-free.app`

**Also works for:** Gitpod, GitHub Codespaces — same pattern, just use the workspace's forwarded port URL.
