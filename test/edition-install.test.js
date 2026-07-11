// @ts-check
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    readAndValidateManifest,
    acquireLock,
    getLockPath,
    installFromTarball,
    installEditionPayload,
    applyStaticFetchMarkerFields,
    MANIFEST_REL_PATH
} = require('../lib/edition-install');

// ── Test helpers ──────────────────────────────────────────────────────

function setupTarballRoot(manifestObj, subtrees) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
    if (manifestObj !== undefined) {
        const mp = path.join(root, MANIFEST_REL_PATH);
        fs.mkdirSync(path.dirname(mp), { recursive: true });
        fs.writeFileSync(mp, JSON.stringify(manifestObj, null, 2));
    }
    if (subtrees) {
        for (const [sub, files] of Object.entries(subtrees)) {
            const subAbs = path.join(root, sub);
            fs.mkdirSync(subAbs, { recursive: true });
            for (const [rel, content] of Object.entries(/** @type {Record<string,string>} */ (files))) {
                const fp = path.join(subAbs, rel);
                fs.mkdirSync(path.dirname(fp), { recursive: true });
                fs.writeFileSync(fp, content);
            }
        }
    }
    return root;
}

function cleanup(root) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
}

function validManifest(overrides) {
    return {
        spec_version: '1.4',
        edition_version: '3.2.0',
        min_extension_version: '9.4.0',
        brain_subtrees: ['.github'],
        marker_schema: { file_name: '.act-heir.json', version: 2 },
        ...overrides
    };
}

// ── readAndValidateManifest ───────────────────────────────────────────

test('manifest: happy path', () => {
    const root = setupTarballRoot(validManifest(), { '.github': { 'placeholder.md': 'x' } });
    try {
        const m = readAndValidateManifest(root, '9.4.0', 'v3.2.0');
        assert.equal(m.edition_version, '3.2.0');
        assert.equal(m.min_extension_version, '9.4.0');
        assert.deepEqual(m.brain_subtrees, ['.github']);
    } finally { cleanup(root); }
});

test('manifest: missing file → MANIFEST_MISSING', () => {
    const root = setupTarballRoot(undefined, { '.github': { 'placeholder.md': 'x' } });
    try {
        assert.throws(
            () => readAndValidateManifest(root, '9.4.0'),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_MISSING'
        );
    } finally { cleanup(root); }
});

test('manifest: bad JSON → MANIFEST_UNPARSEABLE', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
    try {
        const mp = path.join(root, MANIFEST_REL_PATH);
        fs.mkdirSync(path.dirname(mp), { recursive: true });
        fs.writeFileSync(mp, 'NOT JSON {');
        assert.throws(
            () => readAndValidateManifest(root, '9.4.0'),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_UNPARSEABLE'
        );
    } finally { cleanup(root); }
});

test('manifest: unsupported spec_version → MANIFEST_SCHEMA_UNSUPPORTED', () => {
    const root = setupTarballRoot(validManifest({ spec_version: '99.0' }), { '.github': { 'x.md': 'x' } });
    try {
        assert.throws(
            () => readAndValidateManifest(root, '9.4.0'),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_SCHEMA_UNSUPPORTED'
        );
    } finally { cleanup(root); }
});

test('manifest: legacy null contract fields → MANIFEST_MISSING_CONTRACT_FIELDS', () => {
    const root = setupTarballRoot(validManifest({ min_extension_version: null }), { '.github': { 'x.md': 'x' } });
    try {
        assert.throws(
            () => readAndValidateManifest(root, '9.4.0'),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_MISSING_CONTRACT_FIELDS'
        );
    } finally { cleanup(root); }
});

test('manifest: edition_version mismatch with fetched tag → MANIFEST_VERSION_MISMATCH', () => {
    const root = setupTarballRoot(validManifest({ edition_version: '3.2.0' }), { '.github': { 'x.md': 'x' } });
    try {
        assert.throws(
            () => readAndValidateManifest(root, '9.4.0', 'v3.3.0'),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_VERSION_MISMATCH'
        );
    } finally { cleanup(root); }
});

test('manifest: extension too old → EXTENSION_TOO_OLD', () => {
    const root = setupTarballRoot(validManifest({ min_extension_version: '10.0.0' }), { '.github': { 'x.md': 'x' } });
    try {
        assert.throws(
            () => readAndValidateManifest(root, '9.4.0'),
            (err) => /** @type {any} */ (err).code === 'EXTENSION_TOO_OLD'
        );
    } finally { cleanup(root); }
});

