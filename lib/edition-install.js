// @ts-check
'use strict';

/**
 * Filesystem layer for the static-fetch Extension (ADR-009).
 *
 * Consumes the extracted tarball from edition-fetch.fetchTarball() and
 * installs the declared brain subtrees into a heir workspace, atomically
 * (failure leaves the existing brain unchanged).
 *
 * Owns:
 *   - Manifest read + validation (spec 1.4 contract fields)
 *   - Per-heir lockfile (concurrent VS Code windows on same workspace)
 *   - Subtree copy from manifest's `brain_subtrees`
 *   - Marker write per `marker_schema`
 *
 * Does NOT own:
 *   - backup-install-recover atomicity at the .github/ level — that's
 *     extension.js cmdUpgrade's existing concern, which wraps this call
 *   - temp-dir cleanup — caller decides when to dispose the parent
 *
 * Error model: every failure path throws an EditionContractError or
 * EditionInstallError with a `code` property the caller pattern-matches
 * on for user-facing messaging.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { compare, gte } = require('./semver');

const SUPPORTED_SPEC_VERSIONS = ['1.4'];
const MANIFEST_REL_PATH = path.join('.github', 'config', 'edition-manifest.json');
const LOCKFILE_PREFIX = 'alex-act-upgrade-';
const LOCKFILE_SUFFIX = '.lock';
const STALE_LOCK_MS = 10 * 60 * 1000; // 10 minutes

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Read and validate the edition-manifest.json from the extracted tarball.
 * Throws an EditionContractError on any contract violation.
 *
 * @param {string} tarballRoot - absolute path to the extracted Edition root
 * @param {string} extensionVersion - this Extension's version, for min_extension_version check
 * @param {string} [fetchedTag] - tag the Extension just fetched, for editionVersion cross-check
 * @returns {{
 *   spec_version: string,
 *   edition_version: string,
 *   min_extension_version: string,
 *   brain_subtrees: string[],
 *   marker_schema: { file_name: string, version: number },
 *   raw: any
 * }}
 */
function readAndValidateManifest(tarballRoot, extensionVersion, fetchedTag) {
    const manifestPath = path.join(tarballRoot, MANIFEST_REL_PATH);
    if (!fs.existsSync(manifestPath)) {
        throw _contractError(
            'MANIFEST_MISSING',
            `Edition tarball is missing ${MANIFEST_REL_PATH}. This Extension (v${extensionVersion}) requires Edition with manifest spec 1.4 or higher (Edition v3.2.0+).`
        );
    }
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
        throw _contractError(
            'MANIFEST_UNPARSEABLE',
            `Edition manifest at ${MANIFEST_REL_PATH} is not valid JSON: ${err && err.message}`
        );
    }

    const spec = raw && raw.spec_version;
    if (typeof spec !== 'string' || !SUPPORTED_SPEC_VERSIONS.includes(spec)) {
        throw _contractError(
            'MANIFEST_SCHEMA_UNSUPPORTED',
            `Edition manifest uses spec "${spec}", which this Extension (v${extensionVersion}) does not understand. Update the Extension via VS Code first, then retry.`
        );
    }

    const editionVersion = raw.edition_version;
    if (typeof editionVersion !== 'string') {
        throw _contractError('MANIFEST_MISSING_FIELD', 'Edition manifest is missing required field: edition_version');
    }
    if (fetchedTag) {
        const tagClean = fetchedTag.replace(/^v/, '');
        if (tagClean !== editionVersion) {
            throw _contractError(
                'MANIFEST_VERSION_MISMATCH',
                `Edition manifest declares edition_version="${editionVersion}" but the fetched tag is "${fetchedTag}". The release is inconsistent and cannot be safely installed.`
            );
        }
    }

    const minExt = raw.min_extension_version;
    if (typeof minExt !== 'string') {
        throw _contractError(
            'MANIFEST_MISSING_CONTRACT_FIELDS',
            `Edition release v${editionVersion} predates the static-fetch Extension contract (manifest spec < 1.4 effective fields). This Extension (v${extensionVersion}) requires Edition v3.2.0 or later. Wait for the next Edition release.`
        );
    }
    if (!gte(extensionVersion, minExt)) {
        throw _contractError(
            'EXTENSION_TOO_OLD',
            `Edition v${editionVersion} requires Extension v${minExt} or later. You're on v${extensionVersion}. Update the Extension via VS Code first, then retry.`
        );
    }

    const subtrees = raw.brain_subtrees;
    if (!Array.isArray(subtrees) || subtrees.length === 0) {
        throw _contractError(
            'MANIFEST_MISSING_CONTRACT_FIELDS',
            `Edition manifest is missing or empty: brain_subtrees. This Extension cannot install without a non-empty subtree list.`
        );
    }
    for (const sub of subtrees) {
        if (typeof sub !== 'string' || sub.includes('..') || path.isAbsolute(sub)) {
            throw _contractError(
                'MANIFEST_INVALID_SUBTREE',
                `Edition manifest contains an invalid brain_subtrees entry: "${sub}". Entries must be relative paths without ".." segments.`
            );
        }
        const subAbs = path.resolve(tarballRoot, sub);
        if (!fs.existsSync(subAbs) || !fs.statSync(subAbs).isDirectory()) {
            throw _contractError(
                'MANIFEST_SUBTREE_MISSING',
                `Edition manifest declares brain_subtrees entry "${sub}" but no such directory exists in the tarball. Edition release is inconsistent.`
            );
        }
    }

    const marker = raw.marker_schema;
    if (!marker || typeof marker.file_name !== 'string' || typeof marker.version !== 'number') {
        throw _contractError(
            'MANIFEST_MISSING_CONTRACT_FIELDS',
            `Edition manifest is missing or malformed: marker_schema. Expected { file_name, version }.`
        );
    }

    return {
        spec_version: spec,
        edition_version: editionVersion,
        min_extension_version: minExt,
        brain_subtrees: subtrees,
        marker_schema: marker,
        raw
    };
}

