/**
 * check-theme-assets.ts
 *
 * Validates that every theme in THEMES has non-null landingImage and
 * edenPortrait fields, and that the underlying asset files actually exist
 * on disk. Run this in CI before submitting an EAS build:
 *
 *   npx tsx scripts/check-theme-assets.ts
 *
 * Run self-tests (no filesystem checks, uses synthetic source):
 *
 *   npx tsx scripts/check-theme-assets.ts --self-test
 *
 * Exits with code 1 if any issue is found.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const PROJECT_ROOT = resolve(__dirname, '..');

// ── Brace-aware theme block extractor ──────────────────────────────────────
// Returns the exact source text of a single theme's value object `{ ... }`,
// bounded by brace depth — never bleeds into the next theme's content.
function extractThemeBlock(source: string, themeId: string): string | null {
  const startRe = new RegExp(`^  ${themeId}:\\s*\\{`, 'm');
  const match = startRe.exec(source);
  if (!match) return null;

  // The last character of match[0] is the opening '{' of the theme object.
  const braceStart = match.index + match[0].length - 1;
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return null; // unterminated block
}

// ── Core validation (pure — accepts source text, optional file-exist checker)
type FileChecker = (absPath: string) => boolean;

function validateThemeSource(
  source: string,
  projectRoot: string,
  fileExists: FileChecker,
): { errors: string[]; warnings: string[]; themeIds: string[]; themeOrder: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract theme IDs from the THEMES block.
  const themesBlockMatch = source.match(/export const THEMES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!themesBlockMatch) {
    return {
      errors: ['Could not locate THEMES export in theme-context.tsx'],
      warnings: [],
      themeIds: [],
      themeOrder: [],
    };
  }
  const themesBlock = themesBlockMatch[1];

  const themeIds: string[] = [];
  const themeIdPattern = /^\s{2}(\w+):\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = themeIdPattern.exec(themesBlock)) !== null) {
    themeIds.push(m[1]);
  }

  // Extract THEME_ORDER.
  const themeOrderMatch = source.match(/export const THEME_ORDER\s*=\s*\[([^\]]+)\]/);
  const themeOrder: string[] = themeOrderMatch
    ? (themeOrderMatch[1].match(/'(\w+)'/g)?.map(s => s.replace(/'/g, '')) ?? [])
    : [];

  // Cross-check THEMES <-> THEME_ORDER.
  for (const id of themeIds) {
    if (!themeOrder.includes(id)) {
      warnings.push(`Theme '${id}' is in THEMES but missing from THEME_ORDER`);
    }
  }
  for (const id of themeOrder) {
    if (!themeIds.includes(id)) {
      errors.push(`THEME_ORDER references '${id}' but it is not defined in THEMES`);
    }
  }

  // Per-theme validation using brace-aware extraction.
  for (const themeId of themeIds) {
    const block = extractThemeBlock(source, themeId);
    if (!block) {
      errors.push(`[${themeId}] Could not extract theme object (unterminated braces?)`);
      continue;
    }

    for (const field of ['landingImage', 'edenPortrait'] as const) {
      // Pattern: fieldName: require('...') — capture the path.
      const requireRe = new RegExp(
        `${field}:\\s*require\\(['"](@/assets/images/[^'"]+)['"]\\)`,
      );
      const requireMatch = requireRe.exec(block);

      if (!requireMatch) {
        // Check whether the field is explicitly set to null / undefined / absent.
        const fieldPresent = new RegExp(`${field}:\\s*`).test(block);
        if (!fieldPresent) {
          errors.push(`[${themeId}] '${field}' field is missing from theme definition`);
        } else {
          errors.push(`[${themeId}] '${field}' is not a require() call — expected a bundled asset`);
        }
        continue;
      }

      const relPath = requireMatch[1].replace('@/', '');
      const absPath = join(projectRoot, relPath);
      if (!fileExists(absPath)) {
        errors.push(`[${themeId}] '${field}' file not found on disk: ${relPath}`);
      }
    }
  }

  return { errors, warnings, themeIds, themeOrder };
}

// ── Self-test mode ──────────────────────────────────────────────────────────
function runSelfTests(): void {
  console.log('Running self-tests…\n');
  let passed = 0;
  let failed = 0;

  function expect(label: string, errors: string[], shouldMatch: string): void {
    const found = errors.some(e => e.includes(shouldMatch));
    if (found) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.error(`  ✗ ${label}`);
      console.error(`    Expected an error containing: "${shouldMatch}"`);
      console.error(`    Got errors: ${JSON.stringify(errors)}`);
      failed++;
    }
  }

  function expectPass(label: string, errors: string[]): void {
    if (errors.length === 0) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.error(`  ✗ ${label}`);
      console.error(`    Expected no errors, got: ${JSON.stringify(errors)}`);
      failed++;
    }
  }

  const noopFileExists: FileChecker = () => true; // skip disk checks in self-tests

  // ── Test 1: valid theme passes ────────────────────────────────────────────
  const validSource = `
export const THEMES: Record<string, Theme> = {
  default: {
    id: 'default',
    landingImage: require('@/assets/images/eden-landing.jpeg'),
    edenPortrait: require('@/assets/images/eden-portrait.jpeg'),
    terminal: { bg: '#000' },
  },
};
export const THEME_ORDER = ['default'];
`;
  const r1 = validateThemeSource(validSource, PROJECT_ROOT, noopFileExists);
  expectPass('Valid theme with both fields passes', r1.errors);

  // ── Test 2: landingImage missing entirely ────────────────────────────────
  const missingLanding = `
export const THEMES: Record<string, Theme> = {
  candy: {
    id: 'candy',
    edenPortrait: require('@/assets/images/theme-candy.jpeg'),
    terminal: { bg: '#000' },
  },
};
export const THEME_ORDER = ['candy'];
`;
  const r2 = validateThemeSource(missingLanding, PROJECT_ROOT, noopFileExists);
  expect("Missing 'landingImage' field is caught", r2.errors, "[candy] 'landingImage' field is missing");

  // ── Test 3: edenPortrait set to null (not a require) ─────────────────────
  const nullPortrait = `
export const THEMES: Record<string, Theme> = {
  neo: {
    id: 'neo',
    landingImage: require('@/assets/images/theme-neo.jpeg'),
    edenPortrait: null,
    terminal: { bg: '#000' },
  },
};
export const THEME_ORDER = ['neo'];
`;
  const r3 = validateThemeSource(nullPortrait, PROJECT_ROOT, noopFileExists);
  expect("'edenPortrait: null' is caught", r3.errors, "[neo] 'edenPortrait' is not a require() call");

  // ── Test 4: path does not exist on disk ───────────────────────────────────
  const missingFile = `
export const THEMES: Record<string, Theme> = {
  ghost: {
    id: 'ghost',
    landingImage: require('@/assets/images/theme-ghost.jpeg'),
    edenPortrait: require('@/assets/images/theme-ghost.jpeg'),
    terminal: { bg: '#000' },
  },
};
export const THEME_ORDER = ['ghost'];
`;
  const alwaysMissing: FileChecker = () => false;
  const r4 = validateThemeSource(missingFile, PROJECT_ROOT, alwaysMissing);
  expect('Non-existent file path is caught', r4.errors, "[ghost] 'landingImage' file not found on disk");

  // ── Test 5: first theme OK, middle theme has null landingImage ────────────
  // (the critical bleed case — ensures brace-aware extraction isolates themes)
  const bleedCase = `
export const THEMES: Record<string, Theme> = {
  first: {
    id: 'first',
    landingImage: require('@/assets/images/theme-a.jpeg'),
    edenPortrait: require('@/assets/images/theme-a.jpeg'),
    terminal: { bg: '#000' },
  },
  broken: {
    id: 'broken',
    landingImage: null,
    edenPortrait: require('@/assets/images/theme-b.jpeg'),
    terminal: { bg: '#000' },
  },
  last: {
    id: 'last',
    landingImage: require('@/assets/images/theme-c.jpeg'),
    edenPortrait: require('@/assets/images/theme-c.jpeg'),
    terminal: { bg: '#000' },
  },
};
export const THEME_ORDER = ['first', 'broken', 'last'];
`;
  const r5 = validateThemeSource(bleedCase, PROJECT_ROOT, noopFileExists);
  expect(
    "Middle theme with null landingImage caught (brace-aware, no bleed from adjacent themes)",
    r5.errors,
    "[broken] 'landingImage' is not a require() call",
  );
  // First and last should be fine
  const spurious = r5.errors.filter(e => e.includes('[first]') || e.includes('[last]'));
  if (spurious.length === 0) {
    console.log('  ✓ Surrounding valid themes not falsely flagged');
    passed++;
  } else {
    console.error('  ✗ Surrounding valid themes were falsely flagged');
    console.error(`    Spurious errors: ${JSON.stringify(spurious)}`);
    failed++;
  }

  console.log(`\nSelf-tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Self-tests PASSED ✓\n');
}

// ── Main ────────────────────────────────────────────────────────────────────
if (process.argv.includes('--self-test')) {
  runSelfTests();
  process.exit(0);
}

const THEME_FILE = join(PROJECT_ROOT, 'lib', 'theme-context.tsx');
const source = readFileSync(THEME_FILE, 'utf8');

const { errors, warnings, themeIds, themeOrder } = validateThemeSource(
  source,
  PROJECT_ROOT,
  existsSync,
);

// Print per-theme pass lines (only for themes with no errors).
for (const themeId of themeIds) {
  const block = extractThemeBlock(source, themeId);
  if (!block) continue;
  for (const field of ['landingImage', 'edenPortrait'] as const) {
    const requireRe = new RegExp(
      `${field}:\\s*require\\(['"](@/assets/images/[^'"]+)['"]\\)`,
    );
    const m = requireRe.exec(block);
    if (m) {
      const relPath = m[1].replace('@/', '');
      if (existsSync(join(PROJECT_ROOT, relPath))) {
        console.log(`  ✓ [${themeId}] ${field.padEnd(13)} → ${relPath}`);
      }
    }
  }
}

console.log('');
console.log(`Themes checked: ${themeIds.join(', ')}`);
console.log(`THEME_ORDER:    ${themeOrder.join(', ')}`);
console.log('');

if (warnings.length) {
  warnings.forEach(w => console.warn(`  ⚠  ${w}`));
  console.log('');
}

if (errors.length) {
  errors.forEach(e => console.error(`  ✗  ${e}`));
  console.error('');
  console.error(`check-theme-assets: FAILED (${errors.length} error${errors.length !== 1 ? 's' : ''})`);
  process.exit(1);
}

console.log(`check-theme-assets: PASSED — all ${themeIds.length} themes look good 🎉`);
