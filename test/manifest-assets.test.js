'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installVscodeAssets, seedBootstrapTemplates } = require('../lib/manifest-assets');

function makeDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root, rel, content) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
}

function read(root, rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('installVscodeAssets refreshes declared VS Code asset from Edition root', () => {
    const editionRoot = makeDir('edition-assets-');
    const heirRoot = makeDir('heir-assets-');
    try {
        write(editionRoot, '.vscode/markdown-light.css', 'edition-css');
        write(heirRoot, '.vscode/markdown-light.css', 'stale-css');
        const copied = installVscodeAssets(heirRoot, { vscode_assets: ['markdown-light.css'] }, editionRoot);
        assert.deepEqual(copied, ['.vscode/markdown-light.css']);
        assert.equal(read(heirRoot, '.vscode/markdown-light.css'), 'edition-css');
    } finally {
        fs.rmSync(editionRoot, { recursive: true, force: true });
        fs.rmSync(heirRoot, { recursive: true, force: true });
    }
});

test('installVscodeAssets skips missing source asset without throwing', () => {
    const editionRoot = makeDir('edition-assets-missing-');
    const heirRoot = makeDir('heir-assets-missing-');
    try {
        const copied = installVscodeAssets(heirRoot, { vscode_assets: ['markdown-light.css'] }, editionRoot);
        assert.deepEqual(copied, []);
        assert.equal(fs.existsSync(path.join(heirRoot, '.vscode/markdown-light.css')), false);
    } finally {
        fs.rmSync(editionRoot, { recursive: true, force: true });
        fs.rmSync(heirRoot, { recursive: true, force: true });
    }
});

test('seedBootstrapTemplates copies .github template from templates dir and .vscode templates from Edition root', () => {
    const editionRoot = makeDir('edition-templates-');
    const heirRoot = makeDir('heir-templates-');
    const templatesDir = makeDir('extension-templates-');
    try {
        write(templatesDir, 'cognitive-config.json', '{"from":"templates"}');
        write(editionRoot, '.vscode/extensions.json', '{"from":"edition-extensions"}');
        write(editionRoot, '.vscode/settings.json', '{"from":"edition-settings"}');
        const manifest = {
            bootstrap_templates: [
                '.github/config/cognitive-config.json',
                '.vscode/extensions.json',
                '.vscode/settings.json',
            ],
        };
        const result = seedBootstrapTemplates(heirRoot, manifest, editionRoot, templatesDir, null);
        assert.deepEqual(result.failures, []);
        assert.deepEqual(result.seeded.sort(), manifest.bootstrap_templates.slice().sort());
        assert.equal(read(heirRoot, '.github/config/cognitive-config.json'), '{"from":"templates"}');
        assert.equal(read(heirRoot, '.vscode/extensions.json'), '{"from":"edition-extensions"}');
        assert.equal(read(heirRoot, '.vscode/settings.json'), '{"from":"edition-settings"}');
    } finally {
        fs.rmSync(editionRoot, { recursive: true, force: true });
        fs.rmSync(heirRoot, { recursive: true, force: true });
        fs.rmSync(templatesDir, { recursive: true, force: true });
    }
});

test('seedBootstrapTemplates does not overwrite existing heir-owned templates', () => {
    const editionRoot = makeDir('edition-templates-existing-');
    const heirRoot = makeDir('heir-templates-existing-');
    const templatesDir = makeDir('extension-templates-existing-');
    try {
        write(editionRoot, '.vscode/extensions.json', '{"from":"edition"}');
        write(heirRoot, '.vscode/extensions.json', '{"from":"heir"}');
        const result = seedBootstrapTemplates(
            heirRoot,
            { bootstrap_templates: ['.vscode/extensions.json'] },
            editionRoot,
            templatesDir,
            null
        );
        assert.deepEqual(result.seeded, []);
        assert.deepEqual(result.failures, []);
        assert.equal(read(heirRoot, '.vscode/extensions.json'), '{"from":"heir"}');
    } finally {
        fs.rmSync(editionRoot, { recursive: true, force: true });
        fs.rmSync(heirRoot, { recursive: true, force: true });
        fs.rmSync(templatesDir, { recursive: true, force: true });
    }
});

test('seedBootstrapTemplates respects alreadyOwned snapshot during upgrade', () => {
    const editionRoot = makeDir('edition-templates-owned-');
    const heirRoot = makeDir('heir-templates-owned-');
    const templatesDir = makeDir('extension-templates-owned-');
    try {
        write(editionRoot, '.vscode/settings.json', '{"from":"edition"}');
        const result = seedBootstrapTemplates(
            heirRoot,
            { bootstrap_templates: ['.vscode/settings.json'] },
            editionRoot,
            templatesDir,
            new Set(['.vscode/settings.json'])
        );
        assert.deepEqual(result.seeded, []);
        assert.deepEqual(result.failures, []);
        assert.equal(fs.existsSync(path.join(heirRoot, '.vscode/settings.json')), false);
    } finally {
        fs.rmSync(editionRoot, { recursive: true, force: true });
        fs.rmSync(heirRoot, { recursive: true, force: true });
        fs.rmSync(templatesDir, { recursive: true, force: true });
    }
});
