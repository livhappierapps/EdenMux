---
name: EdenMux security scan interpretation
description: How to interpret tooling findings and scanner failures without overstating application security.
---

Treat past vulnerability counts and exemptions as historical, not as evidence for a current all-clear.

**Why:** Advisory databases change, and scans can include obsolete copied lockfiles as well as the active dependency tree. A package inside node_modules can still be an exposed backend dependency.

**How to apply:** Inspect the active dependency path and usage for each serious finding. Distinguish runtime exposure from CLI/build tooling; never blanket-dismiss all dependencies or scripts. Current scan results and deferred risks belong in replit.md, not memory.

Do not force an Expo SDK migration or incompatible major-version overrides merely to reduce scanner counts.

**Why:** Removing tooling findings by breaking native compatibility defeats the user's release-readiness goal.

**How to apply:** Fix compatible runtime dependencies first, document remaining tooling risks, and scope a separate compatibility-tested upgrade if needed.

A scanner schema error is an unavailable result, never a pass.

**Why:** Privacy scanning has returned schema-validation failures even when the other scanners succeed.

**How to apply:** Retry once if useful, report the missing coverage explicitly, and do not claim zero privacy findings.
