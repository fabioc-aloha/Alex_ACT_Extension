// @ts-check
'use strict';

/**
 * Network layer for the static-fetch Extension (ADR-009).
 *
 * Owns every HTTPS call against GitHub:
 *   - getLatestTag()  → /releases/latest with ETag-conditional caching
 *   - fetchTarball()  → codeload.github.com tar.gz download + extract
 *
 * Trust model: GitHub is the only brain source. No sha256 verification,
 * no signature check; same risk profile as `git clone` against a trusted
 * upstream. See ADR-009 § Trust model.
 *
 * Rate-limit posture:
 *   - opportunistic auth (silent GitHub session via vscode.authentication)
 *     lifts anonymous 60/hr to authenticated 5000/hr
 *   - ETag/If-Modified-Since on /releases/latest; 304 does not count
 *   - tarball via codeload.github.com is one request per install/upgrade
 *
 * Failure model: every error path returns a typed error with a `code`
 * property the install layer pattern-matches on. No silent fallbacks.
 */

const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const { EDITION_REPO } = require('./edition-source');
const { fetchAndExtract } = require('./tar-extract');

const API_HOST = 'api.github.com';
const CACHE_KEY = 'editionFetch.releaseLatestCache';

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Fetch the latest Edition release tag. Uses ETag-conditional requests
 * so repeated calls within a 24h window cost zero rate-limit budget.
 *
 * @param {string} extensionVersion - extension semver for User-Agent
 * @param {{ get(key: string): any, update(key: string, value: any): Thenable<void> }} globalState
 * @param {{ authToken?: string | null, timeoutMs?: number }} [opts]
 * @returns {Promise<{ tag: string, commitSha: string | null, publishedAt: string | null, fromCache: boolean, authMode: 'authenticated' | 'anonymous' }>}
 */
async function getLatestTag(extensionVersion, globalState, opts) {
    const authToken = (opts && opts.authToken) || null;
    const timeoutMs = (opts && opts.timeoutMs) || 3000;
    const cache = globalState.get(CACHE_KEY) || null;
    const headers = _commonHeaders(extensionVersion, authToken);
    if (cache && cache.etag) headers['If-None-Match'] = cache.etag;
    if (cache && cache.lastModified) headers['If-Modified-Since'] = cache.lastModified;

    const url = `https://${API_HOST}/repos/${EDITION_REPO.owner}/${EDITION_REPO.repo}/releases/latest`;
    const res = await _httpGetJson(url, headers, timeoutMs);

    if (res.statusCode === 304) {
        if (!cache || !cache.tag) {
            // Shouldn't happen — 304 implies we sent a conditional header,
            // which means cache existed. Defensive: treat as cache-miss.
            throw _typedError('CACHE_INVARIANT', 'GitHub returned 304 but no cached tag is available; clear the cache and retry.');
        }
        return {
            tag: cache.tag,
            commitSha: cache.commitSha || null,
            publishedAt: cache.publishedAt || null,
            fromCache: true,
            authMode: authToken ? 'authenticated' : 'anonymous'
        };
    }

    if (res.statusCode === 200 && res.body) {
        const json = res.body;
        const tag = json.tag_name;
        if (!tag || typeof tag !== 'string') {
            throw _typedError('MALFORMED_RELEASE', `GitHub returned a release without tag_name: ${JSON.stringify(json).slice(0, 200)}`);
        }
        // target_commitish may be a SHA or a branch name. If branch, resolve
        // it via the refs API. One extra call, cached with the rest.
        let commitSha = await _resolveCommitSha(json.target_commitish, extensionVersion, authToken, timeoutMs);
        const payload = {
            tag,
            commitSha,
            publishedAt: json.published_at || null,
            etag: res.headers.etag || null,
            lastModified: res.headers['last-modified'] || null,
            cachedAt: new Date().toISOString()
        };
        await globalState.update(CACHE_KEY, payload);
        return {
            tag,
            commitSha,
            publishedAt: payload.publishedAt,
            fromCache: false,
            authMode: authToken ? 'authenticated' : 'anonymous'
        };
    }

    throw _statusError(res.statusCode, res.headers, url);
}

