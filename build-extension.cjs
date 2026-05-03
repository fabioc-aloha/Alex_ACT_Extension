#!/usr/bin/env node
/**
 * build-extension.cjs -- assemble the VSIX package.
 *
 * Copies brain files (.github/) into extension/brain/,
 * bundles CATALOG.json from the Mall sibling,
 * creates a placeholder icon if missing,
 * then runs `npx vsce package` to produce the .vsix.
 *
 * Usage:
 *   node build-extension.cjs              # build
 *   node build-extension.cjs --no-vsix    # assemble only, skip vsce
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXT_DIR = __dirname;
const EDITION_ROOT = path.resolve(EXT_DIR, '..', 'Alex_ACT_Edition');
const BRAIN_SRC = path.join(EDITION_ROOT, '.github');
const BRAIN_DST = path.join(EXT_DIR, 'brain');
const CATALOG_DST = path.join(EXT_DIR, 'catalog');
const MALL_CATALOG = path.resolve(EXT_DIR, '..', 'Alex_ACT_Plugin_Mall', 'CATALOG.json');
const ICON_PATH = path.join(EXT_DIR, 'assets', 'icon.png');

const noVsix = process.argv.includes('--no-vsix');

// ── Step 1: Clean previous build ─────────────────────────────────
console.log('1. Cleaning previous build...');
if (fs.existsSync(BRAIN_DST)) fs.rmSync(BRAIN_DST, { recursive: true });
if (fs.existsSync(CATALOG_DST)) fs.rmSync(CATALOG_DST, { recursive: true });

// ── Step 2: Copy brain files ─────────────────────────────────────
console.log('2. Copying brain files...');
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

// ── Step 3: Bundle Mall catalog ──────────────────────────────────
console.log('3. Bundling Mall catalog...');
fs.mkdirSync(CATALOG_DST, { recursive: true });
if (fs.existsSync(MALL_CATALOG)) {
    fs.copyFileSync(MALL_CATALOG, path.join(CATALOG_DST, 'CATALOG.json'));
    const plugins = JSON.parse(fs.readFileSync(MALL_CATALOG, 'utf8')).plugins;
    console.log(`   Bundled ${plugins.length} plugins from Mall`);
} else {
    console.log('   WARN: Mall CATALOG.json not found at ' + MALL_CATALOG);
    fs.writeFileSync(path.join(CATALOG_DST, 'CATALOG.json'), JSON.stringify({ plugins: [] }));
}

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

// ── Step 6: Copy README for marketplace ──────────────────────────
console.log('6. Preparing marketplace README...');
const readmeSrc = path.join(EDITION_ROOT, 'README.md');
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

// ── Step 7: Copy CHANGELOG and LICENSE ───────────────────────────
console.log('7. Copying CHANGELOG and LICENSE...');
for (const f of ['CHANGELOG.md', 'LICENSE']) {
    const src = path.join(EDITION_ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(EXT_DIR, f));
}

// ── Step 8: Summary ──────────────────────────────────────────────
const version = fs.readFileSync(path.join(BRAIN_DST, 'VERSION'), 'utf8').trim();
const extPkg = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'package.json'), 'utf8'));
console.log('');
console.log(`Extension: ${extPkg.displayName} v${extPkg.version}`);
console.log(`Brain:     v${version}`);
console.log(`Files:     ${brainCount} brain + catalog + extension.js`);

if (extPkg.version !== version) {
    console.log(`\nWARN: package.json version (${extPkg.version}) differs from brain VERSION (${version}). Sync them before publishing.`);
}

// ── Step 9: Build VSIX ───────────────────────────────────────────
if (!noVsix) {
    console.log('\n8. Building VSIX...');
    try {
        execSync('npx vsce package', { cwd: EXT_DIR, stdio: 'inherit' });
        const vsixFiles = fs.readdirSync(EXT_DIR).filter(f => f.endsWith('.vsix'));
        if (vsixFiles.length > 0) {
            console.log(`\nVSIX ready: extension/${vsixFiles[vsixFiles.length - 1]}`);
            console.log(`Test: code --install-extension extension/${vsixFiles[vsixFiles.length - 1]}`);
        }
    } catch (e) {
        console.error('VSIX build failed. Install vsce: npm install -g @vscode/vsce');
        console.error(e.message);
    }
} else {
    console.log('\nSkipped VSIX build (--no-vsix). Run `npx vsce package` in extension/ to build.');
}
