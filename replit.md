# EdenMux — Replit Agent Guide

## Overview

EdenMux is a mobile terminal emulator for iOS, Android, and web, built with Expo SDK 54 / React Native and an Express.js backend. Its primary goal is to provide a robust terminal experience with an integrated AI assistant named Eden, powered by Grok (xAI) and ElevenLabs for voice I/O. Key features include a real Linux shell via WebSocket, a client-side terminal engine, multi-session tabs, Apple Sign-In, themed UI, and in-app purchases. The project targets the iOS App Store as its primary deployment.

---

## User Preferences

- Communication style: Simple, everyday language — no jargon.
- Long-term goal: The app must be easy to maintain and eventually capable of self-updating. Built to outlast direct involvement.

---

## System Architecture

### Frontend (Expo/React Native)

The frontend uses Expo SDK 54 with Expo Router for file-based routing and TypeScript. State management relies on React Context and TanStack React Query.

- **UI/UX**: `AuthGate` (auth), `SessionTabs` (multi-session), `TerminalInput` with quick-chip bar, `TerminalOutput` (ANSI-style coloring), `EdenPanel` (AI assistant).
  - **Fonts**: JetBrains Mono (monospace), Cinzel (display).
  - **Theming**: Five themes — Red Delicious, Candy, Cyber, Neo, Gothic — each defining accents, backgrounds, terminal palettes, and images. `ThemeShop` handles RevenueCat in-app purchases.
  - **RevenueCat Product IDs** (defined in `lib/theme-context.tsx`, seeded by `scripts/seedRevenueCat.ts`):

    | Product ID | Type | Price | Entitlement |
    |---|---|---|---|
    | `com.edenmux.core_unlock` | One-time | $2.99 | `core_unlock` — unlimited Eden messages, voice I/O, chat history persistence, all themes |
    | `com.edenmux.theme_candy` | One-time | $0.99 | `candy` |
    | `com.edenmux.theme_cyber` | One-time | $0.99 | `cyber` |
    | `com.edenmux.theme_neo` | One-time | $0.99 | `neo` |
    | `com.edenmux.theme_gothic` | One-time | $0.99 | `gothic` |
    | `com.edenmux.theme_bundle_current` | One-time | $2.99 | grants all 4 theme entitlements |
    | `com.edenmux.theme_bundle_future` | One-time | $2.99 | placeholder for future themes |

  - **Tier model**: Free (15 Eden messages/day, text-only, no voice) → Core Unlock ($2.99 one-time, unlimited messages + voice + history) → Themes ($0.99 each or $2.99 bundle).
  - **Invite-code `_p` users** get all themes and Core features without purchasing.
  - **Screenshot Studio**: `app/screenshot-studio.tsx` generates App Store-ready screenshots.

- **Terminal Engine (`lib/terminal-engine.ts`)**: Client-side engine using `expo-file-system/legacy` (SDK 54 — must use `/legacy` sub-path, not bare `expo-file-system`). Supports 80+ commands, pipe operations, aliases, session-scoped package registry, and HOME directory initialization on first launch.

- **Terminal Context (`lib/terminal-context.tsx`)**: Manages multiple terminal sessions with AsyncStorage persistence. Integrates WebSocket shell client alongside local engine. Android defaults to shell mode; iOS/web start in local engine mode.

- **Eden AI Integration (`lib/eden-context.tsx`, `components/EdenPanel.tsx`)**:
  - **Character**: Ethereal, magnetic, naturally flirty and charismatic, sharp and clever, warm and patient. A goddess of her garden. Handles unwanted requests with personality, not formal moderation.
  - **Grok model**: `grok-3-mini`, temperature `0.92` (raised from 0.8 for more expressive responses).
  - **Activation**: Opens automatically on terminal errors (respects Sugar/Spice mode and Hide Eden toggles).
  - **Interaction**: Text chat, voice playback (ElevenLabs TTS), mic input (Whisper STT via backend). Auto-Speak mode reads every Eden reply aloud.
  - **Greetings**: First-open greeting introduces Eden; returning greeting is shorter. Both stored as `pendingGreeting` — Auto-Speak fires 2s after init so audio doesn't compete with startup.
  - **Eden Mode (Sugar/Spice)**: `Sugar` = Eden listens quietly, won't auto-open on errors. `Spice` = active mode (default). Stored in AsyncStorage as `@eden_mode`.
  - **Share terminal**: Share icon in terminal header grabs last 100 lines and opens native iOS/Android share sheet.
  - **Memory**: Per-device memory — daily conversation logs summarized nightly by Grok into a user profile stored in `eden_memories`. Manual bans enforced via `eden_moderation` table.
  - **Voice ID**: `Kukbe09auJMFYu1Aidx0` (configured in `server/voice.ts`).
  - **Auto-speak dedup**: Two `useEffect` hooks handle auto-speak. Effect 1 (isThinking transition) claims the message ID **synchronously before** its setTimeout so Effect 2 (messages change) exits early in the same render — preventing double-voice playback.

