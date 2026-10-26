---
name: GitHub publish safety
description: Why EdenMux checkpoint history must not be uploaded as ordinary GitHub commit history.
---

Do not push the full local Replit checkpoint history to GitHub without first verifying that historical credential literals have been removed.

**Why:** Deleted legacy authentication code contained literal passwords in historical commits. Removing the source file does not remove those values from reachable Git history.

**How to apply:** Preserve local checkpoints, review the current source tree for credentials, and publish that tree as a new snapshot commit whose parent is the current GitHub branch tip. Use a normal fast-forward push, not a force push or a merge that attaches the old checkpoint history. Verify the published tree matches the reviewed source tree.

For explicitly authorized Git writes, the workspace guard may require the command-scoped `DANGEROUSLY_ALLOW_GIT=1` flag. Use the guard's documented override only for the specific operation being performed, not to disable safeguards globally.

GitHub Source Control authorization is a Git Provider connection, not an ordinary application connector. A reported healthy connection does not prove Git CLI credentials work, and the generic integration reconnect card may reject this provider.

**Why:** The generic connection cards cannot attach or reauthorize this Git Provider, while Git and GitHub CLI authentication can still be unavailable.

**How to apply:** If Git rejects credentials and the generic connection card is unavailable, use Replit's documented Account Settings → Git Providers → disconnect/reconnect GitHub flow. Do not request or copy a token into chat.
