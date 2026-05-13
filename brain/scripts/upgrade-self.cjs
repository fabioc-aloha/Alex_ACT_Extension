#!/usr/bin/env node
/**
 * upgrade-self.cjs — heir-side pull from Alex_ACT_Edition.
 *
 * Strategy: backup .github/ → install fresh Edition → recover heir-owned files.
 * This atomic approach prevents partial-sync corruption. The backup is the
 * rollback path: rename it back to .github/ if something goes wrong.
 *
 * Run from a heir repo root.
 *
 * Usage:
 *   node .github/scripts/upgrade-self.cjs              # dry-run; reports plan
 *   node .github/scripts/upgrade-self.cjs --apply      # execute upgrade
 *   node .github/scripts/upgrade-self.cjs --from <url> # use alternate Edition remote
 *   node .github/scripts/upgrade-self.cjs --ref <ref>  # use alternate ref (default: main)
 *   node .github/scripts/upgrade-self.cjs --allow-major  # required for major version bumps
 *
 * The script never writes outside the heir repo. It does not touch git
 * (no commits, no pushes). The heir reviews the diff and commits.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { upsertHeir } = require('./_registry.cjs');

// ─── CLI & Config ────────────────────────────────────────────────────────────

const HEIR_ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}
const APPLY = args.has('--apply');
const ALLOW_MAJOR = args.has('--allow-major');
const FROM = arg('--from', 'https://github.com/fabioc-aloha/Alex_ACT_Edition.git');
const REF = arg('--ref', 'main');

// ─── Marker Validation ───────────────────────────────────────────────────────

const markerPath = path.join(HEIR_ROOT, '.github', '.act-heir.json');
if (!fs.existsSync(markerPath)) {
    console.error(`No .github/.act-heir.json found in ${HEIR_ROOT}`);
    console.error('Are you running from a heir repo root? Bootstrap first via Edition\'s .github/scripts/bootstrap-heir.cjs.');
    process.exit(2);
}

const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
const currentVersion = marker.edition_version || '0.0.0';

console.log('ACT Heir Self-Upgrade');
console.log(`Heir: ${marker.heir_id} (${marker.heir_name || ''})`);
console.log(`Current edition_version: ${currentVersion}`);
console.log(`Source: ${FROM} @ ${REF}`);
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log('');

// ─── Clone Edition ───────────────────────────────────────────────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-act-edition-'));
let cleanupNeeded = true;
function cleanup() {
    if (!cleanupNeeded) return;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
    cleanupNeeded = false;
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

try {
    console.log(`Fetching Edition into temp dir...`);
    execFileSync('git', ['clone', '--depth', '1', '--branch', REF, FROM, tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (err) {
    console.error(`Failed to clone Edition: ${err.message}`);
    process.exit(1);
}

// ─── Version Checks ──────────────────────────────────────────────────────────

const versionPath = path.join(tmp, '.github', 'VERSION');
if (!fs.existsSync(versionPath)) {
    console.error('Cloned Edition has no .github/VERSION file. Aborting.');
    process.exit(1);
}
const newVersion = fs.readFileSync(versionPath, 'utf8').trim();

const policyPath = path.join(tmp, '.github', 'config', 'sync-policy.json');
if (!fs.existsSync(policyPath)) {
    console.error('Cloned Edition has no sync-policy.json. Aborting.');
    process.exit(1);
}

function semver(v) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
    if (!m) return [0, 0, 0];
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}
const [curMaj, curMin, curPatch] = semver(currentVersion);
const [newMaj, newMin, newPatch] = semver(newVersion);
const isMajorBump = newMaj > curMaj;
const isUpgrade = newMaj > curMaj || (newMaj === curMaj && (newMin > curMin || (newMin === curMin && newPatch > curPatch)));
const isDowngrade = !isUpgrade && (newMaj < curMaj || newMin < curMin || newPatch < curPatch);

console.log(`Edition version available: ${newVersion}`);

if (isDowngrade) {
    console.error(`Refusing to downgrade ${currentVersion} -> ${newVersion}.`);
    process.exit(2);
}
if (isMajorBump && !ALLOW_MAJOR) {
    console.error('');
    console.error(`Major bump detected: ${currentVersion} -> ${newVersion}.`);
    console.error('Major releases may contain breaking changes. Review the Edition CHANGELOG, then re-run with --allow-major.');
    process.exit(2);
}
if (currentVersion === newVersion) {
    console.log('Already on this version. Running as repair/reinstall.');
} else {
    console.log(`Will upgrade: ${currentVersion} -> ${newVersion}`);
}
console.log('');

// ─── Collect Heir-Owned Files ────────────────────────────────────────────────

// Read from the CURRENT policy (before it gets replaced)
const currentPolicyPath = path.join(HEIR_ROOT, '.github', 'config', 'sync-policy.json');
let heirOwnedFiles = [];
if (fs.existsSync(currentPolicyPath)) {
    const currentPolicy = JSON.parse(fs.readFileSync(currentPolicyPath, 'utf8'));
    for (const pattern of (currentPolicy.heir_owned || [])) {
        for (const rel of expandGlob(HEIR_ROOT, pattern)) {
            heirOwnedFiles.push(rel);
        }
    }
}

// Always recover these regardless of policy
const alwaysRecover = [
    '.github/.act-heir.json',
    '.github/copilot-instructions.local.md',
    '.github/config/cognitive-config.json',
    '.github/config/goals.json',
];
for (const f of alwaysRecover) {
    if (fs.existsSync(path.join(HEIR_ROOT, f)) && !heirOwnedFiles.includes(f)) {
        heirOwnedFiles.push(f);
    }
}

// Recover local/ directories
const localDirs = [
    '.github/skills/local', '.github/instructions/local',
    '.github/muscles/local', '.github/prompts/local',
    '.github/agents/local',
];
for (const ld of localDirs) {
    const absLd = path.join(HEIR_ROOT, ld);
    if (fs.existsSync(absLd)) {
        walkDir(absLd).forEach(f => {
            const rel = path.relative(HEIR_ROOT, f).replace(/\\/g, '/');
            if (!heirOwnedFiles.includes(rel)) heirOwnedFiles.push(rel);
        });
    }
}

// Recover episodic/
const episodicDir = path.join(HEIR_ROOT, '.github', 'episodic');
if (fs.existsSync(episodicDir)) {
    walkDir(episodicDir).forEach(f => {
        const rel = path.relative(HEIR_ROOT, f).replace(/\\/g, '/');
        if (!heirOwnedFiles.includes(rel)) heirOwnedFiles.push(rel);
    });
}

// ─── Detect Heir-Added Artifacts Outside local/ ──────────────────────────────
// Skills/instructions/prompts/muscles added directly into edition-owned paths
// (pre-v1.0 pattern). These get relocated to local/ during upgrade.

const editionManifestPath = path.join(tmp, '.github', 'config', 'edition-manifest.json');
let editionSkills = new Set();
let editionPrompts = new Set();
let editionAgents = new Set();
if (fs.existsSync(editionManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(editionManifestPath, 'utf8'));
    (manifest.skills || []).forEach(s => editionSkills.add(s));
    (manifest.prompts || []).forEach(p => editionPrompts.add(p));
    (manifest.agents || []).forEach(a => editionAgents.add(a));
}

const relocations = [];

// Check skills
const heirSkillsDir = path.join(HEIR_ROOT, '.github', 'skills');
if (fs.existsSync(heirSkillsDir)) {
    for (const entry of fs.readdirSync(heirSkillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'local') continue;
        if (editionSkills.has(entry.name)) continue;
        const srcDir = path.join(heirSkillsDir, entry.name);
        for (const f of walkDir(srcDir)) {
            const rel = path.relative(HEIR_ROOT, f).replace(/\\/g, '/');
            const newRel = rel.replace('.github/skills/', '.github/skills/local/');
            relocations.push({ from: rel, to: newRel });
        }
    }
}

// Check instructions
const editionInstrDir = path.join(tmp, '.github', 'instructions');
const editionInstructions = new Set();
if (fs.existsSync(editionInstrDir)) {
    fs.readdirSync(editionInstrDir).forEach(f => editionInstructions.add(f));
}
const heirInstrDir = path.join(HEIR_ROOT, '.github', 'instructions');
if (fs.existsSync(heirInstrDir)) {
    for (const entry of fs.readdirSync(heirInstrDir, { withFileTypes: true })) {
        if (entry.name === 'local') continue;
        if (!entry.isFile()) continue;
        if (editionInstructions.has(entry.name)) continue;
        const rel = `.github/instructions/${entry.name}`;
        const newRel = `.github/instructions/local/${entry.name}`;
        relocations.push({ from: rel, to: newRel });
    }
}

// Check prompts
const heirPromptsDir = path.join(HEIR_ROOT, '.github', 'prompts');
if (fs.existsSync(heirPromptsDir)) {
    for (const entry of fs.readdirSync(heirPromptsDir, { withFileTypes: true })) {
        if (entry.name === 'local') continue;
        if (!entry.isFile()) continue;
        if (editionPrompts.has(entry.name)) continue;
        const rel = `.github/prompts/${entry.name}`;
        const newRel = `.github/prompts/local/${entry.name}`;
        relocations.push({ from: rel, to: newRel });
    }
}

// Check muscles
const editionMuscleDir = path.join(tmp, '.github', 'muscles');
const editionMuscles = new Set();
if (fs.existsSync(editionMuscleDir)) {
    for (const f of walkDir(editionMuscleDir)) {
        editionMuscles.add(path.relative(path.join(tmp, '.github', 'muscles'), f).replace(/\\/g, '/'));
    }
}
const heirMuscleDir = path.join(HEIR_ROOT, '.github', 'muscles');
if (fs.existsSync(heirMuscleDir)) {
    for (const entry of fs.readdirSync(heirMuscleDir, { withFileTypes: true })) {
        if (entry.name === 'local' || entry.name === 'shared' || entry.name === 'lua-filters') continue;
        if (!entry.isFile()) continue;
        if (editionMuscles.has(entry.name)) continue;
        const rel = `.github/muscles/${entry.name}`;
        const newRel = `.github/muscles/local/${entry.name}`;
        relocations.push({ from: rel, to: newRel });
    }
}

// Include relocated files in heir-owned collection so they get preserved
if (relocations.length > 0) {
    console.log(`Heir-added artifacts to relocate to local/: ${relocations.length}`);
    relocations.slice(0, 10).forEach(r => console.log(`  ${r.from} -> ${r.to}`));
    if (relocations.length > 10) console.log(`  ... and ${relocations.length - 10} more`);
    console.log('');
    for (const r of relocations) {
        if (!heirOwnedFiles.includes(r.from)) heirOwnedFiles.push(r.from);
    }
}

// ─── Implement "unmatched: preserve" from sync-policy ────────────────────────
// Walk current .github/ and preserve any file that is NOT edition-owned.
// This catches .github/workflows/, .github/ISSUE_TEMPLATE/, dependabot.yml, etc.

const dotGithubDir = path.join(HEIR_ROOT, '.github');
if (fs.existsSync(dotGithubDir)) {
    const currentPolicy = fs.existsSync(currentPolicyPath)
        ? JSON.parse(fs.readFileSync(currentPolicyPath, 'utf8'))
        : {};
    const editionOwnedPatterns = currentPolicy.edition_owned || [];

    function isEditionOwned(relPath) {
        const normalized = relPath.replace(/\\/g, '/');
        for (const pattern of editionOwnedPatterns) {
            const p = pattern.replace(/\\/g, '/');
            if (p.endsWith('/**')) {
                const prefix = p.slice(0, -3); // strip /**
                if (normalized === prefix || normalized.startsWith(prefix + '/')) return true;
            } else if (p.includes('*')) {
                // Single-level wildcard: convert to regex
                const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
                if (new RegExp('^' + escaped + '$').test(normalized)) return true;
            } else {
                if (normalized === p) return true;
            }
        }
        return false;
    }

    let unmatchedCount = 0;
    for (const absPath of walkDir(dotGithubDir)) {
        const rel = path.relative(HEIR_ROOT, absPath).replace(/\\/g, '/');
        if (isEditionOwned(rel)) continue;
        if (heirOwnedFiles.includes(rel)) continue;
        heirOwnedFiles.push(rel);
        unmatchedCount++;
    }

    if (unmatchedCount > 0) {
        console.log(`Unmatched files preserved (not edition-owned): ${unmatchedCount}`);
    }
}

console.log(`Heir-owned files to recover: ${heirOwnedFiles.length}`);
if (heirOwnedFiles.length > 0) {
    heirOwnedFiles.slice(0, 10).forEach(f => console.log(`  ${f}`));
    if (heirOwnedFiles.length > 10) console.log(`  ... and ${heirOwnedFiles.length - 10} more`);
}
console.log('');

// ─── Backup Name ─────────────────────────────────────────────────────────────

const datestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
const backupDir = path.join(HEIR_ROOT, `.github-backup-${datestamp}`);

if (fs.existsSync(backupDir)) {
    console.error(`Backup directory already exists: ${backupDir}`);
    console.error('Remove it or wait until tomorrow to re-run.');
    process.exit(2);
}

// ─── Dry-Run Report ──────────────────────────────────────────────────────────

if (!APPLY) {
    console.log('DRY-RUN: would rename .github/ to ' + path.basename(backupDir));
    console.log('  Then install fresh Edition v' + newVersion);
    console.log('  Then recover ' + heirOwnedFiles.length + ' heir-owned files');
    if (relocations.length > 0) {
        console.log('  Then relocate ' + relocations.length + ' heir-added artifacts to local/');
    }
    console.log('');
    console.log('Re-run with --apply to execute.');
    process.exit(0);
}

// ─── Execute Upgrade ─────────────────────────────────────────────────────────

// Step 1: Copy heir-owned files to temp holding area
const holdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heir-owned-'));
for (const rel of heirOwnedFiles) {
    const src = path.join(HEIR_ROOT, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(holdDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
}

// Step 2: Rename .github/ to backup (atomic on same filesystem)
fs.renameSync(path.join(HEIR_ROOT, '.github'), backupDir);

// Step 3: Install fresh Edition brain
const editionGh = path.join(tmp, '.github');
copyDirRecursive(editionGh, path.join(HEIR_ROOT, '.github'));

// Step 4: Restore heir-owned files (with relocations applied)
const relocationMap = new Map();
for (const r of relocations) {
    relocationMap.set(r.from, r.to);
}

let recovered = 0;
let relocated = 0;
for (const rel of heirOwnedFiles) {
    const src = path.join(holdDir, rel);
    if (!fs.existsSync(src)) continue;
    const targetRel = relocationMap.has(rel) ? relocationMap.get(rel) : rel;
    const dst = path.join(HEIR_ROOT, targetRel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    if (relocationMap.has(rel)) relocated++;
    recovered++;
}

// Step 5: Update marker
const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
marker.edition_version = newVersion;
marker.last_sync_at = now;
fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');

// Cleanup temp holding area
try { fs.rmSync(holdDir, { recursive: true, force: true }); } catch { /* best-effort */ }

