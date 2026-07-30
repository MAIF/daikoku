#!/usr/bin/env node
/**
 * i18n-audit — audit Daikoku frontend translation files.
 *
 * What it does:
 *   1. Scans the frontend source for every translation key actually referenced
 *      (translate('x'), translate({ key: 'x' }), <Translation i18nkey="x" />),
 *      plus the *prefixes* of keys built dynamically (translate(`delete.${id}`)).
 *   2. Reports keys present in a translation file but referenced nowhere ("unused").
 *      Keys matched only by a dynamic prefix are kept and flagged as "dynamic".
 *   3. Reports misalignment between en/fr (keys present in one file, missing in the other).
 *
 * Safety net: before declaring a key unused, it is grepped as a raw literal across
 * the whole repo (frontend + Scala backend + CMS/html), so a key referenced through
 * an unusual pattern is never proposed for deletion.
 *
 * Usage (from daikoku/javascript):
 *   node scripts/i18n-audit.mjs            # report only (default)
 *   node scripts/i18n-audit.mjs --prune    # remove unused keys from every locale file
 *   node scripts/i18n-audit.mjs --align    # copy missing keys across locales (placeholder = other locale value)
 *   node scripts/i18n-audit.mjs --prune --align
 *   node scripts/i18n-audit.mjs --json     # machine-readable report on stdout
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JS_ROOT = resolve(__dirname, '..'); // daikoku/javascript
const SRC_DIR = join(JS_ROOT, 'src');
const REPO_ROOT = resolve(JS_ROOT, '..', '..'); // repo root
const LOCALES = {
  en: join(SRC_DIR, 'locales', 'en', 'translation.json'),
  fr: join(SRC_DIR, 'locales', 'fr', 'translation.json'),
};

const args = new Set(process.argv.slice(2));
const DO_PRUNE = args.has('--prune');
const DO_ALIGN = args.has('--align');
const AS_JSON = args.has('--json');

// ---------------------------------------------------------------------------
// 1. Collect source files
// ---------------------------------------------------------------------------
function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'locales' || entry === 'node_modules') continue;
      out.push(...collectSources(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Extract used keys + dynamic prefixes from source
// ---------------------------------------------------------------------------
// A "static" key = a plain string/backtick literal with no ${...}.
// A "dynamic prefix" = the literal head of a template literal before the first ${.
const STATIC_PATTERNS = [
  // translate('x'), translate("x"), translate(`x`)
  /\btranslate\(\s*(['"`])([^'"`$\\]*?)\1/g,
  // translate({ key: 'x' | "x" | `x` , ... })
  /\btranslate\(\s*\{\s*key:\s*(['"`])([^'"`$\\]*?)\1/g,
  // i18nkey="x" | i18nkey={'x'} | i18nkey={`x`}
  /\bi18nkey=\{?\s*(['"`])([^'"`$\\]*?)\1/g,
];
const DYNAMIC_PATTERNS = [
  /\btranslate\(\s*`([^`]*?)\$\{/g,
  /\btranslate\(\s*\{\s*key:\s*`([^`]*?)\$\{/g,
  /\bi18nkey=\{?\s*`([^`]*?)\$\{/g,
];
// Fully dynamic (key is a variable/expression we cannot resolve at all).
const UNRESOLVABLE_PATTERN = /\btranslate\(\s*([A-Za-z_$][\w$.?]*)[\s,)]/g;

const usedKeys = new Set();
const dynamicPrefixes = new Set();
let unresolvableCount = 0;

for (const file of collectSources(SRC_DIR)) {
  const code = readFileSync(file, 'utf8');
  for (const re of STATIC_PATTERNS) {
    for (const m of code.matchAll(re)) usedKeys.add(m[2]);
  }
  for (const re of DYNAMIC_PATTERNS) {
    for (const m of code.matchAll(re)) {
      const prefix = m[1];
      if (prefix) dynamicPrefixes.add(prefix);
    }
  }
  for (const m of code.matchAll(UNRESOLVABLE_PATTERN)) {
    // ignore the known object/keyword forms already covered
    if (['key', 'translate'].includes(m[1])) continue;
    unresolvableCount++;
  }
}

const dynamicPrefixList = [...dynamicPrefixes];
const matchesDynamic = (key) => dynamicPrefixList.some((p) => key.startsWith(p));

// ---------------------------------------------------------------------------
// 3. Load locale files
// ---------------------------------------------------------------------------
function loadLocale(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
const data = Object.fromEntries(
  Object.entries(LOCALES).map(([lng, path]) => [lng, loadLocale(path)])
);

// ---------------------------------------------------------------------------
// 4. Classify keys (union of keys across all locales)
// ---------------------------------------------------------------------------
const allKeys = new Set();
for (const obj of Object.values(data)) for (const k of Object.keys(obj)) allKeys.add(k);

const classify = (key) => {
  if (usedKeys.has(key)) return 'used';
  if (matchesDynamic(key)) return 'dynamic';
  return 'unused';
};

let unusedCandidates = [...allKeys].filter((k) => classify(k) === 'unused').sort();

// Safety net: grep each candidate as a raw literal across the whole repo
// (frontend + backend + CMS). Anything found is demoted to "used-elsewhere".
function grepUsedElsewhere(keys) {
  const found = new Set();
  for (const key of keys) {
    try {
      // Restrict to code files (excludes the locale JSON where the key text
      // trivially appears). grep exits 1 when there is no match → truly unused.
      const out = execFileSync(
        'grep',
        ['-rlF', '--include=*.ts', '--include=*.tsx', '--include=*.scala', '--include=*.html',
          '--', key, join(REPO_ROOT, 'daikoku', 'app'), SRC_DIR],
        { encoding: 'utf8' }
      );
      if (out.trim()) found.add(key);
    } catch {
      // grep exit 1 = no match → truly unused
    }
  }
  return found;
}

const foundElsewhere = grepUsedElsewhere(unusedCandidates);
const usedElsewhere = [...foundElsewhere].sort();
unusedCandidates = unusedCandidates.filter((k) => !foundElsewhere.has(k));

// ---------------------------------------------------------------------------
// 5. Alignment between locales
// ---------------------------------------------------------------------------
const locales = Object.keys(data);
const misaligned = {}; // lng -> keys missing in that locale but present in another
for (const lng of locales) misaligned[lng] = [];
for (const key of allKeys) {
  const present = locales.filter((l) => key in data[l]);
  if (present.length !== locales.length) {
    for (const lng of locales) if (!(key in data[lng])) misaligned[lng].push(key);
  }
}
for (const lng of locales) misaligned[lng].sort();

// ---------------------------------------------------------------------------
// 6. Report
// ---------------------------------------------------------------------------
if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        totalKeys: allKeys.size,
        usedInSource: usedKeys.size,
        dynamicPrefixes: dynamicPrefixList.sort(),
        unresolvableCalls: unresolvableCount,
        unused: unusedCandidates,
        usedElsewhere,
        misaligned,
      },
      null,
      2
    )
  );
} else {
  const bar = '─'.repeat(60);
  console.log(bar);
  console.log('i18n audit — Daikoku frontend translations');
  console.log(bar);
  console.log(`Distinct keys across locales : ${allKeys.size}`);
  console.log(`Keys referenced in source    : ${usedKeys.size}`);
  console.log(`Dynamic key prefixes         : ${dynamicPrefixList.length} (protected)`);
  console.log(`Unresolvable translate() args: ${unresolvableCount} (key is a variable)`);
  console.log('');
  console.log(`Unused keys (safe to delete) : ${unusedCandidates.length}`);
  for (const k of unusedCandidates) console.log(`  - ${k}`);
  if (usedElsewhere.length) {
    console.log('');
    console.log(`Kept — matched outside translate() (backend/CMS/etc.): ${usedElsewhere.length}`);
    for (const k of usedElsewhere) console.log(`  ? ${k}`);
  }
  console.log('');
  console.log('Alignment between locales:');
  let aligned = true;
  for (const lng of locales) {
    if (misaligned[lng].length) {
      aligned = false;
      console.log(`  missing in ${lng} (${misaligned[lng].length}):`);
      for (const k of misaligned[lng]) console.log(`    - ${k}`);
    }
  }
  if (aligned) console.log('  ✓ all locales share the same keys');
  console.log(bar);
}

// ---------------------------------------------------------------------------
// 7. Mutations (--prune / --align)
// ---------------------------------------------------------------------------
function writeLocale(lng, obj) {
  writeFileSync(LOCALES[lng], JSON.stringify(obj, null, 2) + '\n');
}

if (DO_PRUNE && unusedCandidates.length) {
  const toDrop = new Set(unusedCandidates);
  for (const lng of locales) {
    const next = {};
    for (const [k, v] of Object.entries(data[lng])) if (!toDrop.has(k)) next[k] = v;
    data[lng] = next;
    writeLocale(lng, next);
  }
  console.log(`\n[prune] removed ${unusedCandidates.length} unused key(s) from: ${locales.join(', ')}`);
}

if (DO_ALIGN) {
  // Recompute alignment on possibly-pruned data.
  const keysNow = new Set();
  for (const obj of Object.values(data)) for (const k of Object.keys(obj)) keysNow.add(k);
  const added = {};
  for (const lng of locales) added[lng] = [];
  for (const key of keysNow) {
    for (const lng of locales) {
      if (key in data[lng]) continue;
      const donor = locales.find((l) => key in data[l]);
      data[lng][key] = data[donor][key]; // placeholder = other locale's value
      added[lng].push(key);
    }
  }
  let touched = false;
  for (const lng of locales) {
    if (added[lng].length) {
      touched = true;
      writeLocale(lng, data[lng]);
      console.log(`\n[align] added ${added[lng].length} placeholder key(s) to ${lng} (value copied from another locale — translate them):`);
      for (const k of added[lng]) console.log(`    + ${k}`);
    }
  }
  if (!touched) console.log('\n[align] nothing to do — locales already aligned');
}

// Exit non-zero in CI if problems found and no mutation flag given.
if (!DO_PRUNE && !DO_ALIGN && !AS_JSON) {
  const problems =
    unusedCandidates.length + locales.reduce((n, l) => n + misaligned[l].length, 0);
  process.exitCode = problems > 0 ? 1 : 0;
}