test('manifest: brain_subtrees with .. → MANIFEST_INVALID_SUBTREE', () => {
    const root = setupTarballRoot(validManifest({ brain_subtrees: ['../escape'] }), { '.github': { 'x.md': 'x' } });
    try {
        assert.throws(
            () => readAndValidateManifest(root, '9.4.0'),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_INVALID_SUBTREE'
        );
    } finally { cleanup(root); }
});

test('manifest: brain_subtrees points at non-existent dir → MANIFEST_SUBTREE_MISSING', () => {
    const root = setupTarballRoot(validManifest({ brain_subtrees: ['.github', 'ACT'] }), { '.github': { 'x.md': 'x' } });
    try {
        assert.throws(
            () => readAndValidateManifest(root, '9.4.0'),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_SUBTREE_MISSING'
        );
    } finally { cleanup(root); }
});

test('manifest: empty brain_subtrees → MANIFEST_MISSING_CONTRACT_FIELDS', () => {
    const root = setupTarballRoot(validManifest({ brain_subtrees: [] }), { '.github': { 'x.md': 'x' } });
    try {
        assert.throws(
            () => readAndValidateManifest(root, '9.4.0'),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_MISSING_CONTRACT_FIELDS'
        );
    } finally { cleanup(root); }
});

test('manifest: marker_schema.file_name must be .act-heir.json', () => {
    const badNames = ['../outside.json', '/tmp/outside.json', '.github/.act-heir.json', 'nested/.act-heir.json'];
    for (const fileName of badNames) {
        const root = setupTarballRoot(validManifest({ marker_schema: { file_name: fileName, version: 2 } }), { '.github': { 'x.md': 'x' } });
        try {
            assert.throws(
                () => readAndValidateManifest(root, '9.4.0'),
                (err) => /** @type {any} */ (err).code === 'MANIFEST_INVALID_MARKER_SCHEMA',
                `expected ${fileName} to be rejected`
            );
        } finally { cleanup(root); }
    }
});

// ── acquireLock ────────────────────────────────────────────────────────

test('lock: take → release works', () => {
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const lock = acquireLock(heir);
        assert.equal(fs.existsSync(lock.path), true);
        lock.release();
        assert.equal(fs.existsSync(lock.path), false);
    } finally { cleanup(heir); }
});

test('lock: second concurrent acquire → CONCURRENT_UPGRADE', () => {
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const lock1 = acquireLock(heir);
        try {
            assert.throws(
                () => acquireLock(heir),
                (err) => /** @type {any} */ (err).code === 'CONCURRENT_UPGRADE'
            );
        } finally {
            lock1.release();
        }
    } finally { cleanup(heir); }
});

test('lock: touch refreshes mtime so long-running upgrade lock stays active', () => {
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const lock = acquireLock(heir);
        try {
            const oldTime = (Date.now() - 11 * 60 * 1000) / 1000;
            fs.utimesSync(lock.path, oldTime, oldTime);
            lock.touch();

            assert.throws(
                () => acquireLock(heir),
                (err) => /** @type {any} */ (err).code === 'CONCURRENT_UPGRADE'
            );
        } finally {
            lock.release();
        }
    } finally { cleanup(heir); }
});

test('lock: stale lock (>10min mtime) broken atomically', () => {
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        // Manually create a stale lock at the heir's computed tmpdir path with old mtime.
        const lockPath = getLockPath(heir);
        fs.writeFileSync(lockPath, '{"stale": true}');
        const oldTime = (Date.now() - 11 * 60 * 1000) / 1000;
        fs.utimesSync(lockPath, oldTime, oldTime);

        // Should succeed by breaking the stale lock.
        const lock = acquireLock(heir);
        lock.release();
        assert.equal(fs.existsSync(lockPath), false);
    } finally { cleanup(heir); }
});

test('lock: getLockPath lives under os.tmpdir, not under heirRoot (audit F9)', () => {
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const lockPath = getLockPath(heir);
        // Lock must NOT be under the heir workspace (would pollute git status).
        assert.equal(lockPath.startsWith(heir + path.sep), false, 'lockfile must not live under heir root');
        // Lock must be under the system temp dir.
        assert.equal(lockPath.startsWith(os.tmpdir() + path.sep), true, 'lockfile must live under os.tmpdir()');
        // Lock filename pattern is stable: alex-act-upgrade-<hex>.lock
        assert.match(path.basename(lockPath), /^alex-act-upgrade-[0-9a-f]{16}\.lock$/);
    } finally { cleanup(heir); }
});

