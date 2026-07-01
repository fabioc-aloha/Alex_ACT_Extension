// @ts-check
'use strict';

/**
 * Static-fetch era migration surface.
 *
 * The old AlexMaster -> ACT Edition migration installer depended on a bundled
 * Edition brain and v8.4.0 migration manifests. Post-ADR-009 the VSIX ships
 * no brain, so the migration command is intentionally retired. Rollback and
 * backup cleanup remain for workspaces that already migrated with an older
 * Extension build.
 */

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const MIGRATION_RETIRED_MESSAGE =
    'AlexMaster migration is retired in the static-fetch Extension. ' +
    'Install the latest ACT Edition in a fresh workspace with "ACT: Bootstrap This Workspace", then manually copy any old local customizations you still need.';

// AlexMaster v8.4.0 command IDs retained as deprecated stubs so old keybindings
// and command-palette muscle memory surface a helpful message instead of failing.
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

function readJsonSafe(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

async function migrateFromAlexMaster() {
    vscode.window.showWarningMessage(MIGRATION_RETIRED_MESSAGE);
}

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
        `* Current .github/ will be DELETED\n` +
        `* Backup at ${marker.backupPath}/ will be restored\n` +
        `* ACT Edition extension stays installed; you can re-run migration later.`,
        { modal: true },
        'Roll back',
    );
    if (confirm !== 'Roll back') return;

    try {
        const ghDir = path.join(workspaceRoot, '.github');
        fs.rmSync(ghDir, { recursive: true, force: true });
        fs.cpSync(backupDir, ghDir, { recursive: true });

        const settingsBak = path.join(backupDir, 'settings.json.bak');
        const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
        if (fs.existsSync(settingsBak)) {
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
            fs.copyFileSync(settingsBak, settingsPath);
        }

        vscode.window.showInformationMessage(
            `Rolled back to ${marker.migratedFrom} state. MIGRATION-REVIEW.md left at workspace root for reference.`
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Rollback failed: ${msg}`);
    }
}

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
        `* Once deleted, rollback is no longer possible.\n` +
        `* Only do this when you are confident the migration is complete.`,
        { modal: true },
        'Delete backup',
    );
    if (confirm !== 'Delete backup') return;

    try {
        fs.rmSync(backupDir, { recursive: true, force: true });
        delete marker.backupPath;
        fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');
        vscode.window.showInformationMessage(
            'Migration backup deleted. Rollback is no longer available for this workspace.'
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to delete backup: ${msg}`);
    }
}

async function checkActivationTrigger(_context) {
    // Static-fetch Extension no longer bundles an Edition brain, so the old
    // AlexMaster migration installer is intentionally retired. Do not prompt
    // users into a destructive migration path during activation.
}

module.exports = {
    migrateFromAlexMaster,
    rollbackMigration,
    cleanMigrationBackup,
    registerDeprecatedStubs,
    checkActivationTrigger,
    DEPRECATED_COMMANDS,
    MIGRATION_RETIRED_MESSAGE,
};
