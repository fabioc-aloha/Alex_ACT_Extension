// @ts-check
'use strict';

/**
 * Phase A — Deterministic migration: AlexMaster v8.4.0 → ACT Edition v9.0.0
 *
 * Lifecycle: ships in v9.0.0 (2026-05-24). Falsification deadline 2026-08-24
 * (ADR-004 retrospective). Module retires when retrospective concludes
 * adoption is complete (~zero remaining AlexMaster installs detected in
 * activation telemetry).
 *
 * Plan reference: Alex_ACT_Supervisor/docs/proposals/alexmaster-migration-2026-05-24.md §Phase 1
 * Decisions: Alex_ACT_Supervisor/docs/adrs/ADR-004-alexmaster-migration.md
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vscode = require('vscode');

// ── Module-internal paths (resolved against extension root) ───────
const EXT_ROOT = __dirname;
const SIGNATURE_PATH = path.join(EXT_ROOT, 'migration', 'alex-master-signature.json');
const MANIFEST_PATH = path.join(EXT_ROOT, 'migration', 'alex-master-v8.4.0.manifest.json');
const REVIEW_TEMPLATE_PATH = path.join(EXT_ROOT, 'templates', 'MIGRATION-REVIEW.md');
const BRAIN_DIR = path.join(EXT_ROOT, 'brain');

// ── AlexMaster v8.4.0 command IDs (deprecated stubs) ──────────────
// Extracted from migration/legacy/alex-master-v8.4.0.vsix package.json
const DEPRECATED_COMMANDS = [
    'alex.brainQA',
    'alex.convertDocxToMd',
    'alex.convertHtmlToMd',
    'alex.convertMdToEml',
    'alex.convertMdToEpub',
    'alex.convertMdToGamma',
    'alex.convertMdToHtml',
    'alex.convertMdToLatex',
    'alex.convertMdToPdf',
    'alex.convertMdToPptx',
    'alex.convertMdToTxt',
    'alex.convertMdToWord',
    'alex.convertPptxToMd',
    'alex.createCustomAgent',
    'alex.dream',
    'alex.generateLoopConfig',
    'alex.initialize',
    'alex.insightPipeline',
    'alex.markdownLint',
    'alex.newSkill',
    'alex.openChat',
    'alex.optimizeSettings',
    'alex.refreshWelcome',
    'alex.setContext',
    'alex.setProjectPhase',
    'alex.setupAIMemory',
    'alex.showDiagnostics',
    'alex.tokenCostReport',
    'alex.upgrade',
    'alex.validateSkills',
];

// ── A7 settings-key translation (alex.* → alex-act.*) ─────────────
// Conservative: only translate keys that are known to map. Unknown alex.*
// keys are preserved (no data loss) and reported in MIGRATION-REVIEW.md.
const SETTING_TRANSLATIONS = {
    'alex.aiMemory.path': 'alex-act.aiMemory.path',
    'alex.aiMemory.root': 'alex-act.aiMemory.root',
    'alex.muscle.timeout': 'alex-act.muscle.timeout',
    'alex.brain.version': 'alex-act.brain.version',
    'alex.heirId': 'alex-act.heirId',
    'alex.heirName': 'alex-act.heirName',
};

// ── Small helpers ─────────────────────────────────────────────────

function sha256File(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function listFilesRecursive(dir, base) {
    base = base || dir;
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listFilesRecursive(full, base));
        } else if (entry.isFile()) {
            out.push(path.relative(base, full).replace(/\\/g, '/'));
        }
    }
    return out;
}

function copyFileSync(src, dst) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
}

function isoStamp() {
    // Filesystem-safe ISO: 2026-05-24T13-42-07
    return new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '');
}

function readJsonSafe(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

// ── A1: Detection ─────────────────────────────────────────────────

/**
 * Scan a workspace for AlexMaster signature using migration/alex-master-signature.json.
 * Returns { detected: boolean, strongHits: string[], weakHits: string[], reason: string }.
 *
 * Detection rule: any strongSignal match → detected. Weak signals alone do
 * not trigger detection (too noisy: .github/episodic, .github/quality, etc.
 * may legitimately exist in non-AlexMaster workspaces).
 */
