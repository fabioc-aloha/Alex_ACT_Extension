// @ts-check
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ── Paths ───────────────────────────────────────────────────────────────
const BRAIN_DIR = path.join(__dirname, 'brain');

// ── Bundled brain introspection ──────────────────────────────────────────
function getBundledEditionVersion() {
    try {
        const v = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
        return v || 'unknown';
    } catch { return 'unknown'; }
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

// ── Sync Policy ────────────────────────────────────────────────────
function loadSyncPolicy() {
    const p = path.join(BRAIN_DIR, 'config', 'sync-policy.json');
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function isHeirOwned(relPath, policy) {
    if (!policy || !policy.heir_owned) return false;
    const normalized = relPath.replace(/\\/g, '/');
    return policy.heir_owned.some(glob => {
        const pattern = glob.replace(/\\/g, '/');
        if (pattern.endsWith('/**')) {
            return normalized.startsWith(pattern.slice(0, -3));
        }
        return normalized === pattern;
    });
}

// ── File operations ────────────────────────────────────────────────
// Symlink cycle / depth guard: tracks resolved real paths and caps recursion depth.
// Without this, a workspace with `a -> b` and `b -> a` symlinks would infinite-loop on Unix.
const MAX_RECURSION_DEPTH = 50;
function listFilesRecursive(dir, base, _seen, _depth) {
    base = base || dir;
    _seen = _seen || new Set();
    _depth = _depth || 0;
    let results = [];
    if (!fs.existsSync(dir)) return results;
    if (_depth > MAX_RECURSION_DEPTH) return results;
    let real;
    try { real = fs.realpathSync(dir); } catch { return results; }
    if (_seen.has(real)) return results;
    _seen.add(real);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(listFilesRecursive(full, base, _seen, _depth + 1));
        } else {
            results.push(path.relative(base, full));
        }
    }
    return results;
}

function copyFileSync(src, dst) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
}

// ── AI-Memory (from _registry.cjs, adapted) ────────────────────────
const KNOWN_CLOUD_PATTERNS = [
    { pattern: /^OneDrive/i, provider: 'OneDrive' },
    { pattern: /^iCloud/i, provider: 'iCloud' },
    { pattern: /^Dropbox/i, provider: 'Dropbox' },
    { pattern: /^Google Drive/i, provider: 'Google Drive' },
    { pattern: /^My Drive/i, provider: 'Google Drive' },
    { pattern: /^Box( Sync)?$/i, provider: 'Box' },
    { pattern: /^MEGA/i, provider: 'MEGA' },
    { pattern: /^pCloud/i, provider: 'pCloud' },
    { pattern: /^Nextcloud/i, provider: 'Nextcloud' },
];

function discoverCloudDrives(excludeSet) {
    const home = os.homedir();
    const drives = [];
    let entries;
    try { entries = fs.readdirSync(home, { withFileTypes: true }); } catch { return drives; }

    for (const entry of entries) {
        let isDir = false;
        try { isDir = entry.isDirectory() || fs.statSync(path.join(home, entry.name)).isDirectory(); } catch { continue; }
        if (!isDir) continue;
        if (excludeSet && excludeSet.has(entry.name.toLowerCase())) continue;

        let provider = null;
        for (const kp of KNOWN_CLOUD_PATTERNS) {
            if (kp.pattern.test(entry.name)) { provider = kp.provider; break; }
        }
        if (!provider) continue;

        const driveDir = path.join(home, entry.name);
        const aiMemDir = path.join(driveDir, 'AI-Memory');
        drives.push({
            name: entry.name,
            path: driveDir,
            provider,
            hasAiMemory: fs.existsSync(aiMemDir),
        });
    }

    // macOS iCloud Library path
    if (!drives.some(d => d.provider === 'iCloud')) {
        const macICloud = path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
        try {
            if (fs.existsSync(macICloud) && fs.statSync(macICloud).isDirectory()) {
                drives.push({
                    name: 'Library/Mobile Documents/com~apple~CloudDocs',
                    path: macICloud,
                    provider: 'iCloud',
                    hasAiMemory: fs.existsSync(path.join(macICloud, 'AI-Memory')),
                });
            }
        } catch { /* not macOS */ }
    }

    drives.sort((a, b) => {
        if (a.hasAiMemory !== b.hasAiMemory) return a.hasAiMemory ? -1 : 1;
        return 0;
    });
    return drives;
}

