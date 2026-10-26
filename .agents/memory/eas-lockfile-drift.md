---
name: EAS lockfile drift breaks npm ci
description: package-lock.json can silently drift out of sync with package.json's nested dependency overrides, passing local `npm install` but failing EAS's strict `npm ci`.
---

## Symptom
EAS build fails in the "Install dependencies" phase with:
```
npm error Invalid: lock file's X@a does not satisfy X@b
npm error Missing: Y@c from lock file
```
This happens even though local dev (`npm install`, Metro, `tsc`) all work fine — `npm install` tolerates drift and patches around it, but `npm ci` requires the lock file to exactly match package.json's resolved tree and fails hard on any mismatch.

## Root cause
Transitive/nested dependencies (e.g. a CLI tool's own sub-dependencies like minimatch/brace-expansion/balanced-match) can drift when one package gets bumped without a full lock file regeneration, especially across multiple unrelated task-agent merges that each touch package.json independently.

## Fix
Reinstall the specific package implicated in the version-mismatch error (not a blanket `npm install`) — this forces npm to resolve and rewrite just that subtree in the lock file:
```js
await installLanguagePackages({ language: "nodejs", packages: ["<package-from-error>"] });
```
Verify by inspecting `package-lock.json`'s `packages` map for the conflicting dep names — every nested occurrence should resolve consistently within its own subtree (npm v7+ allows different versions in different subtrees, that's fine; the bug is an actual stale/missing entry, not differing subtree versions).

**Why:** EAS (and any CI using `npm ci`) is the canary for lock file drift that local `npm install` silently tolerates. Always treat an EAS "Install dependencies" phase failure as a lock file sync problem first, not an EAS infra problem.

**How to apply:** After any session/task-agent work that touches package.json, before submitting an EAS build, diff package-lock.json or just re-run the install for whatever package the error names.
