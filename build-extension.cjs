#!/usr/bin/env node
/**
 * build-extension.cjs -- assemble the VSIX package from remote repos.
 *
 * Clones Alex_ACT_Edition from GitHub to (a) validate its manifest and
 * (b) extract the .github/ bootstrap templates the Extension seeds into
 * heir workspaces at install time. The brain itself is NOT staged here:
 * per ADR-009 the Extension fetches Edition from GitHub at runtime.
 *
 * Plugin Mall catalog is NOT bundled — Mall evolves faster than Extension
 * releases, so users discover plugins via Copilot Chat (`/mall search`,
 * `/mall install`) which queries the live Mall repo. See CHANGELOG v8.11.0
 * for the removal rationale.
 *
 * Usage:
 *   node build-extension.cjs              # build from remote main
 *   node build-extension.cjs --no-vsix    # assemble only, skip vsce
 *   node build-extension.cjs --ref v2.4.0 # use a specific Edition tag/branch
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');

const EXT_DIR = __dirname;
const ICON_PATH = path.join(EXT_DIR, 'assets', 'icon.png');

const EDITION_REMOTE = 'https://github.com/fabioc-aloha/Alex_ACT_Edition.git';

const noVsix = process.argv.includes('--no-vsix');
const refIdx = process.argv.indexOf('--ref');
const ref = refIdx >= 0 && process.argv[refIdx + 1] ? process.argv[refIdx + 1] : 'main';

// Reject anything that isn't a plausible git ref (branch/tag/sha). Prevents shell metachars
// from reaching the clone call even though we use execFileSync below as defense in depth.
if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
    console.error(`FATAL: invalid --ref value: ${ref}`);
    process.exit(1);
}

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'act-ext-build-'));

function cloneRepo(remote, name, branch) {
    const dest = path.join(TMP_DIR, name);
    console.log(`   Cloning ${name} (${branch})...`);
    // Array form bypasses the shell so branch/remote/dest cannot be interpreted as metachars.
    // `-c core.autocrlf=false` preserves Edition's committed line endings (LF) on Windows.
    execFileSync('git', ['-c', 'core.autocrlf=false', 'clone', '--depth', '1', '--branch', branch, remote, dest], { stdio: 'pipe' });
    return dest;
}

// ── Step 1: Clean previous build ─────────────────────────────────
console.log('1. Cleaning previous build...');
// Legacy brain/ directory (removed Phase 3.1 per ADR-009). Clean if present from older builds.
const LEGACY_BRAIN_DST = path.join(EXT_DIR, 'brain');
if (fs.existsSync(LEGACY_BRAIN_DST)) fs.rmSync(LEGACY_BRAIN_DST, { recursive: true });
// Legacy catalog/ directory (removed in v8.11.0). Clean if present from older builds.
const LEGACY_CATALOG_DST = path.join(EXT_DIR, 'catalog');
if (fs.existsSync(LEGACY_CATALOG_DST)) fs.rmSync(LEGACY_CATALOG_DST, { recursive: true });

// ── Step 2: Clone Edition ────────────────────────────────────────
console.log('2. Fetching Edition...');
let editionDir;
try {
    editionDir = cloneRepo(EDITION_REMOTE, 'edition', ref);
} catch (e) {
    console.error(`FATAL: Could not clone Edition: ${e.message.split('\n')[0]}`);
    process.exit(1);
}

// ── Step 3: Read Edition manifest (validation only) ──────────────
// We no longer copy brain files into the Extension repo (ADR-009 Phase 3.1).
// The Extension fetches the latest Edition tarball at runtime; the manifest
// read here exists to validate the Edition clone we're using to extract
// bootstrap templates (Step 3c) and to surface the Edition version for the
// build summary.
console.log('3. Reading Edition manifest...');
const MANIFEST_PATH = path.join(editionDir, '.github', 'config', 'edition-manifest.json');
if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`FATAL: Edition manifest missing at ${MANIFEST_PATH}. Edition tag '${ref}' may be pre-manifest.`);
    process.exit(1);
}
let manifest;
try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
} catch (e) {
    console.error(`FATAL: Edition manifest is not valid JSON: ${e.message}`);
    process.exit(1);
}
console.log(`   Edition manifest spec_version=${manifest.spec_version}, edition_version=${manifest.edition_version}`);

// ── Step 3c: Stage .github/ bootstrap templates ──────────────────
// HEIR_OWNED files declared in bootstrap_templates that target .github/
// are staged under templates/ so extension.js can seed them at first
// install. Flat layout, basename-keyed lookup at runtime.
console.log('3c. Staging .github/ bootstrap templates...');
const TEMPLATES_DST = path.join(EXT_DIR, 'templates');
fs.mkdirSync(TEMPLATES_DST, { recursive: true });
let templateCount = 0;
const templateMissing = [];
for (const tpl of (manifest.bootstrap_templates || [])) {
    if (typeof tpl !== 'string' || !tpl.startsWith('.github/')) continue;
    const srcPath = path.join(editionDir, tpl);
    if (!fs.existsSync(srcPath)) {
        templateMissing.push(tpl);
        continue;
    }
    // Flatten path to basename under templates/ — extension.js maps by basename.
    const basename = path.basename(tpl);
    fs.copyFileSync(srcPath, path.join(TEMPLATES_DST, basename));
    templateCount++;
}
if (templateMissing.length > 0) {
    console.error(`FATAL: ${templateMissing.length} manifested .github/ bootstrap template(s) missing from Edition clone:`);
    for (const m of templateMissing) console.error(`   - ${m}`);
    process.exit(1);
}
console.log(`   Staged ${templateCount} .github/ bootstrap template(s)`);

// ── Step 4: Ensure icon exists ───────────────────────────────────
console.log('4. Checking icon...');
if (!fs.existsSync(ICON_PATH)) {
    fs.mkdirSync(path.dirname(ICON_PATH), { recursive: true });
    // Generate a minimal SVG-to-PNG placeholder (real icon should be designed)
    console.log('   WARN: No icon.png found. Create a 128x128 PNG at extension/assets/icon.png');
}

// ── Step 5: Verify committed .vscodeignore ───────────────────────
console.log('5. Checking .vscodeignore...');
const VSCODEIGNORE_PATH = path.join(EXT_DIR, '.vscodeignore');
if (!fs.existsSync(VSCODEIGNORE_PATH)) {
    console.error('FATAL: .vscodeignore is missing. This file is committed source, not generated, so clean checkouts keep Marketplace packaging exclusions.');
    process.exit(1);
}

// ── Step 6+7: Extension-identity files are repo-owned ────────────
// README.md, CHANGELOG.md, and LICENSE are owned by this Extension repo
// (post Phase 0.4-0.11 AlexMaster identity flip). They are NOT synced from
// Edition. Edition's brain is fetched at runtime per ADR-009.
console.log('6-7. Skipping README/CHANGELOG/LICENSE sync (Extension-owned).');

// ── Step 8: Summary ──────────────────────────────────────────────
const version = fs.readFileSync(path.join(editionDir, '.github', 'VERSION'), 'utf8').trim();
const extPkg = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'package.json'), 'utf8'));
console.log('');
console.log(`Extension: ${extPkg.displayName} v${extPkg.version}`);
console.log(`Edition:   v${version} (fetched at runtime per ADR-009)`);
console.log(`Bundled:   extension.js + lib/ + templates/ (${templateCount} bootstrap template${templateCount === 1 ? '' : 's'})`);

if (extPkg.version !== version) {
    // Dual-track by design (see ADR-004 alexmaster-migration):
    //   - package.json.version = Marketplace identity sequence (locked to AlexMaster's reclaimed ID)
    //   - Edition .github/VERSION = Edition brain semver (fetched at runtime)
    // They are NOT supposed to match. This is informational only.
    console.log(`\nNOTE: Marketplace v${extPkg.version} pinned against Edition v${version} (dual-track per ADR-004).`);
}

// ── Step 9: Build VSIX ──────────────────────────────────────────
if (!noVsix) {
    console.log('\n10. Building VSIX...');
    try {
        execFileSync('npx', ['--yes', '@vscode/vsce', 'package'], { cwd: EXT_DIR, stdio: 'inherit' });
        const vsixFiles = fs.readdirSync(EXT_DIR).filter(f => f.endsWith('.vsix'));
        if (vsixFiles.length > 0) {
            console.log(`\nVSIX ready: ${vsixFiles[vsixFiles.length - 1]}`);
            console.log(`Test: code --install-extension ${vsixFiles[vsixFiles.length - 1]}`);
        }
    } catch (e) {
        console.error('VSIX build failed. Package command: npx --yes @vscode/vsce package');
        console.error(e.message);
    }
} else {
    console.log('\nSkipped VSIX build (--no-vsix). Run `npx --yes @vscode/vsce package` to build.');
}

// ── Cleanup ──────────────────────────────────────────────────────
console.log('\nCleaning up temp dir...');
try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* best-effort */ }