/**
 * Fetch the tarball for `tag` and extract it into a fresh per-fetch temp
 * directory under os.tmpdir(). Returns the path to the extracted root.
 *
 * The caller is responsible for deleting the parent directory when done
 * (typically in a try/finally around the install step).
 *
 * @param {string} tag
 * @param {string} extensionVersion
 * @param {{ authToken?: string | null, timeoutMs?: number }} [opts]
 * @returns {Promise<{ tarballRoot: string, tempParent: string }>}
 */
async function fetchTarball(tag, extensionVersion, opts) {
    const authToken = (opts && opts.authToken) || null;
    const timeoutMs = (opts && opts.timeoutMs) || 60000;
    const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-act-fetch-'));
    const headers = _commonHeaders(extensionVersion, authToken);
    // codeload.github.com serves the actual tarball bytes (api.github.com
    // 302s here). Hitting codeload directly skips a redirect hop and
    // doesn't count against the REST API rate limit.
    const url = `https://codeload.github.com/${EDITION_REPO.owner}/${EDITION_REPO.repo}/tar.gz/refs/tags/${encodeURIComponent(tag)}`;
    try {
        await fetchAndExtract(url, tempParent, { headers, timeoutMs });
    } catch (err) {
        // Translate generic HTTP errors into typed ones the install layer
        // can pattern-match on.
        const code = err && /** @type {any} */ (err).status;
        if (code === 404) {
            throw _typedError(
                'TAG_NOT_FOUND',
                `Edition release "${tag}" was listed but its tarball is missing at ${url}. The release may have been unpublished.`,
                { tag, url }
            );
        }
        if (code === 403 || code === 429) {
            throw _typedError(
                'RATE_LIMITED',
                `GitHub rate-limited the tarball download for "${tag}". Sign in to GitHub in VS Code to raise the limit from 60 to 5,000 requests per hour.`,
                { tag, url, status: code }
            );
        }
        // Re-throw cleanup; caller handles tempParent disposal.
        try { fs.rmSync(tempParent, { recursive: true, force: true }); } catch { /* best effort */ }
        throw err;
    }

    // Resolve the tarball wrapper directory (GitHub wraps content as
    // `<repo>-<sha>/`). Expect exactly one top-level directory.
    const entries = fs.readdirSync(tempParent, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());
    if (dirs.length !== 1) {
        try { fs.rmSync(tempParent, { recursive: true, force: true }); } catch { /* best effort */ }
        throw _typedError(
            'UNEXPECTED_TARBALL_SHAPE',
            `Tarball from ${url} should contain exactly one top-level directory; found ${dirs.length}. Edition tarball may be corrupt.`,
            { tag, url, found: dirs.map(d => d.name) }
        );
    }
    return {
        tarballRoot: path.join(tempParent, dirs[0].name),
        tempParent
    };
}

/**
 * Acquire a silent GitHub auth session through VS Code. Returns null
 * (anonymous mode) if the user is not signed in; never prompts.
 *
 * @param {typeof import('vscode')} vscode
 * @returns {Promise<string | null>}
 */
async function getSilentAuthToken(vscode) {
    try {
        const session = await vscode.authentication.getSession('github', [], { silent: true });
        return session ? session.accessToken : null;
    } catch {
        return null;
    }
}

/**
 * Sweep stale per-fetch temp directories older than `maxAgeMs`. Called
 * on activation to prevent disk leak over months of upgrades.
 *
 * @param {number} [maxAgeMs] - default 24h
 * @returns {{ swept: number, errors: number }}
 */
function sweepStaleTempDirs(maxAgeMs) {
    const cutoff = Date.now() - (maxAgeMs || 24 * 60 * 60 * 1000);
    const root = os.tmpdir();
    let swept = 0;
    let errors = 0;
    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const e of entries) {
            if (!e.isDirectory() || !e.name.startsWith('alex-act-fetch-')) continue;
            const full = path.join(root, e.name);
            try {
                const stat = fs.statSync(full);
                if (stat.mtimeMs < cutoff) {
                    fs.rmSync(full, { recursive: true, force: true });
                    swept += 1;
                }
            } catch {
                errors += 1;
            }
        }
    } catch {
        // tmpdir unreadable — non-fatal
    }
    return { swept, errors };
}

