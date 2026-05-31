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
    installFromTarball,
    MANIFEST_REL_PATH,
    LOCKFILE_NAME
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

test('lock: stale lock (>10min mtime) broken atomically', () => {
    const heir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-heir-'));
    try {
        // Manually create a stale lock with old mtime.
        const lockPath = path.join(heir, LOCKFILE_NAME);
        fs.writeFileSync(lockPath, '{"stale": true}');
        const oldTime = (Date.now() - 11 * 60 * 1000) / 1000;
        fs.utimesSync(lockPath, oldTime, oldTime);

        // Should succeed by breaking the stale lock.
        const lock = acquireLock(heir);
        lock.release();
        assert.equal(fs.existsSync(lockPath), false);
    } finally { cleanup(heir); }
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
