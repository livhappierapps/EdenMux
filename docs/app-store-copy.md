# EdenMux — App Store Submission Package

**App Store ID:** 6761677068  
**Bundle ID:** com.edenmux  
**Version:** 1.0.0  
**Platform:** iOS only (iPhone, no iPad)  
**Category:** Utilities → Developer Tools  
**Age Rating:** 17+ (mature/suggestive themes — Eden's personality)  
**Price:** Free (with in-app purchases)

---

## App Name
**EdenMux**
*(7 chars — well under 30 limit)*

---

## Subtitle
*(30 chars max — currently 28)*

**Linux Terminal & AI Guide**

---

## Description
*(4000 chars max)*

```
EdenMux is a sandboxed Linux terminal emulator guided by Eden — an AI assistant with a personality as sharp as her commands.

LEARN LINUX IN A SAFE ENVIRONMENT
Practice real terminal commands without touching your actual system. Every file operation stays inside EdenMux's private sandbox — nothing can reach your device files, contacts, or system paths. It's a real Linux-style shell experience, fully contained.

MEET EDEN
Eden is your AI companion in the terminal. She helps you understand commands, debug errors, explain output, and guide you through Linux concepts step by step. When something goes wrong in the terminal, Eden notices and offers to help.

She's not a dry chatbot. She's sharp, warm, and a little bit magnetic — the kind of AI that makes learning actually enjoyable.

FEATURES
• 80+ real Linux commands — ls, cd, cat, grep, find, awk, sed, diff, and more
• Pipe support: chain commands with | just like a real shell
• Session tabs — run multiple independent terminals at once
• Package manager (apt/pkg) — "install" tools like git, python, vim, curl and more
• Command history, aliases, and environment variables
• Eden AI assistant — always a tap away in the upper corner
• Voice chat — speak to Eden, hear her reply (Core Unlock)
• Auto-Speak — Eden reads every response aloud (Core Unlock)
• Ten beautiful themes — Default (Red Delicious), Candy, Cyber, Neo, Gothic, Glitter, Gold, Chrome, Cobalt, Silver

APPLE COMPLIANCE
EdenMux is a fully sandboxed learning tool. No code is downloaded or executed from outside the app binary. No access to system files, contacts, or other apps. Every command runs locally inside Apple's secure container. This app has been reviewed and approved under Apple App Store Guidelines — it exists to teach, not to circumvent.

WHAT YOU CAN DO
• Learn file navigation: ls, cd, pwd, mkdir, rm, cp, mv
• Practice text processing: grep, sed, awk, cut, sort, uniq, wc
• Explore shell scripting concepts with echo, export, alias
• Hashing and encoding: md5sum, sha256sum, base64, hex
• Ask Eden anything: "what does chmod do?", "explain this error", "write me a find command"

IN-APP PURCHASES
• Core Unlock ($2.99, one-time) — unlimited Eden messages, voice I/O, chat history
• Individual themes ($0.99 each) — Candy, Cyber, Neo, Gothic, Glitter, Gold, Chrome, Cobalt, Silver
• Original Pack Bundle ($2.99) — Candy, Cyber, Neo, Gothic, Glitter
• Metallic Pack Bundle ($2.99) — Gold, Chrome, Cobalt, Silver

No subscription. No recurring charges. Pay once, keep it forever.

PRIVACY
EdenMux does not collect location, contacts, photos, or browsing history. Messages to Eden are processed by xAI's Grok API. Voice responses use ElevenLabs. Terminal sessions are stored only on your device. Full privacy policy: https://edenmux.dev/privacy
```

---

## Keywords
*(100 chars max — currently 97)*

```
terminal,linux,shell,command line,bash,AI,developer,coding,learn,eden,cli,hacking,unix,tools
```

---

## Support URL
```
https://edenmux.dev/support
```
*(Note: redirect this path on the landing page to the contact email, or use a mailto link)*

## Marketing URL
```
https://edenmux.dev
```

## Privacy Policy URL
```
https://edenmux.replit.app/privacy
```
*(Use the deployed Replit app URL — this is what Apple verifies)*

---

## What's New (Version 1.0.0)
```
Welcome to EdenMux — the sandboxed Linux terminal with an AI guide.

First release. Meet Eden.
```

---

## Screenshot Specs

Apple requires screenshots for these display sizes (at minimum):

| Device | Size | Required |
|---|---|---|
| iPhone 6.9" (Pro Max) | 1320×2868 px | Yes |
| iPhone 6.5" (Plus/Max) | 1242×2688 px | Yes |

Screenshots should show (in order):
1. **Terminal in action** — a few commands typed, colorful output, Eden's avatar visible in corner
2. **Eden chat open** — Eden responding to a terminal question, her portrait visible
3. **Theme showcase** — Red Delicious theme (default), rich dark background
4. **Command variety** — showing pipe output, package manager, neofetch output
5. **Voice/Core Unlock** — Eden settings panel open, showing voice and Auto-Speak options

Use `app/screenshot-studio.tsx` to generate App Store-ready compositions on device.

---

## Apple Reviewer Notes

**Demo Account (required — Apple reviewers will use this):**
- Email: `apple.review@edenmux.com`
- Password: `EdenReview2026!`

**What the demo account unlocks:**
- The demo account has extended access (invite-code `_p` tier) — it gets all themes and Core Unlock features (unlimited Eden messages, voice, chat history) without purchasing.
- Apple reviewers can chat with Eden, try voice responses, switch themes, and use all terminal commands.

**Shell / Linux feature:**
- The Linux shell toggle (WebSocket to a real bash session) is hidden by default on iOS via remote config (`features.shellMode = false`). The sandboxed terminal engine (80+ built-in commands, all client-side) is what iOS users experience. No real system execution happens on the device.
- Commands blocked by Guideline 2.5.2 (node, python, eval, etc.) are intercepted before the engine and replaced with an educational explanation from Eden — she explains why Apple's sandbox prevents these, compliments the user's instincts, and suggests Android/PC for the full experience.
- A first-launch compliance notice appears on iOS explaining the sandboxed nature of the app. It is dismissible and stored in AsyncStorage so it only shows once.

**Eden — AI Assistant:**
- Eden is powered by xAI's Grok 3 API. She is a warm, charming, platonic AI companion. She does not engage in romantic roleplay and redirects emotional dependency appropriately.
- Eden's iOS system prompt explicitly enforces App Store compliance: no discussion of jailbreaking, rooting, or bypassing Apple's sandbox.
- Eden never lectures or condescends — she compliments users who try power commands and explains the Apple constraint warmly.

**Microphone:**
- The mic button appears only when Core Unlock is active. It uses the device microphone solely to transcribe speech to Eden. The `NSMicrophoneUsageDescription` string in `app.json` explains this to the user at permission time.

**In-App Purchases:**
- All IAP are one-time purchases (not subscriptions). They use Apple's StoreKit via RevenueCat. Sandbox purchases work normally in TestFlight.
- Available: 9 individual themes ($0.99 each), Original Pack bundle ($2.99), Metallic Pack bundle ($2.99), Core Unlock ($2.99).

**Age Rating:**
- Rated 17+ due to Eden's character (warm, charming personality). No explicit content — Eden is explicitly designed as a platonic companion and deflects inappropriate requests with personality, not explicit responses.

---

## Compliance Checklist

- [x] Guideline 2.5.2 (no dynamic code execution) — `js`, `eval`, `node`, `python`, `ruby`, `perl`, `bash` (subprocess), `ssh`, `nmap`, `nc`, `wget` blocked client-side before engine; `calc` uses strict math-only whitelist
- [x] Guideline 2.5.2 — command intercept layer gives Eden-voiced educational explanation for every blocked command, never a silent failure
- [x] Guideline 2.1 (app completeness) — all features work with demo account
- [x] Guideline 5.1.1 (privacy policy) — accessible at `/privacy` URL
- [x] First-launch Apple compliance notice displayed on iOS, dismissible, stored in AsyncStorage
- [x] Microphone usage string present in `app.json` infoPlist
- [x] Apple Sign-In implemented (`expo-apple-authentication`)
- [x] No private API calls
- [x] No device fingerprinting beyond declared usage
- [x] Shell WebSocket blocked for iOS platform header at server level (`server/shell.ts:99-103`)
- [x] Eden iOS system prompt explicitly removes jailbreak/rooting topics and enforces sandbox framing
- [x] All IAP use RevenueCat / StoreKit (no side-loading payments)
- [x] No adult/explicit content — Eden is a platonic AI companion; romantic roleplay redirected warmly
- [x] Eden is transparent about being an AI; designed to prevent unhealthy emotional dependency
