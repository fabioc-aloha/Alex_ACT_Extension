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

const { getLatestTag, getSilentAuthToken, sweepStaleTempDirs, resolveCommitSha, fetchTarball, CACHE_KEY } = require('../lib/edition-fetch');

function memoryState(initial) {
    const store = new Map(Object.entries(initial || {}));
    return {
        get: (key) => store.get(key),
        update: async (key, value) => { store.set(key, value); },
        dump: () => Object.fromEntries(store.entries()),
    };
}

// ── resolveCommitSha fast-path (no HTTP) ─────────────────────────────
//
// The branches that DO hit GitHub (tag-ref + branch-ref fallback) live
// in edition-fetch.integration.test.js. The SHA-passthrough case is
// pure logic and tested here.

test('resolveCommitSha: returns SHA verbatim when target is already 40-char hex', async () => {
    const sha = '29237f5846794321c91d627e5b60ab2b383b1595';
    const out = await resolveCommitSha(sha, 'v3.2.1', '9.4.1', null, 3000);
    assert.equal(out, sha, 'pre-resolved SHA must short-circuit before any HTTP call');
});

test('resolveCommitSha: returns null when both target and tag are empty/invalid', async () => {
    assert.equal(await resolveCommitSha(null, null, '9.4.1', null, 3000), null);
    assert.equal(await resolveCommitSha('', '', '9.4.1', null, 3000), null);
    assert.equal(await resolveCommitSha(undefined, undefined, '9.4.1', null, 3000), null);
});

test('resolveCommitSha: rejects non-hex 40-char strings as SHA (must fall through to ref lookup)', async () => {
    // This is a guard against accepting garbage as a SHA. With no tag and
    // an invalid SHA-looking target, the branch lookup will fail anyway,
    // but the important property is we do not return the bogus value.
    const bogus = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'; // 40 chars, not hex
    const out = await resolveCommitSha(bogus, null, '9.4.1', null, 3000);
    // Either null (branch fallback fails) or a real SHA from network.
    // What it must NOT be is `bogus`.
    assert.notEqual(out, bogus, 'bogus 40-char non-hex must not be accepted as SHA');
});

// ── getLatestTag deterministic HTTP seam ─────────────────────────────

test('getLatestTag: 200 caches release metadata and returns resolved commit SHA', async () => {
    const state = memoryState();
    const result = await getLatestTag('9.5.6', state, {
        authToken: 'token',
        httpGetJson: async (_url, headers) => {
            assert.equal(headers.Authorization, 'Bearer token');
            return {
                statusCode: 200,
                headers: { etag: 'W/"abc"', 'last-modified': 'Wed, 01 Jul 2026 00:00:00 GMT' },
                body: { tag_name: 'v3.8.0', target_commitish: 'main', published_at: '2026-07-01T00:00:00Z' },
            };
        },
        resolveCommitSha: async () => 'abc123',
    });

    assert.deepEqual(result, {
        tag: 'v3.8.0',
        commitSha: 'abc123',
        publishedAt: '2026-07-01T00:00:00Z',
        fromCache: false,
        authMode: 'authenticated',
    });
    assert.equal(state.dump()[CACHE_KEY].etag, 'W/"abc"');
});

test('getLatestTag: 304 returns cached tag without updating state', async () => {
    const state = memoryState({
        [CACHE_KEY]: {
            tag: 'v3.7.1',
            commitSha: 'def456',
            publishedAt: '2026-06-30T00:00:00Z',
            etag: 'old-etag',
            lastModified: 'Tue, 30 Jun 2026 00:00:00 GMT',
        },
    });
    const result = await getLatestTag('9.5.6', state, {
        httpGetJson: async (_url, headers) => {
            assert.equal(headers['If-None-Match'], 'old-etag');
            assert.equal(headers['If-Modified-Since'], 'Tue, 30 Jun 2026 00:00:00 GMT');
            return { statusCode: 304, headers: {}, body: null };
        },
    });

    assert.equal(result.tag, 'v3.7.1');
    assert.equal(result.commitSha, 'def456');
    assert.equal(result.fromCache, true);
});

