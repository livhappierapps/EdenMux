# Privacy Dataflow Review

**Reviewed:** October 15, 2026  
**Scope:** Authentication, voice, AI chat, email, application logging, and the related third-party boundaries.

## Manual source review

- **Authentication:** `lib/auth-context.tsx` sends email/password credentials only to the login or registration API over the configured HTTPS API URL. `server/auth.ts` hashes passwords with bcrypt and signs JWTs; mobile clients prefer SecureStore, with AsyncStorage fallback, while web uses app storage. Reset tokens are sent to the user by email. Error logs no longer print exception objects, and HTTP request logs no longer capture response bodies.
- **Voice:** `components/EdenPanel.tsx` sends recorded audio to the authenticated transcription route and sends Eden response text to the authenticated speech route. `server/voice.ts` forwards audio to ElevenLabs Scribe and text to ElevenLabs text-to-speech. Neither handler writes the audio or transcript to the database; provider error bodies and exception details are not logged or returned.
- **AI chat:** `lib/eden-context.tsx` sends recent chat messages to `server/eden.ts`, which forwards them to xAI Grok. For requests whose `_x` flag is true, the server reads and stores memory and later sends daily interaction summaries to Grok. Requests with `_x` false now skip both memory reads and persistent writes, matching the app's intended free-tier behavior.
- **Email:** `server/auth.ts` creates a one-time reset URL and `server/email.ts` sends the recipient address and reset link to Resend for delivery. The link and recipient are no longer written to logs. The reset page disables caching and referrers, then removes the query string from browser history after reading the token.
- **Logging:** `server/index.ts` now logs only API method, path (without query string), status, and duration. Error logging in the reviewed auth, voice, Eden, config, build, and OTA paths records error type/status rather than request data, provider response bodies, or raw exception messages.
- **Other providers:** Apple identity tokens are verified against Apple's public keys; RevenueCat handles purchase identity and entitlement status in the mobile SDK; EAS calls fetch build/update metadata. The reviewed source does not log these credentials or user chat/voice payloads.
- **Shell authentication:** Updated clients send the JWT as the first WebSocket message instead of in the URL. The server temporarily accepts URL-token authentication for older installed clients. Shell child processes now receive a small allowlist of ordinary runtime environment values rather than the backend's entire environment.
- **Privacy notices:** The in-app and public policies now identify ElevenLabs Scribe (not OpenAI Whisper), disclose Resend's password-reset delivery, describe Core Unlock memory versus free-tier chat handling, and distinguish local iOS terminal activity from Android/web shell traffic sent to the backend.

## Concrete findings addressed

1. API response bodies—including login tokens, chat replies, and transcription text—were included in request logs. Request logs now omit all response bodies.
2. Development fallback and provider errors could log reset links, recipient details, or provider response content. These are now replaced with fixed messages and status/error-type metadata.
3. Free-tier chat messages were being persisted to server memory despite the privacy notice. New requests that the app marks as non-Core no longer read or write persistent Eden memory.
4. Voice transcription actually used ElevenLabs Scribe while both policy copies described OpenAI Whisper. The notices now match the implementation.
5. Reset links could remain in browser history and be cached; the reset page now sends `no-store` and `no-referrer` headers and removes the token from the address bar after reading it.
6. New shell clients previously placed JWTs in a WebSocket URL. They now authenticate in the first frame, and shell children no longer inherit the backend's complete environment.
7. The privacy notice incorrectly described all terminal activity as local. It now discloses remote Android/web shell traffic.

## Automated coverage and verification

- `npx tsc --noEmit` — passed.
- Server bundle with esbuild — passed.
- `npx eslint app/privacy.tsx` — passed.
- `npm run test:smoke` — passed all seven smoke checks.
- `npm run lint` — still fails on six existing errors in `components/AuthGate.tsx`, `components/EdenPanel.tsx`, and `components/TerminalOutput.tsx`; it also reports existing warnings. The changed privacy screen itself passes targeted ESLint.
- HoundDog — the two prior attempts and one focused retry failed with `HOUNDDOG_SCHEMA_MISMATCH`. No successful privacy scan result is available, and no zero-finding claim is made.

## Remaining limitations

- `_x` is supplied by the client; the normal app sets it from Core Unlock status, but the backend does not independently verify a RevenueCat entitlement before retaining memory. Historical memory rows also lack tier markers, so previously stored free-tier messages cannot be safely distinguished from paid history for cleanup.
- The shell still has access to the backend runtime's filesystem and runs under the same service account. The environment allowlist reduces direct inheritance, but this review did not establish OS-level process isolation or test whether the shell can inspect its parent process.
- The URL-token fallback remains for older installed clients. Proxy access-log retention is outside the source tree, and the WebSocket first-frame handshake was verified by typecheck/bundle/startup rather than an end-to-end client session.
- Third-party provider retention practices were not audited; this review confirms what the application sends, not what Apple, xAI, ElevenLabs, Resend, RevenueCat, or Expo retain under their own policies.