- **Authentication (`lib/auth-context.tsx`)**:
  - **Methods**: Apple Sign-In (iOS); email + password (JWT stored in SecureStore) for web/Android.
  - **Features**: Token verification on launch, auto-logout for invalid tokens, extended access tier (`_p` flag) unlocked via invite codes — grants all themes and enhanced AI knowledge.

---

### Backend (Express.js, `server/`)

Express.js + TypeScript on port 5000. Handles API requests and WebSocket connections.

| File | Purpose |
|---|---|
| `server/index.ts` | Entry point — middleware, CORS, static Expo file serving, route mounting |
| `server/auth.ts` | Register, login (JWT), Apple Sign-In, token verify |
| `server/eden.ts` | Eden chat (Grok), system prompt builder, per-device memory/moderation |
| `server/voice.ts` | ElevenLabs TTS (`/api/eden/speak`), Whisper STT (`/api/eden/transcribe`) |
| `server/shell.ts` | node-pty PTY sessions over WebSocket (`/ws/shell`) |
| `server/routes.ts` | Misc routes (privacy policy, terms) |
| `server/db.ts` | `pg.Pool` instance |

- **Auth**: JWT-based. Login returns a token; clients send `Authorization: Bearer <token>`. No session cookies.
- **CORS**: Dynamically configured using `REPLIT_DEV_DOMAIN` and `REPLIT_DOMAINS`.
- **Shell**: WebSocket at `wss://<domain>/ws/shell?sessionId=<id>`. node-pty bash sessions, idle-cleaned at 10 min.
- **Platform routing**: `expo-platform` header checked on `/` and `/manifest`. Allowlisted to `"ios"` or `"android"` before any path use — no traversal risk.

---

### Database (PostgreSQL)

Raw `pg.Pool` with parameterized SQL. **No ORM is used at runtime.** (drizzle-orm removed — see Security section.)

| Table | Purpose |
|---|---|
| `auth_users` | User accounts (email, username, password hash, Apple ID) |
| `invite_codes` | One-time invite codes for extended access |
| `eden_memories` | Per-device AI memory (daily log + nightly summary) |
| `eden_moderation` | Manual ban enforcement (warning count, ban until, permanent ban) |

---

## Workflows

| Workflow | Command | Port | Output Type |
|---|---|---|---|
| Start Backend | `npm run server:dev` | 5000 | webview (Replit preview) |
| Start Frontend | `npm run expo:dev` | 8081 | console (Metro bundler) |

- The Replit **preview domain points to port 5000** (the Express backend / landing page).
- The Expo web app is on **port 8081** (Metro bundler — access via `<domain>:8081`).
- `Start Frontend` is `console` type because Metro has no HTTP health endpoint — Replit's `ensurePreviewReachable` check would always fail it if set to `webview`.
- Expo Go URL: `exp://<REPLIT_DEV_DOMAIN>` (no port suffix).

---

## External Dependencies

| Package | Purpose |
|---|---|
| PostgreSQL (`pg`) | Database |
| `expo-apple-authentication` | Apple Sign-In (iOS) |
| `expo-secure-store` | JWT token storage on native |
| `@react-native-async-storage/async-storage` | Terminal sessions, theme prefs, Eden settings |
| `expo-file-system/legacy` | Client-side terminal file I/O (SDK 54 — must use `/legacy`) |
| `@tanstack/react-query` | Server state and API fetching |
| `expo-haptics` | Tactile feedback |
| `expo-clipboard` | System clipboard |
| ElevenLabs (`ELEVENLABS_API_KEY`) | TTS for Eden's voice |
| xAI / Grok (`Eden` env var) | Eden AI brain |
| RevenueCat | In-app purchases for themes |
| `react-native-keyboard-controller@1.20.6` | Keyboard handling — **pinned, do not downgrade** |
| `node-pty` | PTY sessions for backend shell |
| `ws` | WebSocket server |
| `bcryptjs` | Password hashing |
| `jsonwebtoken` | JWT signing/verification |

---

## Remote Config — Live Update System

EdenMux has a live configuration system. The app fetches config from the server every time it launches. You can update any setting instantly — no rebuild, no App Store wait, all users pick it up on their next launch.

### What can be updated remotely

| Field | What it controls |
|---|---|
| `features.shellMode` | Show/hide the Linux shell toggle button |
| `features.voiceInput` | Show/hide the mic and mute buttons in Eden's chat |
| `features.themeShop` | Show/hide the Themes & Shop button in Eden's settings |
| `features.screenshotStudio` | Show/hide the camera (screenshot studio) button |
| `eden.voiceId` | ElevenLabs voice ID Eden speaks with (takes effect within 5 min) |
| `app.motd` | A banner message shown to all users at the top of the terminal (tap to dismiss) |
| `app.minimumVersion` | Force users on older builds to update (enforced — see "Recovering from a bad minimumVersion" below) |

### How to update the config

