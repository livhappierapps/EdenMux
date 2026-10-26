---
name: explain-better
description: Reformat any set of instructions or next steps into ultra-simple, numbered baby steps written for a user who is smart but stretched thin — juggling multiple projects and a toddler. Triggers when the user asks to "explain better", "make it simpler", "ELI5", "break it down", "step by step please", "what do I actually do", "too complicated", or when instructions involve more than ~3 actions and the user seems overwhelmed or scattered. Always use tiny words, short sentences, and one action per step. Assume the user will be interrupted mid-task.
---

# Explain Better

## When to Use

- User says "explain better", "simpler", "break it down", "what do I actually do", "step by step"
- You just gave instructions with more than ~3 steps and the user seems lost or overwhelmed
- You're about to give instructions involving multiple tools, terminals, or accounts — pre-emptively use this format
- The user references being distracted, busy, tired, or multitasking

## The Golden Rules

1. **One action per step.** Never combine two things into one bullet.
2. **Say WHERE first.** Every step starts with the location: "On your phone", "In the browser", "In the terminal", "In Replit", etc.
3. **Say exactly what to tap/click/type.** Not "configure the setting" — "tap the gear icon, then tap Account."
4. **Mark stopping points.** If the user might need to wait (a build finishes, an email arrives, a page loads), call it out: ⏳ *Wait for this before moving on.*
5. **Mark checkpoints.** After a group of steps, add a ✅ line: "✅ Done! You should now see X." This lets her re-orient after an interruption.
6. **Keep the whole thing visible.** No walls of text. Use a numbered list. Max ~10 steps before splitting into Part 1 / Part 2.
7. **No jargon without a quick translation.** If you must use a tech term, add it in plain English in parentheses right after. Example: "EAS (the service that builds your app)".

## Format Template

```
Here's exactly what to do:

**Part 1 — [Short name for this chunk]**

1. [WHERE] [do exactly this one thing]
2. [WHERE] [do exactly this one thing]
3. [WHERE] [do exactly this one thing]

✅ You should now see [describe what success looks like].

⏳ If you need to wait for anything, it'll say so here.

**Part 2 — [Short name for next chunk]**

4. ...
```

## Tone

- Warm, friendly, zero condescension.
- Write like a smart friend texting you from across the room, not a manual.
- It's okay to say "that's it for now!" or "don't touch anything else yet."
- If a step is scary or irreversible, add a one-line heads-up: ⚠️ "This deletes the old version — that's fine, just making sure you know."

## Example

**Instead of:**
> Set `EXPO_TOKEN` as a Replit secret, then run the EAS build command using the GIT_INDEX_FILE workaround to bypass the sandbox git write lock.

**Write:**
> Here's exactly what to do:
>
> **Part 1 — Get your Expo token**
> 1. On your computer browser, go to **expo.dev**
> 2. Click your profile picture (top right)
> 3. Click **Access Tokens**
> 4. Click **Create token** — name it anything, like "replit"
> 5. Copy the long code it gives you (highlight it, tap Copy)
>
> ✅ You've got your token. Keep it copied.
>
> **Part 2 — Save it in Replit**
> 6. In Replit, look at the left sidebar and click the 🔒 **Secrets** tab
> 7. Click **New Secret**
> 8. In the Name box type: `EXPO_TOKEN`
> 9. In the Value box, paste the code you copied
> 10. Click **Add Secret**
>
> ✅ Done! Come back here and tell me — I'll kick off the build for you.
