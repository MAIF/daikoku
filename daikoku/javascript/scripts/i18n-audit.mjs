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
// `translate(...)` takes a single argument that resolves to the key: either a
// string/backtick literal, an object `{ key: 'x', ... }`, or an arbitrary
// expression. A plain regex only sees a literal glued to `translate(` and so
// misses shapes like:
//   translate(isMaintenanceMode ? 'Disable maintenance' : 'Maintenance mode')
//   translate(cond && 'Some key')
//   translate(x, `${a}`, 'Default')          // extra args are not keys, but…
// So instead we capture the whole (bracket-balanced) argument expression and
// pull *every* string literal out of it:
//   - a "static" key  = a plain string / backtick literal with no ${...}
//   - a "dynamic prefix" = the literal head of a template literal before ${
//   - object form ({...}) -> only the `key:` literal(s) count as keys, so a
//     `defaultResponse`/`replacements` value is never mistaken for a key.
// This over-approximates on the safe side: a non-key literal may be flagged
// "used", but a real key is never missed (which would risk a wrong deletion).

// Skip a string literal starting at index i (code[i] is a quote); returns the
// index just past the closing quote. Handles escapes and, for backticks,
// nested ${...} interpolation (which may itself contain strings and braces).
function skipString(code, i) {
  const quote = code[i++];
  while (i < code.length) {
    const c = code[i];
    if (c === '\\') { i += 2; continue; }
    if (quote === '`' && c === '$' && code[i + 1] === '{') {
      i = skipInterpolation(code, i + 2);
      continue;
    }
    if (c === quote) return i + 1;
    i++;
  }
  return i;
}

// i points just past `${`; return the index just past the matching `}`.
function skipInterpolation(code, i) {
  let depth = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(code, i); continue; }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { if (depth === 0) return i + 1; depth--; i++; continue; }
    i++;
  }
  return i;
}

// Read a bracket-balanced expression starting at `start` up to the matching
// closing `close` char (accounting for nested (), [], {} and strings).
function readBalanced(code, start, close) {
  let i = start, depth = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(code, i); continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0 && c === close) return { text: code.slice(start, i), end: i };
      depth--; i++; continue;
    }
    i++;
  }
  return { text: code.slice(start), end: code.length };
}

// Pull every string literal out of an expression. Returns keys + dynamic
// prefixes. A backtick literal with ${ contributes its head as a prefix.
function literalsFrom(expr) {
  const keys = [], prefixes = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === '"' || c === "'") {
      const end = skipString(expr, i);
      keys.push(expr.slice(i + 1, end - 1));
      i = end;
    } else if (c === '`') {
      const end = skipString(expr, i);
      const raw = expr.slice(i + 1, end - 1);
      const dollar = raw.indexOf('${');
      if (dollar === -1) keys.push(raw);
      else prefixes.push(raw.slice(0, dollar));
      i = end;
    } else {
      i++;
    }
  }
  return { keys, prefixes };
}

const usedKeys = new Set();
const dynamicPrefixes = new Set();
let unresolvableCount = 0;

const addKeys = (keys, prefixes) => {
  for (const k of keys) usedKeys.add(k);
  for (const p of prefixes) if (p) dynamicPrefixes.add(p);
};

// Object form `{ ... key: <literal> ... }`: only the `key:` literal is a key.
const OBJ_KEY_RE = /\bkey:\s*(?:(['"])((?:\\.|(?!\1).)*?)\1|`([^`]*?)(?:\$\{|`))/g;

const TRANSLATE_CALL_RE = /\btranslate\s*\(/g;
const I18NKEY_ATTR_RE = /\bi18nkey\s*=\s*/g;

for (const file of collectSources(SRC_DIR)) {
  const code = readFileSync(file, 'utf8');

  for (const m of code.matchAll(TRANSLATE_CALL_RE)) {
    const { text } = readBalanced(code, m.index + m[0].length, ')');
    if (/^\s*\{/.test(text)) {
      // { key: 'x', defaultResponse: 'y', ... } — only key: counts
      let matched = false;
      for (const km of text.matchAll(OBJ_KEY_RE)) {
        matched = true;
        if (km[2] !== undefined) usedKeys.add(km[2]);
        else if (km[3] !== undefined) dynamicPrefixes.add(km[3]);
      }
      if (!matched) unresolvableCount++;
    } else {
      const { keys, prefixes } = literalsFrom(text);
      if (keys.length === 0 && prefixes.length === 0) unresolvableCount++;
      else addKeys(keys, prefixes);
    }
  }

  for (const m of code.matchAll(I18NKEY_ATTR_RE)) {
    let expr;
    const at = m.index + m[0].length;
    if (code[at] === '{') expr = readBalanced(code, at + 1, '}').text;
    else if (code[at] === '"' || code[at] === "'") expr = code.slice(at, skipString(code, at));
    else continue;
    const { keys, prefixes } = literalsFrom(expr);
    addKeys(keys, prefixes);
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
