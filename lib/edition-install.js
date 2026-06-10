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
 *   vscode_assets: string[],
 *   bootstrap_templates: string[],
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

    // Optional fields (added 2026-06-09 per ADR-009 amendment). Absent or []
    // is a no-op; validate shape and tarball-existence when present.
    const vscodeAssets = _validateVscodeAssets(raw.vscode_assets, tarballRoot);
    const bootstrapTemplates = _validateBootstrapTemplates(raw.bootstrap_templates, tarballRoot);

    return {
        spec_version: spec,
        edition_version: editionVersion,
        min_extension_version: minExt,
        brain_subtrees: subtrees,
        vscode_assets: vscodeAssets,
        bootstrap_templates: bootstrapTemplates,
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
 * @returns {{ manifest: ReturnType<typeof readAndValidateManifest>, subtreesCopied: string[], vscodeAssetsCopied: string[], bootstrapTemplatesInstalled: string[], bootstrapTemplatesSkipped: string[], markerPath: string }}
 */
function installFromTarball(tarballRoot, heirRoot, extensionVersion, ctx) {
    const fetchedTag = ctx && ctx.fetchedTag;
    const manifest = readAndValidateManifest(tarballRoot, extensionVersion, fetchedTag);

    // Defense-in-depth: HEIR_OWNED source-side filter on brain_subtree copy.
    // Edition's `_registry.cjs` declares paths the heir owns (workflows/,
    // dependabot.yml, ISSUE_TEMPLATE/, episodic/, local/ namespaces, …).
    // Before v9.5.1 the Extension copied .github verbatim, leaking Edition's
    // curator-owned CI / dependabot policy into every heir. The filter reads
    // HEIR_OWNED from the fetched tarball and skips matching files during
    // the subtree copy. Older Edition tags without _registry.cjs degrade
    // gracefully to verbatim copy (pre-v9.5.1 behavior preserved).
    const heirOwnedGlobs = _loadHeirOwnedGlobs(tarballRoot);

    const copied = [];
    for (const sub of manifest.brain_subtrees) {
        const srcAbs = path.resolve(tarballRoot, sub);
        const dstAbs = path.resolve(heirRoot, sub);
        // Replace-in-place. Caller owns whether to back up first.
        if (fs.existsSync(dstAbs)) {
            fs.rmSync(dstAbs, { recursive: true, force: true });
        }
        fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
        _copyDirRecursive(srcAbs, dstAbs, { tarballRoot, heirOwnedGlobs });
        copied.push(sub);
    }

    // vscode_assets: Edition-owned files under .vscode/, refresh on every install.
    const vscodeAssetsCopied = [];
    for (const basename of manifest.vscode_assets) {
        const srcAbs = path.resolve(tarballRoot, '.vscode', basename);
        const dstAbs = path.resolve(heirRoot, '.vscode', basename);
        fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
        fs.copyFileSync(srcAbs, dstAbs);
        vscodeAssetsCopied.push(path.posix.join('.vscode', basename));
    }

    // bootstrap_templates: HEIR_OWNED first-install templates. Install only if
    // the target does not already exist. Entries inside a brain_subtree get
    // unconditionally overwritten by the subtree copy above, then skipped here
    // (file exists ⇒ Edition version wins); outside-subtree entries follow the
    // intended first-install-only semantics (heir edits preserved on upgrade).
    const bootstrapTemplatesInstalled = [];
    const bootstrapTemplatesSkipped = [];
    for (const rel of manifest.bootstrap_templates) {
        const srcAbs = path.resolve(tarballRoot, rel);
        const dstAbs = path.resolve(heirRoot, rel);
        if (fs.existsSync(dstAbs)) {
            bootstrapTemplatesSkipped.push(rel);
            continue;
        }
        fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
        fs.copyFileSync(srcAbs, dstAbs);
        bootstrapTemplatesInstalled.push(rel);
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

    return { manifest, subtreesCopied: copied, vscodeAssetsCopied, bootstrapTemplatesInstalled, bootstrapTemplatesSkipped, markerPath };
}

// ── Internals ───────────────────────────────────────────────────────────

/**
 * Load HEIR_OWNED globs from the tarball's `_registry.cjs` (best-effort).
 * Returns an empty array if the file is missing, fails to require, or
 * doesn't export an HEIR_OWNED array — in which case the caller falls
 * back to a verbatim copy (graceful degradation; preserves pre-v9.5.1
 * behavior for older Edition tags that predate the registry).
 *
 * The registry is a heir-shipped CommonJS module under
 * `.github/scripts/_registry.cjs`. Loading it from a fresh temp dir each
 * fetch avoids any Node require-cache pollution.
 *
 * @param {string} tarballRoot - absolute path to extracted Edition root
 * @returns {string[]}
 */
function _loadHeirOwnedGlobs(tarballRoot) {
    const regPath = path.join(tarballRoot, '.github', 'scripts', '_registry.cjs');
    if (!fs.existsSync(regPath)) return [];
    try {
        // Bust require cache to avoid cross-fetch leakage.
        delete require.cache[require.resolve(regPath)];
        const reg = require(regPath);
        return Array.isArray(reg.HEIR_OWNED) ? reg.HEIR_OWNED.slice() : [];
    } catch {
        return [];
    }
}

/**
 * Test whether a workspace-relative path (forward slashes) matches any of
 * the HEIR_OWNED glob patterns. Patterns are either literal paths
 * (e.g. `.github/dependabot.yml`) or directory-globs ending in `/**`
 * (e.g. `.github/workflows/**`). Anything else is treated as literal.
 *
 * Restricted glob vocabulary matches the patterns actually used by
 * Edition's `_registry.cjs` HEIR_OWNED array (verified 2026-06-10);
 * not a general-purpose glob matcher.
 *
 * @param {string} rel - workspace-relative path, forward slashes
 * @param {string[]} patterns - HEIR_OWNED globs
 * @returns {boolean}
 */
function _matchesHeirOwnedGlob(rel, patterns) {
    for (const pattern of patterns) {
        if (pattern.endsWith('/**')) {
            const prefix = pattern.slice(0, -3);
            if (rel === prefix || rel.startsWith(prefix + '/')) return true;
        } else if (!pattern.includes('*')) {
            if (rel === pattern) return true;
        }
        // Other glob shapes intentionally not matched — Edition's HEIR_OWNED
        // is currently flat literal or `path/**`. A future glob shape would
        // need explicit handling here.
    }
    return false;
}

/**
 * @param {string} src
 * @param {string} dst
 * @param {object} [opts]
 * @param {string} [opts.tarballRoot] - extracted Edition root, for relpath calc
 * @param {string[]} [opts.heirOwnedGlobs] - skip files whose tarball-relative
 *   path matches any glob. Directories always traversed; per-file decision.
 */
function _copyDirRecursive(src, dst, opts) {
    const tarballRoot = opts && opts.tarballRoot;
    const heirOwnedGlobs = (opts && opts.heirOwnedGlobs) || [];
    const filtering = tarballRoot && heirOwnedGlobs.length > 0;

    if (typeof fs.cpSync === 'function') {
        // Node 16.7+ — preferred. force:true overwrites, recursive:true descends.
        const cpOpts = { recursive: true, force: true };
        if (filtering) {
            cpOpts.filter = (srcPath) => {
                try {
                    if (fs.statSync(srcPath).isDirectory()) return true;
                } catch { return true; }
                const rel = path.relative(tarballRoot, srcPath).split(path.sep).join('/');
                return !_matchesHeirOwnedGlob(rel, heirOwnedGlobs);
            };
        }
        fs.cpSync(src, dst, cpOpts);
        return;
    }
    // Fallback for old Node — should not fire on supported VS Code engines (>=1.117 ships Node 20+).
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            _copyDirRecursive(s, d, opts);
        } else if (entry.isFile()) {
            if (filtering) {
                const rel = path.relative(tarballRoot, s).split(path.sep).join('/');
                if (_matchesHeirOwnedGlob(rel, heirOwnedGlobs)) continue;
            }
            fs.copyFileSync(s, d);
        }
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
 * Validate manifest.vscode_assets (added 2026-06-09). Optional array of file
 * basenames (no path separators, no `..`) that exist under .vscode/ in the
 * tarball. Returns the normalized array (empty when absent).
 *
 * @param {any} value
 * @param {string} tarballRoot
 * @returns {string[]}
 */
function _validateVscodeAssets(value, tarballRoot) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
        throw _contractError(
            'MANIFEST_INVALID_VSCODE_ASSET',
            `Edition manifest field vscode_assets must be an array of basenames, got ${typeof value}.`
        );
    }
    for (const entry of value) {
        if (typeof entry !== 'string'
            || entry.length === 0
            || entry.includes('/')
            || entry.includes('\\')
            || entry.includes('..')
            || path.isAbsolute(entry)) {
            throw _contractError(
                'MANIFEST_INVALID_VSCODE_ASSET',
                `Edition manifest contains an invalid vscode_assets entry: "${entry}". Entries must be plain file basenames (no path separators, no ".." segments, not absolute).`
            );
        }
        const abs = path.resolve(tarballRoot, '.vscode', entry);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            throw _contractError(
                'MANIFEST_VSCODE_ASSET_MISSING',
                `Edition manifest declares vscode_assets entry ".vscode/${entry}" but no such file exists in the tarball. Edition release is inconsistent.`
            );
        }
    }
    return value.slice();
}