test('lock: getLockPath is deterministic and path-canonicalised', () => {
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        // Same input -> same hash -> same path
        assert.equal(getLockPath(heir), getLockPath(heir));
        // Resolved variants of the same path -> same hash
        const trailing = heir.endsWith(path.sep) ? heir : heir + path.sep;
        assert.equal(getLockPath(heir), getLockPath(trailing.slice(0, -1)));
        // Different workspaces -> different locks
        const heir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
        try {
            assert.notEqual(getLockPath(heir), getLockPath(heir2));
        } finally { cleanup(heir2); }
    } finally { cleanup(heir); }
});

// ── shared payload installer ───────────────────────────────────────────

test('payload: static-fetch copies declared subtree, filters HEIR_OWNED, and refreshes assets', () => {
    const manifest = validManifest({
        heir_owned: ['.github/workflows/**'],
        vscode_assets: ['markdown-light.css'],
        bootstrap_templates: [],
    });
    const edition = setupTarballRoot(manifest, {
        '.github': {
            'instructions/x.instructions.md': 'rule',
            'workflows/leak.yml': 'do not copy',
        },
    });
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'payload-heir-'));
    try {
        fs.mkdirSync(path.join(edition, '.vscode'), { recursive: true });
        fs.writeFileSync(path.join(edition, '.vscode', 'markdown-light.css'), 'body{}');
        const result = installEditionPayload({ editionRoot: edition, heirRoot: heir, manifest });
        assert.equal(fs.existsSync(path.join(heir, '.github', 'instructions', 'x.instructions.md')), true);
        assert.equal(fs.existsSync(path.join(heir, '.github', 'workflows', 'leak.yml')), false);
        assert.equal(fs.readFileSync(path.join(heir, '.vscode', 'markdown-light.css'), 'utf8'), 'body{}');
        assert.equal(result.heirOwnedSkipped, 1);
    } finally {
        cleanup(edition);
        cleanup(heir);
    }
});

test('payload: legacy flattened brain installs as virtual .github subtree', () => {
    const brain = fs.mkdtempSync(path.join(os.tmpdir(), 'payload-brain-'));
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'payload-heir-'));
    try {
        fs.mkdirSync(path.join(brain, 'prompts'), { recursive: true });
        fs.writeFileSync(path.join(brain, 'prompts', 'x.prompt.md'), 'prompt');
        const result = installEditionPayload({
            brainDir: brain,
            heirRoot: heir,
            manifest: { bootstrap_templates: [], vscode_assets: [] },
        });
        assert.equal(fs.readFileSync(path.join(heir, '.github', 'prompts', 'x.prompt.md'), 'utf8'), 'prompt');
        assert.deepEqual(result.subtreesCopied, ['.github']);
    } finally {
        cleanup(brain);
        cleanup(heir);
    }
});

test('payload: upgrade alreadyOwned set preserves an existing bootstrap template', () => {
    const manifest = validManifest({
        vscode_assets: [],
        bootstrap_templates: ['.vscode/settings.json'],
    });
    const edition = setupTarballRoot(manifest, { '.github': { 'VERSION': '3.2.0' } });
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'payload-heir-'));
    try {
        fs.mkdirSync(path.join(edition, '.vscode'), { recursive: true });
        fs.writeFileSync(path.join(edition, '.vscode', 'settings.json'), '{"edition":true}');
        fs.mkdirSync(path.join(heir, '.vscode'), { recursive: true });
        fs.writeFileSync(path.join(heir, '.vscode', 'settings.json'), '{"heir":true}');
        const result = installEditionPayload({
            editionRoot: edition,
            heirRoot: heir,
            manifest,
            alreadyOwned: new Set(['.vscode/settings.json']),
        });
        assert.equal(fs.readFileSync(path.join(heir, '.vscode', 'settings.json'), 'utf8'), '{"heir":true}');
        assert.deepEqual(result.bootstrapTemplatesInstalled, []);
    } finally {
        cleanup(edition);
        cleanup(heir);
    }
});

// ── installFromTarball ─────────────────────────────────────────────────

test('install: copies subtree and writes marker', () => {
    const tarball = setupTarballRoot(validManifest(), {
        '.github': {
            'instructions/x.instructions.md': 'inst-content',
            'config/cognitive-config.json': '{}'
        }
    });
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const result = installFromTarball(tarball, heir, '9.4.0', {
            fetchedTag: 'v3.2.0',
            commitSha: 'abc123',
            authMode: 'authenticated',
            heirIdentity: { heir_id: 'test-heir', owner: 'me' }
        });

        // Subtree copied
        assert.equal(
            fs.readFileSync(path.join(heir, '.github', 'instructions', 'x.instructions.md'), 'utf8'),
            'inst-content'
        );

        // Marker written with all expected fields
        const marker = JSON.parse(fs.readFileSync(path.join(heir, '.act-heir.json'), 'utf8'));
        assert.equal(marker.heir_id, 'test-heir');
        assert.equal(marker.owner, 'me');
        assert.equal(marker.edition_version, '3.2.0');
        assert.equal(marker.source, 'github-fetch');
        assert.equal(marker.commit_sha, 'abc123');
        assert.equal(marker.auth_mode, 'authenticated');
        assert.equal(marker.extension_version, '9.4.0');
        assert.equal(marker.marker_schema_version, 2);
        assert.match(marker.fetched_at, /^\d{4}-\d{2}-\d{2}T/);
        assert.deepEqual(result.subtreesCopied, ['.github']);
    } finally { cleanup(tarball); cleanup(heir); }
});

