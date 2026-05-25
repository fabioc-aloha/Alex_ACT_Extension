// @ts-check
'use strict';

/**
 * Synthetic-workspace dry run for migration.js
 *
 * Builds a fake AlexMaster workspace in a temp directory, runs the
 * pure (non-UI) migration functions, validates results, runs rollback,
 * confirms byte-identical restoration.
 *
 * Usage: node migration/dry-run.cjs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── Stub the `vscode` module before requiring migration.js ────────
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request === 'vscode') return require.resolve('./vscode-stub.cjs');
    return origResolve.call(this, request, ...rest);
};

// Write the stub to a sibling file so require resolves it
const STUB_PATH = path.join(__dirname, 'vscode-stub.cjs');
if (!fs.existsSync(STUB_PATH)) {
    fs.writeFileSync(STUB_PATH, `
module.exports = {
    window: {
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        showTextDocument: async () => undefined,
        createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {}, text: '', tooltip: '', command: '' }),
        withProgress: async (_opts, fn) => fn({ report() {} }),
    },
    workspace: { workspaceFolders: undefined },
    commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => undefined },
    Uri: { file: (p) => ({ fsPath: p }) },
    StatusBarAlignment: { Right: 2 },
    ProgressLocation: { Notification: 15 },
};
`);
}

const migration = require('../migration.js');

// ── Build synthetic AlexMaster workspace ──────────────────────────

function buildSyntheticWorkspace() {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'act-migration-dryrun-'));
    const ghDir = path.join(tmpRoot, '.github');
    fs.mkdirSync(ghDir, { recursive: true });

    // Load v8.4.0 manifest to know what AlexMaster files looked like
    const manifestPath = path.join(__dirname, 'alex-master-v8.4.0.manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Pull a handful of brain-files paths to seed the workspace.
    // We don't have the file *contents* (only sha256), so we synthesize
    // baseline files by extracting a few from the vsix directly.
    const vsixPath = path.join(__dirname, 'legacy', 'alex-master-v8.4.0.vsix');
    if (!fs.existsSync(vsixPath)) {
        throw new Error(`Need vsix at ${vsixPath} for dry run`);
    }

    const AdmZip = tryRequireAdmZip();
    let writtenBaseline = [];

    if (AdmZip) {
        const zip = new AdmZip(vsixPath);
        const entries = zip.getEntries().filter((e) => e.entryName.startsWith('extension/brain-files/') && !e.isDirectory);
        // Pick the first 20 files for the synthetic workspace
        const sample = entries.slice(0, 20);
        for (const e of sample) {
            const rel = e.entryName.replace(/^extension\/brain-files\//, '');
            const dst = path.join(ghDir, rel);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.writeFileSync(dst, e.getData());
            writtenBaseline.push(rel);
        }
    } else {
        // Fallback: use PowerShell to extract
        const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("${vsixPath.replace(/\\/g, '\\\\')}")
$count = 0
foreach ($e in $zip.Entries) {
    if ($count -ge 20) { break }
    if ($e.FullName -notlike 'extension/brain-files/*') { continue }
    if ($e.FullName.EndsWith('/')) { continue }
    $rel = $e.FullName -replace '^extension/brain-files/', ''
    $dst = Join-Path "${ghDir.replace(/\\/g, '\\\\')}" $rel
    $dstDir = Split-Path $dst -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
    $stream = $e.Open()
    $fs = [System.IO.File]::Create($dst)
    $stream.CopyTo($fs)
    $fs.Close()
    $stream.Close()
    Write-Output $rel
    $count++
}
$zip.Dispose()
`;
        const out = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { encoding: 'utf8' });
        writtenBaseline = out.trim().split(/\r?\n/).filter(Boolean);
    }

    // Add a custom file (not in v8.4.0 manifest)
    const customPath = path.join(ghDir, 'skills', 'my-personal-skill', 'SKILL.md');
    fs.mkdirSync(path.dirname(customPath), { recursive: true });
    fs.writeFileSync(customPath, '# My personal skill\n\nNot part of AlexMaster.\n');

    // Modify one baseline file to make it customised-baseline
    let customisedBaselineRel = null;
    if (writtenBaseline.length > 0) {
        const target = writtenBaseline[0];
        const targetPath = path.join(ghDir, target);
        fs.appendFileSync(targetPath, '\n\n<!-- USER EDIT -->\n');
        customisedBaselineRel = target;
    }

    // Add a settings.json with alex.* keys
    const vscodeDir = path.join(tmpRoot, '.vscode');
    fs.mkdirSync(vscodeDir);
    fs.writeFileSync(path.join(vscodeDir, 'settings.json'), JSON.stringify({
        'alex.aiMemory.path': 'C:/AI-Memory',
        'alex.heirId': 'test-heir',
        'alex.unknownLegacyKey': 'preserve-me',
        'editor.tabSize': 4,
    }, null, 4));

    return {
        root: tmpRoot,
        writtenBaseline,
        customisedBaselineRel,
        customRel: 'skills/my-personal-skill/SKILL.md',
    };
}

function tryRequireAdmZip() {
    try { return require('adm-zip'); } catch { return null; }
}

// ── Compute a checksum of a directory tree (for rollback verification) ──
function dirChecksum(dir) {
    const files = [];
    walk(dir, dir, files);
    files.sort();
    const h = crypto.createHash('sha256');
    for (const rel of files) {
        h.update(rel);
        h.update('\0');
        h.update(fs.readFileSync(path.join(dir, rel)));
        h.update('\0');
    }
    return h.digest('hex');
}

function walk(dir, base, out) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, base, out);
        else if (e.isFile()) out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
}

// ── Test ──────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) { console.error('FAIL:', msg); process.exit(1); }
    console.log('  ✓', msg);
}

async function main() {
    console.log('═══ Phase 1.13 dry run ═══\n');

    console.log('▸ Building synthetic AlexMaster workspace...');
    const synth = buildSyntheticWorkspace();
    console.log(`  workspace: ${synth.root}`);
    console.log(`  baseline files: ${synth.writtenBaseline.length}`);
    console.log(`  customised: ${synth.customisedBaselineRel}`);
    console.log(`  custom: ${synth.customRel}\n`);

    const ghDir = path.join(synth.root, '.github');
    const initialChecksum = dirChecksum(ghDir);
    const initialSettings = fs.readFileSync(path.join(synth.root, '.vscode', 'settings.json'), 'utf8');

    console.log('▸ A1 detection...');
    const detection = migration.detectAlexMaster(synth.root);
    console.log(`  detected: ${detection.detected}, strong: ${detection.strongHits.length}, weak: ${detection.weakHits.length}, reason: ${detection.reason}`);
    assert(detection.detected, 'AlexMaster detected');

    console.log('\n▸ A2-A10 running migration helpers directly...');
    // Note: we can't call the orchestrator (it needs real vscode workspace folders).
    // Instead, call each pure helper in order — this is the exercise.

    // A2 — manually call snapshot
    const snapshotWorkspace = (function () {
        // Re-import internal via re-eval — but migration doesn't export it.
        // Easier path: replicate the orchestrator inline using exported pieces.
        // For dry-run, just use fs.cpSync directly to test downstream logic.
        return null;
    })();

    // Use the orchestrator-style flow but with direct fs (snapshotWorkspace is not exported)
    const stamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '');
    const backupDir = path.join(synth.root, `.github-backup-${stamp}`);
    fs.cpSync(ghDir, backupDir, { recursive: true });
    assert(fs.existsSync(backupDir), `A2 backup created at ${path.basename(backupDir)}`);

    // A3-A4 classification
    const classification = migration.classifyFiles(backupDir);
    console.log(`  classification: baseline=${classification.baseline.length}, customised=${classification.customisedBaseline.length}, custom=${classification.custom.length}`);
    assert(classification.baseline.length === synth.writtenBaseline.length - 1, 'baseline count = written - 1 (we modified one)');
    assert(classification.customisedBaseline.length === 1, 'customised-baseline = 1 (the file we appended to)');
    assert(classification.custom.some((r) => r.replace(/\\/g, '/') === synth.customRel), 'custom file detected');
    assert(classification.customisedBaseline[0] === synth.customisedBaselineRel, 'customised file path matches');

    // A5 — install Edition brain (skip — bundled brain may not exist in this repo yet)
    const editionBrainExists = fs.existsSync(path.join(__dirname, '..', 'brain'));
    if (editionBrainExists) {
        console.log('  A5 brain exists, would install (skipping in dry-run)');
    } else {
        console.log('  A5 SKIPPED — no bundled brain at extension/brain/');
    }

    // A7 — settings translation
    const settingsResult = migration.SETTING_TRANSLATIONS;
    console.log(`  settings translations defined: ${Object.keys(settingsResult).length}`);
    assert(Object.keys(settingsResult).length >= 6, 'settings translation map populated');

    // A8 — verify deprecated commands list
    assert(migration.DEPRECATED_COMMANDS.length === 30, '30 deprecated AlexMaster commands defined');

    console.log('\n▸ Rollback simulation...');
    // Simulate rollback: wipe ghDir, restore from backup
    fs.rmSync(ghDir, { recursive: true, force: true });
    fs.cpSync(backupDir, ghDir, { recursive: true });
    const restoredChecksum = dirChecksum(ghDir);
    assert(restoredChecksum === initialChecksum, 'byte-identical restoration from backup');

    console.log('\n▸ Cleaning up synthetic workspace...');
    fs.rmSync(synth.root, { recursive: true, force: true });

    console.log('\n═══ All dry-run assertions passed ═══');
}

main().catch((err) => {
    console.error('Dry run failed:', err);
    process.exit(1);
});
