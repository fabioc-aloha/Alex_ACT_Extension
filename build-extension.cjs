#!/usr/bin/env node
/**
 * build-extension.cjs -- assemble the VSIX package from remote repos.
 *
 * Clones Alex_ACT_Edition and Alex_Skill_Mall from GitHub (source of truth),
 * copies brain files into brain/, bundles CATALOG.json into catalog/,
 * then optionally runs `npx vsce package` to produce the .vsix.
 *
 * Usage:
 *   node build-extension.cjs              # build from remote
 *   node build-extension.cjs --no-vsix    # assemble only, skip vsce
 *   node build-extension.cjs --ref v1.0.0 # use a specific Edition tag/branch
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const EXT_DIR = __dirname;
const BRAIN_DST = path.join(EXT_DIR, 'brain');
const CATALOG_DST = path.join(EXT_DIR, 'catalog');
const ICON_PATH = path.join(EXT_DIR, 'assets', 'icon.png');

const EDITION_REMOTE = 'https://github.com/fabioc-aloha/Alex_ACT_Edition.git';
const MALL_REMOTE = 'https://github.com/fabioc-aloha/Alex_Skill_Mall.git';

const noVsix = process.argv.includes('--no-vsix');
const refIdx = process.argv.indexOf('--ref');
const ref = refIdx >= 0 && process.argv[refIdx + 1] ? process.argv[refIdx + 1] : 'main';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'act-ext-build-'));

function cloneRepo(remote, name) {
    const dest = path.join(TMP_DIR, name);
    console.log(`   Cloning ${name} (${ref})...`);
    execSync(`git clone --depth 1 --branch ${ref} ${remote} ${dest}`, { stdio: 'pipe' });
    return dest;
}

// ── Step 1: Clean previous build ─────────────────────────────────
console.log('1. Cleaning previous build...');
if (fs.existsSync(BRAIN_DST)) fs.rmSync(BRAIN_DST, { recursive: true });
if (fs.existsSync(CATALOG_DST)) fs.rmSync(CATALOG_DST, { recursive: true });

// ── Step 2: Clone remotes ────────────────────────────────────────
console.log('2. Fetching from remote repos...');
let editionDir, mallDir;
try {
    editionDir = cloneRepo(EDITION_REMOTE, 'edition');
} catch (e) {
    console.error(`FATAL: Could not clone Edition: ${e.message.split('\n')[0]}`);
    process.exit(1);
}
try {
    mallDir = cloneRepo(MALL_REMOTE, 'mall');
} catch (e) {
    console.warn(`WARN: Could not clone Mall (catalog will be empty): ${e.message.split('\n')[0]}`);
    mallDir = null;
}

const BRAIN_SRC = path.join(editionDir, '.github');
const MALL_CATALOG = mallDir ? path.join(mallDir, 'CATALOG.json') : null;

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

// ── Step 4: Bundle Mall catalog ──────────────────────────────────
console.log('4. Bundling Mall catalog...');
fs.mkdirSync(CATALOG_DST, { recursive: true });
if (MALL_CATALOG && fs.existsSync(MALL_CATALOG)) {
    fs.copyFileSync(MALL_CATALOG, path.join(CATALOG_DST, 'CATALOG.json'));
    const plugins = JSON.parse(fs.readFileSync(MALL_CATALOG, 'utf8')).plugins;
    console.log(`   Bundled ${plugins.length} plugins from Mall`);
} else {
    console.log('   WARN: Mall CATALOG.json not found at ' + MALL_CATALOG);
    fs.writeFileSync(path.join(CATALOG_DST, 'CATALOG.json'), JSON.stringify({ plugins: [] }));
}

// ── Step 5: Ensure icon exists ───────────────────────────────────
console.log('5. Checking icon...');
if (!fs.existsSync(ICON_PATH)) {
    fs.mkdirSync(path.dirname(ICON_PATH), { recursive: true });
    // Generate a minimal SVG-to-PNG placeholder (real icon should be designed)
    console.log('   WARN: No icon.png found. Create a 128x128 PNG at extension/assets/icon.png');
}

// ── Step 6: Create .vscodeignore ─────────────────────────────────
console.log('6. Writing .vscodeignore...');
const vscodeignore = [
    '.git',
    '.github',
    'decisions',
    'ACT',
    'ACT_obsolete',
    'assets/banner-*.svg',
    '*.cjs',
    '!extension.js',
    'MIGRATION.md',
    'PLUGINS.md',
    'README.md',
    '!brain/**',
    '!catalog/**',
    'node_modules',
    '.vscode-test',
    'build-extension.cjs',
].join('\n') + '\n';
fs.writeFileSync(path.join(EXT_DIR, '.vscodeignore'), vscodeignore);

// ── Step 7: Copy README for marketplace ──────────────────────────
console.log('7. Preparing marketplace README...');
const readmeSrc = path.join(editionDir, 'README.md');
const readmeDst = path.join(EXT_DIR, 'README.md');
if (fs.existsSync(readmeSrc)) {
    // Copy and fix relative image paths to absolute GitHub URLs
    let readme = fs.readFileSync(readmeSrc, 'utf8');
    readme = readme.replace(
        /\(assets\//g,
        '(https://raw.githubusercontent.com/fabioc-aloha/Alex_ACT_Edition/main/assets/'
    );
    fs.writeFileSync(readmeDst, readme);
}

// ── Step 8: Copy CHANGELOG and LICENSE ───────────────────────────
console.log('8. Copying CHANGELOG and LICENSE...');
for (const f of ['CHANGELOG.md', 'LICENSE']) {
    const src = path.join(editionDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(EXT_DIR, f));
}

// ── Step 9: Summary ──────────────────────────────────────────────
const version = fs.readFileSync(path.join(BRAIN_DST, 'VERSION'), 'utf8').trim();
const extPkg = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'package.json'), 'utf8'));
console.log('');
console.log(`Extension: ${extPkg.displayName} v${extPkg.version}`);
console.log(`Brain:     v${version}`);
console.log(`Files:     ${brainCount} brain + catalog + extension.js`);

if (extPkg.version !== version) {
    console.log(`\nWARN: package.json version (${extPkg.version}) differs from brain VERSION (${version}). Sync them before publishing.`);
}

// ── Step 10: Build VSIX ──────────────────────────────────────────
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