test('install: preserves heir identity from existing marker', () => {
    const tarball = setupTarballRoot(validManifest(), { '.github': { 'a.md': 'a' } });
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        // Pre-existing marker with identity fields
        fs.writeFileSync(path.join(heir, '.act-heir.json'), JSON.stringify({
            heir_id: 'preserved-heir',
            owner: 'preserved-owner',
            repo_url: 'https://example.com/repo'
        }));
        // Pre-existing .github with content that should be replaced
        fs.mkdirSync(path.join(heir, '.github'));
        fs.writeFileSync(path.join(heir, '.github', 'should-be-gone.txt'), 'stale');

        installFromTarball(tarball, heir, '9.4.0', { fetchedTag: 'v3.2.0' });

        const marker = JSON.parse(fs.readFileSync(path.join(heir, '.act-heir.json'), 'utf8'));
        assert.equal(marker.heir_id, 'preserved-heir');
        assert.equal(marker.owner, 'preserved-owner');
        assert.equal(marker.repo_url, 'https://example.com/repo');
        // Old subtree content gone
        assert.equal(fs.existsSync(path.join(heir, '.github', 'should-be-gone.txt')), false);
        // New subtree content present
        assert.equal(fs.readFileSync(path.join(heir, '.github', 'a.md'), 'utf8'), 'a');
    } finally { cleanup(tarball); cleanup(heir); }
});

test('install: refuses to write when manifest is invalid (heir unchanged)', () => {
    const tarball = setupTarballRoot(validManifest({ min_extension_version: '99.0.0' }), {
        '.github': { 'a.md': 'a' }
    });
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        fs.mkdirSync(path.join(heir, '.github'));
        fs.writeFileSync(path.join(heir, '.github', 'preserved.txt'), 'do not touch');

        assert.throws(
            () => installFromTarball(tarball, heir, '9.4.0', { fetchedTag: 'v3.2.0' }),
            (err) => /** @type {any} */ (err).code === 'EXTENSION_TOO_OLD'
        );

        // Pre-existing heir state preserved — install ran no destructive op
        assert.equal(
            fs.readFileSync(path.join(heir, '.github', 'preserved.txt'), 'utf8'),
            'do not touch'
        );
    } finally { cleanup(tarball); cleanup(heir); }
});

// ── vscode_assets + bootstrap_templates (ADR-009 amendment 2026-06-09) ──

function setupTarballWithVscodeAssets(manifestOverrides, vscodeFiles) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
    const mp = path.join(root, MANIFEST_REL_PATH);
    fs.mkdirSync(path.dirname(mp), { recursive: true });
    fs.writeFileSync(mp, JSON.stringify(validManifest(manifestOverrides), null, 2));
    // brain_subtrees content
    fs.mkdirSync(path.join(root, '.github'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github', 'placeholder.md'), 'x');
    // .vscode/ content
    if (vscodeFiles) {
        const vsDir = path.join(root, '.vscode');
        fs.mkdirSync(vsDir, { recursive: true });
        for (const [name, content] of Object.entries(vscodeFiles)) {
            fs.writeFileSync(path.join(vsDir, name), content);
        }
    }
    return root;
}

test('vscode_assets: absent field → empty array, no install', () => {
    const tarball = setupTarballWithVscodeAssets({});
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const result = installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' });
        assert.deepEqual(result.vscodeAssetsCopied, []);
        assert.equal(fs.existsSync(path.join(heir, '.vscode')), false);
    } finally { cleanup(tarball); cleanup(heir); }
});

test('vscode_assets: installs declared file into heir .vscode/', () => {
    const tarball = setupTarballWithVscodeAssets(
        { vscode_assets: ['markdown-light.css'] },
        { 'markdown-light.css': '/* edition css */' }
    );
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const result = installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' });
        assert.deepEqual(result.vscodeAssetsCopied, ['.vscode/markdown-light.css']);
        assert.equal(
            fs.readFileSync(path.join(heir, '.vscode', 'markdown-light.css'), 'utf8'),
            '/* edition css */'
        );
    } finally { cleanup(tarball); cleanup(heir); }
});

