---
name: greatest-hits
description: Full project health check — security scan, TypeScript type-check, deep debug, E2E test, fix all failures, retest until clean, reorganize and declutter files/folders, then update replit.md with the new security state. Use when the user says "run a full check", "security scan and fix", "greatest hits", "deep debug", "health check", "scan and fix everything", "make sure everything is clean", "clean up the project", "declutter", or "reorganize files".
---

# Greatest Hits — Full Project Health Check

Run this when the user wants a full sweep of the project: security, types, runtime correctness, and documentation — all fixed before handing back.

## Sequence

### 1. Security Scan (parallel)
Run all three scanners at once:
```javascript
const [dep, sast, hound] = await Promise.allSettled([
  runDependencyAudit(),
  runSastScan(),
  runHoundDogScan(),
]);
```
Triage results by severity. Critical/high in **app code** (server/, lib/, app/, components/) must be fixed. Findings only in .agents/skills/, node_modules/, or build scripts are noise — note them and move on. Dependency vulns inside Expo's own tree (expo-*, @expo/*, react-native-*) are usually unfixable without breaking Expo — document them, don't break the build chasing them.

### 2. TypeScript Check
```bash
npx tsc --noEmit 2>&1
```
Every TS error must be fixed before proceeding. Common patterns in this project:
- `RecordingOptions` missing `web` property → add `web: { mimeType: 'audio/webm', bitsPerSecond: 64000 }`
- Flow-narrowing false positives on mutable refs → cast `(ref.current as Type)` to break the narrowing
- `deepMerge` type clashes between specific interfaces and `Record<string, unknown>` → use `as unknown as TargetType` at callsite

### 3. Deep Debug
Read the backend and frontend workflow logs. Look for:
- Runtime errors or unhandled promise rejections in the backend
- Metro bundler errors in the frontend
- Any module not found / import errors

Fix anything that would prevent the app from starting or cause crashes at runtime.

### 4. E2E Test (backend APIs + landing page)
Run with `runTest()`. Test plan must cover:
- Landing page loads (HTTP 200, not blank/5xx)
- `GET /api/config` returns valid JSON with `features`, `eden`, `app` fields
- `POST /api/auth/login` with bad creds returns 400/401, NOT 500 (server must not crash)
- `POST /api/auth/register` with empty fields returns 400 (validation works)
- Server still responds after all the bad requests (no crash loop)

If tests fail due to a timing issue right after a workflow restart, wait a moment and retry once before diving into bug fixes.

### 5. Fix → Retest Loop
For each failure:
1. Read the relevant file and the test output carefully
2. Make the targeted fix
3. Restart the affected workflow if server-side
4. Rerun only the failing test(s) to confirm
Repeat until all tests pass.

### 6. Reorganize & Declutter
Walk the project tree and clean house. Do all of the following:

**Delete dead files:**
- Any file explicitly noted as deleted in `replit.md` that somehow came back (e.g. `server/storage.ts`, `shared/schema.ts`, `drizzle.config.ts`)
- Orphaned test/scratch/temp files (`*.tmp`, `*.bak`, debug scripts left in root, etc.)
- Duplicate or stale copies of components that have been superseded

**Check folder structure:**
- Files in the wrong directory (e.g. a component sitting in `lib/` instead of `components/`)
- Empty directories with no files
- Misnamed files that don't match the convention of their neighbors

**Check imports:**
- Run a quick grep for imports of deleted modules — they'll crash at runtime even if TS doesn't catch them
- Look for `require()` calls that should be ES imports (TypeScript project convention)

**EdenMux-specific things to check:**
- `server/storage.ts`, `shared/schema.ts`, `drizzle.config.ts` — must NOT exist (were deleted; don't let them creep back)
- `app/mdb/` — MDB routes should be self-contained; flag any MDB file that leaked into the main `app/` root
- `lib/` vs `components/` boundary — `lib/` is for contexts, engines, and utilities; `components/` is for UI. Flag anything in the wrong place.
- Unused assets in `assets/` — flag but don't delete without confirming with the user (assets can be intentional placeholders)

After cleaning, do a final `npx tsc --noEmit` to confirm nothing broke.

### 7. Update replit.md
After a clean run, update the **Security State** section in `replit.md`:
- Update `Last full scan:` date to today
- List anything newly fixed under "Fixed this session"
- List remaining unfixable vulns (Expo internals, etc.) with a clear explanation of why they're acceptable

## EdenMux-Specific Notes

**Known unfixable vulns (Expo internals — do not attempt to fix):**
- `tmp` via `patch-package` (dev-only, never runs in production)
- `uuid` via `@expo/ngrok` and `@expo/config-plugins` → `xcode` (Expo build tooling only)
- 16 moderate vulns in Expo's internal dependency tree (expo-linking, expo-splash-screen, etc.)

**Always check these after any MDB changes:**
- `lib/mdb-voice-context.tsx` — RecordingOptions type, VoiceGateState ref narrowing
- `lib/mdb-eden-context.tsx` — action tag parsing, passphrase flow
- `lib/mdb-actions-bridge.ts` — module-level singletons reset on hot reload (fine for dev, fine for prod)
- `server/config.ts` — deepMerge type casting

**expo-file-system**: Always import from `expo-file-system/legacy` — bare import crashes at runtime in SDK 54.

**react-native-keyboard-controller**: Pinned at 1.20.6. The "expected version: 1.18.5" Metro warning is wrong for this project — ignore it.

## Output to User

After the full sweep, give a clear summary:
```
Security:   0 critical, 0 high in app code | X moderate (Expo internals, unfixable)
TypeScript: CLEAN — 0 errors
Backend:    RUNNING — all startup tables init'd
E2E Tests:  PASSED — landing page, config API, auth endpoints all healthy
Declutter:  X dead files removed | Y misplaced files moved | structure clean
replit.md:  updated — security state current as of [date]
```
