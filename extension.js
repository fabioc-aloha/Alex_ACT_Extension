// @ts-check
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { listFilesRecursive } = require('./lib/fs-utils');

// ── Paths ───────────────────────────────────────────────────────────────
const BRAIN_DIR = path.join(__dirname, 'brain');

// ── Bundled brain introspection ──────────────────────────────────────────
function getBundledEditionVersion() {
    try {
        const v = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
        if (!v || v === 'unknown') {
            console.warn('ACT: brain/VERSION is missing or empty — bundled brain may be incomplete.');
            return 'unknown';
        }
        return v;
    } catch (e) {
        console.warn('ACT: brain/VERSION unreadable:', e && e.message ? e.message : e);
        return 'unknown';
    }
}

/**
 * Count edition-shipped artifacts in the bundled brain. Returns an object with
 * counts that are read at call time, never hardcoded in user-facing strings.
 * Errors collapse to 0 silently — a bad count in a friendly prompt is less
 * harmful than a thrown exception during bootstrap.
 */
function getBundledCounts() {
    const count = (subdir, suffix) => {
        const dir = path.join(BRAIN_DIR, subdir);
        if (!fs.existsSync(dir)) return 0;
        try {
            return fs.readdirSync(dir).filter(n => n.endsWith(suffix)).length;
        } catch { return 0; }
    };
    const countSkills = () => {
        const dir = path.join(BRAIN_DIR, 'skills');
        if (!fs.existsSync(dir)) return 0;
        try {
            return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).length;
        } catch { return 0; }
    };
    return {
        instructions: count('instructions', '.instructions.md'),
        skills: countSkills(),
        prompts: count('prompts', '.prompt.md'),
        agents: count('agents', '.agent.md'),
    };
}

// Defensive marker reader. Returns null if the file is missing or malformed.
function readMarkerSafe(markerPath) {
    try {
        if (!fs.existsSync(markerPath)) return null;
        return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    } catch { return null; }
}

function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
}

function getGitHubDir(root) {
    return path.join(root, '.github');
}

function getMarkerPath(root) {
    return path.join(root, '.github', '.act-heir.json');
}

// ── Edition manifest (authoritative bill-of-materials) ─────────────
// The manifest at brain/config/edition-manifest.json declares which files
// are heir-owned "bootstrap_templates" (copy on first install, never
// overwrite on upgrade). Anything not in that list is edition-owned and
// overwritten on upgrade. Returns null if the manifest is missing/invalid.
function loadEditionManifest() {
    const p = path.join(BRAIN_DIR, 'config', 'edition-manifest.json');
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function getBootstrapTemplateSet(manifest) {
    const s = new Set();
    if (manifest && Array.isArray(manifest.bootstrap_templates)) {
        for (const t of manifest.bootstrap_templates) {
            s.add(String(t).replace(/\\/g, '/'));
        }
    }
    return s;
}

// Map a brain-relative path (e.g. `instructions/foo.md` or `.vscode/settings.json`)
// to its workspace-relative key and absolute destination. Files under `.vscode/`
// land at the workspace root; everything else lands under `.github/`.
function resolveBrainDest(rel, workspaceRoot, ghDir) {
    const norm = rel.replace(/\\/g, '/');
    if (norm === '.vscode' || norm.startsWith('.vscode/')) {
        return { wsRel: norm, dst: path.join(workspaceRoot, norm) };
    }
    return { wsRel: '.github/' + norm, dst: path.join(ghDir, norm) };
}

// ── File operations ────────────────────────────────────────────────

function copyFileSync(src, dst) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
}

/**
 * Merge the heir workspace-settings baseline into the heir's
 * `.vscode/settings.json`. Mirrors the invocation pattern used by
 * `brain/scripts/bootstrap-heir.cjs` and `brain/scripts/upgrade-self.cjs`
 * (Edition v2.6.0+); needed here because the Extension's cmdBootstrap and
 * cmdUpgrade are independent JS implementations that do not invoke the
 * Edition shell scripts. Returns `{ ok, changes, error }` where `changes`
 * is the count of upserted keys (0 = no-op). Best-effort: any failure is
 * reported but does not abort the surrounding command.
 *
 * @param {string} root - heir workspace root
 * @returns {{ ok: boolean, changes: number, error?: string }}
 */
