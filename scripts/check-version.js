#!/usr/bin/env node
/**
 * Pre-build guard: reads the app.json snapshot baked into the last git tag
 * and verifies that ALL THREE store identifiers have been strictly incremented:
 *
 *   expo.version             (semver — must be strictly greater)
 *   expo.ios.buildNumber     (integer string — must be strictly greater)
 *   expo.android.versionCode (integer — must be strictly greater)
 *
 * Run BEFORE creating the release tag so the comparison is against the
 * previous release, not the one you are about to cut.
 *
 * Usage:
 *   node scripts/check-version.js
 *   npm run version:check
 *
 * First-release (no v* tag): always exits 0 with an advisory notice.
 *
 * Security: all git invocations use spawnSync with argument arrays so no
 * shell is spawned and tag names can never be used for command injection.
 * Accepted tag format is validated against /^v\d+\.\d+\.\d+$/ before use.
 */

"use strict";

const { spawnSync } = require("child_process");
const { readFileSync } = require("fs");
const { resolve } = require("path");

const APP_JSON = resolve(__dirname, "../app.json");

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Run a git command via spawnSync (no shell, safe from injection).
 * Returns trimmed stdout on success or null on any error.
 */
function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0 || result.error) return null;
  return result.stdout.trim();
}

/** Returns true when semver string a is strictly greater than b. */
function semverGt(a, b) {
  const parse = (s) =>
    String(s ?? "0.0.0").split(".").map((seg) => {
      if (!/^\d+$/.test(seg)) throw new Error(`Non-numeric semver segment "${seg}" in "${s}"`);
      return Number(seg);
    });
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false; // equal
}

/**
 * Parses value as a non-negative integer.
 * Rejects anything that is not an exact sequence of decimal digits
 * (e.g. "1junk", "1.5", "", undefined all throw).
 */
function parseIntStrict(value, fieldName) {
  const s = String(value ?? "");
  if (!/^\d+$/.test(s)) {
    throw new Error(
      `${fieldName} must be a non-negative integer (digits only), got: ${JSON.stringify(value)}`
    );
  }
  return Number(s);
}

// ── read current app.json ──────────────────────────────────────────────────

let expo;
try {
  expo = JSON.parse(readFileSync(APP_JSON, "utf8")).expo ?? {};
} catch (err) {
  console.error(`❌ Could not parse app.json: ${err.message}`);
  process.exit(1);
}

let currentVersion, currentBuild, currentVersionCode;
try {
  currentVersion     = String(expo.version ?? "");
  currentBuild       = parseIntStrict(expo.ios?.buildNumber,     "ios.buildNumber");
  currentVersionCode = parseIntStrict(expo.android?.versionCode, "android.versionCode");
} catch (err) {
  console.error(`❌ app.json validation error: ${err.message}`);
  process.exit(1);
}

console.log(`Current app.json
  expo.version             = ${currentVersion}
  ios.buildNumber          = ${currentBuild}
  android.versionCode      = ${currentVersionCode}`);

// ── find last v* git tag ───────────────────────────────────────────────────

const lastTag = git("describe", "--tags", "--match", "v*", "--abbrev=0");

if (!lastTag) {
  console.log(`
⚠️  No previous v* git tag found.
   Assuming this is the first release — OK to build.
   After building, tag this release: git tag v${currentVersion}
`);
  process.exit(0);
}

// Validate the tag matches the expected vMAJOR.MINOR.PATCH format before
// using it in any further git invocation, preventing unexpected inputs.
if (!/^v\d+\.\d+\.\d+$/.test(lastTag)) {
  console.error(
    `❌ Last tag "${lastTag}" does not match expected vMAJOR.MINOR.PATCH format. ` +
    `Aborting to avoid comparing against an unexpected reference.`
  );
  process.exit(1);
}

// ── read app.json from the last tag (no shell, safe) ──────────────────────

// git show <ref>:<path> — arguments passed as array, never interpolated into shell
const taggedRaw = git("show", `${lastTag}:app.json`);

if (!taggedRaw) {
  console.log(`
⚠️  Could not read app.json from tag ${lastTag} (file may not have existed yet).
   Skipping comparison — OK to build.
`);
  process.exit(0);
}

let taggedExpo;
try {
  taggedExpo = JSON.parse(taggedRaw).expo ?? {};
} catch (err) {
  console.error(`❌ app.json at tag ${lastTag} is not valid JSON: ${err.message}`);
  process.exit(1);
}

let taggedVersion, taggedBuild, taggedVersionCode;
try {
  taggedVersion     = String(taggedExpo.version ?? "0.0.0");
  taggedBuild       = parseIntStrict(taggedExpo.ios?.buildNumber     ?? 0, "ios.buildNumber (tagged)");
  taggedVersionCode = parseIntStrict(taggedExpo.android?.versionCode ?? 0, "android.versionCode (tagged)");
} catch (err) {
  console.error(`❌ Tagged app.json validation error: ${err.message}`);
  process.exit(1);
}

console.log(`
Last tag: ${lastTag}
  expo.version             = ${taggedVersion}
  ios.buildNumber          = ${taggedBuild}
  android.versionCode      = ${taggedVersionCode}
`);

// ── compare all three identifiers ─────────────────────────────────────────

const failures = [];

try {
  if (!semverGt(currentVersion, taggedVersion)) {
    failures.push(`  expo.version: ${currentVersion} must be > ${taggedVersion}`);
  }
} catch (err) {
  failures.push(`  expo.version: ${err.message}`);
}

if (currentBuild <= taggedBuild) {
  failures.push(`  ios.buildNumber: ${currentBuild} must be > ${taggedBuild}`);
}
if (currentVersionCode <= taggedVersionCode) {
  failures.push(`  android.versionCode: ${currentVersionCode} must be > ${taggedVersionCode}`);
}

if (failures.length > 0) {
  console.error(`❌ Version check FAILED — the following must be strictly incremented:\n`);
  failures.forEach((f) => console.error(f));
  console.error(`
Run  npm run version:bump  to fix all three atomically, then re-run this check.
Do NOT create the git tag until this check passes.
`);
  process.exit(1);
}

console.log(`✅ All three identifiers are strictly ahead of ${lastTag}. Safe to build.\n`);