/**
 * Compute the absolute lockfile path for a given heir workspace root.
 * Lives under `os.tmpdir()` keyed by a sha256 hash of the resolved heir
 * path, so the lock does not pollute the heir's `git status`. Two VS
 * Code windows on the same workspace resolve to the same hash and
 * therefore the same lockfile; different workspaces never collide.
 *
 * @param {string} heirRoot
 * @returns {string}
 */
function getLockPath(heirRoot) {
    const canonical = path.resolve(heirRoot);
    const hash = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
    return path.join(os.tmpdir(), `${LOCKFILE_PREFIX}${hash}${LOCKFILE_SUFFIX}`);
}

/**
 * Take an exclusive per-heir lock to prevent concurrent VS Code windows
 * from racing on the same workspace. The returned object must have its
 * `release()` method called in a `finally` block.
 *
 * Stale locks (mtime > STALE_LOCK_MS ago) are treated as crashed-and-
 * abandoned and broken atomically.
 *
 * @param {string} heirRoot
 * @returns {{ release: () => void, path: string }}
 */
function acquireLock(heirRoot) {
    const lockPath = getLockPath(heirRoot);
    const payload = JSON.stringify({
        pid: process.pid,
        host: process.platform,
        acquired_at: new Date().toISOString()
    });
    // Try once; if EEXIST and stale, break and retry once.
    try {
        fs.writeFileSync(lockPath, payload, { flag: 'wx' });
    } catch (err) {
        if (err && /** @type {any} */ (err).code === 'EEXIST') {
            let stale = false;
            try {
                const stat = fs.statSync(lockPath);
                if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) stale = true;
            } catch { /* unreadable lock — treat as stale */ stale = true; }
            if (stale) {
                try { fs.unlinkSync(lockPath); } catch { /* best effort */ }
                fs.writeFileSync(lockPath, payload, { flag: 'wx' });
            } else {
                throw _installError(
                    'CONCURRENT_UPGRADE',
                    `Brain upgrade already in progress in another VS Code window (lock held at ${lockPath}). Wait for it to finish, then retry.`
                );
            }
        } else {
            throw err;
        }
    }
    return {
        path: lockPath,
        release: () => {
            try { fs.unlinkSync(lockPath); } catch { /* best effort */ }
        }
    };
}

/**
 * Install the brain from the extracted tarball into `heirRoot`.
 *
 * This is the destructive step. Caller must have already taken any
 * higher-level backup (cmdUpgrade does this); the in-tarball subtree
 * copies are NOT individually backed up by this function.
 *
 * Returns the resolved manifest plus paths copied (diagnostic).
 *
 * @param {string} tarballRoot
 * @param {string} heirRoot
 * @param {string} extensionVersion
 * @param {{
 *   fetchedTag?: string,
 *   commitSha?: string | null,
 *   authMode?: 'authenticated' | 'anonymous',
 *   heirIdentity?: { heir_id?: string, owner?: string, repo_url?: string, heir_name?: string }
 * }} [ctx]
 * @returns {{ manifest: ReturnType<typeof readAndValidateManifest>, subtreesCopied: string[], markerPath: string }}
 */