function mergeHeirWorkspaceSettings(root) {
    try {
        const baselinePath = path.join(BRAIN_DIR, 'config', 'heir-workspace-settings-baseline.json');
        if (!fs.existsSync(baselinePath)) return { ok: true, changes: 0 };
        const mergerPath = path.join(BRAIN_DIR, 'scripts', 'shared', 'workspace-settings-merger.cjs');
        if (!fs.existsSync(mergerPath)) return { ok: true, changes: 0 };
        const { mergeWorkspaceSettings, writeMerged } = require(mergerPath);
        const result = mergeWorkspaceSettings(root, baselinePath);
        if (!result.ok) return { ok: false, changes: 0, error: result.error };
        if (result.changes.length === 0) return { ok: true, changes: 0 };
        writeMerged(result);
        return { ok: true, changes: result.changes.length };
    } catch (e) {
        return { ok: false, changes: 0, error: e && e.message ? e.message : String(e) };
    }
}

// ── Shared Memory Bus ──────────────────────────────────────────────
// Resolution delegated to brain/scripts/_registry.cjs (resolveMemoryBus).
// Extension only needs to invoke it during bootstrap.

// ── Commands ───────────────────────────────────────────────────────

/**
 * Bootstrap: copy brain into workspace .github/
 */
async function cmdBootstrap() {
    const root = getWorkspaceRoot();
    if (!root) {
        vscode.window.showErrorMessage('ACT: Open a workspace folder first.');
        return;
    }

    const markerPath = getMarkerPath(root);
    if (fs.existsSync(markerPath)) {
        const marker = readMarkerSafe(markerPath);
        if (!marker) {
            vscode.window.showErrorMessage(
                `ACT: heir marker at ${path.relative(root, markerPath)} is corrupted. Restore from .github-backup-* or re-bootstrap after removing it.`
            );
            return;
        }
        vscode.window.showWarningMessage(
            `This workspace is already an ACT heir (${marker.heir_id}, v${marker.edition_version}). Use "ACT: Upgrade Brain" instead.`
        );
        return;
    }

    // Derive heir-id from folder name
    const folderName = path.basename(root).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const heirId = await vscode.window.showInputBox({
        prompt: 'Heir ID (lowercase, alphanumeric + hyphens)',
        value: folderName,
        validateInput: v => /^[a-z0-9][a-z0-9-]{1,63}$/.test(v) ? null : 'Must be 2-64 chars, lowercase alphanumeric + hyphens',
    });
    if (!heirId) return;

    const heirName = await vscode.window.showInputBox({
        prompt: 'Display name (human-readable)',
        value: path.basename(root),
    });
    if (!heirName) return;

    const confirm = await vscode.window.showWarningMessage(
        `Bootstrap ACT Edition v${getBundledEditionVersion()} into this workspace?\n\n` +
        `This will create .github/ with ${(() => { const c = getBundledCounts(); return `${c.instructions} instructions, ${c.skills} skills, ${c.prompts} prompts, and ${c.agents} agents`; })()}.`,
        { modal: true },
        'Bootstrap'
    );
    if (confirm !== 'Bootstrap') return;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'ACT: Bootstrapping brain...',
        cancellable: false,
    }, async (progress) => {
        const ghDir = getGitHubDir(root);
        const manifest = loadEditionManifest();
        const bootstrapTemplates = getBootstrapTemplateSet(manifest);

        // 1. Copy edition-owned brain files
        progress.report({ message: 'Copying brain files...' });
        const brainFiles = listFilesRecursive(BRAIN_DIR);
        let copied = 0;
        const copyFailures = [];
        for (const rel of brainFiles) {
            const { wsRel, dst } = resolveBrainDest(rel, root, ghDir);
            const isTemplate = bootstrapTemplates.has(wsRel);
            try {
                if (isTemplate) {
                    // Heir-owned template: only copy if absent
                    if (!fs.existsSync(dst)) {
                        copyFileSync(path.join(BRAIN_DIR, rel), dst);
                        copied++;
                    }
                } else {
                    copyFileSync(path.join(BRAIN_DIR, rel), dst);
                    copied++;
                }
            } catch (err) {
                copyFailures.push({ rel: wsRel, err: err && err.message ? err.message : String(err) });
            }
        }
        if (copyFailures.length > 0) {
            const sample = copyFailures.slice(0, 5).map(f => `${f.rel}: ${f.err}`).join('\n');
            const more = copyFailures.length > 5 ? `\n... and ${copyFailures.length - 5} more` : '';
            vscode.window.showWarningMessage(
                `ACT bootstrap: ${copyFailures.length} file(s) failed to copy. Workspace may be in a partial state — consider removing .github/ and retrying.\n\n${sample}${more}`
            );
        }

        // 1b. Seed .github/ bootstrap templates from staged templates/ dir.
        // These (e.g. cognitive-config.json) are intentionally absent from
        // brain/ per the audit contract, so they don't appear in brainFiles
        // above. We copy them once on first install; upgrades never touch them.
        const templatesDir = path.join(__dirname, 'templates');
        const templateSeedFailures = [];
        for (const tpl of (manifest && Array.isArray(manifest.bootstrap_templates) ? manifest.bootstrap_templates : [])) {
            const norm = String(tpl).replace(/\\/g, '/');
            if (!norm.startsWith('.github/')) continue;
            const dst = path.join(root, norm);
            if (fs.existsSync(dst)) continue;
            const src = path.join(templatesDir, path.basename(norm));
            if (!fs.existsSync(src)) continue;
            try {
                fs.mkdirSync(path.dirname(dst), { recursive: true });
                fs.copyFileSync(src, dst);
                copied++;
            } catch (err) {
                templateSeedFailures.push({ rel: norm, err: err && err.message ? err.message : String(err) });
            }
        }
        if (templateSeedFailures.length > 0) {
            const sample = templateSeedFailures.map(f => `${f.rel}: ${f.err}`).join('\n');
            vscode.window.showWarningMessage(
                `ACT bootstrap: ${templateSeedFailures.length} bootstrap template(s) failed to seed.\n\n${sample}`
            );
        }

        // 2. Render marker
        progress.report({ message: 'Creating heir marker...' });
        const versionFile = path.join(ghDir, 'VERSION');
        const editionVersion = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : '1.0.0';
        const marker = {
            spec_version: '1.0',
            edition: 'Alex',
            edition_version: editionVersion,
            heir_id: heirId,
            heir_name: heirName,
            repo_url: '',
            deployed_at: new Date().toISOString(),
            last_sync_at: new Date().toISOString(),
            contact: { owner: '' },
            opt_in: { fleet_inventory: true, auto_upgrade: false },
        };
        // Try to get repo URL
        try {
            const { execSync } = require('child_process');
            marker.repo_url = execSync('git remote get-url origin', { cwd: root, encoding: 'utf8' }).trim();
            const match = marker.repo_url.match(/github\.com[:/]([^/]+)/);
            if (match) marker.contact.owner = match[1];
        } catch { /* no git remote */ }

        fs.mkdirSync(path.dirname(markerPath), { recursive: true });
        fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');

        // 2b. Merge heir workspace-settings baseline into .vscode/settings.json.
        // HEIR_OWNED file, per-key merge. Without this, .github/skills/local/<name>/SKILL.md
        // and the matching prompts/agents local/ folders are invisible to chat.
        // Mirrors brain/scripts/bootstrap-heir.cjs (Edition v2.6.0+).
        const wsMerge = mergeHeirWorkspaceSettings(root);
        if (!wsMerge.ok) {
            vscode.window.showWarningMessage(`ACT bootstrap: workspace-settings merge skipped (${wsMerge.error}). Run "ACT: Upgrade Brain" to retry.`);
        }

        // 3. Render copilot-instructions.local.md if absent
        const localCI = path.join(ghDir, 'copilot-instructions.local.md');
        if (!fs.existsSync(localCI)) {
            fs.writeFileSync(localCI, [
                '# Identity (heir-owned)',
                '',
                '<!-- This file is heir-owned. Edition upgrades never overwrite it. -->',
                '',
                '## Project Context',
                '',
                '<!-- One-paragraph summary: what this repo does, who uses it, and why. -->',
                '',
                '## My Preferences',
                '',
                '<!-- Communication style, naming conventions, test framework choices, etc. -->',
                '',
            ].join('\n'));
        }

        // 4. Shared memory bus resolution (git-based)
        progress.report({ message: 'Resolving shared memory bus...' });
        try {
            const registry = require(path.join(BRAIN_DIR, 'scripts', '_registry.cjs'));
            const memResult = registry.resolveMemoryBus(root);
            if (memResult && memResult.message) {
                vscode.window.showInformationMessage(`ACT: ${memResult.message}`);
            }
        } catch { /* best-effort; memory bus is optional */ }

        // Run heir-doctor and surface exit code; non-fatal if it fails.
        // 30s timeout so a wedged subprocess can't hang the bootstrap UI indefinitely.
        const doctorOk = await runHeirDoctor(root);

        const doctorLine = doctorOk === null
            ? ''
            : doctorOk ? ' ✓ heir-doctor passed.' : ' ⚠ heir-doctor reported issues (run /status for details).';

        const ACT_WELCOME = 'Run /welcome (orientation)';
        const ACT_CONFIG = 'Run /configure-vscode';
        const ACT_README = 'Open README';
        const choice = await vscode.window.showInformationMessage(
            `ACT Edition v${editionVersion} bootstrapped. ${copied} files written.${doctorLine}\n\n` +
            `Next: open .github/copilot-instructions.local.md and fill in ## Project Context, then start a Copilot Chat and run /welcome.`,
            ACT_WELCOME, ACT_CONFIG, ACT_README
        );
        if (choice === ACT_WELCOME) {
            await vscode.commands.executeCommand('workbench.action.chat.open', { query: '/welcome' });
        } else if (choice === ACT_CONFIG) {
            await vscode.commands.executeCommand('workbench.action.chat.open', { query: '/configure-vscode' });
        } else if (choice === ACT_README) {
            const readme = path.join(root, 'README.md');
            if (fs.existsSync(readme)) {
                await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(readme));
            } else {
                vscode.window.showWarningMessage('No README.md in this workspace.');
            }
        }
    });
}