test('getLatestTag: 304 without cached tag throws CACHE_INVARIANT', async () => {
    const state = memoryState({ [CACHE_KEY]: { etag: 'etag-without-tag' } });

    await assert.rejects(
        getLatestTag('9.5.6', state, {
            httpGetJson: async () => ({ statusCode: 304, headers: {}, body: null }),
        }),
        (err) => err.code === 'CACHE_INVARIANT'
    );
});

test('getLatestTag: 200 without tag_name throws MALFORMED_RELEASE', async () => {
    await assert.rejects(
        getLatestTag('9.5.6', memoryState(), {
            httpGetJson: async () => ({ statusCode: 200, headers: {}, body: { target_commitish: 'main' } }),
        }),
        (err) => err.code === 'MALFORMED_RELEASE'
    );
});

test('getLatestTag: primary rate limit throws RATE_LIMITED', async () => {
    await assert.rejects(
        getLatestTag('9.5.6', memoryState(), {
            httpGetJson: async () => ({ statusCode: 403, headers: { 'x-ratelimit-remaining': '0' }, body: null }),
        }),
        (err) => err.code === 'RATE_LIMITED'
    );
});

test('getLatestTag: secondary rate limit throws RATE_LIMITED_SECONDARY', async () => {
    await assert.rejects(
        getLatestTag('9.5.6', memoryState(), {
            httpGetJson: async () => ({ statusCode: 429, headers: { 'retry-after': '30' }, body: null }),
        }),
        (err) => err.code === 'RATE_LIMITED_SECONDARY'
    );
});

test('getLatestTag: 404 throws REPO_GONE', async () => {
    await assert.rejects(
        getLatestTag('9.5.6', memoryState(), {
            httpGetJson: async () => ({ statusCode: 404, headers: {}, body: null }),
        }),
        (err) => err.code === 'REPO_GONE'
    );
});

test('getLatestTag: timeout typed error propagates', async () => {
    await assert.rejects(
        getLatestTag('9.5.6', memoryState(), {
            httpGetJson: async () => {
                const err = new Error('timeout');
                err.code = 'TIMEOUT';
                throw err;
            },
        }),
        (err) => err.code === 'TIMEOUT'
    );
});

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

test('fetchTarball: cleans temp dir and throws TAG_NOT_FOUND on 404', async () => {
    let tempParent = null;
    await assert.rejects(
        fetchTarball('v0.0.0-missing', '9.5.6', {
            extract: async (_url, outDir) => {
                tempParent = outDir;
                fs.writeFileSync(path.join(outDir, 'sentinel.txt'), 'x');
                const err = new Error('not found');
                err.status = 404;
                throw err;
            },
        }),
        (err) => err.code === 'TAG_NOT_FOUND'
    );

    assert.equal(fs.existsSync(tempParent), false);
});

test('fetchTarball: cleans temp dir and throws RATE_LIMITED on 403', async () => {
    let tempParent = null;
    await assert.rejects(
        fetchTarball('v3.8.0', '9.5.6', {
            extract: async (_url, outDir) => {
                tempParent = outDir;
                fs.writeFileSync(path.join(outDir, 'sentinel.txt'), 'x');
                const err = new Error('rate limited');
                err.status = 403;
                throw err;
            },
        }),
        (err) => err.code === 'RATE_LIMITED'
    );

    assert.equal(fs.existsSync(tempParent), false);
});

test('fetchTarball: cleans temp dir and throws RATE_LIMITED on 429', async () => {
    let tempParent = null;
    await assert.rejects(
        fetchTarball('v3.8.0', '9.5.6', {
            extract: async (_url, outDir) => {
                tempParent = outDir;
                fs.writeFileSync(path.join(outDir, 'sentinel.txt'), 'x');
                const err = new Error('too many requests');
                err.status = 429;
                throw err;
            },
        }),
        (err) => err.code === 'RATE_LIMITED'
    );

    assert.equal(fs.existsSync(tempParent), false);
});
