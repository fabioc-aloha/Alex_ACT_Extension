#!/usr/bin/env node
/**
 * upgrade-self.cjs — heir-side pull from Alex_ACT_Edition.
 *
 * Run from a heir repo root. Fetches Edition into a temp dir, applies
 * edition_owned paths per .github/config/sync-policy.json, preserves
 * heir_owned paths, and bumps edition_version + last_sync_at in the marker.
 *
 * Usage:
 *   node .github/scripts/upgrade-self.cjs              # dry-run; reports changes
 *   node .github/scripts/upgrade-self.cjs --apply      # apply changes
 *   node .github/scripts/upgrade-self.cjs --from <url> # use alternate Edition remote
 *   node .github/scripts/upgrade-self.cjs --ref <ref>  # use alternate ref (default: main)
 *   node .github/scripts/upgrade-self.cjs --allow-major  # required if Edition major bumped
 *
 * The script never writes outside the heir repo. It does not touch git
 * (no commits, no pushes). The heir reviews the diff and commits.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { upsertHeir, resolveAiMemoryRoot } = require('./_registry.cjs');

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

const markerPath = path.join(HEIR_ROOT, '.github', '.act-heir.json');
if (!fs.existsSync(markerPath)) {
    console.error(`No .github/.act-heir.json found in ${HEIR_ROOT}`);
    console.error('Are you running from a heir repo root? Bootstrap first via Edition\'s .github/scripts/bootstrap-heir.cjs.');
    process.exit(2);
}

const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
const currentVersion = marker.edition_version || '0.0.0';

console.log(`ACT Heir Self-Upgrade`);
console.log(`Heir: ${marker.heir_id} (${marker.heir_name || ''})`);
console.log(`Current edition_version: ${currentVersion}`);
console.log(`Source: ${FROM} @ ${REF}`);
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log('');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-act-edition-'));
let cleanupNeeded = true;
function cleanup() {
    if (!cleanupNeeded) return;
    try {
        fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
        // best-effort
    }
    cleanupNeeded = false;
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

try {
    console.log(`Fetching Edition into ${tmp}...`);
    execFileSync('git', ['clone', '--depth', '1', '--branch', REF, FROM, tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (err) {
    console.error(`Failed to clone Edition: ${err.message}`);
    process.exit(1);
}

const versionPath = path.join(tmp, '.github', 'VERSION');
if (!fs.existsSync(versionPath)) {
    console.error(`Cloned Edition has no .github/VERSION file. Aborting.`);
    process.exit(1);
}
const newVersion = fs.readFileSync(versionPath, 'utf8').trim();

const policyPath = path.join(tmp, '.github', 'config', 'sync-policy.json');
if (!fs.existsSync(policyPath)) {
    console.error(`Cloned Edition has no sync-policy.json. Aborting.`);
    process.exit(1);
}
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

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
    console.log(`Already on ${currentVersion}. No edition_version change.`);
} else {
    console.log(`Will bump: ${currentVersion} -> ${newVersion}`);
}
console.log('');

// ── Major-version path: backup + fresh install + recover heir-owned ──
if (isMajorBump && ALLOW_MAJOR) {
    console.log('MAJOR VERSION UPGRADE: backup + fresh install + recover heir-owned');
    console.log('');

    const datestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
    const backupDir = path.join(HEIR_ROOT, `.github-backup-${datestamp}`);

    if (fs.existsSync(backupDir)) {
        console.error(`Backup directory already exists: ${backupDir}`);
        console.error('Remove it or wait until tomorrow to re-run.');
        process.exit(2);
    }

    // Collect heir-owned files before rename (from the CURRENT policy, not new)
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

    // ── Detect heir-added artifacts outside local/ (pre-v1.0 pattern) ──
    // These are skills/instructions/prompts/muscles the heir added directly
    // into edition-owned paths. In v1.0+ they must live in local/.
    // We detect them by diffing the heir's files against the Edition manifest.
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

    // Relocations: { from: original relative path, to: new local/ relative path }
    const relocations = [];

    // Check skills: heir has skill folders that Edition doesn't ship
    const heirSkillsDir = path.join(HEIR_ROOT, '.github', 'skills');
    if (fs.existsSync(heirSkillsDir)) {
        for (const entry of fs.readdirSync(heirSkillsDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (entry.name === 'local') continue; // already handled
            if (editionSkills.has(entry.name)) continue; // Edition ships this
            // This is a heir-added skill outside local/ -- relocate
            const srcDir = path.join(heirSkillsDir, entry.name);
            for (const f of walkDir(srcDir)) {
                const rel = path.relative(HEIR_ROOT, f).replace(/\\/g, '/');
                const newRel = rel.replace('.github/skills/', '.github/skills/local/');
                relocations.push({ from: rel, to: newRel });
            }
        }
    }

    // Check instructions: heir has instruction files that Edition doesn't ship
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

    // Check prompts: heir has prompt files that Edition doesn't ship
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

    // Check muscles: heir has muscle files that Edition doesn't ship
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

    if (relocations.length > 0) {
        console.log(`Heir-added artifacts to relocate to local/: ${relocations.length}`);
        relocations.slice(0, 10).forEach(r => console.log(`  ${r.from} -> ${r.to}`));
        if (relocations.length > 10) console.log(`  ... and ${relocations.length - 10} more`);
        console.log('');

        // Add relocations to heir-owned recovery (with new paths)
        for (const r of relocations) {
            heirOwnedFiles.push(r.from); // so it gets copied to hold dir
        }
    }

    console.log(`Heir-owned files to recover: ${heirOwnedFiles.length}`);
    if (heirOwnedFiles.length > 0) {
        heirOwnedFiles.slice(0, 10).forEach(f => console.log(`  ${f}`));
        if (heirOwnedFiles.length > 10) console.log(`  ... and ${heirOwnedFiles.length - 10} more`);
    }
    console.log('');

    if (!APPLY) {
        console.log('DRY-RUN (major): would rename .github/ to ' + path.basename(backupDir));
        console.log('  Then install fresh Edition v' + newVersion);
        console.log('  Then recover ' + heirOwnedFiles.length + ' heir-owned files from backup');
        if (relocations.length > 0) {
            console.log('  Then relocate ' + relocations.length + ' heir-added artifacts to local/');
        }
        process.exit(0);
    }

    // Step 1: Copy heir-owned files to temp holding area
    const holdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heir-owned-'));
    for (const rel of heirOwnedFiles) {
        const src = path.join(HEIR_ROOT, rel);
        if (!fs.existsSync(src)) continue;
        const dst = path.join(holdDir, rel);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
    }

    // Step 2: Rename .github/ to backup
    fs.renameSync(path.join(HEIR_ROOT, '.github'), backupDir);

    // Step 3: Copy fresh Edition .github/ from cloned tmp
    const editionGh = path.join(tmp, '.github');
    copyDirRecursive(editionGh, path.join(HEIR_ROOT, '.github'));

    // Step 4: Restore heir-owned files from holding area
    // For relocations, copy to the NEW path (local/), not the original
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
        if (relocationMap.has(rel)) {
            relocated++;
        }
        recovered++;
    }

    // Step 5: Update marker
    const now2 = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    marker.edition_version = newVersion;
    marker.last_sync_at = now2;
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');

    // Cleanup temp
    try { fs.rmSync(holdDir, { recursive: true, force: true }); } catch { }

    const registryResult2 = upsertHeir(marker, HEIR_ROOT);
    if (registryResult2.ok) console.log(`Refreshed fleet registry: ${registryResult2.path}`);

    console.log(`Major upgrade complete: ${currentVersion} -> ${newVersion}`);
    console.log(`Fresh brain installed. ${recovered} heir-owned files recovered. ${relocated} relocated to local/.`);
    console.log(`Backup at: ${path.basename(backupDir)}`);
    console.log('');
    console.log('Next steps:');
    console.log('  git status                    # review changes');
    console.log('  git add -A && git commit -m "Major upgrade to Edition ' + newVersion + '"');
    console.log('  # Test, then delete ' + path.basename(backupDir) + '/ when satisfied');
    process.exit(0);
}

// ── Helper: walk a directory recursively, return all file paths ──
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

// ── Helper: copy a directory recursively ──
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

function hash(file) {
    // Normalize CRLF -> LF so Windows/Unix checkouts compare equal.
    // Binary files rarely contain raw 0x0D 0x0A pairs, so the normalization
    // is safe for the file types Edition ships (markdown, JSON, JS, YAML).
    const buf = fs.readFileSync(file);
    const normalized = Buffer.from(buf.toString('binary').replace(/\r\n/g, '\n'), 'binary');
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

const editionFiles = new Set();
for (const pattern of policy.edition_owned) {
    for (const rel of expandGlob(tmp, pattern)) editionFiles.add(rel);
}

const heirOwnedSet = new Set();
for (const pattern of policy.heir_owned) {
    for (const rel of expandGlob(HEIR_ROOT, pattern)) heirOwnedSet.add(rel);
}

const changes = { add: [], update: [], same: [], skipped_heir_owned: [] };
for (const rel of editionFiles) {
    if (heirOwnedSet.has(rel)) {
        changes.skipped_heir_owned.push(rel);
        continue;
    }
    const editionFile = path.join(tmp, rel);
    const heirFile = path.join(HEIR_ROOT, rel);
    if (!fs.existsSync(heirFile)) {
        changes.add.push(rel);
    } else if (hash(editionFile) !== hash(heirFile)) {
        changes.update.push(rel);
    } else {
        changes.same.push(rel);
    }
}

console.log(`Files added:           ${changes.add.length}`);
console.log(`Files updated:         ${changes.update.length}`);
console.log(`Files unchanged:       ${changes.same.length}`);
console.log(`Heir-owned (skipped):  ${changes.skipped_heir_owned.length}`);
console.log('');

// ── Deprecated file cleanup + heir-artifact relocation ──
// Find files in heir's .github/ that are edition-owned paths but NOT in the
// new Edition. These are deprecated artifacts from a prior version.
// EXCEPTION: if a file looks like a heir-added artifact (skill/instruction/prompt/muscle
// that Edition doesn't ship), relocate it to local/ instead of deleting.
const heirEditionFiles = new Set();
for (const pattern of policy.edition_owned) {
    for (const rel of expandGlob(HEIR_ROOT, pattern)) heirEditionFiles.add(rel);
}

// Load Edition manifest to detect heir-added vs genuinely deprecated
const edManifestPath = path.join(tmp, '.github', 'config', 'edition-manifest.json');
let edSkillSet = new Set();
if (fs.existsSync(edManifestPath)) {
    const edManifest = JSON.parse(fs.readFileSync(edManifestPath, 'utf8'));
    (edManifest.skills || []).forEach(s => edSkillSet.add(s));
}

const deprecated = [];
const relocations = [];
for (const rel of heirEditionFiles) {
    if (heirOwnedSet.has(rel)) continue; // heir owns it, don't touch
    if (editionFiles.has(rel)) continue; // still in Edition, keep it

    // Check if this is a heir-added skill that should relocate to local/
    const skillMatch = rel.match(/^\.github\/skills\/([^/]+)\/(.+)$/);
    if (skillMatch && skillMatch[1] !== 'local' && !edSkillSet.has(skillMatch[1])) {
        const newRel = rel.replace('.github/skills/', '.github/skills/local/');
        relocations.push({ from: rel, to: newRel });
        continue;
    }
    // Check heir-added instructions
    const instrMatch = rel.match(/^\.github\/instructions\/(?!local\/)(.+)$/);
    if (instrMatch) {
        const instrFile = instrMatch[1];
        const edInstrDir = path.join(tmp, '.github', 'instructions');
        const edHasIt = fs.existsSync(path.join(edInstrDir, instrFile));
        if (!edHasIt) {
            // Not in Edition, but is it genuinely heir-added or just deprecated?
            // If it doesn't match any known v0.x instruction pattern, relocate it
            // For safety, deprecate it (the heir can recover from backup if needed)
        }
    }

    deprecated.push(rel);
}

if (relocations.length > 0) {
    console.log(`Heir-added artifacts to relocate to local/: ${relocations.length}`);
    relocations.forEach(r => console.log(`  ${r.from} -> ${r.to}`));
    console.log('');
}

if (deprecated.length > 0) {
    console.log(`Deprecated files (in heir but not in Edition): ${deprecated.length}`);
    deprecated.slice(0, 15).forEach(f => console.log(`  - ${f}`));
    if (deprecated.length > 15) console.log(`  ... and ${deprecated.length - 15} more`);
    console.log('');
}

if (changes.add.length || changes.update.length || deprecated.length) {
    console.log('Changes:');
    [...changes.add.map((f) => `  + ${f}`), ...changes.update.map((f) => `  ~ ${f}`), ...deprecated.map((f) => `  - ${f}`)]
        .slice(0, 30)
        .forEach((line) => console.log(line));
    const total = changes.add.length + changes.update.length + deprecated.length;
    if (total > 30) console.log(`  ... and ${total - 30} more`);
    console.log('');
}

if (!APPLY) {
    console.log('DRY-RUN complete. Re-run with --apply to write changes.');
    process.exit(0);
}

let written = 0;
for (const rel of [...changes.add, ...changes.update]) {
    const src = path.join(tmp, rel);
    const dst = path.join(HEIR_ROOT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    written += 1;
}

// Remove deprecated files
let removed = 0;
for (const rel of deprecated) {
    const target = path.join(HEIR_ROOT, rel);
    if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        removed++;
    }
}

// Relocate heir-added artifacts to local/
let relocated = 0;
const relocatedDirs = new Set();
for (const r of relocations) {
    const src = path.join(HEIR_ROOT, r.from);
    const dst = path.join(HEIR_ROOT, r.to);
    if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        fs.unlinkSync(src);
        // Track source directories for cleanup
        relocatedDirs.add(path.dirname(src));
        relocated++;
    }
}
// Clean up empty source directories from relocations
for (const dir of relocatedDirs) {
    try {
        if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
        }
    } catch { /* best-effort */ }
}

const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
marker.edition_version = newVersion;
marker.last_sync_at = now;
fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');

// Best-effort: refresh this heir's row in shared AI-Memory/heirs/registry.json.
const registryResult = upsertHeir(marker, HEIR_ROOT);
if (registryResult.ok) {
    console.log(`Refreshed fleet registry: ${registryResult.path}`);
}

console.log(`Wrote ${written} files. Removed ${removed} deprecated. Relocated ${relocated} to local/. Marker bumped to ${newVersion} @ ${now}.`);
console.log('');
console.log('Next steps:');
console.log('  git status                    # review changes');
console.log('  git diff .github/.act-heir.json');
console.log('  git add -A && git commit -m "Sync to Alex_ACT_Edition ' + newVersion + '"');