/**
 * Upgrade: overwrite edition-owned files from bundled brain
 */
async function cmdUpgrade() {
    const root = getWorkspaceRoot();
    if (!root) { vscode.window.showErrorMessage('ACT: Open a workspace folder first.'); return; }

    const markerPath = getMarkerPath(root);
    if (!fs.existsSync(markerPath)) {
        vscode.window.showWarningMessage('Not an ACT heir. Run "ACT: Bootstrap This Workspace" first.');
        return;
    }

    const marker = readMarkerSafe(markerPath);
    if (!marker) {
        vscode.window.showErrorMessage(
            `ACT: heir marker at ${path.relative(root, markerPath)} is corrupted. Restore from .github-backup-* or re-bootstrap after removing it.`
        );
        return;
    }
    const bundledVersion = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
    const currentVersion = marker.edition_version || '0.0.0';

    if (bundledVersion === currentVersion) {
        vscode.window.showInformationMessage(`Already on Edition v${currentVersion}. No upgrade needed.`);
        return;
    }

    // Major version check
    const bundledMajor = parseInt(bundledVersion.split('.')[0], 10);
    const currentMajor = parseInt(currentVersion.split('.')[0], 10);
    if (bundledMajor > currentMajor) {
        const proceed = await vscode.window.showWarningMessage(
            `This is a MAJOR upgrade (v${currentVersion} to v${bundledVersion}). Your local/ content is preserved, but edition-owned files will be replaced.`,
            { modal: true },
            'Upgrade'
        );
        if (proceed !== 'Upgrade') return;
    }

    const manifest = loadEditionManifest();
    const bootstrapTemplates = getBootstrapTemplateSet(manifest);
    const ghDir = getGitHubDir(root);

    // Migrate legacy misplacement: prior Extension versions (<= 8.12.0) copied
    // brain/.vscode/* into .github/.vscode/ instead of the workspace .vscode/.
    // Move any survivors back to the right place before the regular sync runs.
    let migrated = 0;
    const legacyVscodeDir = path.join(ghDir, '.vscode');
    if (fs.existsSync(legacyVscodeDir)) {
        try {
            for (const name of fs.readdirSync(legacyVscodeDir)) {
                const legacy = path.join(legacyVscodeDir, name);
                const target = path.join(root, '.vscode', name);
                try {
                    if (!fs.existsSync(target)) {
                        fs.mkdirSync(path.dirname(target), { recursive: true });
                        fs.copyFileSync(legacy, target);
                        migrated++;
                    }
                    fs.unlinkSync(legacy);
                } catch { /* best-effort per file */ }
            }
            // Remove the legacy dir if it ended up empty
            try {
                if (fs.readdirSync(legacyVscodeDir).length === 0) {
                    fs.rmdirSync(legacyVscodeDir);
                }
            } catch { /* leave it alone if not empty */ }
        } catch { /* best-effort */ }
    }

    const brainFiles = listFilesRecursive(BRAIN_DIR);

    let updated = 0, skipped = 0;
    for (const rel of brainFiles) {
        const { wsRel, dst } = resolveBrainDest(rel, root, ghDir);
        if (bootstrapTemplates.has(wsRel)) { skipped++; continue; }

        const src = path.join(BRAIN_DIR, rel);
        // Only write if content changed (SHA-256 for consistency with migration.js)
        if (fs.existsSync(dst)) {
            const srcHash = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
            const dstHash = crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex');
            if (srcHash === dstHash) continue;
        }
        copyFileSync(src, dst);
        updated++;
    }

    // Update marker
    marker.edition_version = bundledVersion;
    marker.last_sync_at = new Date().toISOString();
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');

    // Step 5b: Merge heir workspace-settings baseline into .vscode/settings.json.
    // HEIR_OWNED file, per-key merge. Idempotent — no-op when already current.
    // Mirrors brain/scripts/upgrade-self.cjs Step 5b (Edition v2.6.0+). Without this,
    // heirs upgrading via "ACT: Upgrade Brain" do not receive the chat.*FilesLocations
    // keys needed to discover .github/skills/local/<name>/SKILL.md and equivalents.
    const wsMerge = mergeHeirWorkspaceSettings(root);
    const mergeLine = wsMerge.ok
        ? (wsMerge.changes > 0 ? ` ${wsMerge.changes} workspace-settings key(s) merged.` : '')
        : ` ⚠ workspace-settings merge skipped (${wsMerge.error}).`;

    // Validate the upgraded brain before declaring success.
    const doctorOk = await runHeirDoctor(root);
    const doctorLine = doctorOk === null
        ? ''
        : doctorOk ? ' ✓ heir-doctor passed.' : ' ⚠ heir-doctor reported issues (run /status for details).';

    const migratedLine = migrated > 0 ? ` ${migrated} legacy .vscode file(s) relocated.` : '';
    vscode.window.showInformationMessage(
        `Upgraded to Edition v${bundledVersion}. ${updated} files updated, ${skipped} heir-owned skipped.${migratedLine}${mergeLine}${doctorLine}`
    );
}

