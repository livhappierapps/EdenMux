#!/usr/bin/env python3
"""Export a detached Android starter without credentials or local history."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "generated-artifacts" / "EdenMuxOP-Android-Leo-Source.zip"
PREFIX = "EdenMuxOP-Android-Leo/"
DIRECTORIES = ("app", "assets", "components", "constants", "lib", "server", "scripts", "patches", "docs")
FILES = ("package.json", "pnpm-lock.yaml", "babel.config.js", "metro.config.js",
         "tsconfig.json", "eslint.config.js", ".gitignore", "RELEASING.md", "threat_model.md")

HANDOFF = """# EdenMuxOP Android source handoff for Leo

## Read this first
This is the current EdenMux codebase, exported as a detached Android starter
named EdenMuxOP. It is NOT a finished personal-edition APK, a Termux runtime,
or a trained model. The public app and its workspace have not been renamed.
Reuse the architecture and then give Leo's app its own final branding and IDs.

Included: complete Expo/React Native app, terminal engine, themes and images,
authentication, Express backend, PostgreSQL table initialization and migration,
Grok chat, voice integration, RevenueCat integration, tests, dependency lockfile,
patches, maintenance scripts and original release/security reference docs.
Original docs describe EdenMux and are historical context, not certification
that this fork has passed store review or is production-ready.

Excluded intentionally: secrets, signing keys (including debug keys), account
data/database dumps, Git history, personal uploads, research/chat/memory files,
node_modules, generated builds, and generated native android/ios folders.
No custom native module is provided. Expo prebuild regenerates Android from
app.json and the installed plugins; do not copy EdenMux's old native folder.

## Isolation from the original app
- Export-only display name: EdenMuxOP.
- Starter package: com.edenmux.op.leostarter; scheme: edenmuxop-leo.
- Original Expo owner/project ID, store ID, OTA URL and submission config removed.
- OTA updates disabled until Leo configures his own project.
- EAS profile produces a standalone internal APK, not a Metro-dependent dev client.
- Original artwork/text/product IDs are retained as requested. Rebrand them and
  configure independent RevenueCat products before distributing Leo's own app.
- Use a NEW backend, database, signing key, API credentials and EAS project.
  Never point this fork at EdenMux's production backend or reuse its credentials.

## Bring-up steps for Leo
1. Extract this folder on a Linux/macOS/Windows development computer.
2. Install Node 22 and pnpm 10.26.1. Run:
   pnpm install --frozen-lockfile
   Keep patch-package enabled. The retained expo-asset patch filename references
   12.0.13 while the installed compatible patch is 12.0.14; review install output.
   Keep keyboard-controller at 1.20.6; Expo's 1.18.5 suggestion is intentionally
   not applied in this source.
3. Provision an empty PostgreSQL database. Supply server variables listed in
   ENVIRONMENT.template through the host's secret manager. Table initialization
   runs on backend startup; inspect server/migrations for existing-schema changes.
4. Start backend: pnpm run server:dev
   The backend needs working DATABASE_URL and SESSION_SECRET. Deploy behind HTTPS.
   Optional Grok/voice/email/billing features need their own provider credentials.
