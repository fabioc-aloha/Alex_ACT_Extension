// @ts-check
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── Paths ──────────────────────────────────────────────────────────
const BRAIN_DIR = path.join(__dirname, 'brain');
const CATALOG_PATH = path.join(__dirname, 'catalog', 'CATALOG.json');

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
function listFilesRecursive(dir, base) {
    base = base || dir;
    let results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(listFilesRecursive(full, base));
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
        const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
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
        `Bootstrap ACT Edition v1.0.0 into this workspace?\n\nThis will create .github/ with 33 instructions, 17 skills, 20 prompts, 3 agents, and 20 muscles.`,
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
        for (const rel of brainFiles) {
            const ghRel = '.github/' + rel.replace(/\\/g, '/');
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
        }

        // 2. Render marker
        progress.report({ message: 'Creating heir marker...' });
        const versionFile = path.join(ghDir, 'VERSION');
        const editionVersion = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : '1.0.0';
        const marker = {
            $schema: 'https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/fleet/schema/act-heir.schema.json',
            spec_version: '1.0',
            edition: 'Alex_ACT_Edition',
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
                    edition: 'Alex_ACT_Edition',
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

        vscode.window.showInformationMessage(
            `ACT Edition v${editionVersion} bootstrapped. ${copied} files written. Start a Copilot Chat session to begin.`
        );
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

    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
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

    vscode.window.showInformationMessage(
        `Upgraded to Edition v${bundledVersion}. ${updated} files updated, ${skipped} heir-owned skipped.`
    );
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

    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
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

/**
 * Mall Search: search bundled CATALOG.json
 */
async function cmdMallSearch() {
    let catalog;
    try {
        catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    } catch {
        vscode.window.showErrorMessage('ACT: Could not load Mall catalog.');
        return;
    }

    const query = await vscode.window.showInputBox({
        prompt: 'Search the Plugin Mall (keyword, category, or technology)',
        placeHolder: 'e.g., azure, testing, mermaid, security',
    });
    if (!query) return;

    const q = query.toLowerCase();
    const matches = catalog.plugins.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
    );

    if (matches.length === 0) {
        vscode.window.showInformationMessage(`No plugins found for "${query}". Try a broader term.`);
        return;
    }

    const picks = matches.slice(0, 30).map(p => ({
        label: `${p.name}  ${p.shape}`,
        description: `${p.category} | ~${p.token_cost} tokens`,
        detail: p.description,
        plugin: p,
    }));

    const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: `${matches.length} plugin${matches.length === 1 ? '' : 's'} found`,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (pick) {
        const p = pick.plugin;
        const detail = [
            `**${p.name}** (${p.shape}, ${p.tier})`,
            `Category: ${p.category}`,
            `Token cost: ~${p.token_cost}`,
            `Engines: ${(p.engines || []).join(', ')}`,
            '',
            `Install: \`/mall install ${p.name}\` in Copilot Chat`,
            `Or clone the Mall and copy from \`${p.path}\``,
        ].join('\n');
        vscode.window.showInformationMessage(detail, { modal: true });
    }
}

// ── Converter Commands ─────────────────────────────────────────────

const CONVERTERS = {
    'md-to-word': { muscle: 'md-to-word.cjs', ext: '.docx', label: 'Word' },
    'md-to-html': { muscle: 'md-to-html.cjs', ext: '.html', label: 'HTML' },
    'md-to-eml': { muscle: 'md-to-eml.cjs', ext: '.eml', label: 'Email' },
    'md-to-txt': { muscle: 'md-to-txt.cjs', ext: '.txt', label: 'Plain Text' },
    'docx-to-md': { muscle: 'docx-to-md.cjs', ext: '.md', label: 'Markdown' },
    'html-to-md': { muscle: 'html-to-md.cjs', ext: '.md', label: 'Markdown' },
};

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

    // Find the muscle script (check workspace .github/muscles first, then bundled brain)
    const root = getWorkspaceRoot();
    let musclePath = root ? path.join(root, '.github', 'muscles', converter.muscle) : null;
    if (!musclePath || !fs.existsSync(musclePath)) {
        musclePath = path.join(BRAIN_DIR, 'muscles', converter.muscle);
    }
    if (!fs.existsSync(musclePath)) {
        vscode.window.showErrorMessage(`ACT Convert: Muscle not found: ${converter.muscle}`);
        return;
    }

    // Compute output path
    const inputDir = path.dirname(inputPath);
    const inputBase = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(inputDir, inputBase + converter.ext);

    // Run the converter
    const terminal = vscode.window.createTerminal({ name: `ACT: ${converter.label}`, cwd: inputDir });
    terminal.show();
    terminal.sendText(`node "${musclePath}" "${inputPath}" --out "${outputPath}"`);

    vscode.window.showInformationMessage(`ACT: Converting to ${converter.label}...`);
}

// ── Activation ─────────────────────────────────────────────────────

function activate(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand('alex-act.bootstrap', cmdBootstrap),
        vscode.commands.registerCommand('alex-act.upgrade', cmdUpgrade),
        vscode.commands.registerCommand('alex-act.status', cmdStatus),
        vscode.commands.registerCommand('alex-act.mall-search', cmdMallSearch),
    );

    // Register converter commands
    for (const [id, _] of Object.entries(CONVERTERS)) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`alex-act.convert.${id}`, (fileUri) => runConverter(id, fileUri))
        );
    }

    // Silent startup check: if workspace is a heir, show status bar item
    const root = getWorkspaceRoot();
    if (root && fs.existsSync(getMarkerPath(root))) {
        try {
            const marker = JSON.parse(fs.readFileSync(getMarkerPath(root), 'utf8'));
            const bundledVersion = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
            const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
            statusBar.text = `$(brain) ACT v${marker.edition_version}`;
            statusBar.tooltip = `Alex ACT Edition v${marker.edition_version}${bundledVersion !== marker.edition_version ? ` (v${bundledVersion} available)` : ''}`;
            statusBar.command = 'alex-act.status';
            statusBar.show();
            context.subscriptions.push(statusBar);
        } catch { /* silent */ }
    }
}

function deactivate() { }

module.exports = { activate, deactivate };