/**
 * Status-bar menu: QuickPick of common ACT actions, opened from the
 * `$(brain) ACT vX.Y.Z` status-bar item. Each pick routes to an existing
 * command — this is a discovery surface, not new logic.
 */
async function cmdStatusBarMenu() {
    const root = getWorkspaceRoot();
    const isHeir = root && fs.existsSync(getMarkerPath(root));

    let upgradeAvailable = false;
    let editionVersion = '';
    let bundledVersion = '';
    if (isHeir) {
        const marker = readMarkerSafe(getMarkerPath(root));
        if (marker) {
            try {
                editionVersion = marker.edition_version;
                bundledVersion = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
                upgradeAvailable = bundledVersion && editionVersion && bundledVersion !== editionVersion;
            } catch { /* fall through */ }
        }
    }

    const items = [];

    if (isHeir) {
        items.push({
            label: '$(info) Show Status',
            description: `Edition v${editionVersion}${upgradeAvailable ? ` → v${bundledVersion} available` : ''}`,
            action: 'status',
        });
        if (upgradeAvailable) {
            items.push({
                label: '$(arrow-up) Upgrade Brain',
                description: `Pull v${bundledVersion} into this workspace`,
                action: 'upgrade',
            });
        }
        items.push(
            { label: '$(comment-discussion) Run /welcome', description: 'Orientation tour for this brain', action: 'welcome' },
            { label: '$(settings-gear) Run /configure-vscode', description: 'Apply recommended VS Code settings', action: 'configure' },
            { label: '$(book) Open Brain README', description: '.github/copilot-instructions.local.md', action: 'localReadme' },
        );
    } else {
        items.push({
            label: '$(rocket) Bootstrap This Workspace',
            description: 'Install the ACT brain into this folder',
            action: 'bootstrap',
        });
    }

    items.push(
        { label: '$(milestone) Open Welcome Walkthrough', description: 'Extension getting-started guide', action: 'walkthrough' },
        { label: '$(book) Open Extension README', description: 'About Alex — ACT Edition', action: 'extReadme' },
    );

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: isHeir
            ? `Alex ACT v${editionVersion} • pick an action`
            : 'Alex ACT — not a heir yet • pick an action',
        matchOnDescription: true,
    });
    if (!pick) return;

    switch (pick.action) {
        case 'status': return cmdStatus();
        case 'upgrade': return cmdUpgrade();
        case 'bootstrap': return cmdBootstrap();
        case 'welcome':
            return vscode.commands.executeCommand('workbench.action.chat.open', { query: '/welcome' });
        case 'configure':
            return vscode.commands.executeCommand('workbench.action.chat.open', { query: '/configure-vscode' });
        case 'walkthrough':
            return vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'fabioc-aloha.alex-cognitive-architecture#alex-getting-started',
                false
            );
        case 'localReadme': {
            const local = root ? path.join(root, '.github', 'copilot-instructions.local.md') : null;
            if (local && fs.existsSync(local)) {
                return vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(local));
            }
            vscode.window.showWarningMessage('No .github/copilot-instructions.local.md in this workspace.');
            return;
        }
        case 'extReadme': {
            const readme = path.join(__dirname, 'README.md');
            return vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(readme));
        }
    }
}

