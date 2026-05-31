#!/usr/bin/env node
/**
 * build-extension.cjs -- assemble the VSIX package from remote repos.
 *
 * Clones Alex_ACT_Edition from GitHub (source of truth) and copies brain
 * files into brain/, then optionally runs `npx vsce package` to produce
 * the .vsix.
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
const BRAIN_DST = path.join(EXT_DIR, 'brain');
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
    // `-c core.autocrlf=false` preserves Edition's committed line endings (LF) on Windows
    // where global git config defaults to autocrlf=true. Without this, fresh clones
    // convert LF -> CRLF on checkout and brain/ ships byte-different from the Edition tag.
    execFileSync('git', ['-c', 'core.autocrlf=false', 'clone', '--depth', '1', '--branch', branch, remote, dest], { stdio: 'pipe' });
    return dest;
}

// ── Step 1: Clean previous build ─────────────────────────────────
console.log('1. Cleaning previous build...');
if (fs.existsSync(BRAIN_DST)) fs.rmSync(BRAIN_DST, { recursive: true });
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

const BRAIN_SRC = path.join(editionDir, '.github');

// ── Step 3: Copy brain files (manifest-driven) ───────────────────
// We read .github/config/edition-manifest.json (Edition's authoritative bill
// of materials) and copy ONLY the files it declares. This prevents leakage
// of any untracked / dev-only / draft files that happen to live under
// Edition's .github tree, and makes drift loud: a missing manifested file
// fails the build immediately rather than shipping a silently-incomplete brain.
console.log('3. Copying brain files (manifest-driven)...');

const MANIFEST_PATH = path.join(BRAIN_SRC, 'config', 'edition-manifest.json');
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

// Build the explicit relative-path list (under .github/) from the manifest.
// Each entry below mirrors what edition-manifest.json declares as edition-shipped.
const filesToCopy = [
    // Top-level
    manifest.copilot_instructions,                                  // copilot-instructions.md
    manifest.version_file,                                          // VERSION
    // Category folders
    ...(manifest.instructions || []).map(f => `instructions/${f}`),
    ...(manifest.prompts || []).map(f => `prompts/${f}`),
    ...(manifest.agents || []).map(f => `agents/${f}`),
    ...(manifest.skill_files || []).map(f => `skills/${f}`),
    ...(manifest.scripts || []).map(f => `scripts/${f}`),
    ...(manifest.configs || []).map(f => `config/${f}`),
];

let brainCount = 0;
const missing = [];
for (const rel of filesToCopy) {
    if (!rel) continue;
    const srcPath = path.join(BRAIN_SRC, rel);
    const dstPath = path.join(BRAIN_DST, rel);
    if (!fs.existsSync(srcPath)) {
        missing.push(rel);
        continue;
    }
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.copyFileSync(srcPath, dstPath);
    brainCount++;
}

if (missing.length > 0) {
    console.error(`FATAL: ${missing.length} manifested file(s) missing from Edition clone:`);
    for (const m of missing) console.error(`   - ${m}`);
    process.exit(1);
}

console.log(`   Copied ${brainCount} brain files (manifest-declared, no drift)`);

// ── Step 3b: Copy .vscode/ assets (manifest-driven) ──────────────
// Edition ships .vscode/settings.json (bootstrap_templates) and
// .vscode/markdown-light.css (vscode_assets). Both live at Edition repo root,
// not under .github/. Mirror them under brain/.vscode/ so they land at the
// workspace root when the Extension installs the brain into a heir.
//
// `.github/` entries in bootstrap_templates (e.g. cognitive-config.json) are
// intentionally absent from brain/ per the audit contract — they are seeded
// from templates/ instead (see Step 3c).
console.log('3b. Copying .vscode/ assets...');
const vscodeAssets = [];
for (const tpl of (manifest.bootstrap_templates || [])) {
    if (typeof tpl === 'string' && tpl.startsWith('.vscode/')) vscodeAssets.push(tpl);
}
for (const name of (manifest.vscode_assets || [])) {
    const rel = `.vscode/${name}`;
    if (!vscodeAssets.includes(rel)) vscodeAssets.push(rel);
}

let vscodeCount = 0;
const vscodeMissing = [];
for (const rel of vscodeAssets) {
    const srcPath = path.join(editionDir, rel);
    const dstPath = path.join(BRAIN_DST, rel);
    if (!fs.existsSync(srcPath)) {
        vscodeMissing.push(rel);
        continue;
    }
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.copyFileSync(srcPath, dstPath);
    vscodeCount++;
}

if (vscodeMissing.length > 0) {
    console.error(`FATAL: ${vscodeMissing.length} manifested .vscode/ file(s) missing from Edition clone:`);
    for (const m of vscodeMissing) console.error(`   - ${m}`);
    process.exit(1);
}

console.log(`   Copied ${vscodeCount} .vscode/ asset(s)`);

// ── Step 3c: Stage .github/ bootstrap templates outside brain/ ────
// HEIR_OWNED files declared in bootstrap_templates that target .github/
// must NOT live under brain/ (audit-brain-faithfulness.cjs enforces their
// absence). Stage them under templates/ so extension.js can seed them at
// first install without polluting brain/.
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

// ── Step 5: Create .vscodeignore ─────────────────────────────────
console.log('5. Writing .vscodeignore...');
const vscodeignore = [
    '.git',
    '.github',
    'decisions',
    'ACT',
    'ACT_obsolete',
    'assets/banner-*.svg',
    '*.cjs',
    '**/*.cjs',
    '!extension.js',
    'MIGRATION.md',
    'PLUGINS.md',
    'README.md',
    // Per ADR-009 Phase 1B.9: brain/ is excluded from the VSIX. The
    // Extension fetches the latest Edition brain from GitHub at runtime.
    // Local build-extension.cjs still copies brain/ to disk for dev
    // inspection, but vsce excludes it from the published package.
    'brain/**',
    'test/**',
    'node_modules',
    '.vscode-test',
    'build-extension.cjs',
    // Constellation source-repo marker. Runtime reads the *workspace-root*
    // marker (the user's open folder), not the bundled one, so shipping
    // it adds dead weight and could mislead installed users.
    '.act-protected.json',
].join('\n') + '\n';
fs.writeFileSync(path.join(EXT_DIR, '.vscodeignore'), vscodeignore);

