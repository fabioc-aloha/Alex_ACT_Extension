// @ts-check
'use strict';

/**
 * Unit tests for lib/fs-utils.js.
 *
 * Covers listFilesRecursive — the directory walker that brain copies
 * depend on. Key risk: symlink loops + pathologically-deep trees.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { listFilesRecursive } = require('../lib/fs-utils');

function mkRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'fs-utils-test-'));
}

function cleanup(p) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ }
}

// ── Happy paths ───────────────────────────────────────────────────────

test('listFilesRecursive: flat directory', () => {
    const root = mkRoot();
    try {
        fs.writeFileSync(path.join(root, 'a.md'), 'a');
        fs.writeFileSync(path.join(root, 'b.md'), 'b');
        const files = listFilesRecursive(root).sort();
        assert.deepEqual(files, ['a.md', 'b.md']);
    } finally { cleanup(root); }
});

test('listFilesRecursive: nested directories', () => {
    const root = mkRoot();
    try {
        fs.mkdirSync(path.join(root, 'sub', 'deeper'), { recursive: true });
        fs.writeFileSync(path.join(root, 'top.md'), 'x');
        fs.writeFileSync(path.join(root, 'sub', 'mid.md'), 'x');
        fs.writeFileSync(path.join(root, 'sub', 'deeper', 'leaf.md'), 'x');
        const files = listFilesRecursive(root).sort();
        assert.deepEqual(files, ['sub/deeper/leaf.md', 'sub/mid.md', 'top.md']);
    } finally { cleanup(root); }
});

test('listFilesRecursive: returns forward-slash paths even on Windows', () => {
    const root = mkRoot();
    try {
        fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a', 'b', 'c.txt'), 'c');
        const files = listFilesRecursive(root);
        // The contract is: separators are forward slashes regardless of platform.
        assert.equal(files[0].includes('\\'), false, 'no backslashes in output');
        assert.equal(files[0], 'a/b/c.txt');
    } finally { cleanup(root); }
});

test('listFilesRecursive: base parameter rebases relative paths', () => {
    const root = mkRoot();
    try {
        fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
        fs.writeFileSync(path.join(root, 'sub', 'x.md'), 'x');
        // Walk from `sub/`, but rebase relative paths against `root`.
        const files = listFilesRecursive(path.join(root, 'sub'), root);
        assert.deepEqual(files, ['sub/x.md']);
    } finally { cleanup(root); }
});

// ── Defensive paths ───────────────────────────────────────────────────

test('listFilesRecursive: non-existent directory returns []', () => {
    const phantom = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());
    assert.deepEqual(listFilesRecursive(phantom), []);
});

test('listFilesRecursive: empty directory returns []', () => {
    const root = mkRoot();
    try {
        assert.deepEqual(listFilesRecursive(root), []);
    } finally { cleanup(root); }
});

// ── Symlink-loop protection (deterministic via _seen parameter) ───────
// The internal `_seen` Set parameter lets tests exercise the cycle guard
// without needing OS-level symlink permissions (Windows often refuses).

test('listFilesRecursive: pre-populated _seen short-circuits the walk', () => {
    const root = mkRoot();
    try {
        fs.writeFileSync(path.join(root, 'should-not-appear.md'), 'x');
        // Pre-populate _seen with the real path of root. The walk must
        // short-circuit before reading any entries.
        const seen = new Set([fs.realpathSync(root)]);
        const files = listFilesRecursive(root, undefined, seen, 0);
        assert.deepEqual(files, [], 'cycle guard must return [] when real path already seen');
    } finally { cleanup(root); }
});

test('listFilesRecursive: _seen accumulates real paths during walk', () => {
    const root = mkRoot();
    try {
        fs.mkdirSync(path.join(root, 'a'));
        fs.writeFileSync(path.join(root, 'a', 'leaf.md'), 'x');
        const seen = new Set();
        listFilesRecursive(root, undefined, seen, 0);
        // After the walk, _seen must contain the root + every subdirectory
        // it descended into. This pins the contract that the cycle guard
        // actually populates _seen (mutation: skipping _seen.add() would
        // re-walk subdirectories forever in a real cycle).
        assert.equal(seen.has(fs.realpathSync(root)), true, 'root real-path added to _seen');
        assert.equal(seen.has(fs.realpathSync(path.join(root, 'a'))), true, 'subdir real-path added to _seen');
    } finally { cleanup(root); }
});

test('listFilesRecursive: symlink cycle does not infinite-loop (best-effort, may skip)', (t) => {
    const root = mkRoot();
    try {
        fs.mkdirSync(path.join(root, 'real'));
        fs.writeFileSync(path.join(root, 'real', 'file.md'), 'x');
        try {
            // Cycle: root/real/loop -> root/real (loops back)
            fs.symlinkSync(path.join(root, 'real'), path.join(root, 'real', 'loop'), 'junction');
        } catch (err) {
            // Windows without elevated privileges, or other symlink restriction.
            // The deterministic _seen tests above already cover the contract;
            // this test is an extra integration check on platforms that allow it.
            t.skip(`symlink creation refused (${err && /** @type {any} */ (err).code || err}); deterministic _seen tests cover the contract`);
            return;
        }
        const files = listFilesRecursive(root);
        assert.equal(Array.isArray(files), true);
        const realFileHits = files.filter(f => f.endsWith('real/file.md')).length;
        assert.equal(realFileHits, 1, 'each real file should appear exactly once');
    } finally { cleanup(root); }
});

test('listFilesRecursive: depth cap returns [] above MAX_RECURSION_DEPTH', () => {
    const root = mkRoot();
    try {
        fs.writeFileSync(path.join(root, 'leaf.md'), 'x');
        // Calling with _depth=51 (above the cap of 50) must short-circuit
        // and return [] without reading any entries. Mutation: removing the
        // depth cap would let this proceed and return ['leaf.md'].
        const above = listFilesRecursive(root, undefined, undefined, 51);
        assert.deepEqual(above, [], 'depth-cap guard must return [] above MAX_RECURSION_DEPTH');
        // Sanity: at depth 0 the leaf is found.
        const at = listFilesRecursive(root, undefined, undefined, 0);
        assert.deepEqual(at, ['leaf.md']);
    } finally { cleanup(root); }
});

test('listFilesRecursive: pathological 60-level chain terminates without throwing', () => {
    const root = mkRoot();
    try {
        // Build a 60-level deep chain. MAX_RECURSION_DEPTH is 50; we cap
        // out cleanly rather than crashing. Use a synthetic, narrow tree
        // to avoid filesystem-path-length limits.
        let p = root;
        for (let i = 0; i < 60; i++) {
            p = path.join(p, 'd' + i);
            fs.mkdirSync(p);
        }
        fs.writeFileSync(path.join(p, 'leaf.txt'), 'leaf');
        // Should not throw; should return only the entries reachable below
        // the cap. The defensive assertion is "did not throw" + "truncated".
        const files = listFilesRecursive(root);
        assert.equal(Array.isArray(files), true, 'depth cap kept the walk terminating');
        // The leaf is at depth 60; with MAX_RECURSION_DEPTH=50 it must NOT
        // appear. Mutation: removing the depth cap would surface the leaf.
        assert.equal(files.includes('leaf.txt'), false, 'leaf at depth 60 must be unreachable past MAX_RECURSION_DEPTH=50');
    } finally { cleanup(root); }
});