/**
 * Status: show brain version, heir info, memory bus health
 */
async function cmdStatus() {
    const root = getWorkspaceRoot();
    if (!root) { vscode.window.showErrorMessage('ACT: Open a workspace folder first.'); return; }

    const markerPath = getMarkerPath(root);
    if (!fs.existsSync(markerPath)) {
        vscode.window.showInformationMessage('Not an ACT heir. Run "ACT: Bootstrap This Workspace" to set up.');
        return;
    }

    const marker = readMarkerSafe(markerPath);
    if (!marker) {
        vscode.window.showErrorMessage(
            `ACT: heir marker at ${path.relative(root, markerPath)} is corrupted. Restore from .github-backup-* or re-bootstrap after removing it.`
        );
        return;
    }
    const bundledVersion = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
    const ghDir = getGitHubDir(root);
    const instrCount = fs.existsSync(path.join(ghDir, 'instructions'))
        ? fs.readdirSync(path.join(ghDir, 'instructions')).filter(f => f.endsWith('.instructions.md')).length : 0;
    const skillCount = fs.existsSync(path.join(ghDir, 'skills'))
        ? fs.readdirSync(path.join(ghDir, 'skills')).filter(f => { try { return fs.statSync(path.join(ghDir, 'skills', f)).isDirectory() && f !== 'local'; } catch { return false; } }).length : 0;
    const localCount = fs.existsSync(path.join(ghDir, 'skills', 'local'))
        ? fs.readdirSync(path.join(ghDir, 'skills', 'local')).filter(f => { try { return fs.statSync(path.join(ghDir, 'skills', 'local', f)).isDirectory(); } catch { return false; } }).length : 0;

    const upgradeAvailable = bundledVersion !== marker.edition_version;
    const lines = [
        `Heir: ${marker.heir_name} (${marker.heir_id})`,
        `Edition: v${marker.edition_version}${upgradeAvailable ? ` (v${bundledVersion} available)` : ' (latest)'}`,
        `Skills: ${skillCount} edition + ${localCount} local`,
        `Instructions: ${instrCount}`,
        `Last sync: ${marker.last_sync_at ? marker.last_sync_at.substring(0, 10) : 'never'}`,
    ];

    if (upgradeAvailable) {
        const pick = await vscode.window.showInformationMessage(
            lines.join('\n'),
            'Upgrade Now'
        );
        if (pick === 'Upgrade Now') await cmdUpgrade();
    } else {
        vscode.window.showInformationMessage(lines.join('\n'));
    }
}