/**
 * Validate manifest.bootstrap_templates (added 2026-06-09). Optional array of
 * repo-relative paths (no `..` segments, not absolute) that exist as files in
 * the tarball. Returns the normalized array (empty when absent).
 *
 * @param {any} value
 * @param {string} tarballRoot
 * @returns {string[]}
 */
function _validateBootstrapTemplates(value, tarballRoot) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
        throw _contractError(
            'MANIFEST_INVALID_BOOTSTRAP_TEMPLATE',
            `Edition manifest field bootstrap_templates must be an array of paths, got ${typeof value}.`
        );
    }
    for (const entry of value) {
        if (typeof entry !== 'string'
            || entry.length === 0
            || entry.includes('..')
            || path.isAbsolute(entry)) {
            throw _contractError(
                'MANIFEST_INVALID_BOOTSTRAP_TEMPLATE',
                `Edition manifest contains an invalid bootstrap_templates entry: "${entry}". Entries must be relative paths without ".." segments and not absolute.`
            );
        }
        const abs = path.resolve(tarballRoot, entry);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            throw _contractError(
                'MANIFEST_BOOTSTRAP_TEMPLATE_MISSING',
                `Edition manifest declares bootstrap_templates entry "${entry}" but no such file exists in the tarball. Edition release is inconsistent.`
            );
        }
    }
    return value.slice();
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
    STALE_LOCK_MS,
    _loadHeirOwnedGlobs,
    _matchesHeirOwnedGlob
};
