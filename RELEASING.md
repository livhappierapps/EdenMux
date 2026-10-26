# Releasing EdenMux

Follow these steps **in order** before every App Store / Play Store submission.
Skipping or reordering steps — especially tagging before the check — will break
the guard and may result in App Store Connect rejecting the build.

## Every production release

```bash
# 1. Bump all three store identifiers atomically
#    (expo.version semver, ios.buildNumber integer, android.versionCode integer)
npm run version:bump          # patch bump (default): 1.0.0 → 1.0.1
# npm run version:bump:minor  # minor bump:            1.0.0 → 1.1.0
# npm run version:bump:major  # major bump:            1.0.0 → 2.0.0

# 2. Verify ALL identifiers are strictly ahead of the previous tag
#    Run this BEFORE tagging; after tagging the comparison is against
#    the new tag and the check will correctly fail.
npm run version:check

# 3. Commit the version bump
git add app.json
git commit -m "chore: bump version to $(node -p "require('./app.json').expo.version")"

# 4. Tag the release (AFTER the check passes)
git tag v$(node -p "require('./app.json').expo.version")

# 5. Build for both platforms
eas build --profile production --platform all

# 6. Submit to App Store Connect + Play Console
eas submit --profile production --platform all
```

## What `version:bump` updates

| Field | JSON type | Store requirement |
|---|---|---|
| `expo.version` | semver string (`"1.0.1"`) | displayed to users in store listings |
| `expo.ios.buildNumber` | integer string (`"2"`) | must strictly increase per submission |
| `expo.android.versionCode` | integer (`2`) | must strictly increase per submission |

All three are written atomically in a single `app.json` pass.

## Shell authentication cutoff

The shell client now authenticates in its first WebSocket message; JWTs must
not be placed in the WebSocket URL. This release raises the supported app
version to **1.0.1**. The backend startup migration raises an older stored
`app.minimumVersion` to 1.0.1 while preserving a higher admin-configured value.

Roll out the change in this order:

1. Build and submit app version 1.0.1 to both stores.
2. Wait until the update is available to users in both stores.
3. Deploy the backend that removes URL-token authentication and raises the
   minimum-version floor.

Do not deploy the backend cutoff before the 1.0.1 store release is available:
older builds will be directed to update, and their shell connections will be
rejected unless they authenticate in the first WebSocket message. The app's
existing update-required screen handles versions below the enforced floor.

## What `version:check` validates

Reads the `app.json` snapshot stored inside the last `v*` git tag using
`git show <tag>:app.json` and confirms that **all three** identifiers are
strictly greater than their tagged values. A marketing-version bump that
leaves `buildNumber` unchanged still fails the check.

On a first release (no `v*` tag yet) the check exits 0 with an advisory.

## Rolling back a bad OTA update

If a broken JS bundle reaches production users, re-publish a known-good update
group in seconds — no native rebuild or store review required.

```bash
# 1. Find the previous good group ID
#    EAS Dashboard: https://expo.dev/accounts/livhappierapps/projects/edenmux/updates
#    Or list recent groups (copy the ID from the Group ID column):
npx eas update:list

# 2. Roll back (replaces the current production bundle for all devices)
npm run update:rollback -- <previous-group-id>

# Example:
npm run update:rollback -- 879aa638-cf91-4e27-aa1f-64d9f1ba28b1

# 3. Verify the channel now points at the rolled-back group
npx eas channel:view production
```

Devices fetch the rolled-back bundle on next launch (or immediately if the
update banner is shown). The broken group remains in EAS history but is no
longer served.

## OTA-only updates (no store submission)

If the change is JS/assets only and the native runtime version hasn't changed,
push an OTA update instead — no version bump required:

```bash
eas update --channel production --platform all --message "describe the fix"
```

## Rolling back a bad OTA update

If a published OTA update causes a regression, re-publish the last known-good
update group in seconds — no native rebuild required.

**Step 1 — find the previous good group ID**

Open the EAS Dashboard and copy the Update Group ID of the last good release:
https://expo.dev/accounts/livhappierapps/projects/edenmux/updates

Group IDs look like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

**Step 2 — republish that group to production**

```bash
npm run update:rollback -- <previous-group-id>
```

This runs `eas update:republish --destination-channel production --group <previous-group-id>`.
EAS immediately promotes the old bundle to the `production` channel; users
receive it on their next OTA check (typically within minutes).

**Step 3 — verify**

Confirm the EAS Dashboard shows the republished group as the active update on
the `production` channel, then monitor crash/error rates to confirm stability.

**Step 4 — follow up**

Fix the regression in a feature branch, test it thoroughly, then push a new
OTA (`eas update ...`) once the fix is validated.
