// @ts-check
'use strict';

/**
 * Integration tests against a real Edition tarball from github.com.
 *
 * Skipped automatically when the network is unavailable (e.g., offline CI)
 * or when Edition v3.2.0 has not been tagged yet. Run-on-demand only;
 * not part of the default `node --test test/*.test.js` glob — invoke
 * explicitly with `node --test test/edition-fetch.integration.test.js`.
 *
 * These tests make real HTTPS calls and cost rate-limit budget (1 API
 * call + 1 codeload download per run). Cap at ~3 runs/hour anonymous.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');

const { getLatestTag, fetchTarball } = require('../lib/edition-fetch');
const { readAndValidateManifest } = require('../lib/edition-install');

const EXT_VERSION = '9.4.0';
const SKIP_TAG = 'v3.2.0'; // skip if this tag does not yet exist

// In-memory globalState shim for tests.
function makeMemoryState() {
    const store = new Map();
    return {
        get(k) { return store.get(k); },
        update(k, v) { store.set(k, v); return Promise.resolve(); }
    };
}

async function networkReachable() {
    return new Promise((resolve) => {
        const req = https.get('https://api.github.com/zen', (res) => {
            res.resume();
            resolve(res.statusCode != null && res.statusCode < 500);
        });
        req.setTimeout(3000, () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

async function tagExists(tag) {
    return new Promise((resolve) => {
        const url = `https://api.github.com/repos/fabioc-aloha/Alex_ACT_Edition/git/ref/tags/${encodeURIComponent(tag)}`;
        const req = https.get(url, { headers: { 'User-Agent': `Alex_ACT_Extension-tests/${EXT_VERSION}` } }, (res) => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.setTimeout(3000, () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

/**
 * getLatestTag (the function under test) hits `/releases/latest`, which
 * requires a GitHub Release to have been published — a tag alone is NOT
 * enough. Skip the integration suite when no Release exists for the
 * minimum Edition version we need.
 */
async function releaseExists() {
    return new Promise((resolve) => {
        const url = `https://api.github.com/repos/fabioc-aloha/Alex_ACT_Edition/releases/latest`;
        const req = https.get(url, { headers: { 'User-Agent': `Alex_ACT_Extension-tests/${EXT_VERSION}` } }, (res) => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.setTimeout(3000, () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

// ── Tests ─────────────────────────────────────────────────────────────

test('integration: getLatestTag against real GitHub', { skip: false }, async (t) => {
    if (!(await networkReachable())) { t.skip('network unreachable'); return; }
    if (!(await releaseExists())) { t.skip('no published GitHub Release exists yet — publish via `gh release create` before running integration tests'); return; }

    const state = makeMemoryState();
    const result = await getLatestTag(EXT_VERSION, state);
    assert.match(result.tag, /^v?\d+\.\d+\.\d+/);
    assert.equal(typeof result.fromCache, 'boolean');
    assert.equal(['authenticated', 'anonymous'].includes(result.authMode), true);
});

test('integration: ETag cache → second call returns 304 fromCache=true', async (t) => {
    if (!(await networkReachable())) { t.skip('network unreachable'); return; }
    if (!(await releaseExists())) { t.skip('no published GitHub Release exists yet'); return; }

    const state = makeMemoryState();
    const first = await getLatestTag(EXT_VERSION, state);
    assert.equal(first.fromCache, false);
    const second = await getLatestTag(EXT_VERSION, state);
    assert.equal(second.fromCache, true, 'second call should hit ETag cache');
    assert.equal(second.tag, first.tag);
});

test('integration: fetchTarball + readAndValidateManifest end-to-end', async (t) => {
    if (!(await networkReachable())) { t.skip('network unreachable'); return; }
    if (!(await releaseExists())) { t.skip('no published GitHub Release exists yet'); return; }

    const state = makeMemoryState();
    const { tag } = await getLatestTag(EXT_VERSION, state);
    const { tarballRoot, tempParent } = await fetchTarball(tag, EXT_VERSION);
    try {
        const m = readAndValidateManifest(tarballRoot, EXT_VERSION, tag);
        assert.equal(m.spec_version, '1.4');
        assert.equal(typeof m.edition_version, 'string');
        assert.equal(typeof m.min_extension_version, 'string');
        assert.equal(Array.isArray(m.brain_subtrees), true);
        assert.equal(m.brain_subtrees.length >= 1, true);
        // brain_subtrees actually exist in the tarball — readAndValidateManifest
        // already asserts this, but double-check the .github dir specifically
        assert.equal(fs.existsSync(path.join(tarballRoot, '.github')), true);
    } finally {
        try { fs.rmSync(tempParent, { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

// sweepStaleTempDirs coverage moved to edition-fetch.unit.test.js — it does
// not require network and runs in the default `npm test` suite.
