#!/usr/bin/env node
/**
 * Atomically bumps the app version in app.json.
 *
 * Usage:
 *   node scripts/version-bump.js          # bump patch (1.0.0 → 1.0.1)
 *   node scripts/version-bump.js minor    # bump minor (1.0.0 → 1.1.0)
 *   node scripts/version-bump.js major    # bump major (1.0.0 → 2.0.0)
 *
 * Updates in one atomic write:
 *   expo.version             (semver string)
 *   expo.ios.buildNumber     (integer string, always increments by 1)
 *   expo.android.versionCode (integer, always increments by 1)
 */

const { readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");

const APP_JSON = resolve(__dirname, "../app.json");

function bumpSemver(version, part) {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (part) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    default:      return `${major}.${minor}.${patch + 1}`;
  }
}

const part = process.argv[2] ?? "patch";
if (!["major", "minor", "patch"].includes(part)) {
  console.error(`Unknown bump type "${part}". Use major | minor | patch.`);
  process.exit(1);
}

const raw = readFileSync(APP_JSON, "utf8");
const config = JSON.parse(raw);
const expo = config.expo;

const prevVersion     = expo.version;
const prevBuild       = String(expo.ios?.buildNumber ?? "0");
const prevVersionCode = Number(expo.android?.versionCode ?? 0);

const nextVersion     = bumpSemver(prevVersion, part);
const nextBuild       = String(Number(prevBuild) + 1);
const nextVersionCode = prevVersionCode + 1;

expo.version                  = nextVersion;
expo.ios                      = expo.ios ?? {};
expo.ios.buildNumber          = nextBuild;
expo.android                  = expo.android ?? {};
expo.android.versionCode      = nextVersionCode;

writeFileSync(APP_JSON, JSON.stringify(config, null, 2) + "\n", "utf8");

console.log(`
✅ Version bumped (${part})

  version       ${prevVersion}  →  ${nextVersion}
  buildNumber   ${prevBuild}  →  ${nextBuild}
  versionCode   ${prevVersionCode}  →  ${nextVersionCode}

Next steps:
  1. Commit: git add app.json && git commit -m "chore: bump version to ${nextVersion}"
  2. Tag:    git tag v${nextVersion}
  3. Build:  eas build --profile production --platform all
`);
