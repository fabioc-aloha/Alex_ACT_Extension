#!/usr/bin/env node
/**
 * audit-brain-faithfulness.cjs -- verify brain/ matches Edition's tagged release.
 *
 * Reads brain/VERSION to discover the Edition tag the brain claims to be,
 * resolves that tag against a local Alex_ACT_Edition clone (sibling repo by
 * default), and compares every file in brain/ against the tagged blob at
 * the git-object level (SHA-1 of blob contents). This bypasses any local
 * line-ending normalization noise that working-tree comparisons would hit
 * on Windows.
 *
 * Files in the manifest's HEIR_OWNED category (currently:
 * config/cognitive-config.json) are expected to be absent from brain/ and
 * are not treated as drift.
 *
 * Exits 0 if 100% of declared brain files match the tag; exits 1 otherwise.
 *
 * Usage:
 *   node scripts/audit-brain-faithfulness.cjs
 *   node scripts/audit-brain-faithfulness.cjs --edition-repo C:\path\to\Alex_ACT_Edition
 *   node scripts/audit-brain-faithfulness.cjs --tag v2.4.0   # override brain/VERSION
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXT_DIR = path.resolve(__dirname, '..');
const BRAIN_DIR = path.join(EXT_DIR, 'brain');
const DEFAULT_EDITION_REPO = path.resolve(EXT_DIR, '..', 'Alex_ACT_Edition');

// HEIR_OWNED files that are intentionally absent from brain/ per the manifest contract.
// Update this list ONLY when the manifest's bootstrap_templates contract changes.
const HEIR_OWNED_ABSENT_FROM_BRAIN = new Set([
    '.github/config/cognitive-config.json',
]);

function parseArgs() {
    const args = { editionRepo: DEFAULT_EDITION_REPO, tag: null };
    for (let i = 2; i < process.argv.length; i++) {
        const a = process.argv[i];
        if (a === '--edition-repo' && process.argv[i + 1]) { args.editionRepo = path.resolve(process.argv[++i]); }
        else if (a === '--tag' && process.argv[i + 1]) { args.tag = process.argv[++i]; }
        else if (a === '--help' || a === '-h') {
            console.log('Usage: node scripts/audit-brain-faithfulness.cjs [--edition-repo PATH] [--tag TAG]');
            process.exit(0);
        } else {
            console.error(`Unknown argument: ${a}`);
            process.exit(2);
        }
    }
    return args;
}

function git(repo, args) {
    return execFileSync('git', args, { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
}

function tryGit(repo, args) {
    try { return git(repo, args).trim(); } catch { return null; }
}

const { editionRepo, tag: tagOverride } = parseArgs();

if (!fs.existsSync(BRAIN_DIR)) {
    console.error(`FATAL: brain/ not found at ${BRAIN_DIR}. Run build-extension.cjs first.`);
    process.exit(1);
}
if (!fs.existsSync(path.join(editionRepo, '.git'))) {
    console.error(`FATAL: --edition-repo is not a git repo: ${editionRepo}`);
    process.exit(1);
}

const brainVersionPath = path.join(BRAIN_DIR, 'VERSION');
const brainVersion = fs.existsSync(brainVersionPath)
    ? fs.readFileSync(brainVersionPath, 'utf8').trim()
    : null;

let tag = tagOverride || (brainVersion ? `v${brainVersion}` : null);
if (!tag) {
    console.error('FATAL: cannot determine Edition tag (brain/VERSION missing and no --tag override).');
    process.exit(1);
}

if (!tryGit(editionRepo, ['rev-parse', '--verify', `${tag}^{commit}`])) {
    console.error(`FATAL: tag ${tag} does not exist in ${editionRepo}. Fetch tags or pass --tag.`);
    process.exit(1);
}

console.log(`Auditing brain/ against ${editionRepo} @ ${tag}`);

// Enumerate files at the tag, under .github/ and .vscode/.
const tagFiles = [];
for (const prefix of ['.github/', '.vscode/']) {
    const out = tryGit(editionRepo, ['ls-tree', '-r', '--name-only', tag, prefix]) || '';
    for (const line of out.split(/\r?\n/)) {
        if (line.trim()) tagFiles.push(line.trim().replace(/\\/g, '/'));
    }
}

let matched = 0;
const mismatches = [];
const missingExpected = [];   // in tag, expected in brain/, but absent
const heirOwnedSkipped = [];

for (const tagRel of tagFiles) {
    // Map tag path → brain path. .github/foo → brain/foo; .vscode/foo → brain/.vscode/foo
    let brainRel;
    if (tagRel.startsWith('.github/')) brainRel = tagRel.substring('.github/'.length);
    else brainRel = tagRel; // .vscode/... lands at brain/.vscode/...

    const brainPath = path.join(BRAIN_DIR, brainRel.replace(/\//g, path.sep));

    if (HEIR_OWNED_ABSENT_FROM_BRAIN.has(tagRel)) {
        heirOwnedSkipped.push(tagRel);
        if (fs.existsSync(brainPath)) {
            mismatches.push({ rel: tagRel, reason: 'HEIR_OWNED file present in brain/ (should be absent)' });
        }
        continue;
    }

    if (!fs.existsSync(brainPath)) {
        missingExpected.push(tagRel);
        continue;
    }

    const tagSha = tryGit(editionRepo, ['rev-parse', `${tag}:${tagRel}`]);
    const brainSha = tryGit(EXT_DIR, ['hash-object', brainPath]);

    if (tagSha && brainSha && tagSha === brainSha) matched++;
    else mismatches.push({ rel: tagRel, reason: `blob SHA mismatch (tag=${tagSha?.slice(0, 8)} brain=${brainSha?.slice(0, 8)})` });
}

// Files in brain/ that don't correspond to any tag file (drift).
const brainFiles = [];
(function walk(dir, base) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.posix.join(base, entry.name);
        if (entry.isDirectory()) walk(full, rel);
        else brainFiles.push(rel);
    }
})(BRAIN_DIR, '');

const tagSet = new Set();
for (const t of tagFiles) {
    const brainRel = t.startsWith('.github/') ? t.substring('.github/'.length) : t;
    tagSet.add(brainRel);
}
const drift = brainFiles.filter(f => !tagSet.has(f));

// Report.
console.log('');
console.log('=== Result ===');
console.log(`Tag files (declared):       ${tagFiles.length}`);
console.log(`Brain files (on disk):      ${brainFiles.length}`);
console.log(`Byte-identical:             ${matched}`);
console.log(`Mismatched:                 ${mismatches.length}`);
console.log(`Missing from brain/:        ${missingExpected.length}`);
console.log(`HEIR_OWNED skipped:         ${heirOwnedSkipped.length}`);
console.log(`Drift (in brain/ only):     ${drift.length}`);

if (mismatches.length > 0) {
    console.log('\n--- Mismatched ---');
    for (const m of mismatches) console.log(`  ${m.rel}  (${m.reason})`);
}
if (missingExpected.length > 0) {
    console.log('\n--- Missing from brain/ ---');
    for (const m of missingExpected) console.log(`  ${m}`);
}
if (drift.length > 0) {
    console.log('\n--- Drift (in brain/ but not in tag) ---');
    for (const d of drift) console.log(`  ${d}`);
}

const ok = mismatches.length === 0 && missingExpected.length === 0 && drift.length === 0;
if (ok) {
    console.log(`\nPASS: brain/ is faithful to ${tag}.`);
    process.exit(0);
} else {
    console.log(`\nFAIL: brain/ does not faithfully reproduce ${tag}.`);
    process.exit(1);
}