test('vscode_assets: refresh on every install (overwrites heir copy)', () => {
    const tarball = setupTarballWithVscodeAssets(
        { vscode_assets: ['markdown-light.css'] },
        { 'markdown-light.css': '/* edition v2 */' }
    );
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        fs.mkdirSync(path.join(heir, '.vscode'));
        fs.writeFileSync(path.join(heir, '.vscode', 'markdown-light.css'), '/* heir-edited */');
        installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' });
        assert.equal(
            fs.readFileSync(path.join(heir, '.vscode', 'markdown-light.css'), 'utf8'),
            '/* edition v2 */'
        );
    } finally { cleanup(tarball); cleanup(heir); }
});

test('vscode_assets: path separator in entry → MANIFEST_INVALID_VSCODE_ASSET', () => {
    const tarball = setupTarballWithVscodeAssets(
        { vscode_assets: ['../escape.css'] },
        { 'markdown-light.css': 'x' }
    );
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        assert.throws(
            () => installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' }),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_INVALID_VSCODE_ASSET'
        );
        // Heir untouched
        assert.equal(fs.existsSync(path.join(heir, '.vscode')), false);
    } finally { cleanup(tarball); cleanup(heir); }
});

test('vscode_assets: declared file missing from tarball → MANIFEST_VSCODE_ASSET_MISSING', () => {
    const tarball = setupTarballWithVscodeAssets(
        { vscode_assets: ['missing.css'] },
        { 'markdown-light.css': 'x' }
    );
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        assert.throws(
            () => installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' }),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_VSCODE_ASSET_MISSING'
        );
    } finally { cleanup(tarball); cleanup(heir); }
});

test('bootstrap_templates: absent field → empty arrays, no install', () => {
    const tarball = setupTarballWithVscodeAssets({});
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const result = installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' });
        assert.deepEqual(result.bootstrapTemplatesInstalled, []);
        assert.deepEqual(result.bootstrapTemplatesSkipped, []);
    } finally { cleanup(tarball); cleanup(heir); }
});

test('bootstrap_templates: installs when target absent (first-install semantics)', () => {
    const tarball = setupTarballWithVscodeAssets(
        { bootstrap_templates: ['.vscode/settings.json', '.vscode/extensions.json'] },
        { 'settings.json': '{"editor.tabSize":2}', 'extensions.json': '{"recommendations":[]}' }
    );
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const result = installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' });
        assert.deepEqual(result.bootstrapTemplatesInstalled.sort(), ['.vscode/extensions.json', '.vscode/settings.json']);
        assert.deepEqual(result.bootstrapTemplatesSkipped, []);
        assert.equal(
            fs.readFileSync(path.join(heir, '.vscode', 'settings.json'), 'utf8'),
            '{"editor.tabSize":2}'
        );
        assert.equal(
            fs.readFileSync(path.join(heir, '.vscode', 'extensions.json'), 'utf8'),
            '{"recommendations":[]}'
        );
    } finally { cleanup(tarball); cleanup(heir); }
});

test('bootstrap_templates: preserves heir-edited file on upgrade (skips, does NOT clobber)', () => {
    const tarball = setupTarballWithVscodeAssets(
        { bootstrap_templates: ['.vscode/settings.json'] },
        { 'settings.json': '{"editor.tabSize":2}' }
    );
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        fs.mkdirSync(path.join(heir, '.vscode'));
        fs.writeFileSync(path.join(heir, '.vscode', 'settings.json'), '{"heir":"customized"}');
        const result = installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' });
        assert.deepEqual(result.bootstrapTemplatesInstalled, []);
        assert.deepEqual(result.bootstrapTemplatesSkipped, ['.vscode/settings.json']);
        // Heir customization preserved
        assert.equal(
            fs.readFileSync(path.join(heir, '.vscode', 'settings.json'), 'utf8'),
            '{"heir":"customized"}'
        );
    } finally { cleanup(tarball); cleanup(heir); }
});

test('bootstrap_templates: entry with .. → MANIFEST_INVALID_BOOTSTRAP_TEMPLATE', () => {
    const tarball = setupTarballWithVscodeAssets(
        { bootstrap_templates: ['../escape.txt'] },
        { 'settings.json': 'x' }
    );
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        assert.throws(
            () => installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' }),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_INVALID_BOOTSTRAP_TEMPLATE'
        );
    } finally { cleanup(tarball); cleanup(heir); }
});