function detectAlexMaster(workspaceRoot) {
    const sig = readJsonSafe(SIGNATURE_PATH);
    if (!sig) {
        return { detected: false, strongHits: [], weakHits: [], reason: 'signature manifest missing' };
    }

    const ghDir = path.join(workspaceRoot, '.github');
    if (!fs.existsSync(ghDir)) {
        return { detected: false, strongHits: [], weakHits: [], reason: 'no .github directory' };
    }

    const strongHits = [];
    for (const signal of sig.strongSignals || []) {
        if (!signal.path) continue; // skip glob-only entries here
        const candidate = path.join(workspaceRoot, signal.path);
        if (!fs.existsSync(candidate)) continue;
        const patterns = signal.matchAny || signal.contentMatch;
        if (patterns) {
            try {
                const content = fs.readFileSync(candidate, 'utf8');
                const pats = Array.isArray(patterns) ? patterns : [patterns];
                if (pats.some((p) => content.includes(p))) strongHits.push(signal.path);
            } catch { /* unreadable */ }
        } else {
            strongHits.push(signal.path);
        }
    }

    const weakHits = [];
    for (const signal of sig.weakSignals || []) {
        if (signal.path) {
            const candidate = path.join(workspaceRoot, signal.path);
            if (fs.existsSync(candidate)) weakHits.push(signal.path);
        } else if (signal.pattern) {
            // file-glob in workspace root: simple prefix match (e.g. ".github-backup-*")
            const prefix = signal.pattern.replace(/\*.*$/, '');
            try {
                const entries = fs.readdirSync(workspaceRoot);
                if (entries.some((e) => e.startsWith(prefix))) weakHits.push(signal.pattern);
            } catch { /* unreadable */ }
        }
    }

    return {
        detected: strongHits.length > 0,
        strongHits,
        weakHits,
        reason: strongHits.length > 0 ? `${strongHits.length} strong signal(s) matched` : 'no strong signals',
    };
}

// ── A2: Snapshot ──────────────────────────────────────────────────

function snapshotWorkspace(workspaceRoot) {
    const stamp = isoStamp();
    const backupDir = path.join(workspaceRoot, `.github-backup-${stamp}`);
    const ghDir = path.join(workspaceRoot, '.github');

    if (!fs.existsSync(ghDir)) {
        throw new Error('No .github directory to snapshot. Migration cannot proceed safely.');
    }
    if (fs.existsSync(backupDir)) {
        throw new Error(`Backup directory already exists: ${backupDir}. Aborting to prevent overwrite.`);
    }

    // fs.cpSync recursive — Node 16.7+ (VS Code 1.117 ships Node 20+)
    fs.cpSync(ghDir, backupDir, { recursive: true });

    // Also snapshot .vscode/settings.json if it has any alex.* keys
    const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
    if (fs.existsSync(settingsPath)) {
        const settings = readJsonSafe(settingsPath);
        if (settings && Object.keys(settings).some((k) => k.startsWith('alex.'))) {
            copyFileSync(settingsPath, path.join(backupDir, 'settings.json.bak'));
        }
    }

    return backupDir;
}

// ── A3 + A4: Classification ───────────────────────────────────────

/**
 * Build a path→sha256 map from the v8.4.0 manifest. Manifest paths are
 * prefixed `brain-files/`; AlexMaster's bootstrap copied that subtree into
 * the user's `.github/`, so we strip the prefix when comparing.
 */
