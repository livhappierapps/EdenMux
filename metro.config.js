const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude Replit internal directories from Metro's file watcher.
// These paths contain dynamically created/deleted files that cause
// ENOENT crashes in Metro's FallbackWatcher.
const blockList = [
  /\.local[/\\]state[/\\].*/,
  /\.local[/\\]skills[/\\]\.old-.*/,
  /\.local[/\\]skills[/\\]\.new-.*/,
  /\.local[/\\]skills[/\\]\.tmp-.*/,
  /\.local[/\\]secondary_skills[/\\]\.old-.*/,
  /\.local[/\\]secondary_skills[/\\]\.new-.*/,
  /\.local[/\\]secondary_skills[/\\]\.tmp-.*/,
];

config.resolver = config.resolver || {};
config.resolver.blockList = [
  ...(config.resolver.blockList ? [config.resolver.blockList].flat() : []),
  ...blockList,
];

// Restrict watchFolders to only the workspace root (not symlinked internals)
config.watchFolders = [__dirname];

module.exports = config;
