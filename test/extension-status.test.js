'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const Module = require('module');

const vscodeStub = {
    window: {},
    workspace: {},
    commands: {},
    StatusBarAlignment: { Right: 1 },
    ProgressLocation: { Notification: 1 },
    Uri: { file: (filePath) => ({ fsPath: filePath }) },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return vscodeStub;
    }
    return originalLoad.call(this, request, parent, isMain);
};

let extension;
try {
    extension = require('../extension');
} finally {
    Module._load = originalLoad;
}

const {
    getAvailableEditionVersion,
    formatBootstrapFailureMessage,
    getConverterOutputPath,
    confirmConverterOverwrite,
    withLockHeartbeat,
    _cmdBootstrapBody,
    setBrainDirForTest,
    setFetchProvenanceForTest,
    setExtensionContextForTest,
} = extension._internal;

function writeFile(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}

test('getAvailableEditionVersion: returns cached latest tag when bundled brain is absent', () => {
    const ctx = {
        globalState: {
            get: () => ({ tag: 'v3.8.0' }),
        },
    };

    assert.equal(getAvailableEditionVersion(ctx), '3.8.0');
});

test('getAvailableEditionVersion: returns empty string when no bundle and no cache', () => {
    const ctx = {
        globalState: {
            get: () => null,
        },
    };

    assert.equal(getAvailableEditionVersion(ctx), '');
});

test('getAvailableEditionVersion: prefers fetched/bundled BRAIN_DIR version when present', () => {
    const brainRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'act-brain-'));
    try {
        fs.writeFileSync(path.join(brainRoot, 'VERSION'), '4.0.0\n');
        assert.equal(getAvailableEditionVersion({ globalState: { get: () => ({ tag: 'v3.8.0' }) } }, brainRoot), '4.0.0');
    } finally {
        fs.rmSync(brainRoot, { recursive: true, force: true });
    }
});

test('formatBootstrapFailureMessage: tells user marker was not created', () => {
    const message = formatBootstrapFailureMessage(
        [{ rel: '.github/copilot-instructions.md', err: 'EACCES' }],
        [{ rel: '.vscode/settings.json', err: 'EPERM' }]
    );

    assert.match(message, /failed before creating the heir marker/);
    assert.match(message, /brain file \.github\/copilot-instructions\.md: EACCES/);
    assert.match(message, /bootstrap template \.vscode\/settings\.json: EPERM/);
});

test('getConverterOutputPath: replaces extension with converter output extension', () => {
    const output = getConverterOutputPath('C:/work/docs/readme.md', { ext: '.docx' });

    assert.equal(output.replace(/\\/g, '/'), 'C:/work/docs/readme.docx');
});