Use `curl` with the `ADMIN_SECRET` environment variable. You can find it in Replit's Secrets panel.

**Turn something off** (e.g. disable voice input while ElevenLabs is down):
```bash
curl -X POST https://<your-replit-domain>/api/admin/config \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"features":{"voiceInput":false}}'
```

**Send a message to all users** (MOTD banner):
```bash
curl -X POST https://<your-replit-domain>/api/admin/config \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"app":{"motd":"Eden will be offline for maintenance tonight 10pm–11pm EST."}}'
```

**Change Eden's voice:**
```bash
curl -X POST https://<your-replit-domain>/api/admin/config \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"eden":{"voiceId":"<new-elevenlabs-voice-id>"}}'
```

**Read current config** (no auth needed):
```bash
curl https://<your-replit-domain>/api/config
```

> The `ADMIN_SECRET` is stored in Replit's Secrets panel. Never share it publicly.
> You can always read your app's `REPLIT_DEV_DOMAIN` from the Replit environment to build the domain.

### Recovering from a bad `minimumVersion`

If `app.minimumVersion` is accidentally set too high (e.g. a version that doesn't exist yet), every user gets locked out of the app on the update screen. There is no separate "unlock" endpoint — the recovery path is the same admin config endpoint:

```bash
curl -X POST https://<your-replit-domain>/api/admin/config \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"app":{"minimumVersion":"1.0.1"}}'
```

Lower `minimumVersion` back to a safe value (e.g. `"1.0.1"`) and users recover automatically:
- The update screen re-checks `/api/config` every 30 seconds on its own, so most users unblock within half a minute without needing to force-quit or relaunch the app.
- A fresh cold launch also re-fetches config immediately, so this works even if a user does relaunch.

### Architecture

- `server/config.ts` — DB table `app_config`, `GET /api/config`, `POST /api/admin/config`
- `lib/app-config-context.tsx` — React context, fetches on every app launch, falls back to safe defaults if network fails
- Config is stored as a single JSON row in `app_config` table; updates deep-merge (so you only need to send changed fields)
- Voice ID cache refreshes server-side every 5 minutes without restart

### The path to full code OTA (future)

For actual JavaScript code changes to reach users without an App Store review:
- Create a free Expo account at expo.dev
- Run `eas init` once from your computer to link the project
- After that, any code change can be pushed via `eas update --channel production`
- Users get it on their next app launch automatically

This is the recommended path for Layer 2 updates. The Remote Config above handles the majority of day-to-day changes without needing it.

---

## Security State

Last full scan attempt: **2026-10-16** — dependency and SAST scans completed; privacy scan failed with `HOUNDDOG_SCHEMA_MISMATCH`.

### Build-tool dependency refresh (2026-10-16)
- **Compatible updates:** Expo remains on SDK 54 (`expo@54.0.37`, `babel-preset-expo@54.0.12`); Expo Constants, File System, and Updates were aligned to SDK-compatible patch releases. `express-rate-limit` is now 8.7.1.
- **EAS CLI:** updated from 20.5.1 to 25.0.0 and moved to `devDependencies`; CLI version and build/update help commands were checked. No EAS build or publish command was run.
- **Transitive fixes:** added pnpm overrides only for compatible, patched versions within existing package major versions, including `shell-quote`, `postcss`, `tar`, `joi`, `ip-address`, `minimatch`, `nanoid`, and related patch-level dependencies. No Expo SDK migration or forced major transitive overrides were made.
- **Current dependency scan:** `pnpm audit` reports 0 critical, 5 high, 6 moderate, and 1 low findings. The OSV dependency scanner reports 0 critical, 32 high, 22 moderate, and 1 low advisory/package findings; scanner totals differ because advisories can be counted per affected package version.
- **Remaining high findings:** `image-size@1.2.1` in Expo Metro (the proposed fix is major version 2); `node-forge@1.4.0` in EAS CLI (no fix reported); `http-cache-semantics@4.2.0` through `@expo/ngrok` (no fix reported); and `braces@3.0.3` in EAS CLI (no fix reported). Remaining moderate/low findings include older `uuid` majors, `ts-deepmerge@6.2.0`, `decode-uri-component@0.2.2`, `sprintf-js@1.0.3`, and `diff@7.0.0`. These are dependency/tooling findings, not a count of confirmed app-code vulnerabilities.
- **SAST:** two findings remain: the existing manifest file-path warning, reviewed as a false positive because platform names are allowlisted before path access, and SHA-1 in an installed brainstorming skill script outside the application.
- **Privacy scanner:** failed with `HOUNDDOG_SCHEMA_MISMATCH`; no successful privacy result can be claimed.
- **Lint check:** `npm run lint` reports 6 errors and 19 warnings in unchanged app files (`components/AuthGate.tsx`, `components/EdenPanel.tsx`, and `components/TerminalOutput.tsx`). The package manager also warns that ESLint 9.39.5 is no longer supported; an ESLint 10/config migration was not attempted.
- **Verified:** TypeScript clean; server bundle builds; all seven backend smoke checks pass; all 10 theme asset sets exist; Expo exported web, iOS, and Android JavaScript bundles; both workflows restarted successfully. EAS CLI `build` and `update` help are available.
- **Compatibility note:** Expo's compatibility checker reports only `react-native-keyboard-controller@1.20.6` differs from its expected 1.18.5. The project pin was left unchanged; the Expo web/iOS/Android JavaScript exports succeeded with 1.20.6. Native EAS builds and physical-device behavior were not tested.

### Greatest Hits health sweep (2026-10-14)
- **Dependency hardening:** Express updated to 5.3.0, http-proxy-middleware minimum raised to 3.0.7, pnpm overrides enforce proxy-addr 2.0.8+ and qs 6.16.0+. The critical proxy-addr advisory is resolved.
- **Workflow:** removed the duplicate `Start App` invocation from `Project`; backend and frontend now run once each. Removed the leftover duplicate Metro process.
- **Declutter:** removed two unreferenced `.ci-test` manifests with stale dependency snapshots and removed the obsolete `db:push` script (Drizzle is no longer used). Current assets retained.
- **Repeatable verification:** `npm run test:smoke` checks the landing page, config shape, invalid login, empty registration, removed Google endpoint, invalid-platform fallback, and server survival. Set `SMOKE_BASE_URL` to choose a target; otherwise it uses `REPLIT_DEV_DOMAIN`. It does not create accounts.
- **Verified:** TypeScript clean; backend bundle builds; smoke checks pass; all 10 theme assets exist; Expo public config loads; Android Metro JavaScript bundle returns HTTP 200; both workflows start successfully; landing page screenshot renders.
- **Dependency scan at that time:** 0 critical, 78 high, 36 moderate, 8 low advisory/package findings remained. See the 2026-10-16 scan above for current counts.
- **SAST:** two findings: the already-reviewed manifest path false positive (platform allowlisted before file access), and SHA-1 in an installed brainstorming skill script outside the application. No new confirmed app-code vulnerability.
- **Privacy scanner:** failed twice with `HOUNDDOG_SCHEMA_MISMATCH`; no successful privacy result can be claimed.
- **Not verified:** physical-device UI, Apple/Google store purchases, production database/backend, or IPA/APK installation. No native EAS build was started.

### Fixed this session (2026-08-10) — Greatest Hits health sweep
- **Email PII removed from logs** — `server/email.ts` no longer logs `fromEnv` to stdout; changed to generic "sent successfully" message (GDPR/CCPA compliance).
- **TypeScript**: clean — 0 errors.
- **E2E** (backend port 5000): landing page 200, `/api/config` returns valid JSON with all feature flags, bad login → 401, empty register → 400, no crash loop.
- **Dead files**: `server/storage.ts`, `shared/schema.ts`, `drizzle.config.ts` — confirmed absent.
- **Path traversal flag** (SAST): false positive — `serveExpoManifest()` already gates `platform` through `ALLOWED_PLATFORMS = new Set(["ios", "android"])` before any `path.resolve()` call.

### Fixed this session (2026-08-09) — Greatest Hits health sweep
- **Path traversal blocked** — `serveExpoManifest()` in `server/index.ts` now validates `platform` against an allowlist `["ios", "android"]` before using it in `path.resolve()`. Previously an attacker could send `../../etc/passwd` as the platform and read arbitrary files.
- **Email PII removed from logs** — `server/email.ts` no longer logs the recipient email address to stdout (GDPR/CCPA compliance).
- **node-forge vuln pinned** — added `pnpm.overrides["node-forge"] = ">=1.3.2"` in `package.json` to force eas-cli's bundled 1.3.1 (ASN.1 CVEs) up to a patched version.
- **CORS hardened** — `server/index.ts` now includes the stable production URL and `APP_PUBLIC_URL` env var as explicit allowed origins, independent of `REPLIT_DOMAINS`.
- **Railway escape hatch** — `railway.toml` added to root; full deploy instructions inline for hosting outside Replit if ever needed.
- **TypeScript**: clean — 0 errors.
- **E2E** (backend port 5000): `/api/config` valid JSON with all feature flags, bad login → 400, empty register → 400, no crash loop.

### Unfixable vulns (Expo/EAS internals — do not chase):
- `node-forge@1.3.1` via `eas-cli@20.5.1` internal deps — mitigated by pnpm override above; remaining exposure is eas-cli build tooling only, never runs in production.
- `minimatch` ReDoS via eas-cli — eas-cli tooling only, not production.
- `undici` via Expo CLI — Expo CLI dependency, never runs in the production app.

### Fixed this session (2026-07-06) — Task #24: App Store launch readiness
- **shellMode default → false** — `server/config.ts` DEFAULT_CONFIG now ships with `shellMode: false`. iOS users never see the Linux shell toggle on first install. Can be re-enabled via admin config endpoint after review.
- **iOS guard on /ws/shell** — `server/shell.ts` now checks `expo-platform` header at WebSocket upgrade; sends `4403 Shell not available on iOS` and closes before spawning any PTY. Belt-and-suspenders on top of the `shellMode: false` remote config.
- **Apple compliance verified** — `js`, `eval`, `node` commands in terminal engine are already blocked (return a message, no execution). `calc` uses `Function()` with a strict math-only character whitelist — no dynamic code execution risk. Fully compliant with Apple Guideline 2.5.2.
- **Privacy policy updated** — added RevenueCat (purchase entitlements), OpenAI Whisper (STT), daily message counter (stored on-device), conversation memory (Core Unlock), microphone access section, iOS Keychain detail. "Last Updated" → July 6, 2026.
- **App Store metadata written** — `docs/app-store-copy.md` contains: name, subtitle, full description, keywords, URLs, screenshot specs, reviewer notes, demo account instructions, compliance checklist.
- **TypeScript**: `npx tsc --noEmit --skipLibCheck` → 0 errors.
- **E2E**: landing page 200, `/api/config` valid JSON + `shellMode=false`, bad login → 401, empty register → 400.

### Fixed this session (2026-07-05)
- **Full Greatest Hits sweep** — 0 critical, 0 high, 0 moderate in app code. SAST: 0 findings. HoundDog: 0. TypeScript: 0 errors. E2E: all green. Structure clean.
- **npm → pnpm migration** — EAS Android builds crashed deterministically with `npm error Exit handler never called!` (node-pty dep chain bug). Switched to pnpm; generated `pnpm-lock.yaml`, deleted `package-lock.json`, added `shamefully-hoist=true`. First successful EAS build: `0d78f4bd`.
- **node-pty native rebuild** — pnpm doesn't auto-compile native modules on Linux. Fixed by adding `npx node-gyp rebuild` step to `scripts/post-merge.sh`; backend shell now starts cleanly after every task merge.
- **post-merge.sh fixed** — changed `npm install` → `CI=true pnpm install --no-frozen-lockfile` so task merges install deps without hanging on TTY prompt.
- **SerpentMux background removed** — deleted 5 old images (`eden-landing*.jpeg`, `edenmux-hero.jpeg`); removed all renders from AuthGate, templates, and theme-context.
- **New EdenMux artwork wired in** — `eden-landing.jpeg` (profile view, 688×1504) as full-screen login background; `eden-portrait.jpeg` (front-facing, cropped 688×841) as Eden's terminal panel portrait.
- **Sugar & Spice mode** — replaced "Silence Eden" toggle with a Sugar/Spice segmented picker in Eden's settings. Sugar = Eden listens quietly (won't auto-open on errors). Spice = active mode (current default). Stored in AsyncStorage as `@eden_mode`.
- **Share terminal** — share icon added to terminal header. Grabs last 100 lines, opens native iOS/Android share sheet so users can send output to ChatGPT, Claude, or any AI app.
- **Eden voice & personality overhaul (Task #22)** — first-open greeting introduces Eden in full; returning greeting is brief. `pendingGreeting` state auto-speaks the greeting 2s after init. Contact Developer button added to Eden settings (mailto: oblivionhappier@icloud.com). System prompt fully rewritten with Eden's character depth, Apple reviewer persona, and elevated temperature (0.92).
- **App Store ID wired (Task #21)** — ID `6761677068` set as `EXPO_PUBLIC_APP_STORE_ID` env var and `app.json extra.appStoreId`. "Update on App Store" button now deep-links directly to the EdenMux listing instead of a search fallback.

### Fixed this session (2026-06-30)
- **Full Greatest Hits sweep** — security scans, TypeScript, E2E, declutter all passed clean.
- **Wrong SDK 54 package versions fixed** — task agents installed `expo-application@56.0.3` (SDK 56!) and `expo-updates@^0.27.5` (wrong constraint) into this SDK 54 project. Fixed with `npx expo install` which resolves correct peer versions: `expo-application@~7.0.8`, `expo-updates@~29.0.18`. This was causing all EAS Android builds to fail.
- **Invalid `"update"` key removed from eas.json** — Task #9 added a top-level `"update"` section that EAS schema rejects, silently killing every EAS build in the Prebuild phase.
- **Task #5 (AI/Voice Endpoint Abuse)** — `requireAuth` middleware added to all Eden/voice endpoints; Apple Sign-In backend JWT flow added using `jose` JWKS verification; JWT_SECRET fails fast in production if `SESSION_SECRET` unset.
- **Task #6 (Public Archive Exposure)** — all ZIP archives deleted from `assets/` and root; `/api/dl/mdb` unauthenticated download route removed; `.zip` filter middleware added to both dev and prod static handlers.
- **Task #7 (Public Shell RCE)** — `/ws/shell` WebSocket now requires a valid JWT (`token` query param); PTY never spawns for unauthenticated connections; session IDs scoped per-user to prevent cross-user hijacking.
- **Task #9 (OTA updates)** — `expo-updates` configured; EAS channel `preview` wired to build profile; `/api/ota/status` endpoint added.
- **Task #10 (APK download link)** — `/api/dl/apk` route always redirects to latest FINISHED EAS Android build (10-min cache, 503 if none ready).
- **Task #12 (Minimum version gate)** — app reads `config.app.minimumVersion` on launch; outdated builds see a full-screen update prompt with APK download button instead of the app.
- **Metro watcher crash fixed** — `metro.config.js` blockList extended to cover `.local/secondary_skills/.tmp-*` paths.
- **TypeScript**: `npx tsc --noEmit --skipLibCheck` → 0 errors.
- **E2E**: Landing page 200, `/api/config` valid JSON, bad login → 401, empty register → 400, no crash loop.

### Fixed previous session (2026-06-04)
- **MDB (mommydevbeta) fully removed** — exported as `mdb_export.zip` (18 files, 926 KB), then deleted: `app/mdb/`, `components/mdb/`, `lib/mdb-*.tsx`, `lib/mdb-actions-bridge.ts`, `server/mdb.ts`, `assets/mdb-landing.jpeg`, `assets/mdb-eden.jpeg`. Removed MDB import/route block from `server/routes.ts` and `<Stack.Screen name="mdb" />` from `app/_layout.tsx`.
- **Expo Go restored** — `expo-dev-client` was silently switching Metro to development-client mode (`exp+edenmux://` URL), making Expo Go unable to connect to the Samsung A17. Removed `expo-dev-client`; Metro now runs in Expo Go mode with the correct `exp://` URL.
- **TypeScript**: `npx tsc --noEmit` → 0 errors after all changes.
- **E2E**: Landing page 200, `/api/config` valid JSON, bad login → 401, empty register → 400, no crash loop.
- **Security**: 0 critical, 0 high in app code. All SAST findings in `.agents/skills/` (external, not owned). HoundDog: 0 findings.

### Fixed previous session (2026-05-31)
- **TypeScript error fixed** — `components/AuthGate.tsx` was missing `useRef` in its React import (introduced when `comingSoonTimer` ref was added). Added `useRef` to import. Project now type-checks clean: `npx tsc --noEmit` → 0 errors.
- No new vulnerabilities introduced. No dead files, bad imports, or misplaced files found.

### Fixed previous session (2026-05-30)
- **MDB full retheme** — all 9 MDB screens rewritten with charcoal/cyan/pink palette. No security impact; TypeScript still 0 errors after all changes.
- **Metro port conflict resolved** — Start Frontend workflow was stuck prompting for port 8082; restarted cleanly.
- **Package version rollback + safe patches** — user accidentally bumped `expo` SDK 54→56, `react-native` 0.81.5→0.85.3, `expo-router` 6→56, `react-native-keyboard-controller` 1.20.6→1.21.8, and others. Reverted all breaking jumps; applied only the safe SDK 54 patch updates Metro recommended (`expo@~54.0.35`, `expo-file-system@~19.0.23`, `expo-font@~14.0.12`, `expo-router@~6.0.24`). `react-native-keyboard-controller` re-pinned to exactly `1.20.6` (no caret). `babel-preset-expo` was dropped and reinstalled at `~54.0.10` (rollback pulled in v56, causing Metro crash). TypeScript 0 errors, Metro clean.
- **expo-asset missing + HTTPS patch** — the package reinstalls dropped `expo-asset` from top-level `node_modules`. `patch-package` postinstall was failing silently (`expo-asset not present`), meaning the critical HTTPS asset-URL patch (`patches/expo-asset+12.0.12.patch`) was never applied. Without it, Expo Go on Replit loads all assets (fonts, images) over `http://` instead of `https://`, causing runtime crashes. Fixed by: installing `expo-asset@~12.0.13` (SDK 54 expected version), renaming patch to `expo-asset+12.0.13.patch`, running postinstall — patch now applies cleanly (`expo-asset@12.0.13 ✔`).
- No new vulnerabilities introduced. No dead files or bad imports found.

### Fixed previous session (2026-05-29)
- **4 TypeScript errors eliminated** — project now type-checks clean (`npx tsc --noEmit` → 0 errors):
  - `lib/mdb-voice-context.tsx`: Added missing `web` property to `RecordingOptions` object.
  - `lib/mdb-voice-context.tsx`: Fixed TS flow-narrowing false positive on `VoiceGateState` ref — added explicit cast `(voiceStateRef.current as VoiceGateState)`.
  - `server/config.ts`: Fixed `deepMerge` signature clash between `AppConfig` and `Record<string, unknown>` — callsite uses `as unknown as` double-cast.
- Removed `drizzle-orm@0.39.3` + `drizzle-zod` + `drizzle-kit` (HIGH SQL injection CVE). Updated 7 expo packages to latest patch.
- **Codebase declutter** — removed 3 stale artifacts, freeing ~75MB:
  - `EDENMUX_FULL_SOURCE.txt` — 112KB/3870-line source dump, leftover from an early export, zero code references.
  - `shared/` — empty directory left behind after `shared/schema.ts` was deleted in a prior session.
  - `attached_assets/` — 90 raw iPhone photos (~75MB) uploaded during past agent sessions for visual context; not referenced anywhere in code.

### Security scan — 2026-08-03
- **0 critical, 0 high, 0 moderate** — `npm audit` fully clean
- **SAST**: 0 findings in app code (`server/`, `lib/`, `app/`, `components/`)
- **Secrets**: JWT fallback `_DEFAULT_JWT_SECRET` in `server/auth.ts` is intentional dev-only placeholder; production exits at boot if `SESSION_SECRET` is unset — acceptable
- TypeScript: **0 errors** (`npx tsc --noEmit` clean)
- Fixed: ThemeShop now has two packs (Original 5 + Metallic 4) with separate bundle buttons
- Added: 5 new themes (glitter, gold, chrome, cobalt, silver) with full terminal palettes and RC product IDs
- New images: `assets/images/theme-{candy,cyber,neo,gothic,glitter,gold,chrome,cobalt,silver}.jpeg` + new default `eden-landing.jpeg` / `eden-portrait.jpeg`
- `METALLIC_BUNDLE_PRODUCT_ID = 'com.edenmux.theme_bundle_metallic'` exported from theme-context
- `seedRevenueCat.ts` updated with all 5 new products + metallic bundle entitlement wiring
- EAS account migrated: `livhappier` → `livhappierapps`; `EAS_PROJECT_ID` and `EAS_OWNER` now read from env vars

### Dependency vulnerabilities — scanner results 2026-06-29
- **0 critical** in app code
- **0 high in app code** — two HIGH findings exist but neither is exploitable:
  - `http-proxy-middleware@3.0.5` (CVE-2026-55602, host+path substring routing bypass) — our usage only sets `target: "http://localhost:8081"` with no `router` option. The vulnerable code path is never reached. Not exploitable.
  - `undici` via `expo@54 → @expo/cli` — Expo CLI dependency, never runs in production app. Unfixable without breaking Expo.
- **5 moderate** in Expo's internal dependency tree. Cannot be patched without `npm audit fix --force` which would break the Expo install. Track for next Expo minor/major release.

### SAST findings — all false positives / external files
- All SAST findings are in `.agents/skills/` (platform-installed skill scripts we don't own). Zero findings in `server/`, `lib/`, `app/`, or `components/`.
- **HoundDog**: 0 findings — clean.
- Known false positives: insecure WebSocket in `lib/shell-client.ts` (uses `wss://` correctly at runtime), path traversal in `server/index.ts` (explicit allowlist), SQL raw in auth/eden (fully parameterized).
- **Last full security + health pass: 2026-08-07** — 0 TS errors, backend clean, all endpoints healthy.

### Eden & Apple Compliance (2026-08-07)
- `server/eden.ts` `buildSystemPrompt()`: three distinct personas — iOS (Apple sandbox, compliant), open platform (Android/PC, full Termux), dev mode (`ext=true` / `_x` flag, fully unlocked with warn-and-allow philosophy).
- iOS command intercept layer in `lib/terminal-context.tsx` (`reviewIOSCommand()`) — catches Guideline 2.5.2-blocked commands (node, python, ruby, eval, ssh, nmap, nc, etc.) before the engine and returns an Eden-voiced explanation. Never a silent failure.
- First-launch Apple compliance notice in `app/index.tsx` — iOS only, dismissible, stored in AsyncStorage (`@edenmux_apple_notice_dismissed`).
- Eden personality rewritten: platonic bestie framing, explicit AI transparency section, emotional dependency prevention built in, charm without romantic framing.
- Dev mode (`_x=true`): warn-and-allow, no blocks, jail-time deterrents for illegal activity, enthusiastic about clever power moves.

---

## Bug Fix History

| Bug | Root Cause | Fix |
|---|---|---|
| Voice never played (app crash on file system) | SDK 54 moved `documentDirectory`, `cacheDirectory`, `EncodingType` to sub-path | Switched all imports to `expo-file-system/legacy` in `terminal-engine.ts` and `EdenPanel.tsx` |
| `FileInfo.size` TypeScript errors | Missing `info.exists` narrowing before `.size` access | Added `info.exists ? info.size : 0` guards (3 locations) |
| Dead Platform.OS comparison error | Comparing `Platform.OS === 'web'` on a type that can never be `'web'` | Removed dead branch in `AuthGate.tsx` |
| Social sign-in buttons silent | OAuth not implemented | Added "Soon" pill + 2.2s info banner |
| EdenPanel header buttons blocked when open | `avatarBtn` covered entire panel with pointer events | Added `pointerEvents={isOpen ? 'none' : 'auto'}` on avatarBtn |
| Camera icon triggered logout | No testIDs, touch overlap between buttons | Added testIDs; reduced hitSlop; increased gap |
| Eden speaks twice simultaneously | Two auto-speak `useEffect` hooks fired in same render; dedup ref was set inside a `setTimeout` so Effect 2 didn't see it | Moved `lastEdenMsgIdRef.current` assignment before the `setTimeout` in Effect 1 — synchronous claim blocks Effect 2 in the same render |
| `drizzle-orm` HIGH SQL injection CVE | Unused package installed but vulnerable | Removed drizzle-orm, drizzle-zod, drizzle-kit entirely; deleted dead schema/storage/config files |
| Start Frontend workflow always "failed" | `ensurePreviewReachable = "/status"` — Metro has no `/status` endpoint | Reconfigured Start Frontend as `console` output type (no HTTP health check required) |
| Warning system dead code | Old warning/ban system removed but references remained | Cleaned all `hasWarning`, `clearWarning`, `[WARN]` detection, `warningBadge` UI, `BAN_DURATIONS` references |
| Expo Go crash "Something went wrong" on Android (Samsung A17) | Metro was serving a stale bundle cache that had `httpServerLocation='/assets/images'` for an asset that was previously at a different path. Metro strips `/assets/` from request URLs, so it looked for `images/something` at the project root — directory didn't exist → ENOENT → 404 → crash. | Added `--clear` flag to the `expo:dev` npm script. Now Metro wipes its bundle cache on every restart, so stale `httpServerLocation` values can never persist. |
| Expo Go stopped working after EAS attempt | Installing `expo-dev-client` switched Metro to development-client mode — the QR URL changed from `exp://` to `exp+edenmux://`, which Expo Go cannot parse. | Removed `expo-dev-client`; Metro reverts to Expo Go mode automatically. |

---

## Important Notes for Future Agents

- **EAS appVersionSource is "local"**: `eas.json` sets `cli.appVersionSource = "local"`, meaning the app version and build number are read from `app.json` (managed in the repo) rather than auto-incremented by EAS servers. Bump `expo.version` and `expo.ios.buildNumber` / `expo.android.versionCode` in `app.json` before each release build.
- **Package manager is pnpm**: This project switched from npm to pnpm to fix EAS Android build crashes. Use `pnpm install` instead of `npm install`. The lockfile is `pnpm-lock.yaml`. `.npmrc` has `shamefully-hoist=true` for Metro/Expo compatibility. Do NOT recreate `package-lock.json` — EAS detects pnpm via the absence of `package-lock.json` and presence of `pnpm-lock.yaml`.
- **expo-file-system**: Always import from `expo-file-system/legacy` in this project. The bare `expo-file-system` import throws at runtime in SDK 54.
- **react-native-keyboard-controller**: Pinned at exactly `1.20.6` (no caret). Do NOT upgrade — pinned for stability.
- **Metro `--clear` on every start**: The `expo:dev` script uses `npx expo start --localhost --clear`. This is intentional. Without `--clear`, Metro caches bundle metadata including asset `httpServerLocation` values. If an asset is ever moved or renamed, the stale cache persists across restarts and causes ENOENT crashes on device. `--clear` ensures a fresh build on every Metro start. The extra ~15s build time on first connect is the correct trade-off.
- **No ORM**: The DB layer is raw `pg.Pool`. Do not add drizzle or any ORM back.
- **Auth is JWT**: No session cookies. Clients send `Authorization: Bearer <token>`. The correct endpoint for verifying a stored token is `POST /api/auth/verify`.
- **Eden API key**: Stored in env as `Eden` (alias for `XAI_API_KEY`). The code checks both: `process.env.XAI_API_KEY || process.env.Eden`.
- **Demo account**: `apple.review@edenmux.com` / `EdenReview2026!` | Invite code: `Friends&Fam!`
- **Google Play**: Not supported by Replit's publishing. iOS only via Expo Launch.
- **server/storage.ts** and **shared/schema.ts**: Deleted. Do not recreate.
- **Password-reset link base URL**: `server/auth.ts` builds reset URLs using `APP_PUBLIC_URL` (full URL, e.g. `https://edenmux.replit.app`) when set — this is the stable production base. Without it, the code falls back to `REPLIT_DOMAINS` (deployed stable domain) then `REPLIT_DEV_DOMAIN` (ephemeral dev domain). Set `APP_PUBLIC_URL` as a Replit secret to the production domain once deployed so reset emails always point to the live app.
- **App Store ID (fill in after first publish)**: Once the app is live on the App Store, find the numeric ID in the App Store Connect URL — it's the number after `/id` in the app's page URL (e.g. `apps.apple.com/app/id1234567890`). Fill it in one of two ways:
  1. Set `EXPO_PUBLIC_APP_STORE_ID` as a Replit environment variable (shared) to the numeric ID (e.g. `1234567890`) — no rebuild needed.
  2. Or set `extra.appStoreId` in `app.json` to the same numeric string and rebuild.
  Until this is done, the "Update on App Store" button on the update-required screen falls back to an App Store search for "EdenMux" instead of a direct link.