function loadV840Index() {
    const manifest = readJsonSafe(MANIFEST_PATH);
    if (!manifest) throw new Error(`v8.4.0 manifest missing at ${MANIFEST_PATH}`);
    const index = new Map();
    for (const entry of manifest.files || []) {
        if (!entry.path.startsWith('brain-files/')) continue;
        const ghRel = entry.path.replace(/^brain-files\//, ''); // → "instructions/foo.md"
        index.set(ghRel, entry.sha256);
    }
    return index;
}

/**
 * Walk the snapshotted .github-backup-<ISO>/ and classify every file.
 *
 * Returns { baseline: string[], customisedBaseline: string[], custom: string[] }
 * with paths relative to the backup dir (= relative to .github/).
 */
function classifyFiles(backupDir) {
    const v840 = loadV840Index();
    const files = listFilesRecursive(backupDir);
    const result = { baseline: [], customisedBaseline: [], custom: [] };

    for (const rel of files) {
        // Skip the settings.json.bak we wrote during A2
        if (rel === 'settings.json.bak') continue;
        const fullPath = path.join(backupDir, rel);
        const baselineSha = v840.get(rel);
        if (baselineSha == null) {
            result.custom.push(rel);
            continue;
        }
        const actualSha = sha256File(fullPath);
        if (actualSha === baselineSha) {
            result.baseline.push(rel);
        } else {
            result.customisedBaseline.push(rel);
        }
    }
    return result;
}

// ── A5: Install Edition brain ─────────────────────────────────────

function installEditionBrain(workspaceRoot) {
    const ghDir = path.join(workspaceRoot, '.github');
    if (!fs.existsSync(BRAIN_DIR)) {
        throw new Error(`Bundled Edition brain missing at ${BRAIN_DIR}`);
    }
    // Wipe .github/ (we already have the backup); fresh install avoids stale files
    fs.rmSync(ghDir, { recursive: true, force: true });
    fs.cpSync(BRAIN_DIR, ghDir, { recursive: true });
    return listFilesRecursive(ghDir).length;
}

// ── A6: Preserve customs under .github/local/ ─────────────────────

/**
 * For every `custom` and `customised-baseline` file from classification,
 * copy from backup into `.github/local/<originalRel>`. Idempotent: skips
 * any destination that already exists (caller should never re-run on a
 * partially-migrated workspace, but defense in depth).
 */
function preserveCustoms(workspaceRoot, backupDir, classification) {
    const localRoot = path.join(workspaceRoot, '.github', 'local');
    const preserved = [];
    const toPreserve = [...classification.custom, ...classification.customisedBaseline];
    for (const rel of toPreserve) {
        const src = path.join(backupDir, rel);
        const dst = path.join(localRoot, rel);
        if (!fs.existsSync(src)) continue; // backup race; skip
        if (fs.existsSync(dst)) continue;  // idempotent
        copyFileSync(src, dst);
        preserved.push(rel);
    }
    return preserved;
}

// ── A7: Settings translation ──────────────────────────────────────

function translateSettings(workspaceRoot) {
    const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
    if (!fs.existsSync(settingsPath)) return { translated: [], preservedUnknown: [] };

    const settings = readJsonSafe(settingsPath);
    if (!settings) return { translated: [], preservedUnknown: [] };

    const translated = [];
    const preservedUnknown = [];
    for (const oldKey of Object.keys(settings)) {
        if (!oldKey.startsWith('alex.')) continue;
        const newKey = SETTING_TRANSLATIONS[oldKey];
        if (newKey) {
            settings[newKey] = settings[oldKey];
            delete settings[oldKey];
            translated.push(`${oldKey} → ${newKey}`);
        } else {
            preservedUnknown.push(oldKey);
        }
    }

    if (translated.length > 0) {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4) + '\n');
    }
    return { translated, preservedUnknown };
}

// ── A8: Deprecated-command stubs (extension-internal) ─────────────

/**
 * Register no-op handlers for AlexMaster's 30 commands. Fires a toast
 * pointing users to chat instead. Lives in extension code, not user
 * workspace, so does not need backup/rollback.
 */
function registerDeprecatedStubs(context) {
    for (const cmdId of DEPRECATED_COMMANDS) {
        const sub = vscode.commands.registerCommand(cmdId, () => {
            vscode.window.showInformationMessage(
                `Command ${cmdId} moved to chat in ACT Edition. Try /<keyword> in Copilot Chat instead.`
            );
        });
        context.subscriptions.push(sub);
    }
}

// ── A9: Mark migration state ──────────────────────────────────────

function writeMigrationMarker(workspaceRoot, backupDir, classification) {
    const markerPath = path.join(workspaceRoot, '.github', '.act-heir.json');
    const editionVersionPath = path.join(BRAIN_DIR, 'VERSION');
    const editionVersion = fs.existsSync(editionVersionPath)
        ? fs.readFileSync(editionVersionPath, 'utf8').trim()
        : '9.0.0';

    const marker = {
        $schema: 'https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/fleet/schema/act-heir.schema.json',
        spec_version: '1.0',
        edition: 'Alex_ACT_Edition',
        edition_version: editionVersion,
        heir_id: path.basename(workspaceRoot).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'),
        heir_name: path.basename(workspaceRoot),
        deployed_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        opt_in: { fleet_inventory: true, auto_upgrade: false },
        migratedFrom: 'alex-master@8.4.0',
        migrationDate: new Date().toISOString(),
        backupPath: path.relative(workspaceRoot, backupDir).replace(/\\/g, '/'),
        migrationCounts: {
            baseline: classification.baseline.length,
            customisedBaseline: classification.customisedBaseline.length,
            custom: classification.custom.length,
        },
    };
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');
    return marker;
}