// ── Step 6+7: Extension-identity files are repo-owned ────────────
// README.md, CHANGELOG.md, and LICENSE are owned by this Extension repo
// (post Phase 0.4-0.11 AlexMaster identity flip). They are NOT synced from
// Edition. Edition's brain content still flows through brain/ (Step 3).
console.log('6-7. Skipping README/CHANGELOG/LICENSE sync (Extension-owned).');

// ── Step 7b: Brain faithfulness gate (deprecated, ADR-009) ────────
// Pre-ADR-009 (Phase 1B.9): this gate audited brain/ against the Edition
// tag and was load-bearing — it guaranteed the published VSIX was byte-
// identical to a tagged Edition release.
//
// Post-ADR-009: brain/ is no longer shipped in the VSIX (see Step 5's
// .vscodeignore). The Extension fetches the latest Edition brain from
// GitHub at runtime, so there is nothing to be faithful to here. The
// new contract is enforced at fetch time by lib/edition-install.js
// against the spec-1.4 manifest in the fetched tarball.
//
// The release-preflight skill replaces the old check with two cheap
// invariants (per ADR-009 Phase 1C.2):
//   1. VSIX must not contain a brain/ directory
//   2. lib/edition-source.js must point at the canonical Edition repo
//
// Phase 3 (3.1) removes brain/ from this repo entirely and deletes the
// brain-copy steps (3, 3b, 3c) above. Until then, brain/ is still
// produced on disk for dev inspection but never reaches the VSIX.
console.log('7b. Brain faithfulness audit skipped (ADR-009 — Extension fetches Edition at runtime; brain/ not in VSIX).');

// ── Step 8: Summary ──────────────────────────────────────────────
const version = fs.readFileSync(path.join(BRAIN_DST, 'VERSION'), 'utf8').trim();
const extPkg = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'package.json'), 'utf8'));
console.log('');
console.log(`Extension: ${extPkg.displayName} v${extPkg.version}`);
console.log(`Brain:     v${version}`);
console.log(`Files:     ${brainCount} brain + extension.js`);

if (extPkg.version !== version) {
    // Dual-track by design (see ADR-004 alexmaster-migration):
    //   - package.json.version = Marketplace identity sequence (locked to AlexMaster's reclaimed ID)
    //   - brain/VERSION        = Edition brain semver (tracks .github/VERSION upstream)
    // They are NOT supposed to match. This is informational only.
    console.log(`\nNOTE: Marketplace v${extPkg.version} bundles brain v${version} (dual-track per ADR-004).`);
}

// ── Step 9: Build VSIX ──────────────────────────────────────────
if (!noVsix) {
    console.log('\n10. Building VSIX...');
    try {
        execSync('npx vsce package', { cwd: EXT_DIR, stdio: 'inherit' });
        const vsixFiles = fs.readdirSync(EXT_DIR).filter(f => f.endsWith('.vsix'));
        if (vsixFiles.length > 0) {
            console.log(`\nVSIX ready: ${vsixFiles[vsixFiles.length - 1]}`);
            console.log(`Test: code --install-extension ${vsixFiles[vsixFiles.length - 1]}`);
        }
    } catch (e) {
        console.error('VSIX build failed. Install vsce: npm install -g @vscode/vsce');
        console.error(e.message);
    }
} else {
    console.log('\nSkipped VSIX build (--no-vsix). Run `npx vsce package` to build.');
}

// ── Cleanup ──────────────────────────────────────────────────────
console.log('\nCleaning up temp dir...');
try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* best-effort */ }
