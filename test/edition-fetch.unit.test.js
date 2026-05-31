// @ts-check
'use strict';

/**
 * Local-only unit tests for lib/edition-fetch.js.
 *
 * No network. Covers the parts of the network layer that do not require
 * a live HTTPS round-trip:
 *   - getSilentAuthToken (auth shim around vscode.authentication)
 *   - sweepStaleTempDirs (filesystem-only cleanup)
 *
 * The HTTPS-touching surface (getLatestTag, fetchTarball) lives in
 * edition-fetch.integration.test.js and is run separately via
 * `npm run test:integration`.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getSilentAuthToken, sweepStaleTempDirs } = require('../lib/edition-fetch');

// ── getSilentAuthToken ────────────────────────────────────────────────

test('getSilentAuthToken: returns token when session present', async () => {
    const fakeVscode = {
        authentication: {
            getSession: async (_provider, _scopes, _opts) => ({ accessToken: 'gho_test-token' })
        }
    };
    const token = await getSilentAuthToken(fakeVscode);
    assert.equal(token, 'gho_test-token');
});

test('getSilentAuthToken: returns null when no session', async () => {
    const fakeVscode = {
        authentication: {
            getSession: async (_provider, _scopes, _opts) => undefined
        }
    };
    const token = await getSilentAuthToken(fakeVscode);
    assert.equal(token, null);
});

test('getSilentAuthToken: returns null when getSession throws (silent failure)', async () => {
    const fakeVscode = {
        authentication: {
            getSession: async () => { throw new Error('auth provider unavailable'); }
        }
    };
    const token = await getSilentAuthToken(fakeVscode);
    assert.equal(token, null, 'auth failures must never propagate; anonymous mode is the fallback');
});

test('getSilentAuthToken: never prompts (silent:true contract)', async () => {
    let capturedOpts = null;
    const fakeVscode = {
        authentication: {
            getSession: async (_provider, _scopes, opts) => {
                capturedOpts = opts;
                return null;
            }
        }
    };
    await getSilentAuthToken(fakeVscode);
    assert.equal(capturedOpts && capturedOpts.silent, true, 'must call with silent:true');
});

// ── sweepStaleTempDirs ────────────────────────────────────────────────

test('sweepStaleTempDirs: cleans alex-act-fetch-* >24h, preserves fresh', () => {
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-act-fetch-old-'));
    fs.writeFileSync(path.join(old, 'sentinel.txt'), 'x');
    // Backdate mtime to 25 hours ago.
    const oldTime = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(old, oldTime, oldTime);

    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-act-fetch-fresh-'));

    try {
        const result = sweepStaleTempDirs();
        assert.equal(result.swept >= 1, true, `expected ≥1 swept, got ${result.swept}`);
        assert.equal(fs.existsSync(old), false, 'stale dir should be removed');
        assert.equal(fs.existsSync(fresh), true, 'fresh dir should be preserved');
    } finally {
        try { fs.rmSync(old, { recursive: true, force: true }); } catch { /* may already be gone */ }
        try { fs.rmSync(fresh, { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

test('sweepStaleTempDirs: ignores non-matching prefixes', () => {
    // A directory in tmpdir that does NOT start with alex-act-fetch- must
    // be left alone even when stale.
    const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'some-other-tool-'));
    const oldTime = (Date.now() - 48 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(unrelated, oldTime, oldTime);
    try {
        sweepStaleTempDirs();
        assert.equal(fs.existsSync(unrelated), true, 'non-matching prefix must not be swept');
    } finally {
        try { fs.rmSync(unrelated, { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

test('sweepStaleTempDirs: custom maxAgeMs honoured', () => {
    const recent = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-act-fetch-recent-'));
    // mtime 2 minutes ago — fresh under default 24h, stale under 1-minute window.
    const oldTime = (Date.now() - 2 * 60 * 1000) / 1000;
    fs.utimesSync(recent, oldTime, oldTime);
    try {
        const result = sweepStaleTempDirs(60 * 1000); // 1 minute
        assert.equal(result.swept >= 1, true);
        assert.equal(fs.existsSync(recent), false);
    } finally {
        try { fs.rmSync(recent, { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

test('sweepStaleTempDirs: returns shape {swept, errors}', () => {
    const result = sweepStaleTempDirs();
    assert.equal(typeof result.swept, 'number');
    assert.equal(typeof result.errors, 'number');
    assert.equal(result.swept >= 0, true);
    assert.equal(result.errors >= 0, true);
});
