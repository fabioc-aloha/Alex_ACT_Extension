'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const ignorePath = path.join(root, '.vscodeignore');

test('Marketplace identity keeps its stable ID and descriptive display name', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    assert.equal(packageJson.publisher, 'fabioc-aloha');
    assert.equal(packageJson.name, 'alex-cognitive-architecture');
    assert.equal(
        packageJson.displayName,
        'Alex: Artificial Critical Thinking for GitHub Copilot'
    );
});

function readIgnoreLines() {
    return fs.readFileSync(ignorePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
}

test('.vscodeignore is committed and excludes non-runtime payloads', () => {
    assert.equal(fs.existsSync(ignorePath), true);

    const lines = new Set(readIgnoreLines());
    for (const required of [
        'brain/**',
        'test/**',
        'scripts/**',
        '.vscode/**',
        '*.tmp',
        '.github',
        'build-extension.cjs',
        '.act-protected.json',
    ]) {
        assert.equal(lines.has(required), true, `${required} must stay excluded from VSIX`);
    }
});

test('build-extension uses non-interactive @vscode/vsce packaging command', () => {
    const buildScript = fs.readFileSync(path.join(root, 'build-extension.cjs'), 'utf8');

    assert.match(buildScript, /const NPX_CLI = process\.platform === 'win32'/);
    assert.match(buildScript, /const packageCommand = NPX_CLI \? process\.execPath : 'npx';/);
    assert.match(buildScript, /execFileSync\(packageCommand, packageArgs/);
    assert.doesNotMatch(buildScript, /shell: true|shell: process\.platform/);
    assert.match(buildScript, /process\.exitCode = 1;/);
    assert.doesNotMatch(buildScript, /npx\.cmd/);
    assert.doesNotMatch(buildScript, /npx vsce package/);
});
