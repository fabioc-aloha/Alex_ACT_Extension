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

// ── Symlink-loop protection ──────────────────────────────────────────
// Skipped on Windows when not running elevated (junctions need permission).
// The protection itself is platform-agnostic; this test exercises it where
// the runtime permits the setup.

test('listFilesRecursive: symlink cycle does not infinite-loop', (t) => {
    const root = mkRoot();
    try {
        fs.mkdirSync(path.join(root, 'real'));
        fs.writeFileSync(path.join(root, 'real', 'file.md'), 'x');
        try {
            // Cycle: root/real/loop -> root/real (loops back)
            fs.symlinkSync(path.join(root, 'real'), path.join(root, 'real', 'loop'), 'junction');
        } catch (err) {
            // Windows without elevated privileges, or other symlink restriction.
            t.skip(`symlink creation refused (${err && /** @type {any} */ (err).code || err}); test environment lacks symlink permissions`);
            return;
        }
        // Walk must terminate. We do not assert on exact output (platform
        // varies on whether the symlink itself shows up); only that it
        // doesn't hang and doesn't blow the stack.
        const files = listFilesRecursive(root);
        assert.equal(Array.isArray(files), true);
        // The real file under the cycle should appear at most once via the
        // direct path; the cycle's recursion via loop/ is suppressed by the
        // _seen real-path set.
        const realFileHits = files.filter(f => f.endsWith('real/file.md')).length;
        assert.equal(realFileHits, 1, 'each real file should appear exactly once');
    } finally { cleanup(root); }
});

test('listFilesRecursive: depth cap protects against pathological nesting', () => {
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
        // Should not throw; should return an empty list (or whatever it
        // walked up to depth 50). The defensive assertion is "did not throw".
        const files = listFilesRecursive(root);
        assert.equal(Array.isArray(files), true, 'depth cap kept the walk terminating');
    } finally { cleanup(root); }
});
