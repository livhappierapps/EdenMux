# Threat Model

## Project Overview

EdenMux is a public-facing Expo/React Native app with an Express backend and PostgreSQL database. The production backend serves the landing page, API routes, and a WebSocket shell service. The primary users are mobile app users, but because the deployment is public, every production HTTP and WebSocket endpoint must be treated as reachable from the internet.

This scan assumes:
- Production runs with `NODE_ENV=production`
- Replit provides TLS at the edge
- Dev-only Metro/proxy behavior is out of scope unless production reachability is proven

## Assets

- **Server command execution environment** — the backend host process, filesystem, environment variables, and any attached secrets. Compromise here becomes full application compromise.
- **User accounts and auth state** — email/password accounts, JWTs, Apple-linked identities, and extended-access flags. Weaknesses here enable impersonation or unauthorized feature access.
- **AI and voice API credits** — xAI and ElevenLabs keys and the paid external requests they authorize. Abuse here can create direct financial loss and service disruption.
- **User conversation memory and moderation data** — per-device summaries, daily logs, and ban state stored in PostgreSQL. Exposure here leaks private user interaction history and enforcement status.
- **Remote configuration state** — live feature flags, voice configuration, MOTD, and future minimum-version controls. Unauthorized changes affect all users on next launch.
- **Application source and internal artifacts** — exported archives, old feature bundles, and backend implementation details that could help attackers discover credentials, hidden routes, or weak defaults.

## Trust Boundaries

- **Client to backend API** — the mobile/web app is untrusted. Every request body, header, and device ID can be attacker-controlled.
- **Public internet to WebSocket shell** — any exposed shell endpoint is a critical trust boundary because it can bridge directly into server command execution.
- **Backend to PostgreSQL** — the server has broad database access. Injection or logic flaws here can expose user data or alter moderation/config records.
- **Backend to third-party AI/voice providers** — server routes can spend API credits and process user content through xAI and ElevenLabs.
- **Public to admin boundary** — admin/config or maintenance actions must be protected independently of the client.
- **Production to dev-only boundary** — Metro proxying, localhost allowances, and dev helper behavior should not be considered vulnerabilities unless they are reachable in production mode.

## Scan Anchors

- Production entry points: `server/index.ts`, `server/routes.ts`, `server/shell.ts`
- Highest-risk code areas: `server/auth.ts`, `server/eden.ts`, `server/voice.ts`, `server/config.ts`, public download/archive paths
- Public surfaces: `/api/auth/*`, `/api/eden/*`, `/api/config`, `/api/sys/*`, `/ws/shell`, `/api/dl/mdb`, `/assets/*`
- Admin surface: `/api/admin/config`
- Dev-only areas usually to ignore in production: Metro proxy branch in `server/index.ts`, Expo local bundler behavior, development scripts in `package.json`

## Threat Categories

### Spoofing

Authentication is split between Apple/device-side state and backend JWTs. The backend must never rely on client claims alone, and production must not fall back to predictable default secrets. Any privileged or identity-bearing backend action must be bound to server-validated credentials, not just a user-supplied device ID, email, or boolean flag.

Required guarantees:
- Production JWT signing keys must come from secrets, not built-in defaults.
- Server-side privileged actions must require server-validated authentication.
- Extended-access or invite-style privileges must not depend on guessable or reusable shared secrets without abuse controls.

### Tampering

Clients can submit arbitrary config-like, auth-like, and AI request bodies. The backend must reject unauthorized state changes and must not let untrusted clients drive server-side side effects beyond their own scope.

Required guarantees:
- Remote config changes must require a strong admin secret.
- Public routes must not let one client trigger state changes for all users unless explicitly authorized.
- All database writes must remain parameterized and scoped to the intended actor.

### Information Disclosure

The backend stores private chat summaries, moderation state, and authentication material, and it also keeps old archives in the repo. Public routes, logs, and downloads must not expose secrets, tokens, internal source bundles, or user-specific memory data to unauthenticated callers.

Required guarantees:
- Auth responses and secrets must not be exposed through public logs or downloads.
- Device-scoped memory and moderation data must not be readable by arbitrary callers.
- Old source archives and sensitive exports must not be publicly downloadable in production.

### Denial of Service

Several endpoints invoke external AI/voice services or expensive database work. Public attackers can abuse these to burn API credits, create queue pressure, or degrade service availability.

Required guarantees:
- Costly public endpoints must have authentication, rate limits, or other abuse controls.
- Batch or maintenance jobs must not be triggerable by arbitrary internet users.
- WebSocket and long-lived connection surfaces must enforce access control and reasonable lifecycle limits.

### Elevation of Privilege

The most dangerous boundary in this project is anything that crosses from public network access into shell execution or broad backend capability. The app also has an extended-access tier that changes assistant behavior and unlocked features, so privilege transitions must be deliberate and protected.

Required guarantees:
- No public or weakly protected route may grant shell access or server-side code execution.
- Privilege-bearing flags must be derived from server-trusted state.
- Admin and maintenance capabilities must be separated from ordinary user flows and enforced on the server.