// ── Converter Commands ─────────────────────────────────────────────
//
// Each converter ships as a skill: brain/skills/<id>/scripts/<id>.cjs
// (Edition v2.4.0 collapsed the former .github/muscles/ tree into
// per-skill scripts/ folders. The runConverter resolver below honors
// both the bundled brain layout and the workspace `.github/skills/`
// layout written by bootstrap.)

const CONVERTERS = {
    'md-to-word': { skill: 'md-to-word', script: 'md-to-word.cjs', ext: '.docx', label: 'Word' },
    'md-to-html': { skill: 'md-to-html', script: 'md-to-html.cjs', ext: '.html', label: 'HTML' },
    'md-to-eml':  { skill: 'md-to-eml',  script: 'md-to-eml.cjs',  ext: '.eml',  label: 'Email' },
    'md-to-txt':  { skill: 'md-to-txt',  script: 'md-to-txt.cjs',  ext: '.txt',  label: 'Plain Text' },
    'docx-to-md': { skill: 'docx-to-md', script: 'docx-to-md.cjs', ext: '.md',   label: 'Markdown' },
    'html-to-md': { skill: 'html-to-md', script: 'html-to-md.cjs', ext: '.md',   label: 'Markdown' },
};

// Resolve converter script path. Prefer workspace-installed brain so
// heir-local edits to converters take precedence over the bundled copy.
function resolveConverterScript(converter, root) {
    const rel = path.join('skills', converter.skill, 'scripts', converter.script);
    const candidates = [];
    if (root) candidates.push(path.join(root, '.github', rel));
    candidates.push(path.join(BRAIN_DIR, rel));
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

async function runConverter(converterId, fileUri) {
    const converter = CONVERTERS[converterId];
    if (!converter) { vscode.window.showErrorMessage(`Unknown converter: ${converterId}`); return; }

    // Resolve input file
    let inputPath;
    if (fileUri && fileUri.fsPath) {
        inputPath = fileUri.fsPath;
    } else {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            inputPath = editor.document.uri.fsPath;
        } else {
            vscode.window.showErrorMessage('ACT Convert: No file selected.');
            return;
        }
    }

    // Find the converter script (workspace .github/skills/ first, then bundled brain)
    const root = getWorkspaceRoot();
    const scriptPath = resolveConverterScript(converter, root);
    if (!scriptPath) {
        vscode.window.showErrorMessage(
            `ACT Convert: ${converter.skill} script not found in workspace or bundled brain.`
        );
        return;
    }

    // Compute output path
    const inputDir = path.dirname(inputPath);
    const inputBase = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(inputDir, inputBase + converter.ext);

    // Run the converter via spawn() with array args so paths containing spaces,
    // quotes, or shell metacharacters can't be reinterpreted. Stream output into
    // a dedicated OutputChannel so the user sees progress without a shell window.
    const channel = getConverterOutputChannel();
    channel.show(true);
    channel.appendLine(`> ${path.basename(scriptPath)} "${inputPath}" --out "${outputPath}"`);
    vscode.window.showInformationMessage(`ACT: Converting to ${converter.label}...`);

    const child = spawn(process.execPath, [scriptPath, inputPath, '--out', outputPath], {
        cwd: inputDir,
        windowsHide: true,
    });
    child.stdout.on('data', d => channel.append(d.toString()));
    child.stderr.on('data', d => channel.append(d.toString()));
    child.on('error', err => {
        const hint = err.code === 'ENOENT'
            ? ` Node.js executable not found at "${process.execPath}". Reinstall VS Code or check your PATH.`
            : '';
        channel.appendLine(`\n[ACT Convert] spawn error: ${err.message}${hint}`);
        vscode.window.showErrorMessage(`ACT Convert (${converter.label}) failed to start: ${err.message}${hint}`);
    });
    child.on('close', code => {
        channel.appendLine(`\n[ACT Convert] ${converter.label} exited with code ${code}`);
        if (code === 0) {
            vscode.window.showInformationMessage(`ACT: Wrote ${path.basename(outputPath)}`);
        } else {
            vscode.window.showErrorMessage(`ACT Convert (${converter.label}) exited with code ${code}. See "ACT Convert" output channel.`);
        }
    });
}

