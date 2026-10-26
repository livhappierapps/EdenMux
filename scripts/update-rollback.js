#!/usr/bin/env node
/**
 * Roll back the production OTA channel to a previous update group.
 *
 * Usage:
 *   node scripts/update-rollback.js <group-id>
 *   npm run update:rollback -- <group-id>
 *
 * <group-id> is the UUID of the update group to republish.
 * Find it in the EAS Dashboard or via `eas update:list`.
 *
 * What this does:
 *   Runs `eas update:republish --group <id> --channel production --platform all`
 *   which re-publishes the chosen bundle as the newest entry on the production
 *   channel — all devices on that channel fetch it on next launch.
 *
 * Security: group ID is validated against UUID format and passed as a
 * CLI argument array (never interpolated into a shell string).
 */

"use strict";

const { spawnSync } = require("child_process");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const groupId = process.argv[2];

if (!groupId) {
  console.error(`
Usage: npm run update:rollback -- <group-id>

<group-id>  UUID of the update group to republish to the production channel.
            Find it at: https://expo.dev/accounts/livhappierapps/projects/edenmux/updates
            or run:     npx eas update:list

Example:
  npm run update:rollback -- 879aa638-cf91-4e27-aa1f-64d9f1ba28b1
`);
  process.exit(1);
}

if (!UUID_RE.test(groupId)) {
  console.error(
    `❌ Invalid group ID "${groupId}". Must be a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).`
  );
  process.exit(1);
}

const message = `Rollback to update group ${groupId}`;

console.log(`
🔄 Rolling back production channel to group ${groupId}...
   Message: "${message}"
   Platform: all (android + ios)
`);

const result = spawnSync(
  "npx",
  [
    "eas",
    "update:republish",
    "--group",    groupId,
    "--channel",  "production",
    "--platform", "all",
    "--message",  message,
    "--non-interactive",
  ],
  { stdio: "inherit", encoding: "utf8" }
);

if (result.status !== 0) {
  console.error(`\n❌ Rollback failed (exit ${result.status}).`);
  process.exit(result.status ?? 1);
}

console.log(`
✅ Rollback complete. Devices on the production channel will receive
   update group ${groupId} on next launch.

To verify: npx eas channel:view production
`);