// ── A10: Write MIGRATION-REVIEW.md ────────────────────────────────

function writeMigrationReview(workspaceRoot, classification, backupDir, preserved, settingsResult) {
    const templatePath = REVIEW_TEMPLATE_PATH;
    const reviewPath = path.join(workspaceRoot, 'MIGRATION-REVIEW.md');

    let body = '';
    if (fs.existsSync(templatePath)) {
        body = fs.readFileSync(templatePath, 'utf8');
    } else {
        body = '# Migration Review\n\n(Template missing; this file was auto-generated.)\n';
    }

    // Append the actual classification data
    const backupRel = path.relative(workspaceRoot, backupDir).replace(/\\/g, '/');
    const summary = [
        '',
        '---',
        '',
        '## Auto-generated migration summary',
        '',
        `**Migration date**: ${new Date().toISOString()}`,
        `**Backup location**: \`${backupRel}/\``,
        `**Source**: AlexMaster v8.4.0 (Marketplace published 2026-04-26)`,
        '',
        '### File counts',
        '',
        `- **Baseline** (matched v8.4.0 byte-for-byte, discarded): ${classification.baseline.length}`,
        `- **Customised baseline** (path in v8.4.0 but content modified, preserved under \`.github/local/\`): ${classification.customisedBaseline.length}`,
        `- **Custom** (not in v8.4.0, preserved under \`.github/local/\`): ${classification.custom.length}`,
        '',
    ];

    if (classification.customisedBaseline.length > 0) {
        summary.push('### Customised-baseline files (your edits to v8.4.0 files)');
        summary.push('');
        summary.push('Review these carefully — they may overlap ACT Edition brain paths.');
        summary.push('');
        for (const rel of classification.customisedBaseline.slice(0, 50)) {
            summary.push(`- \`.github/local/${rel}\` (was \`.github/${rel}\`)`);
        }
        if (classification.customisedBaseline.length > 50) {
            summary.push(`- _...and ${classification.customisedBaseline.length - 50} more_`);
        }
        summary.push('');
    }

    if (classification.custom.length > 0) {
        summary.push('### Custom files (not part of v8.4.0)');
        summary.push('');
        summary.push('These are likely your own additions. Preserved as-is.');
        summary.push('');
        for (const rel of classification.custom.slice(0, 50)) {
            summary.push(`- \`.github/local/${rel}\``);
        }
        if (classification.custom.length > 50) {
            summary.push(`- _...and ${classification.custom.length - 50} more_`);
        }
        summary.push('');
    }

    if (settingsResult.translated.length > 0 || settingsResult.preservedUnknown.length > 0) {
        summary.push('### Settings (`.vscode/settings.json`)');
        summary.push('');
        if (settingsResult.translated.length > 0) {
            summary.push('Translated keys:');
            summary.push('');
            for (const t of settingsResult.translated) summary.push(`- ${t}`);
            summary.push('');
        }
        if (settingsResult.preservedUnknown.length > 0) {
            summary.push('Unknown `alex.*` keys preserved (manual review needed):');
            summary.push('');
            for (const k of settingsResult.preservedUnknown) summary.push(`- ${k}`);
            summary.push('');
        }
    }

    summary.push('### Next step');
    summary.push('');
    summary.push('Open Copilot Chat and run `/migrate-from-alex-master` to walk through the semantic review.');
    summary.push('');
    summary.push(`### Rollback`);
    summary.push('');
    summary.push(`Run command **Alex ACT: Rollback Migration** to restore from \`${backupRel}/\`.`);
    summary.push('');

    fs.writeFileSync(reviewPath, body + summary.join('\n'));
    return reviewPath;
}

// ── A11: Open chat with welcome (best-effort) ─────────────────────

async function openWelcomeChat() {
    // VS Code's chat API is still evolving. Best-effort: open Chat view.
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open');
    } catch {
        // Older builds may not have this command; skip silently.
    }
}

// ── Orchestrator: cmdMigrateFromAlexMaster ────────────────────────

