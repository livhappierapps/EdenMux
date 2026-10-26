#!/bin/bash
set -e
CI=true pnpm install --no-frozen-lockfile
npx patch-package
# Rebuild node-pty native module (pnpm doesn't auto-compile it on Linux)
NODE_PTY_DIR="node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty"
if [ -d "$NODE_PTY_DIR" ] && [ ! -f "$NODE_PTY_DIR/build/Release/pty.node" ]; then
  echo "Building node-pty native module..."
  (cd "$NODE_PTY_DIR" && npx node-gyp rebuild)
fi