function initAiMemory(drivePath) {
    const root = path.join(drivePath, 'AI-Memory');
    const dirs = ['', 'feedback', path.join('feedback', 'alex-act'), 'announcements', path.join('announcements', 'alex-act'), 'heirs', 'knowledge', 'insights'];
    for (const d of dirs) {
        const full = path.join(root, d);
        if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    }
    // READMEs
    const readme = path.join(root, 'README.md');
    if (!fs.existsSync(readme)) {
        fs.writeFileSync(readme, '# AI-Memory\n\nShared fleet communication channel for ACT-Edition heirs.\n');
    }
    const fbReadme = path.join(root, 'feedback', 'alex-act', 'README.md');
    if (!fs.existsSync(fbReadme)) {
        fs.writeFileSync(fbReadme, '# ACT Heir Feedback Inbox\n\nDrop feedback here. One markdown file per item.\n');
    }
    const annReadme = path.join(root, 'announcements', 'alex-act', 'README.md');
    if (!fs.existsSync(annReadme)) {
        fs.writeFileSync(annReadme, '# ACT Fleet Announcements\n\nRelease notes and fleet-wide guidance. Heirs read on session start.\n');
    }
    return root;
}

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
        const policy = loadSyncPolicy();

        // 1. Copy edition-owned brain files
        progress.report({ message: 'Copying brain files...' });
        const brainFiles = listFilesRecursive(BRAIN_DIR);
        let copied = 0;
        const copyFailures = [];
        for (const rel of brainFiles) {
            const ghRel = '.github/' + rel.replace(/\\/g, '/');
            try {
                if (isHeirOwned(ghRel, policy)) {
                    // Heir-owned template: only copy if absent
                    const dst = path.join(ghDir, rel);
                    if (!fs.existsSync(dst)) {
                        copyFileSync(path.join(BRAIN_DIR, rel), dst);
                        copied++;
                    }
                } else {
                    copyFileSync(path.join(BRAIN_DIR, rel), path.join(ghDir, rel));
                    copied++;
                }
            } catch (err) {
                copyFailures.push({ rel, err: err && err.message ? err.message : String(err) });
            }
        }
        if (copyFailures.length > 0) {
            const sample = copyFailures.slice(0, 5).map(f => `${f.rel}: ${f.err}`).join('\n');
            const more = copyFailures.length > 5 ? `\n... and ${copyFailures.length - 5} more` : '';
            vscode.window.showWarningMessage(
                `ACT bootstrap: ${copyFailures.length} file(s) failed to copy. Workspace may be in a partial state — consider removing .github/ and retrying.\n\n${sample}${more}`
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

        // 4. AI-Memory setup
        progress.report({ message: 'Setting up AI-Memory...' });
        let aiMemRoot = null;
        // Check cognitive-config for pinned root
        const cogConfig = path.join(ghDir, 'config', 'cognitive-config.json');
        let cogCfg = {};
        if (fs.existsSync(cogConfig)) {
            try { cogCfg = JSON.parse(fs.readFileSync(cogConfig, 'utf8')); } catch { /* */ }
        }

        const excludeSet = new Set((cogCfg.ai_memory_exclude || []).map(s => s.toLowerCase()));
        if (cogCfg.ai_memory_root) {
            const pinned = path.join(os.homedir(), cogCfg.ai_memory_root, 'AI-Memory');
            if (fs.existsSync(pinned)) aiMemRoot = pinned;
        }

        if (!aiMemRoot) {
            const drives = discoverCloudDrives(excludeSet);
            const withMem = drives.find(d => d.hasAiMemory);
            if (withMem) {
                aiMemRoot = path.join(withMem.path, 'AI-Memory');
            } else if (drives.length > 0) {
                // Ask user which drive
                const picks = drives.map(d => ({ label: d.name, description: d.provider }));
                picks.push({ label: '~/AI-Memory', description: 'Local (no cloud sync)' });
                const pick = await vscode.window.showQuickPick(picks, {
                    placeHolder: 'Choose a cloud drive for AI-Memory (fleet communication)',
                });
                if (pick) {
                    const driveName = pick.label;
                    const drivePath = driveName === '~/AI-Memory'
                        ? os.homedir()
                        : drives.find(d => d.name === driveName).path;
                    aiMemRoot = initAiMemory(drivePath);
                    // Persist choice
                    cogCfg.ai_memory_root = driveName === '~/AI-Memory' ? undefined : driveName;
                    fs.writeFileSync(cogConfig, JSON.stringify(cogCfg, null, 4) + '\n');
                }
            }
        }

        // 5. Register in AI-Memory fleet
        if (aiMemRoot) {
            try {
                const heirsDir = path.join(aiMemRoot, 'heirs');
                fs.mkdirSync(heirsDir, { recursive: true });
                const regPath = path.join(heirsDir, 'registry.json');
                let registry = { schema: '1.0', heirs: {} };
                if (fs.existsSync(regPath)) {
                    try { registry = JSON.parse(fs.readFileSync(regPath, 'utf8')); } catch { /* */ }
                    if (!registry.heirs) registry.heirs = {};
                }
                registry.heirs[heirId] = {
                    heir_id: heirId,
                    heir_name: heirName,
                    edition: 'Alex',
                    edition_version: editionVersion,
                    repo_url: marker.repo_url,
                    deployed_at: marker.deployed_at,
                    last_sync_at: marker.last_sync_at,
                    owner: marker.contact.owner,
                };
                registry.last_updated = new Date().toISOString();
                fs.writeFileSync(regPath, JSON.stringify(registry, null, 2) + '\n');
            } catch { /* best-effort */ }
        }

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

    const policy = loadSyncPolicy();
    const ghDir = getGitHubDir(root);
    const brainFiles = listFilesRecursive(BRAIN_DIR);

    let updated = 0, skipped = 0;
    for (const rel of brainFiles) {
        const ghRel = '.github/' + rel.replace(/\\/g, '/');
        if (isHeirOwned(ghRel, policy)) { skipped++; continue; }

        const src = path.join(BRAIN_DIR, rel);
        const dst = path.join(ghDir, rel);
        // Only write if content changed
        if (fs.existsSync(dst)) {
            const srcHash = crypto.createHash('md5').update(fs.readFileSync(src)).digest('hex');
            const dstHash = crypto.createHash('md5').update(fs.readFileSync(dst)).digest('hex');
            if (srcHash === dstHash) continue;
        }
        copyFileSync(src, dst);
        updated++;
    }

    // Update marker
    marker.edition_version = bundledVersion;
    marker.last_sync_at = new Date().toISOString();
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');

    // Validate the upgraded brain before declaring success.
    const doctorOk = await runHeirDoctor(root);
    const doctorLine = doctorOk === null
        ? ''
        : doctorOk ? ' ✓ heir-doctor passed.' : ' ⚠ heir-doctor reported issues (run /status for details).';

    vscode.window.showInformationMessage(
        `Upgraded to Edition v${bundledVersion}. ${updated} files updated, ${skipped} heir-owned skipped.${doctorLine}`
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
 * Status: show brain version, heir info, AI-Memory health
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

    // Run the converter in a terminal so the user can see streaming output.
    const terminal = vscode.window.createTerminal({ name: `ACT: ${converter.label}`, cwd: inputDir });
    terminal.show();
    terminal.sendText(`node "${scriptPath}" "${inputPath}" --out "${outputPath}"`);

    vscode.window.showInformationMessage(`ACT: Converting to ${converter.label}...`);
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
const migration = require('./migration');

// ── Activation ─────────────────────────────────────────────────────

function activate(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand('alex-act.bootstrap', cmdBootstrap),
        vscode.commands.registerCommand('alex-act.upgrade', cmdUpgrade),
        vscode.commands.registerCommand('alex-act.status', cmdStatus),
        vscode.commands.registerCommand('alex-act.statusBarMenu', cmdStatusBarMenu),
        vscode.commands.registerCommand('alex-act.openWalkthrough', () => {
            vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'fabioc-aloha.alex-cognitive-architecture#alex-getting-started',
                false
            );
        }),
        vscode.commands.registerCommand('alex-act.migrate-from-alex-master', migration.migrateFromAlexMaster),
        vscode.commands.registerCommand('alex-act.rollback-migration', migration.rollbackMigration),
        vscode.commands.registerCommand('alex-act.clean-migration-backup', migration.cleanMigrationBackup),
    );

    // Register converter commands
    for (const [id, _] of Object.entries(CONVERTERS)) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`alex-act.convert.${id}`, (fileUri) => runConverter(id, fileUri))
        );
    }

    // Register no-op stubs for AlexMaster's 30 deprecated commands
    migration.registerDeprecatedStubs(context);

    // Fire AlexMaster detection modal (respects "remind later" / "don't ask again")
    migration.checkActivationTrigger(context).catch(() => { /* silent */ });

    // Auto-open the Welcome walkthrough on first install or after version bump.
    // Non-devs won't know to run a command, so surface it on startup, once per version.
    try {
        const pkg = require('./package.json');
        const currentVersion = pkg.version;
        const SHOWN_KEY = 'alex-act.walkthroughShownVersion';
        const shownVersion = context.globalState.get(SHOWN_KEY);
        if (shownVersion !== currentVersion) {
            // Defer briefly so VS Code finishes restoring editors before we open the walkthrough.
            setTimeout(() => {
                vscode.commands.executeCommand(
                    'workbench.action.openWalkthrough',
                    'fabioc-aloha.alex-cognitive-architecture#alex-getting-started',
                    false
                );
            }, 1500);
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
}

function deactivate() { }

module.exports = { activate, deactivate };
