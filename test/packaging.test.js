'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const ignorePath = path.join(root, '.vscodeignore');

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

    assert.match(buildScript, /execFileSync\('npx', \['--yes', '@vscode\/vsce', 'package'\]/);
    assert.doesNotMatch(buildScript, /npx vsce package/);
});