5. Set EXPO_PUBLIC_DOMAIN to YOUR backend hostname (no https:// prefix).
   This gets embedded in the app; set it again when building. Never put server
   secrets in EXPO_PUBLIC_* variables. Public app variables can be placed in an
   ignored .env file for Expo. The server does not automatically load .env.
6. Check the source:
   pnpm exec tsc --noEmit
   pnpm run lint
   pnpm run test:shell
   pnpm run test:eden-entitlement
   pnpm run test:security-education
   pnpm run check:themes
   pnpm run server:build
7. For an emulator/device dev session, install Android Studio/SDK and JDK 17,
   then run: pnpm exec expo run:android
   Expo generates android/ and a local debug signing key. This debug build needs
   Metro. Android emulator HTTP development URLs need adapting because this
   client's native API URL helper expects an HTTPS hostname.
8. For an installable standalone APK through EAS:
   pnpm exec eas login
   pnpm exec eas init
   Set EXPO_PUBLIC_DOMAIN in Leo's own EAS environment/profile.
   pnpm exec eas build --platform android --profile preview
   This consumes a cloud build; the exporter has NOT run it.
   For a local standalone release, generate native Android, configure your own
   release signing and backend environment, and build with Android tooling.
   Never distribute a release signed with the generated debug key.

## Important current limitations
- Remote server shell execution is deliberately disabled pending true isolation.
  Local terminal commands remain. No Termux RUN_COMMAND bridge or root access
  integration exists. Build that separately with explicit device permissions.
- General Android security curriculum is prompt grounding, not model fine-tuning.
- Personal-only humor/persona and a separate owner-only personal mode have not
  been completed. This export does not remove authorization or safety checks.
- Billing entitlements still gate paid features; no paid bypass is included.
  Configure Leo's own RevenueCat project and store/test products.
- Google sign-in is not wired up. Do not advertise it as available.
- Password reset needs a configured email provider. Apple sign-in is retained
  in shared source for completeness, not configured for this Android fork.
- Backend OTA management requires Leo's own EAS identifiers/token if enabled.
- Dependency/security advisories remain; do not treat this handoff as an all-clear.
- No native APK was built, installed or device-tested during this export.

## Useful official documentation
Expo Android builds: https://docs.expo.dev/build-reference/apk/
Expo native generation: https://docs.expo.dev/workflow/continuous-native-generation/
Android Studio: https://developer.android.com/studio
Termux: https://github.com/termux/termux-app

SOURCE-MANIFEST.json lists every packaged payload and its SHA-256.
"""

ENVIRONMENT = """# TEMPLATE ONLY. No real values are included.
# Backend (server environment; required for secure deployed authentication)
DATABASE_URL=
SESSION_SECRET=
ADMIN_SECRET=
APP_PUBLIC_URL=
PORT=5000
# Optional providers (server ONLY)
XAI_API_KEY=
ELEVENLABS_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
REVENUECAT_SECRET_KEY=
REVENUECAT_API_KEY=
# Optional own-project OTA administration
EAS_OWNER=
EAS_PROJECT_ID=
EXPO_TOKEN=
# Expo client public values, embedded at build time
EXPO_PUBLIC_DOMAIN=
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=
EXPO_PUBLIC_REVENUECAT_TEST_API_KEY=
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
EXPO_PUBLIC_APP_STORE_ID=
"""


def main():
    payload = {}
    candidates = [ROOT / name for name in FILES]
    for directory in DIRECTORIES:
        candidates.extend(sorted((ROOT / directory).rglob("*")))
    for path in candidates:
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(ROOT)
        if "__pycache__" in relative.parts or path.suffix in (".pyc", ".keystore", ".jks", ".pem", ".key", ".p12", ".p8"):
            continue
        payload[str(relative)] = path.read_bytes()

    config = json.loads((ROOT / "app.json").read_text())
    expo = config["expo"]
    expo.update(name="EdenMuxOP", slug="edenmuxop-leo", scheme="edenmuxop-leo")
    expo["android"]["package"] = "com.edenmux.op.leostarter"
    expo["ios"]["bundleIdentifier"] = "com.edenmux.op.leostarter"
    expo["ios"].pop("usesAppleSignIn", None)
    expo.pop("owner", None)
    expo["extra"].pop("eas", None)
    expo["extra"].pop("appStoreId", None)
    expo["updates"] = {"enabled": False}
    payload["app.json"] = (json.dumps(config, indent=2) + "\n").encode()
    eas = {
        "cli": {"version": ">= 25.0.0", "appVersionSource": "local"},
        "build": {"preview": {
            "distribution": "internal", "node": "22.22.0",
            "android": {"buildType": "apk"}
        }}
    }
    payload["eas.json"] = (json.dumps(eas, indent=2) + "\n").encode()
    # Keep source behavior except for original-account defaults in the fork.
    ota = payload["server/ota.ts"].decode()
    ota = ota.replace('process.env.EAS_OWNER ?? "livhappierapps"', 'process.env.EAS_OWNER ?? ""')
    ota = ota.replace('const EAS_SLUG = "edenmux";', 'const EAS_SLUG = "edenmuxop-leo";')
    payload["server/ota.ts"] = ota.encode()
    index = payload["server/index.ts"].decode()
    index = index.replace('    origins.add("https://eden-mux--LivHappierApps.replit.app");',
                          '    // Detached fork: configure APP_PUBLIC_URL for your own backend origin.')
    payload["server/index.ts"] = index.encode()
    payload["README.md"] = HANDOFF.encode()
    payload["ENVIRONMENT.template"] = ENVIRONMENT.encode()

    # Scan without logging matching material. No environment values are inspected.
    credential_patterns = (
        rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        rb"gh[pousr]_[A-Za-z0-9]{30,}",
        rb"github_pat_[A-Za-z0-9_]{30,}",
        rb"xai-[A-Za-z0-9]{25,}",
        rb"sk_(?:live|test)_[A-Za-z0-9]{20,}",
        rb"postgres(?:ql)?://[^:\s]+:[^@\s]+@",
        rb"eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}",
    )
    flagged = []
    for name, data in payload.items():
        if any(re.search(pattern, data) for pattern in credential_patterns):
            flagged.append(name)
    if flagged:
        raise RuntimeError("Credential-like content requires review in: " + ", ".join(flagged))
    manifest = {
        "format": 1,
        "purpose": "Detached Android source handoff; not a built APK",
        "files": {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                  for name, data in sorted(payload.items())}
    }
    payload["SOURCE-MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(payload.items()):
            archive.writestr(PREFIX + name, data)
    with zipfile.ZipFile(OUT) as archive:
        assert archive.testzip() is None
        for name, record in manifest["files"].items():
            data = archive.read(PREFIX + name)
            assert hashlib.sha256(data).hexdigest() == record["sha256"]
        assert len(archive.namelist()) == len(payload)
    print(f"Verified {len(payload)} files; ZIP size {OUT.stat().st_size:,} bytes")
    print(f"SHA-256 {hashlib.sha256(OUT.read_bytes()).hexdigest()}")
    print(OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
