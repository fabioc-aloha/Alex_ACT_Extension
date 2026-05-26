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
    execFileSync('git', ['clone', '--depth', '1', '--branch', branch, remote, dest], { stdio: 'pipe' });
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

// ── Step 3: Copy brain files ─────────────────────────────────────
console.log('3. Copying brain files...');
function copyRecursive(src, dst) {
    let count = 0;
    if (!fs.existsSync(src)) return count;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const dstPath = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            count += copyRecursive(srcPath, dstPath);
        } else {
            fs.mkdirSync(path.dirname(dstPath), { recursive: true });
            fs.copyFileSync(srcPath, dstPath);
            count++;
        }
    }
    return count;
}

const brainCount = copyRecursive(BRAIN_SRC, BRAIN_DST);
console.log(`   Copied ${brainCount} brain files`);

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
    '!brain/**',
    'node_modules',
    '.vscode-test',
    'build-extension.cjs',
].join('\n') + '\n';
fs.writeFileSync(path.join(EXT_DIR, '.vscodeignore'), vscodeignore);

// ── Step 6+7: Extension-identity files are repo-owned ────────────
// README.md, CHANGELOG.md, and LICENSE are owned by this Extension repo
// (post Phase 0.4-0.11 AlexMaster identity flip). They are NOT synced from
// Edition. Edition's brain content still flows through brain/ (Step 3).
console.log('6-7. Skipping README/CHANGELOG/LICENSE sync (Extension-owned).');

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