test('confirmConverterOverwrite: allows when output file is absent', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'converter-overwrite-'));
    try {
        const outputPath = path.join(root, 'missing.docx');
        let prompted = false;
        vscodeStub.window.showWarningMessage = async () => { prompted = true; return 'Overwrite'; };

        assert.equal(await confirmConverterOverwrite(outputPath, 'Word'), true);
        assert.equal(prompted, false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('confirmConverterOverwrite: prompts and respects cancel when output exists', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'converter-overwrite-'));
    try {
        const outputPath = path.join(root, 'existing.docx');
        fs.writeFileSync(outputPath, 'old');
        vscodeStub.window.showWarningMessage = async () => undefined;

        assert.equal(await confirmConverterOverwrite(outputPath, 'Word'), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('confirmConverterOverwrite: prompts and allows explicit overwrite', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'converter-overwrite-'));
    try {
        const outputPath = path.join(root, 'existing.docx');
        fs.writeFileSync(outputPath, 'old');
        vscodeStub.window.showWarningMessage = async () => 'Overwrite';

        assert.equal(await confirmConverterOverwrite(outputPath, 'Word'), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('withLockHeartbeat: clears heartbeat interval after work completes', async () => {
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    let intervalStarted = false;
    let cleared = false;
    let touched = 0;
    const fakeTimer = { id: 'timer' };

    try {
        global.setInterval = (fn) => {
            intervalStarted = true;
            fn();
            return fakeTimer;
        };
        global.clearInterval = (timer) => {
            if (timer === fakeTimer) cleared = true;
        };

        const result = await withLockHeartbeat(
            { touch: () => { touched += 1; } },
            async () => 'done'
        );

        assert.equal(result, 'done');
        assert.equal(intervalStarted, true);
        assert.equal(touched, 1);
        assert.equal(cleared, true);
    } finally {
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
    }
});

test('_cmdBootstrapBody: installs via production copy loop without leaking HEIR_OWNED paths', async () => {
    const editionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'edition-root-'));
    const brainDir = path.join(editionRoot, '.github');
    const heirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heir-root-'));
    const priorWarning = vscodeStub.window.showWarningMessage;
    const priorInfo = vscodeStub.window.showInformationMessage;
    const priorInput = vscodeStub.window.showInputBox;
    const priorProgress = vscodeStub.window.withProgress;
    const priorCommands = vscodeStub.commands.executeCommand;

    try {
        writeFile(path.join(brainDir, 'VERSION'), '3.8.0\n');
        writeFile(path.join(brainDir, 'copilot-instructions.md'), '# Brain\n');
        writeFile(path.join(brainDir, 'instructions', 'x.instructions.md'), 'rule');
        writeFile(path.join(brainDir, 'workflows', 'leak.yml'), 'name: should not copy');
        writeFile(path.join(brainDir, 'dependabot.yml'), 'version: 2');
        writeFile(path.join(brainDir, 'config', 'edition-manifest.json'), JSON.stringify({
            vscode_assets: ['markdown-light.css'],
            bootstrap_templates: ['.github/config/cognitive-config.json', '.vscode/settings.json'],
        }, null, 2));
        writeFile(path.join(brainDir, 'scripts', '_registry.cjs'), 'module.exports = { HEIR_OWNED: [".github/workflows/**", ".github/dependabot.yml"], EDITION_OWNED: [".github/**", ".vscode/markdown-light.css"] };');
        writeFile(path.join(editionRoot, '.vscode', 'markdown-light.css'), 'body{}');
        writeFile(path.join(editionRoot, '.vscode', 'settings.json'), '{\n  "editor.tabSize": 4\n}\n');
        writeFile(path.join(__dirname, '..', 'templates', 'cognitive-config.json'), '{\n  "showConfidenceBadge": false\n}\n');

        setBrainDirForTest(brainDir);
        setFetchProvenanceForTest({ source: 'github-fetch', tag: 'v3.8.0', commitSha: 'abc123', authMode: 'anonymous', tarballRoot: editionRoot });
        setExtensionContextForTest({ extension: { packageJSON: { version: '9.5.6' } } });

        vscodeStub.window.showInputBox = async (opts) => opts && opts.prompt && opts.prompt.startsWith('Heir ID') ? 'test-heir' : 'Test Heir';
        vscodeStub.window.showWarningMessage = async (_message, _opts, ...items) => items.includes('Bootstrap') ? 'Bootstrap' : undefined;
        vscodeStub.window.showInformationMessage = async () => undefined;
        vscodeStub.window.withProgress = async (_opts, task) => task({ report() {} });
        vscodeStub.commands.executeCommand = async () => undefined;

        await _cmdBootstrapBody(heirRoot);

        assert.equal(fs.existsSync(path.join(heirRoot, '.github', 'copilot-instructions.md')), true);
        assert.equal(fs.existsSync(path.join(heirRoot, '.github', 'instructions', 'x.instructions.md')), true);
        assert.equal(fs.existsSync(path.join(heirRoot, '.github', 'workflows', 'leak.yml')), false);
        assert.equal(fs.existsSync(path.join(heirRoot, '.github', 'dependabot.yml')), false);
        assert.equal(fs.existsSync(path.join(heirRoot, '.vscode', 'markdown-light.css')), true);
        assert.equal(fs.existsSync(path.join(heirRoot, '.vscode', 'settings.json')), true);
        assert.equal(fs.existsSync(path.join(heirRoot, '.github', 'config', 'cognitive-config.json')), true);

        const marker = JSON.parse(fs.readFileSync(path.join(heirRoot, '.github', '.act-heir.json'), 'utf8'));
        assert.equal(marker.heir_id, 'test-heir');
        assert.equal(marker.edition_version, '3.8.0');
        assert.equal(marker.source, 'github-fetch');
        assert.equal(marker.extension_version, '9.5.6');
    } finally {
        vscodeStub.window.showWarningMessage = priorWarning;
        vscodeStub.window.showInformationMessage = priorInfo;
        vscodeStub.window.showInputBox = priorInput;
        vscodeStub.window.withProgress = priorProgress;
        vscodeStub.commands.executeCommand = priorCommands;
        setFetchProvenanceForTest(null);
        setExtensionContextForTest(null);
        fs.rmSync(editionRoot, { recursive: true, force: true });
        fs.rmSync(heirRoot, { recursive: true, force: true });
    }
});