function installFromTarball(tarballRoot, heirRoot, extensionVersion, ctx) {
    const fetchedTag = ctx && ctx.fetchedTag;
    const manifest = readAndValidateManifest(tarballRoot, extensionVersion, fetchedTag);

    const copied = [];
    for (const sub of manifest.brain_subtrees) {
        const srcAbs = path.resolve(tarballRoot, sub);
        const dstAbs = path.resolve(heirRoot, sub);
        // Replace-in-place. Caller owns whether to back up first.
        if (fs.existsSync(dstAbs)) {
            fs.rmSync(dstAbs, { recursive: true, force: true });
        }
        fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
        _copyDirRecursive(srcAbs, dstAbs);
        copied.push(sub);
    }

    // Marker write. Preserves heir identity if provided; otherwise tries
    // to read it from any existing marker so an upgrade doesn't lose
    // heir_id / owner / repo_url. The marker lives inside .github/, so it
    // gets nuked by the subtree replace above — write it AFTER the copy.
    const markerPath = path.join(heirRoot, manifest.marker_schema.file_name);
    const existingMarker = _readExistingMarker(heirRoot, manifest.marker_schema.file_name);
    const identity = (ctx && ctx.heirIdentity) || {};
    const marker = {
        spec_version: '2',
        heir_id: identity.heir_id || (existingMarker && existingMarker.heir_id) || null,
        heir_name: identity.heir_name || (existingMarker && existingMarker.heir_name) || null,
        owner: identity.owner || (existingMarker && existingMarker.owner) || null,
        repo_url: identity.repo_url || (existingMarker && existingMarker.repo_url) || null,
        edition_version: manifest.edition_version,
        source: 'github-fetch',
        commit_sha: (ctx && ctx.commitSha) || null,
        fetched_at: new Date().toISOString(),
        auth_mode: (ctx && ctx.authMode) || 'anonymous',
        extension_version: extensionVersion,
        marker_schema_version: manifest.marker_schema.version
    };
    // Ensure parent exists (file lives at heir root or under .github/ depending on schema).
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf8');

    return { manifest, subtreesCopied: copied, markerPath };
}

// ── Internals ───────────────────────────────────────────────────────────

/**
 * @param {string} src
 * @param {string} dst
 */
function _copyDirRecursive(src, dst) {
    if (typeof fs.cpSync === 'function') {
        // Node 16.7+ — preferred. force:true overwrites, recursive:true descends.
        fs.cpSync(src, dst, { recursive: true, force: true });
        return;
    }
    // Fallback for old Node — should not fire on supported VS Code engines (>=1.117 ships Node 20+).
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dst, entry.name);
        if (entry.isDirectory()) _copyDirRecursive(s, d);
        else if (entry.isFile()) fs.copyFileSync(s, d);
    }
}

/**
 * @param {string} heirRoot
 * @param {string} markerFileName
 */
function _readExistingMarker(heirRoot, markerFileName) {
    const p = path.join(heirRoot, markerFileName);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { return null; }
}

function _contractError(code, message) {
    const err = new Error(message);
    /** @type {any} */ (err).code = code;
    /** @type {any} */ (err).kind = 'EditionContractError';
    return err;
}

function _installError(code, message) {
    const err = new Error(message);
    /** @type {any} */ (err).code = code;
    /** @type {any} */ (err).kind = 'EditionInstallError';
    return err;
}

/**
 * Pure function: additively merge the static-fetch v2 marker fields into
 * an existing heir marker object. Returns a new object; does not mutate
 * the input. When `fetchProvenance` is null or describes a bundled-brain
 * source, the marker is returned unchanged (v1 shape preserved).
 *
 * This function is the load-bearing surface for the extension.js bootstrap
 * and upgrade marker writes; isolating it here lets unit tests cover the
 * field-population logic without needing VS Code APIs (audit F10).
 *
 * @param {Record<string, any>} marker - existing marker object (v1 shape OK)
 * @param {{ source: string, commitSha?: string | null, authMode?: string } | null} fetchProvenance
 * @param {string} extensionVersion
 * @returns {Record<string, any>}
 */
function applyStaticFetchMarkerFields(marker, fetchProvenance, extensionVersion) {
    if (!fetchProvenance || fetchProvenance.source !== 'github-fetch') {
        return marker;
    }
    return Object.assign({}, marker, {
        source: 'github-fetch',
        commit_sha: fetchProvenance.commitSha || null,
        fetched_at: new Date().toISOString(),
        auth_mode: fetchProvenance.authMode || 'anonymous',
        extension_version: extensionVersion || 'unknown',
        marker_schema_version: 2
    });
}

module.exports = {
    readAndValidateManifest,
    acquireLock,
    getLockPath,
    installFromTarball,
    applyStaticFetchMarkerFields,
    // Exposed for tests + diagnostics:
    SUPPORTED_SPEC_VERSIONS,
    MANIFEST_REL_PATH,
    STALE_LOCK_MS
};