test('bootstrap_templates: declared file missing from tarball → MANIFEST_BOOTSTRAP_TEMPLATE_MISSING', () => {
    const tarball = setupTarballWithVscodeAssets(
        { bootstrap_templates: ['.vscode/never-existed.json'] },
        { 'settings.json': 'x' }
    );
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        assert.throws(
            () => installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' }),
            (err) => /** @type {any} */ (err).code === 'MANIFEST_BOOTSTRAP_TEMPLATE_MISSING'
        );
    } finally { cleanup(tarball); cleanup(heir); }
});

test('bootstrap_templates: entries inside brain_subtree get overwritten by subtree then skipped', () => {
    // Edge case documented in ADR-009 amendment 2026-06-09. cognitive-config.json
    // lives at .github/config/ which is inside the .github subtree. The subtree
    // copy lands the Edition version there first; the bootstrap_templates loop
    // then sees it exists and skips. Net: Edition version always wins for
    // inside-subtree entries (no heir-preservation for this path), unlike
    // outside-subtree entries which behave per first-install semantics.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
    const mp = path.join(root, MANIFEST_REL_PATH);
    fs.mkdirSync(path.dirname(mp), { recursive: true });
    fs.writeFileSync(mp, JSON.stringify(validManifest({
        bootstrap_templates: ['.github/config/cognitive-config.json']
    }), null, 2));
    fs.mkdirSync(path.join(root, '.github', 'config'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github', 'config', 'cognitive-config.json'), '{"edition":true}');

    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        // Pre-existing heir version
        fs.mkdirSync(path.join(heir, '.github', 'config'), { recursive: true });
        fs.writeFileSync(path.join(heir, '.github', 'config', 'cognitive-config.json'), '{"heir":true}');
        const result = installFromTarball(heir === root ? '/never' : root, heir, '9.5.0', { fetchedTag: 'v3.2.0' });
        // Loop skipped (file already existed post-subtree-copy)
        assert.deepEqual(result.bootstrapTemplatesSkipped, ['.github/config/cognitive-config.json']);
        // Edition version wins (subtree copy clobbered heir's first)
        assert.equal(
            fs.readFileSync(path.join(heir, '.github', 'config', 'cognitive-config.json'), 'utf8'),
            '{"edition":true}'
        );
    } finally { cleanup(root); cleanup(heir); }
});

test('install: subtree + vscode_assets + bootstrap_templates all happen in order, marker last', () => {
    const tarball = setupTarballWithVscodeAssets(
        {
            vscode_assets: ['markdown-light.css'],
            bootstrap_templates: ['.vscode/settings.json']
        },
        {
            'markdown-light.css': '/* css */',
            'settings.json': '{"key":"value"}'
        }
    );
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        const result = installFromTarball(tarball, heir, '9.5.0', { fetchedTag: 'v3.2.0' });
        assert.deepEqual(result.subtreesCopied, ['.github']);
        assert.deepEqual(result.vscodeAssetsCopied, ['.vscode/markdown-light.css']);
        assert.deepEqual(result.bootstrapTemplatesInstalled, ['.vscode/settings.json']);
        // All three categories present in heir
        assert.equal(fs.existsSync(path.join(heir, '.github', 'placeholder.md')), true);
        assert.equal(fs.existsSync(path.join(heir, '.vscode', 'markdown-light.css')), true);
        assert.equal(fs.existsSync(path.join(heir, '.vscode', 'settings.json')), true);
        assert.equal(fs.existsSync(path.join(heir, '.act-heir.json')), true);
    } finally { cleanup(tarball); cleanup(heir); }
});

// ── applyStaticFetchMarkerFields ──────────────────────────────────────
// Pure-function coverage of the marker merge that extension.js performs at
// bootstrap and upgrade time (audit F10 — fills the integration gap so the
// shipped marker write does not depend on smoke tests alone).

test('applyStaticFetchMarkerFields: null provenance returns marker unchanged', () => {
    const input = { spec_version: '1.0', heir_id: 'x' };
    const out = applyStaticFetchMarkerFields(input, null, '9.4.0');
    assert.equal(out, input, 'returns the same reference when no merge applies');
});

test('applyStaticFetchMarkerFields: bundled source returns marker unchanged', () => {
    const input = { spec_version: '1.0', heir_id: 'x' };
    const out = applyStaticFetchMarkerFields(input, { source: 'bundled' }, '9.4.0');
    assert.equal(out, input);
});

