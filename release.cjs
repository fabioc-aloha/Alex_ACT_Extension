#!/usr/bin/env node
/**
 * release.cjs — Repeatable Extension release orchestrator.
 *
 * Runs the deterministic gates from the test harness (extension/README.md in Supervisor)
 * in sequence, stops on first failure, and produces a release-ready state.
 *
 * Usage:
 *   node release.cjs                     # full release (build + VSIX + audit)
 *   node release.cjs --dry-run           # all checks, no git commit/tag/push
 *   node release.cjs --edition-tag v3.0.0  # explicit Edition tag (default: reads ../Alex_ACT_Edition/VERSION)
 *   node release.cjs --bump patch|minor|major  # auto-bump package.json version
 *   node release.cjs --skip-vsix         # skip vsce package (useful for pre-checks)
 *   node release.cjs --skip-wiki         # skip wiki publish
 *
 * Requirements:
 *   - Node.js 18+
 *   - git on PATH
 *   - npx vsce available (npm i -g @vscode/vsce)
 *   - Sibling clone: ../Alex_ACT_Edition
 *   - Sibling clone: ../Alex_ACT_Supervisor (for brain-qa)
 *
 * Exit codes:
 *   0 = release ready (or completed if not --dry-run)
 *   1 = gate failure (details printed)
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────────────
const EXT_ROOT = __dirname;
const EDITION_ROOT = path.resolve(EXT_ROOT, '..', 'Alex_ACT_Edition');
const SUPERVISOR_ROOT = path.resolve(EXT_ROOT, '..', 'Alex_ACT_Supervisor');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipVsix = args.includes('--skip-vsix');
const skipWiki = args.includes('--skip-wiki');

const bumpIdx = args.indexOf('--bump');
const bumpType = bumpIdx >= 0 ? args[bumpIdx + 1] : null;

const tagIdx = args.indexOf('--edition-tag');
let editionTag = tagIdx >= 0 ? args[tagIdx + 1] : null;

// ─── Helpers ─────────────────────────────────────────────────────────────────
let gateNum = 0;
let failures = [];

function gate(name) {
    gateNum++;
    process.stdout.write(`\n[${ gateNum }] ${name}... `);
}

function pass(detail) {
    console.log(`PASS${detail ? ' — ' + detail : ''}`);
}

function fail(detail) {
    console.log(`FAIL — ${detail}`);
    failures.push({ gate: gateNum, detail });
}

function fatal(detail) {
    fail(detail);
    console.error(`\nFATAL at gate ${gateNum}. Stopping.`);
    process.exit(1);
}

function run(cmd, opts = {}) {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function runFile(file, args, opts = {}) {
    return execFileSync(file, args, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

// ─── Pre-flight: resolve Edition tag ─────────────────────────────────────────
if (!editionTag) {
    const versionFile = path.join(EDITION_ROOT, 'VERSION');
    if (!fs.existsSync(versionFile)) {
        console.error('FATAL: Cannot find ../Alex_ACT_Edition/VERSION. Pass --edition-tag explicitly.');
        process.exit(1);
    }
    editionTag = 'v' + fs.readFileSync(versionFile, 'utf8').trim();
}

console.log('═══════════════════════════════════════════════════════════');
console.log(' Alex — ACT Edition: Release Pipeline');
console.log('═══════════════════════════════════════════════════════════');
console.log(` Edition tag:  ${editionTag}`);
console.log(` Dry run:      ${dryRun}`);
console.log(` Skip VSIX:    ${skipVsix}`);
console.log(` Skip wiki:    ${skipWiki}`);
console.log(` Bump:         ${bumpType || '(none — manual)'}`);
console.log('═══════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 0: Brain QA
// ═══════════════════════════════════════════════════════════════════════════════

gate('Brain QA (Supervisor + Edition)');
try {
    run(`node scripts/brain-qa.cjs --quiet`, { cwd: SUPERVISOR_ROOT });
    pass('exit 0');
} catch (e) {
    fatal(`brain-qa.cjs failed:\n${e.stdout || e.stderr || e.message}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 1-2: Edition readiness
// ═══════════════════════════════════════════════════════════════════════════════

gate('Edition tag exists and is fetchable');
try {
    run(`git fetch --tags`, { cwd: EDITION_ROOT });
    run(`git rev-parse --verify "${editionTag}^{commit}"`, { cwd: EDITION_ROOT });
    pass(editionTag);
} catch (e) {
    fatal(`Cannot resolve Edition tag ${editionTag}`);
}

gate('Edition VERSION matches tag');
{
    const fileVer = fs.readFileSync(path.join(EDITION_ROOT, 'VERSION'), 'utf8').trim();
    const expected = 'v' + fileVer;
    if (expected === editionTag) {
        pass(`${fileVer} = ${editionTag}`);
    } else {
        fail(`VERSION=${fileVer} but using tag=${editionTag}`);
    }
}

gate('Edition manifest is current');
try {
    run(`node .github/scripts/build-edition-manifest.cjs`, { cwd: EDITION_ROOT });
    const diff = run(`git diff .github/config/edition-manifest.json`, { cwd: EDITION_ROOT });
    // Only generated_at timestamp is acceptable
    const lines = diff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-'));
    const nonTimestamp = lines.filter(l => !l.includes('generated_at') && !l.startsWith('+++') && !l.startsWith('---'));
    if (nonTimestamp.length === 0) {
        pass('manifest current (timestamp-only diff)');
    } else {
        fail('manifest has structural drift — run build-edition-manifest.cjs in Edition');
    }
    // Reset the timestamp-only change
    run(`git checkout .github/config/edition-manifest.json`, { cwd: EDITION_ROOT });
} catch (e) {
    fail(`manifest check error: ${e.message}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 3: Build brain bundle
// ═══════════════════════════════════════════════════════════════════════════════

gate('Version bump (if requested)');
if (bumpType) {
    if (!['patch', 'minor', 'major'].includes(bumpType)) {
        fatal(`Invalid --bump value: ${bumpType}. Use patch|minor|major.`);
    }
    const pkgPath = path.join(EXT_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const [major, minor, patch] = pkg.version.split('.').map(Number);
    let newVer;
    if (bumpType === 'major') newVer = `${major + 1}.0.0`;
    else if (bumpType === 'minor') newVer = `${major}.${minor + 1}.0`;
    else newVer = `${major}.${minor}.${patch + 1}`;

    if (dryRun) {
        pass(`would bump ${pkg.version} → ${newVer} (dry run)`);
    } else {
        pkg.version = newVer;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        pass(`${pkg.version.replace(newVer, '')}${bumpType}: ${newVer}`);
    }
} else {
    pass('no bump requested — using current package.json version');
}

gate('Build brain bundle (manifest-driven)');
try {
    const output = run(`node build-extension.cjs --no-vsix --ref ${editionTag}`, { cwd: EXT_ROOT });
    if (output.includes('PASS')) {
        pass('build + internal audit passed');
    } else if (output.includes('FAIL')) {
        fatal(`build audit failed:\n${output.slice(-500)}`);
    } else {
        pass('build completed');
    }
} catch (e) {
    fatal(`build-extension.cjs failed:\n${(e.stdout || '') + (e.stderr || '')}`);
}

gate('Standalone faithfulness audit');
try {
    const output = run(`node scripts/audit-brain-faithfulness.cjs`, { cwd: EXT_ROOT });
    if (output.includes('PASS')) {
        pass('brain/ faithful to ' + editionTag);
    } else {
        fatal(`audit failed:\n${output.slice(-500)}`);
    }
} catch (e) {
    fatal(`audit script failed:\n${(e.stdout || '') + (e.stderr || '')}`);
}

gate('brain/VERSION matches Edition');
{
    const brainVer = fs.readFileSync(path.join(EXT_ROOT, 'brain', 'VERSION'), 'utf8').trim();
    const editionVer = fs.readFileSync(path.join(EDITION_ROOT, 'VERSION'), 'utf8').trim();
    if (brainVer === editionVer) {
        pass(`v${brainVer}`);
    } else {
        fail(`brain=${brainVer}, Edition=${editionVer}`);
    }
}

gate('Walkthrough files exist');
{
    const pkg = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'package.json'), 'utf8'));
    const walkthroughs = pkg.contributes?.walkthroughs || [];
    let missing = [];
    for (const wt of walkthroughs) {
        for (const step of (wt.steps || [])) {
            if (step.markdown && !fs.existsSync(path.join(EXT_ROOT, step.markdown))) {
                missing.push(step.markdown);
            }
        }
    }
    if (missing.length === 0) {
        pass(`all paths resolve`);
    } else {
        fail(`missing: ${missing.join(', ')}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 4: VSIX
// ═══════════════════════════════════════════════════════════════════════════════

if (!skipVsix) {
    gate('vsce package');
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'package.json'), 'utf8'));
        const vsixName = `alex-act-edition-${pkg.version}.vsix`;
        const vsixPath = path.join(EXT_ROOT, vsixName);
        run(`npx vsce package --out "${vsixPath}"`, { cwd: EXT_ROOT });
        if (fs.existsSync(vsixPath)) {
            const sizeMB = (fs.statSync(vsixPath).size / (1024 * 1024)).toFixed(2);
            pass(`${vsixName} (${sizeMB} MB)`);
        } else {
            fatal('VSIX file not produced');
        }
    } catch (e) {
        fatal(`vsce package failed:\n${(e.stdout || '') + (e.stderr || '')}`);
    }
} else {
    gate('vsce package (SKIPPED)');
    pass('--skip-vsix');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stage 5: Wiki
// ═══════════════════════════════════════════════════════════════════════════════

gate('Wiki source structure');
{
    const wikiDir = path.join(EXT_ROOT, 'docs', 'wiki');
    const sidebar = path.join(wikiDir, '_Sidebar.md');
    if (!fs.existsSync(wikiDir)) {
        fail('docs/wiki/ not found');
    } else if (!fs.existsSync(sidebar)) {
        fail('_Sidebar.md missing');
    } else {
        const pages = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md'));
        pass(`${pages.length} pages + _Sidebar.md`);
    }
}

if (!skipWiki && !dryRun) {
    gate('Publish wiki');
    try {
        run(`pwsh -NoProfile -File scripts/publish-wiki.ps1`, { cwd: EXT_ROOT });
        pass('wiki synced');
    } catch (e) {
        // Wiki publish failure is non-fatal (network dependent)
        fail(`wiki publish failed (non-fatal): ${e.message}`);
    }
} else {
    gate('Publish wiki (SKIPPED)');
    pass(dryRun ? '--dry-run' : '--skip-wiki');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
if (failures.length === 0) {
    const pkg = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'package.json'), 'utf8'));
    console.log(` ALL GATES PASSED — v${pkg.version} ready`);
    console.log('═══════════════════════════════════════════════════════════');

    if (!dryRun) {
        console.log('\nNext steps (manual):');
        console.log(`  1. Update CHANGELOG.md with release notes`);
        console.log(`  2. git add brain/ package.json CHANGELOG.md`);
        console.log(`  3. git commit -F <msg-file>  (severity tag: [behaviour])`);
        console.log(`  4. git tag v${pkg.version}`);
        console.log(`  5. git push origin main && git push origin v${pkg.version}`);
        console.log(`  6. npx vsce publish --packagePath alex-act-edition-${pkg.version}.vsix`);
    }
} else {
    console.log(` ${failures.length} GATE(S) FAILED:`);
    for (const f of failures) {
        console.log(`   Gate ${f.gate}: ${f.detail}`);
    }
    console.log('═══════════════════════════════════════════════════════════');
    process.exit(1);
}