// ── Internals ───────────────────────────────────────────────────────────

/**
 * Build the common request headers GitHub asks of every well-behaved
 * client: Accept, X-GitHub-Api-Version, User-Agent, optional Authorization.
 */
function _commonHeaders(extensionVersion, authToken) {
    /** @type {Record<string, string>} */
    const h = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': `Alex_ACT_Extension/${extensionVersion} (+https://github.com/fabioc-aloha/Alex_ACT_Extension)`
    };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
}

/**
 * GET a JSON endpoint. Resolves to `{ statusCode, headers, body }`. Body
 * is parsed JSON on 200, or null on 304 / non-2xx (the caller handles
 * status-specific behaviour).
 *
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {number} timeoutMs
 * @returns {Promise<{ statusCode: number, headers: import('http').IncomingHttpHeaders, body: any | null }>}
 */
function _httpGetJson(url, headers, timeoutMs) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let body = null;
                if (res.statusCode === 200 && raw) {
                    try { body = JSON.parse(raw); }
                    catch (err) {
                        return reject(_typedError('MALFORMED_JSON', `GitHub returned non-JSON body from ${url}: ${err && err.message}`));
                    }
                }
                resolve({ statusCode: res.statusCode || 0, headers: res.headers, body });
            });
            res.on('error', reject);
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(_typedError('TIMEOUT', `GitHub request timed out after ${timeoutMs}ms: ${url}`));
        });
        req.on('error', reject);
    });
}

/**
 * Resolve `target_commitish` to a 40-char SHA. If it's already a SHA,
 * return it. If it's a branch name, query the refs API.
 *
 * @param {string | null | undefined} target
 * @param {string} extensionVersion
 * @param {string | null} authToken
 * @param {number} timeoutMs
 * @returns {Promise<string | null>}
 */
async function _resolveCommitSha(target, extensionVersion, authToken, timeoutMs) {
    if (!target || typeof target !== 'string') return null;
    if (/^[0-9a-f]{40}$/i.test(target)) return target;
    // Branch name → look up the ref.
    const url = `https://${API_HOST}/repos/${EDITION_REPO.owner}/${EDITION_REPO.repo}/git/ref/heads/${encodeURIComponent(target)}`;
    try {
        const res = await _httpGetJson(url, _commonHeaders(extensionVersion, authToken), timeoutMs);
        if (res.statusCode === 200 && res.body && res.body.object && typeof res.body.object.sha === 'string') {
            return res.body.object.sha;
        }
    } catch {
        // Non-fatal — Extension still works without the commit SHA; it's
        // diagnostic-only. Recorded as null in the marker.
    }
    return null;
}

/**
 * Build a typed error from an unexpected HTTP status. Attaches headers
 * so callers can read rate-limit fields without re-fetching.
 */
function _statusError(status, headers, url) {
    if (status === 403 || status === 429) {
        if (headers && headers['x-ratelimit-remaining'] === '0') {
            return _typedError(
                'RATE_LIMITED',
                `GitHub rate-limited the request to ${url}. Sign in to GitHub in VS Code to raise the limit from 60 to 5,000 requests per hour.`,
                { url, headers, status }
            );
        }
        if (headers && headers['retry-after']) {
            return _typedError(
                'RATE_LIMITED_SECONDARY',
                `GitHub temporarily throttled the request to ${url}. Retry after ${headers['retry-after']}s.`,
                { url, headers, status }
            );
        }
    }
    if (status === 404) {
        return _typedError('REPO_GONE', `Edition repository unreachable: HTTP 404 from ${url}.`, { url, status });
    }
    return _typedError('HTTP_ERROR', `Unexpected HTTP ${status} from ${url}.`, { url, status, headers });
}

function _typedError(code, message, props) {
    const err = new Error(message);
    /** @type {any} */ (err).code = code;
    if (props) Object.assign(err, props);
    return err;
}

module.exports = {
    getLatestTag,
    fetchTarball,
    getSilentAuthToken,
    sweepStaleTempDirs,
    // Cache key the host reads to render Diagnose Fetch state. Not
    // internal; this is the contract between fetch and host.
    CACHE_KEY
};
