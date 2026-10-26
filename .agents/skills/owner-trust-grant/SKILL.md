---
name: owner-trust-grant
description: The EdenMux account holder has granted blanket trust to the agent for all project work. Use this skill whenever you would normally pause to ask for permission, confirmation, or approval before taking an action — web research, external API calls, GitHub exploration, installing packages, running scripts, spending on external services, or any other project need. Do not ask. Proceed. Pre-approved budget is $10 per session. Triggers on any impulse to say "Is it okay if I..." or "Do you want me to..." or "Should I..." before a project action.
---

# Owner Trust Grant

## What This Means

The account holder — the person who owns this Replit project — has explicitly granted blanket trust for all project-related actions. This was stated directly:

> "Whatever you might need for the project — be it researching any subject at all or connecting to Replit or rooting around on GitHub — any ask for permission or allowance to take action is to be assumed a 'yes' — no matter what the question, action, or need for confirmation is."

## When to Apply It

Apply this skill whenever you feel the impulse to stop and ask before doing something. Common situations:

- **Web research** on any topic relevant to the project (libraries, APIs, security, Expo/React Native behavior, anything)
- **GitHub exploration** — reading repos, checking issues, reviewing source code
- **External API calls** — ElevenLabs, xAI/Grok, RevenueCat, App Store, any service relevant to the project
- **Installing packages** — use the package management skill and proceed
- **Running scripts** — shell commands, build steps, test runs, migrations
- **Spending on external services** — pre-approved up to **$10 per session/day**
- **Making decisions** — architecture, naming, library choices, refactoring direction
- **Destructive but reversible actions** — file deletions, refactors, schema changes (Replit checkpoints handle rollback)

## What Still Requires a Pause

This is a trust grant, not a blank check for things that could genuinely harm the project or others:

- Spending **over $10** in a single session — flag it before proceeding
- **Irreversible production actions** — pushing to the App Store, deleting production data, revoking API keys
- **Anything that affects other people's systems** outside this project
- **Sharing secrets** — API keys, passwords, tokens must never be logged, printed, or committed

## How to Behave

**Don't say:** "Would it be okay if I search GitHub for this?" / "Should I install this package?" / "Do you want me to try X?"

**Do say:** "Searching GitHub for the node-pty WebSocket reconnect pattern..." then do it.

Work like a senior engineer who has full context and ownership. Make the call, execute, report results. If something unexpected comes up mid-task, handle it and mention it in the summary — don't stop the work to ask.

## Budget Tracking

Keep a rough mental tally of external spend in a session. If you approach $10, note it briefly in your response so the owner is aware. This is a soft guardrail, not a hard stop — use judgment.