test('applyStaticFetchMarkerFields: github-fetch adds all six v2 fields', () => {
    const input = { spec_version: '1.0', heir_id: 'x' };
    const out = applyStaticFetchMarkerFields(
        input,
        { source: 'github-fetch', commitSha: 'abc123', authMode: 'authenticated' },
        '9.4.0'
    );
    assert.equal(out.spec_version, '1.0', 'v1 field preserved');
    assert.equal(out.heir_id, 'x', 'v1 field preserved');
    assert.equal(out.source, 'github-fetch');
    assert.equal(out.commit_sha, 'abc123');
    assert.equal(out.auth_mode, 'authenticated');
    assert.equal(out.extension_version, '9.4.0');
    assert.equal(out.marker_schema_version, 2);
    assert.match(out.fetched_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('applyStaticFetchMarkerFields: does not mutate the input marker', () => {
    const input = { spec_version: '1.0', heir_id: 'x' };
    applyStaticFetchMarkerFields(
        input,
        { source: 'github-fetch', commitSha: 'abc', authMode: 'anonymous' },
        '9.4.0'
    );
    assert.equal(input.source, undefined, 'input must remain a v1-shape marker');
    assert.equal(input.marker_schema_version, undefined);
});

test('applyStaticFetchMarkerFields: missing commitSha → null', () => {
    const out = applyStaticFetchMarkerFields(
        {},
        { source: 'github-fetch', authMode: 'anonymous' },
        '9.4.0'
    );
    assert.equal(out.commit_sha, null);
});

test('applyStaticFetchMarkerFields: missing authMode defaults to anonymous', () => {
    const out = applyStaticFetchMarkerFields(
        {},
        { source: 'github-fetch', commitSha: 'abc' },
        '9.4.0'
    );
    assert.equal(out.auth_mode, 'anonymous');
});

test('applyStaticFetchMarkerFields: missing extensionVersion defaults to unknown', () => {
    const out = applyStaticFetchMarkerFields(
        {},
        { source: 'github-fetch', commitSha: 'abc', authMode: 'anonymous' },
        ''
    );
    assert.equal(out.extension_version, 'unknown');
});

// ── HEIR_OWNED source-side filter (added v9.5.1, defense against leak of
//    Edition's curator workflows / dependabot.yml into heir trees) ──────

const { _loadHeirOwnedGlobs, _matchesHeirOwnedGlob } = require('../lib/edition-install');

function setupRegistry(tarballRoot, heirOwned) {
    const regDir = path.join(tarballRoot, '.github', 'scripts');
    fs.mkdirSync(regDir, { recursive: true });
    const regPath = path.join(regDir, '_registry.cjs');
    fs.writeFileSync(regPath, `module.exports = { HEIR_OWNED: ${JSON.stringify(heirOwned)} };\n`);
    return regPath;
}

test('_matchesHeirOwnedGlob: literal path matches exactly', () => {
    assert.equal(_matchesHeirOwnedGlob('.github/dependabot.yml', ['.github/dependabot.yml']), true);
    assert.equal(_matchesHeirOwnedGlob('.github/dependabot.yaml', ['.github/dependabot.yml']), false);
});

test('_matchesHeirOwnedGlob: dir/** matches descendants but not unrelated paths', () => {
    const globs = ['.github/workflows/**'];
    assert.equal(_matchesHeirOwnedGlob('.github/workflows/brain-qa.yml', globs), true);
    assert.equal(_matchesHeirOwnedGlob('.github/workflows/sub/deep.yml', globs), true);
    assert.equal(_matchesHeirOwnedGlob('.github/workflows', globs), true);
    assert.equal(_matchesHeirOwnedGlob('.github/instructions/critical-thinking.instructions.md', globs), false);
});

test('_matchesHeirOwnedGlob: unsupported glob shape (single-segment *) does not match', () => {
    // Edition's HEIR_OWNED is flat literal or `path/**`. A `*.yml` pattern
    // is outside the supported vocabulary and intentionally not matched.
    assert.equal(_matchesHeirOwnedGlob('.github/dependabot.yml', ['.github/*.yml']), false);
});

test('_loadHeirOwnedGlobs: missing _registry.cjs → empty array (graceful)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heirglobs-'));
    try {
        assert.deepEqual(_loadHeirOwnedGlobs(root), []);
    } finally { cleanup(root); }
});

test('_loadHeirOwnedGlobs: malformed _registry.cjs → empty array (graceful)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heirglobs-'));
    try {
        const regDir = path.join(root, '.github', 'scripts');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, '_registry.cjs'), 'this is not valid js {');
        assert.deepEqual(_loadHeirOwnedGlobs(root), []);
    } finally { cleanup(root); }
});