// Single OutputChannel for all converters; created lazily on first use.
let _converterChannel = null;
function getConverterOutputChannel() {
    if (!_converterChannel) {
        _converterChannel = vscode.window.createOutputChannel('ACT Convert');
    }
    return _converterChannel;
}

// ── heir-doctor runner ────────────────────────────────────────────
//
// Resolves the heir-doctor script from the workspace's installed brain
// (Edition v2.4.0 layout: skills/greeting-checkin/scripts/heir-doctor.cjs)
// or falls back to the bundled brain. Returns true / false / null where
// null means "no doctor found, nothing was run".
async function runHeirDoctor(root) {
    if (!root) return null;
    const rel = path.join('skills', 'greeting-checkin', 'scripts', 'heir-doctor.cjs');
    const candidates = [
        path.join(getGitHubDir(root), rel),
        path.join(BRAIN_DIR, rel),
    ];
    const doctorPath = candidates.find(p => fs.existsSync(p));
    if (!doctorPath) return null;
    try {
        return await new Promise((resolve) => {
            const child = spawn(process.execPath, [doctorPath], { cwd: root, windowsHide: true });
            let settled = false;
            const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
            const timer = setTimeout(() => { try { child.kill(); } catch { /* */ } finish(false); }, 30000);
            // Drain pipes so the child doesn't block on a full stdout buffer.
            child.stdout.on('data', () => {});
            child.stderr.on('data', () => {});
            child.on('close', code => finish(code === 0));
            child.on('error', () => finish(false));
        });
    } catch { return false; }
}

// ── Migration (AlexMaster v8.4.0 → ACT Edition) ────────────
// Defensive load: if migration.js is missing or broken, core commands must still work.
let migration;
try {
    migration = require('./migration');
} catch (e) {
    console.error('ACT: migration module failed to load:', e && e.message ? e.message : e);
    migration = null;
}

let _activationChannel = null;
function getActivationOutputChannel() {
    if (!_activationChannel) {
        _activationChannel = vscode.window.createOutputChannel('ACT Extension');
    }
    return _activationChannel;
}

function logActivationError(channel, phase, err) {
    const message = err && err.message ? err.message : String(err);
    const stack = err && err.stack ? err.stack : '(no stack)';
    channel.appendLine(`[${phase}] ${message}`);
    channel.appendLine(stack);
}

function registerCriticalCommands(context, channel) {
    let registered = 0;
    const register = (id, handler) => {
        try {
            context.subscriptions.push(vscode.commands.registerCommand(id, handler));
            registered++;
        } catch (err) {
            logActivationError(channel, `register:${id}`, err);
        }
    };

    register('alex-act.bootstrap', cmdBootstrap);
    register('alex-act.upgrade', cmdUpgrade);
    register('alex-act.status', cmdStatus);
    register('alex-act.statusBarMenu', cmdStatusBarMenu);
    register('alex-act.openWalkthrough', () => {
        vscode.commands.executeCommand(
            'workbench.action.openWalkthrough',
            'fabioc-aloha.alex-cognitive-architecture#alex-getting-started',
            false
        );
    });

    return registered;
}

