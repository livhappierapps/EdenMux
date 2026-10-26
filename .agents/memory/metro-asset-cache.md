---
name: Metro asset cache crash pattern
description: Why stale Metro bundle cache causes ENOENT crashes on device and how --clear fixes it
---

## The rule
The `expo:dev` npm script **must include `--clear`**. Removing it will cause intermittent "Something went wrong" crashes on device whenever an asset is moved, renamed, or deleted.

**Why:** Metro computes `httpServerLocation` for each asset when it transforms the bundle. The value is `path.join(publicPath, dirname(localPath))` where `localPath = path.relative(projectRoot, module.path)`. For an asset at `assets/images/foo.jpeg` this correctly produces `/assets/assets/images`. Metro then serves asset HTTP requests by stripping its own `/assets/` URL prefix, so `/assets/assets/images/foo.jpeg` → resolves `assets/images/foo.jpeg` from project root → finds the file. If a stale cache entry exists for an asset that was at a different path (e.g. `images/foo.jpeg` at the project root before being moved into `assets/images/`), `httpServerLocation` = `/assets/images`, the device requests `/assets/images/foo.jpeg`, Metro strips `/assets/` → `images/foo.jpeg`, resolves `/home/runner/workspace/images/foo.jpeg` → that directory doesn't exist → ENOENT → 404 → device crash.

**How to apply:** Always keep `--clear` in `expo:dev`. Whenever Metro is restarted (workflow restart), it wipes transform + bundle cache and rebuilds from scratch in ~15s. That's the right trade-off for correctness. Never remove `--clear` to speed up startup.

## How this was diagnosed
- Fresh bundle build showed all 420 project assets + node_module assets had correct paths — no `images/` ENOENT in a clean build.
- ENOENT only happened when the device connected and Metro served a **cached** bundle (fast, no rebuild).
- The `--clear` flag wipes this cache on startup, forcing a fresh build every time.