test('_loadHeirOwnedGlobs: returns array from registry', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heirglobs-'));
    try {
        setupRegistry(root, ['.github/workflows/**', '.github/dependabot.yml']);
        const globs = _loadHeirOwnedGlobs(root);
        assert.deepEqual(globs, ['.github/workflows/**', '.github/dependabot.yml']);
    } finally { cleanup(root); }
});

test('install: HEIR_OWNED files in tarball are NOT copied to heir', () => {
    const root = setupTarballRoot(validManifest(), {
        '.github': {
            'copilot-instructions.md': 'brain content',
            'instructions/foo.instructions.md': 'rule',
            'workflows/curator-only.yml': 'on: push',
            'dependabot.yml': 'version: 2',
            'episodic/note-2026-06-10.md': 'history'
        }
    });
    setupRegistry(root, [
        '.github/workflows/**',
        '.github/dependabot.yml',
        '.github/episodic/**'
    ]);
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'heir-'));
    try {
        installFromTarball(root, heir, '9.5.1', {});
        // Brain content lands.
        assert.equal(fs.existsSync(path.join(heir, '.github', 'copilot-instructions.md')), true);
        assert.equal(fs.existsSync(path.join(heir, '.github', 'instructions', 'foo.instructions.md')), true);
        // Curator-owned content filtered out.
        assert.equal(fs.existsSync(path.join(heir, '.github', 'workflows', 'curator-only.yml')), false, 'workflows/ must not leak');
        assert.equal(fs.existsSync(path.join(heir, '.github', 'dependabot.yml')), false, 'dependabot.yml must not leak');
        assert.equal(fs.existsSync(path.join(heir, '.github', 'episodic', 'note-2026-06-10.md')), false, 'episodic/ must not leak');
    } finally { cleanup(root); cleanup(heir); }
});

test('install: reads HEIR_OWNED policy without executing fetched registry code', () => {
    const tarball = setupTarballRoot(validManifest({ heir_owned: ['.github/workflows/**'] }), {
        '.github': {
            'instructions/x.instructions.md': 'inst-content',
            'workflows/leak.yml': 'name: should-not-copy',
            'scripts/_registry.cjs': 'require("fs").writeFileSync("SIDE_EFFECT", "bad"); module.exports = { HEIR_OWNED: [] };'
        }
    });
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    const cwd = process.cwd();
    try {
        process.chdir(tarball);
        installFromTarball(tarball, heir, '9.4.0', { fetchedTag: 'v3.2.0' });
        assert.equal(fs.existsSync(path.join(tarball, 'SIDE_EFFECT')), false, 'fetched _registry.cjs must not execute during install');
        assert.equal(fs.existsSync(path.join(heir, '.github', 'workflows', 'leak.yml')), false, 'manifest heir_owned should filter workflows');
        assert.equal(fs.existsSync(path.join(heir, '.github', 'instructions', 'x.instructions.md')), true);
    } finally {
        process.chdir(cwd);
        cleanup(tarball);
        cleanup(heir);
    }
});

test('install: graceful fallback when tarball has no _registry.cjs (older Edition)', () => {
    // Pre-v9.5.1 behavior preserved: no registry → no filter → verbatim copy.
    const root = setupTarballRoot(validManifest(), {
        '.github': {
            'copilot-instructions.md': 'brain',
            'workflows/x.yml': 'on: push'
        }
    });
    // Deliberately no setupRegistry — tarball lacks _registry.cjs.
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'heir-'));
    try {
        installFromTarball(root, heir, '9.5.1', {});
        assert.equal(fs.existsSync(path.join(heir, '.github', 'copilot-instructions.md')), true);
        // Without registry guidance, files copy verbatim.
        assert.equal(fs.existsSync(path.join(heir, '.github', 'workflows', 'x.yml')), true);
    } finally { cleanup(root); cleanup(heir); }
});

test('install: heir-owned local/ subdirectory in Edition tarball does not land in heir', () => {
    // Catches the case where Edition accidentally commits a local/ overlay.
    const root = setupTarballRoot(validManifest(), {
        '.github': {
            'skills/baseline-skill/SKILL.md': 'baseline',
            'skills/local/curator-test/SKILL.md': 'curator-only test artifact'
        }
    });
    setupRegistry(root, ['.github/skills/local/**']);
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'heir-'));
    try {
        installFromTarball(root, heir, '9.5.1', {});
        assert.equal(fs.existsSync(path.join(heir, '.github', 'skills', 'baseline-skill', 'SKILL.md')), true);
        assert.equal(fs.existsSync(path.join(heir, '.github', 'skills', 'local', 'curator-test', 'SKILL.md')), false);
    } finally { cleanup(root); cleanup(heir); }
});