// Best-effort: refresh fleet registry
const registryResult = upsertHeir(marker, HEIR_ROOT);
if (registryResult.ok) console.log(`Refreshed fleet registry: ${registryResult.path}`);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('');
console.log(`Upgrade complete: ${currentVersion} -> ${newVersion}`);
console.log(`Fresh brain installed. ${recovered} heir-owned files recovered. ${relocated} relocated to local/.`);
console.log(`Backup at: ${path.basename(backupDir)}`);
console.log('');
console.log('Next steps:');
console.log('  git status                    # review changes');
console.log('  git add -A && git commit -m "Upgrade to Edition ' + newVersion + '"');
console.log('  # Test, then delete ' + path.basename(backupDir) + '/ when satisfied');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function walkDir(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(full));
        } else {
            results.push(full);
        }
    }
    return results;
}

function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(s, d);
        } else {
            fs.copyFileSync(s, d);
        }
    }
}

function expandGlob(root, pattern) {
    const literal = pattern.replace(/\\/g, '/');
    if (!literal.includes('*')) {
        return fs.existsSync(path.join(root, literal)) ? [literal] : [];
    }
    const parts = literal.split('/');
    const results = [];
    function walk(dir, idx) {
        if (idx >= parts.length) return;
        const seg = parts[idx];
        const full = path.join(root, dir);
        if (!fs.existsSync(full)) return;
        let entries;
        try { entries = fs.readdirSync(full, { withFileTypes: true }); } catch { return; }
        if (seg === '**') {
            for (const e of entries) {
                const rel = path.posix.join(dir, e.name);
                if (e.isDirectory()) {
                    walk(rel, idx);
                    walk(rel, idx + 1);
                } else if (idx + 1 >= parts.length || parts[idx + 1] === e.name) {
                    results.push(rel);
                }
            }
        } else if (seg === '*' || seg.includes('*')) {
            const re = new RegExp('^' + seg.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            for (const e of entries) {
                if (!re.test(e.name)) continue;
                const rel = path.posix.join(dir, e.name);
                if (idx === parts.length - 1) {
                    if (e.isFile()) results.push(rel);
                } else if (e.isDirectory()) {
                    walk(rel, idx + 1);
                }
            }
        } else {
            for (const e of entries) {
                if (e.name !== seg) continue;
                const rel = path.posix.join(dir, e.name);
                if (idx === parts.length - 1) {
                    if (e.isFile()) results.push(rel);
                } else if (e.isDirectory()) {
                    walk(rel, idx + 1);
                }
            }
        }
    }
    walk('', 0);
    return results;
}
