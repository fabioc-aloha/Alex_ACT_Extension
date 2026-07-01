'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(filePath) {
    return fs.readFileSync(path.join(root, filePath), 'utf8');
}

test('semantic: static-fetch contract has exactly one hardcoded Edition source', () => {
    const source = read('lib/edition-source.js');
    const extension = read('extension.js');
    const build = read('build-extension.cjs');

    assert.match(source, /owner:\s*'fabioc-aloha'/);
    assert.match(source, /repo:\s*'Alex_ACT_Edition'/);
    assert.doesNotMatch(extension, /Alex_ACT_Edition/);
    assert.match(build, /Alex_ACT_Edition\.git/);
});

test('semantic: static-fetch runtime does not require a bundled brain directory', () => {
    const extension = read('extension.js');
    const ignore = read('.vscodeignore');
    const build = read('build-extension.cjs');

    assert.match(extension, /function isStaticFetchMode\(\)/);
    assert.match(extension, /ensureBrainDir/);
    assert.match(ignore, /^brain\/\*\*/m);
    assert.match(build, /no longer copy brain files into the Extension repo/);
});

test('semantic: fetched registry policy is treated as data, not executable code', () => {
    const install = read('lib/edition-install.js');
    const host = read('extension.js');

    assert.match(install, /manifestRaw\.heir_owned/);
    assert.match(install, /readFileSync\(regPath, 'utf8'\)/);
    assert.doesNotMatch(install, /require\(regPath\)/);
    assert.doesNotMatch(host, /require\(path\.join\(BRAIN_DIR, 'scripts', '_registry\.cjs'\)\)/);
});

test('semantic: Marketplace package excludes source-only and repo-local surfaces', () => {
    const ignore = read('.vscodeignore');

    for (const pattern of ['.github', 'brain/**', 'test/**', 'scripts/**', '.vscode/**', '*.tmp', 'build-extension.cjs', '.act-protected.json']) {
        assert.match(ignore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    }
});

test('semantic: user-visible commands remain registered for every package contribution', () => {
    const pkg = JSON.parse(read('package.json'));
    const extension = read('extension.js');

    for (const item of pkg.contributes.commands) {
        if (item.command.startsWith('alex-act.convert.')) {
            assert.match(extension, /vscode\.commands\.registerCommand\(`alex-act\.convert\.\$\{id\}`/);
            continue;
        }
        assert.match(extension, new RegExp(item.command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
});