// ── Activation ─────────────────────────────────────────────────────

function activate(context) {
    const channel = getActivationOutputChannel();
    channel.appendLine('[activate] Starting activation.');

    let criticalReady = false;
    try {
        const criticalCount = registerCriticalCommands(context, channel);
        criticalReady = criticalCount > 0;

        context.subscriptions.push(
            vscode.commands.registerCommand('alex-act.migrate-from-alex-master', (...args) => {
                if (!migration) { vscode.window.showErrorMessage('ACT: Migration module unavailable.'); return; }
                return migration.migrateFromAlexMaster(...args);
            }),
            vscode.commands.registerCommand('alex-act.rollback-migration', (...args) => {
                if (!migration) { vscode.window.showErrorMessage('ACT: Migration module unavailable.'); return; }
                return migration.rollbackMigration(...args);
            }),
            vscode.commands.registerCommand('alex-act.clean-migration-backup', (...args) => {
                if (!migration) { vscode.window.showErrorMessage('ACT: Migration module unavailable.'); return; }
                return migration.cleanMigrationBackup(...args);
            }),
        );

        // Register converter commands
        for (const [id, _] of Object.entries(CONVERTERS)) {
            context.subscriptions.push(
                vscode.commands.registerCommand(`alex-act.convert.${id}`, (fileUri) => runConverter(id, fileUri))
            );
        }

        // Register no-op stubs for AlexMaster's 30 deprecated commands
        if (migration) migration.registerDeprecatedStubs(context);

        // Fire AlexMaster detection modal (respects "remind later" / "don't ask again")
        if (migration) migration.checkActivationTrigger(context).catch(() => { /* silent */ });

        // Auto-open the Welcome walkthrough on first install or after version bump.
        // Non-devs won't know to run a command, so surface it on startup, once per version.
        try {
            const pkg = require('./package.json');
            const currentVersion = pkg.version;
            const SHOWN_KEY = 'alex-act.walkthroughShownVersion';
            const shownVersion = context.globalState.get(SHOWN_KEY);
            if (shownVersion !== currentVersion) {
                // Defer until VS Code finishes restoring editors.
                // Use onDidChangeActiveTextEditor as a readiness signal with a timeout fallback.
                const openWalkthrough = () => vscode.commands.executeCommand(
                    'workbench.action.openWalkthrough',
                    'fabioc-aloha.alex-cognitive-architecture#alex-getting-started',
                    false
                );
                const readyDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
                    readyDisposable.dispose();
                    clearTimeout(readyTimeout);
                    openWalkthrough();
                });
                const readyTimeout = setTimeout(() => {
                    readyDisposable.dispose();
                    openWalkthrough();
                }, 3000);
                context.globalState.update(SHOWN_KEY, currentVersion);
            }
        } catch { /* silent */ }

        // Silent startup check: if workspace is a heir, show status bar item
        const root = getWorkspaceRoot();
        if (root && fs.existsSync(getMarkerPath(root))) {
            const marker = readMarkerSafe(getMarkerPath(root));
            if (marker) try {
                const bundledVersion = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
                const upgradeAvailable = bundledVersion !== marker.edition_version;
                const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
                statusBar.text = upgradeAvailable
                    ? `$(brain) ACT v${marker.edition_version} $(arrow-up)`
                    : `$(brain) ACT v${marker.edition_version}`;
                statusBar.tooltip = `Alex ACT Edition v${marker.edition_version}${upgradeAvailable ? ` — v${bundledVersion} available` : ''}\nClick for actions`;
                statusBar.command = 'alex-act.statusBarMenu';
                statusBar.show();
                context.subscriptions.push(statusBar);
            } catch { /* silent */ }
        }

        channel.appendLine('[activate] Activation completed.');
    } catch (err) {
        logActivationError(channel, 'activate', err);

        if (!criticalReady) {
            const recovered = registerCriticalCommands(context, channel);
            criticalReady = recovered > 0;
            channel.appendLine(`[activate] Recovery registration attempted (${recovered} critical command(s)).`);
        }

        const state = criticalReady
            ? 'Core ACT commands are still available.'
            : 'Core command registration also failed.';
        vscode.window.showWarningMessage(
            `ACT: Extension activated with limited functionality due to a startup error. ${state} See the "ACT Extension" output channel for details.`
        );
    }
}

function deactivate() {
    if (_converterChannel) {
        _converterChannel.dispose();
        _converterChannel = null;
    }
    if (_activationChannel) {
        _activationChannel.dispose();
        _activationChannel = null;
    }
}

module.exports = { activate, deactivate };