async function migrateFromAlexMaster() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('ACT: Open a workspace folder first.');
        return;
    }
    const workspaceRoot = folders[0].uri.fsPath;

    // Idempotency: don't re-run if already migrated
    const markerPath = path.join(workspaceRoot, '.github', '.act-heir.json');
    if (fs.existsSync(markerPath)) {
        const existing = readJsonSafe(markerPath);
        if (existing && existing.migratedFrom) {
            vscode.window.showWarningMessage(
                `This workspace was already migrated from ${existing.migratedFrom} on ${existing.migrationDate?.substring(0, 10)}. To re-run, first run "Alex ACT: Rollback Migration".`
            );
            return;
        }
    }

    const detection = detectAlexMaster(workspaceRoot);
    if (!detection.detected) {
        const proceed = await vscode.window.showWarningMessage(
            `No AlexMaster signature detected (${detection.reason}). Migrate anyway?`,
            { modal: true },
            'Migrate anyway',
        );
        if (proceed !== 'Migrate anyway') return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Migrate this workspace from AlexMaster to ACT Edition?\n\n` +
        `• Your .github/ will be backed up to .github-backup-<timestamp>/\n` +
        `• ACT Edition brain will be installed\n` +
        `• Your customizations will be preserved under .github/local/\n` +
        `• A MIGRATION-REVIEW.md will be written at workspace root\n\n` +
        `This is reversible via "Alex ACT: Rollback Migration".`,
        { modal: true },
        'Migrate',
    );
    if (confirm !== 'Migrate') return;

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'ACT: Migrating from AlexMaster...',
            cancellable: false,
        }, async (progress) => {
            progress.report({ message: 'A2 snapshot .github/...' });
            const backupDir = snapshotWorkspace(workspaceRoot);

            progress.report({ message: 'A3-A4 classifying files...' });
            const classification = classifyFiles(backupDir);

            progress.report({ message: 'A5 installing Edition brain...' });
            installEditionBrain(workspaceRoot);

            progress.report({ message: 'A6 preserving customizations...' });
            const preserved = preserveCustoms(workspaceRoot, backupDir, classification);

            progress.report({ message: 'A7 translating settings...' });
            const settingsResult = translateSettings(workspaceRoot);

            progress.report({ message: 'A9 marking migration state...' });
            writeMigrationMarker(workspaceRoot, backupDir, classification);

            progress.report({ message: 'A10 writing MIGRATION-REVIEW.md...' });
            writeMigrationReview(workspaceRoot, classification, backupDir, preserved, settingsResult);

            progress.report({ message: 'A11 opening chat...' });
            await openWelcomeChat();
        });

        vscode.window.showInformationMessage(
            `Migration complete. Open MIGRATION-REVIEW.md and run /migrate-from-alex-master in chat.`,
            'Open MIGRATION-REVIEW.md',
        ).then((pick) => {
            if (pick === 'Open MIGRATION-REVIEW.md') {
                const reviewUri = vscode.Uri.file(path.join(workspaceRoot, 'MIGRATION-REVIEW.md'));
                vscode.window.showTextDocument(reviewUri);
            }
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(
            `Migration failed: ${msg}\n\nYour .github-backup-<timestamp>/ directory is intact. ` +
            `Run "Alex ACT: Rollback Migration" to restore.`
        );
    }
}

// ── Rollback ──────────────────────────────────────────────────────

async function rollbackMigration() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('ACT: Open a workspace folder first.');
        return;
    }
    const workspaceRoot = folders[0].uri.fsPath;

    const markerPath = path.join(workspaceRoot, '.github', '.act-heir.json');
    const marker = readJsonSafe(markerPath);
    if (!marker || !marker.migratedFrom || !marker.backupPath) {
        vscode.window.showWarningMessage('No migration marker found. Nothing to roll back.');
        return;
    }

    const backupDir = path.join(workspaceRoot, marker.backupPath);
    if (!fs.existsSync(backupDir)) {
        vscode.window.showErrorMessage(
            `Backup directory missing: ${marker.backupPath}. Cannot roll back automatically.`
        );
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Roll back migration from ${marker.migratedFrom}?\n\n` +
        `• Current .github/ will be DELETED\n` +
        `• Backup at ${marker.backupPath}/ will be restored\n` +
        `• ACT Edition extension stays installed; you can re-run migration later.`,
        { modal: true },
        'Roll back',
    );
    if (confirm !== 'Roll back') return;

    try {
        const ghDir = path.join(workspaceRoot, '.github');
        fs.rmSync(ghDir, { recursive: true, force: true });
        fs.cpSync(backupDir, ghDir, { recursive: true });

        // Restore settings.json if we backed it up
        const settingsBak = path.join(backupDir, 'settings.json.bak');
        const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
        if (fs.existsSync(settingsBak)) {
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
            fs.copyFileSync(settingsBak, settingsPath);
        }

        // Marker came back as part of the restored .github/, no extra cleanup needed.
        // The MIGRATION-REVIEW.md at workspace root is left in place as a record
        // (user can delete manually). Leaving it deliberately so a re-migration
        // attempt has visibility into the prior run.

        vscode.window.showInformationMessage(
            `Rolled back to ${marker.migratedFrom} state. MIGRATION-REVIEW.md left at workspace root for reference.`
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Rollback failed: ${msg}`);
    }
}

// ── Clean migration backup ────────────────────────────────────────

/**
 * Remove the `.github-backup-<ISO>/` directory referenced by the
 * migration marker. User-initiated cleanup, never automatic. The
 * marker's `backupPath` field is cleared after successful deletion
 * so the rollback command knows the backup is gone.
 */
async function cleanMigrationBackup() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('ACT: Open a workspace folder first.');
        return;
    }
    const workspaceRoot = folders[0].uri.fsPath;

    const markerPath = path.join(workspaceRoot, '.github', '.act-heir.json');
    const marker = readJsonSafe(markerPath);
    if (!marker || !marker.migratedFrom || !marker.backupPath) {
        vscode.window.showWarningMessage('No migration backup recorded. Nothing to clean.');
        return;
    }

    const backupDir = path.join(workspaceRoot, marker.backupPath);
    if (!fs.existsSync(backupDir)) {
        vscode.window.showInformationMessage(
            `Backup directory already gone: ${marker.backupPath}. Clearing marker reference.`
        );
        delete marker.backupPath;
        fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Permanently delete the migration backup at ${marker.backupPath}/?\n\n` +
        `• Once deleted, rollback is no longer possible.\n` +
        `• Only do this when you are confident the migration is complete.`,
        { modal: true },
        'Delete backup',
    );
    if (confirm !== 'Delete backup') return;

    try {
        fs.rmSync(backupDir, { recursive: true, force: true });
        delete marker.backupPath;
        fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');
        vscode.window.showInformationMessage(
            `Migration backup deleted. Rollback is no longer available for this workspace.`
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to delete backup: ${msg}`);
    }
}

// ── Activation trigger (modal on detection) ───────────────────────

const REMIND_LATER_KEY = 'alex-act.migration.remindLaterUntil';
const DONT_ASK_KEY = 'alex-act.migration.dontAsk';

async function checkActivationTrigger(context) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    const workspaceRoot = folders[0].uri.fsPath;

    // Don't fire if already migrated or already an ACT heir
    const markerPath = path.join(workspaceRoot, '.github', '.act-heir.json');
    if (fs.existsSync(markerPath)) return;

    // "Don't ask again" check (workspace-scoped)
    if (context.workspaceState.get(DONT_ASK_KEY) === true) return;

    // "Remind me later" check
    const remindUntil = context.workspaceState.get(REMIND_LATER_KEY);
    if (typeof remindUntil === 'number' && Date.now() < remindUntil) return;

    const detection = detectAlexMaster(workspaceRoot);
    if (!detection.detected) return;

    const pick = await vscode.window.showInformationMessage(
        `This workspace looks like an AlexMaster install (${detection.strongHits.length} signal(s) matched). ` +
        `Migrate it to ACT Edition? Non-destructive — full backup is taken first.`,
        'Migrate now',
        'Remind me later',
        "Don't ask again",
    );

    if (pick === 'Migrate now') {
        await migrateFromAlexMaster();
    } else if (pick === 'Remind me later') {
        // 7 days
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        await context.workspaceState.update(REMIND_LATER_KEY, Date.now() + sevenDays);
    } else if (pick === "Don't ask again") {
        await context.workspaceState.update(DONT_ASK_KEY, true);
    }
}

module.exports = {
    // Commands
    migrateFromAlexMaster,
    rollbackMigration,
    cleanMigrationBackup,
    // Activation
    registerDeprecatedStubs,
    checkActivationTrigger,
    // For testing / dry-run
    detectAlexMaster,
    classifyFiles,
    loadV840Index,
    DEPRECATED_COMMANDS,
    SETTING_TRANSLATIONS,
};
