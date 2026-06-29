// @ts-check
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { listFilesRecursive } = require('./lib/fs-utils');
const { EDITION_REPO } = require('./lib/edition-source');
const { getLatestTag, fetchTarball, getSilentAuthToken, sweepStaleTempDirs, CACHE_KEY: EDITION_FETCH_CACHE_KEY } = require('./lib/edition-fetch');
const { readAndValidateManifest, acquireLock, getLockPath, applyStaticFetchMarkerFields } = require('./lib/edition-install');
const { pathMatchesAny, shouldSkipForHeirOwnership } = require('./lib/heir-ownership');
const { installVscodeAssets, seedBootstrapTemplates } = require('./lib/manifest-assets');

// ── Paths ───────────────────────────────────────────────────────────────
// BRAIN_DIR is mutable. In v9.3.x it stays at `<extension>/brain` (bundled
// brain). In v9.4.0+ (per ADR-009 static-fetch) the VSIX ships no `brain/`
// directory; ensureBrainDir() populates BRAIN_DIR with the .github root
// of a freshly-fetched Edition tarball before any destructive op runs.
//
// Sync callers (status bar, getBundledEditionVersion) gracefully degrade
// when bundle is absent and tarball has not yet been fetched this session.
let BRAIN_DIR = path.join(__dirname, 'brain');

// Set at activate() time so the static-fetch helper can reach extension
// state (globalState for ETag cache, extension.packageJSON.version for
// User-Agent) from sync utility functions. Null until activate runs;
// callers that need ctx before activation should not exist in practice.
/** @type {vscode.ExtensionContext | null} */
let _extensionContext = null;

// Static-fetch state. Populated by ensureBrainDir() in fetch mode; null
// when the bundled brain is in use.
let _fetchProvenance = null; // { source, tag, commitSha, authMode, tempParent }
let _fetchCleanup = null;    // () => void

/**
 * True if the Extension is running in static-fetch mode (no bundled brain
 * directory present in the install location).
 */
function isStaticFetchMode() {
    return !fs.existsSync(path.join(__dirname, 'brain'));
}

/**
 * Read the last-known Edition version from globalState (populated by
 * getLatestTag's ETag cache). Used by sync callers in static-fetch mode
 * when they need to display an "available version" without paying the
 * cost of an HTTPS round-trip.
 *
 * @param {vscode.ExtensionContext} ctx
 * @returns {string | null}
 */
function getCachedLatestEditionTag(ctx) {
    try {
        const cached = ctx && ctx.globalState && ctx.globalState.get(EDITION_FETCH_CACHE_KEY);
        if (cached && typeof cached.tag === 'string') return cached.tag;
    } catch { /* best effort */ }
    return null;
}

/**
 * Ensure BRAIN_DIR points at a usable Edition brain. In bundled mode
 * (`<extension>/brain` exists) this is a no-op. In static-fetch mode this
 * downloads the latest Edition release tarball to a per-fetch temp dir,
 * validates the manifest contract per ADR-009, and points BRAIN_DIR at
 * `<tarball>/.github`.
 *
 * Throws a typed error on any failure; callers should let the throw
 * propagate BEFORE any destructive op runs against the heir.
 *
 * Sets `_fetchCleanup` to a function that deletes the temp dir. The
 * cmdBootstrap / cmdUpgrade wrappers call it in their finally blocks.
 *
 * @param {vscode.ExtensionContext} [ctx]
 * @returns {Promise<{ source: 'bundled' | 'github-fetch', tag?: string, commitSha?: string | null, authMode?: 'authenticated' | 'anonymous' }>}
 */
async function ensureBrainDir(ctx) {
    ctx = ctx || _extensionContext;
    if (!ctx) {
        // No context — refuse rather than guess. This should not happen
        // in practice; both bootstrap and upgrade run after activate().
        throw new Error('ensureBrainDir called before activate(); cannot reach extension state.');
    }
    const bundled = path.join(__dirname, 'brain');
    if (fs.existsSync(bundled)) {
        BRAIN_DIR = bundled;
        _fetchProvenance = { source: 'bundled' };
        _fetchCleanup = null;
        return { source: 'bundled' };
    }

    // Static-fetch path. Acquire silent auth (no prompt), fetch latest
    // tag with ETag-conditional cache, then download tarball.
    const extensionVersion = (ctx && ctx.extension && ctx.extension.packageJSON && ctx.extension.packageJSON.version) || '0.0.0';
    const authToken = await getSilentAuthToken(vscode);

    let tagInfo;
    try {
        tagInfo = await getLatestTag(extensionVersion, ctx.globalState, { authToken });
    } catch (err) {
        // Re-throw with a friendlier message for the bootstrap/upgrade
        // callers. The /typed/ code property is preserved for diagnostics.
        const code = /** @type {any} */ (err).code || 'FETCH_FAILED';
        const msg = code === 'TIMEOUT'
            ? 'Could not reach github.com to check for the latest Edition release. Check your connection. If you are behind a corporate proxy, allowlist api.github.com and codeload.github.com.'
            : code === 'RATE_LIMITED'
                ? 'GitHub rate limit reached for fetching the Edition release list. Sign in to GitHub in VS Code to raise the limit from 60 to 5,000 requests per hour.'
                : code === 'REPO_GONE'
                    ? 'The Edition repository appears unreachable. Check https://www.githubstatus.com for an active incident; if the outage persists, see ADR-009 (extension brain delivery).'
                    : `Could not fetch the Edition release list from GitHub: ${err && err.message ? err.message : err}`;
        const friendly = new Error(msg);
        /** @type {any} */ (friendly).code = code;
        /** @type {any} */ (friendly).cause = err;
        throw friendly;
    }

    let fetch;
    try {
        fetch = await fetchTarball(tagInfo.tag, extensionVersion, { authToken });
    } catch (err) {
        const code = /** @type {any} */ (err).code || 'TARBALL_FETCH_FAILED';
        const msg = code === 'TAG_NOT_FOUND'
            ? `GitHub published the Edition release list, but the tarball for ${tagInfo.tag} is missing. The release may have been unpublished; try again later, or report it with the output of "ACT: Diagnose Fetch".`
            : code === 'RATE_LIMITED'
                ? `GitHub rate-limited the download of Edition ${tagInfo.tag}. Sign in to GitHub in VS Code to raise the limit from 60 to 5,000 requests per hour.`
                : `Could not download the Edition ${tagInfo.tag} tarball from GitHub: ${err && err.message ? err.message : err}`;
        const friendly = new Error(msg);
        /** @type {any} */ (friendly).code = code;
        /** @type {any} */ (friendly).cause = err;
        throw friendly;
    }

    // Validate the manifest contract BEFORE any destructive op.
    try {
        readAndValidateManifest(fetch.tarballRoot, extensionVersion, tagInfo.tag);
    } catch (err) {
        // Clean up temp dir before re-throwing — caller's finally will
        // also try, but doing it here means callers that never get to
        // their finally (early throw) don't leak the temp dir.
        try { fs.rmSync(fetch.tempParent, { recursive: true, force: true }); } catch { /* best effort */ }
        throw err;
    }

    BRAIN_DIR = path.join(fetch.tarballRoot, '.github');
    _fetchProvenance = {
        source: 'github-fetch',
        tag: tagInfo.tag,
        commitSha: tagInfo.commitSha,
        authMode: tagInfo.authMode,
        tarballRoot: fetch.tarballRoot,
        tempParent: fetch.tempParent
    };
    _fetchCleanup = () => {
        try { fs.rmSync(fetch.tempParent, { recursive: true, force: true }); } catch { /* best effort */ }
        // BRAIN_DIR intentionally NOT reset here. In static-fetch mode the
        // bundled `<extension>/brain` does not exist; the next ensureBrainDir()
        // call sets BRAIN_DIR to a freshly-fetched tarball root. Sync callers
        // that touch BRAIN_DIR between commands gracefully degrade to
        // 'unknown' (see isStaticFetchMode guard in getBundledEditionVersion).
        _fetchProvenance = null;
        _fetchCleanup = null;
    };
    return {
        source: 'github-fetch',
        tag: tagInfo.tag,
        commitSha: tagInfo.commitSha,
        authMode: tagInfo.authMode
    };
}

// ── Semver comparison ────────────────────────────────────────────────────
//
// Upgrade prompts must only fire when the bundled/available Edition is
// strictly newer than what the workspace already has. A naive `!==`
// check would offer a downgrade when a user installs an older Extension
// build (or when the cached "latest" tag briefly lags behind the
// marker). Pre-release suffixes are ignored — we compare only the
// numeric MAJOR.MINOR.PATCH prefix, which matches how `brain/VERSION`
// is shaped.
function isNewerSemver(candidate, current) {
    const parse = (v) => {
        if (!v || typeof v !== 'string') return null;
        const m = v.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
        if (!m) return null;
        return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    };
    const a = parse(candidate);
    const b = parse(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
    }
    return false;
}

// ── Bundled brain introspection ──────────────────────────────────────────
function getBundledEditionVersion() {
    try {
        const v = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
        if (!v || v === 'unknown') {
            // Not a warning in static-fetch mode — sync callers don't
            // know whether ensureBrainDir() has populated BRAIN_DIR yet.
            if (!isStaticFetchMode()) {
                console.warn('ACT: brain/VERSION is missing or empty — bundled brain may be incomplete.');
            }
            return 'unknown';
        }
        return v;
    } catch (e) {
        // Same: silent in static-fetch mode pre-ensureBrainDir.
        if (!isStaticFetchMode()) {
            console.warn('ACT: brain/VERSION unreadable:', e && e.message ? e.message : e);
        }
        return 'unknown';
    }
}

/**
 * Count edition-shipped artifacts in the bundled brain. Returns an object with
 * counts that are read at call time, never hardcoded in user-facing strings.
 * Errors collapse to 0 silently — a bad count in a friendly prompt is less
 * harmful than a thrown exception during bootstrap.
 */
function getBundledCounts() {
    const count = (subdir, suffix) => {
        const dir = path.join(BRAIN_DIR, subdir);
        if (!fs.existsSync(dir)) return 0;
        try {
            return fs.readdirSync(dir).filter(n => n.endsWith(suffix)).length;
        } catch { return 0; }
    };
    const countSkills = () => {
        const dir = path.join(BRAIN_DIR, 'skills');
        if (!fs.existsSync(dir)) return 0;
        try {
            return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).length;
        } catch { return 0; }
    };
    return {
        instructions: count('instructions', '.instructions.md'),
        skills: countSkills(),
        prompts: count('prompts', '.prompt.md'),
        agents: count('agents', '.agent.md'),
    };
}

// Defensive marker reader. Returns null if the file is missing or malformed.
function readMarkerSafe(markerPath) {
    try {
        if (!fs.existsSync(markerPath)) return null;
        return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    } catch { return null; }
}

function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
}

function getGitHubDir(root) {
    return path.join(root, '.github');
}

function getMarkerPath(root) {
    return path.join(root, '.github', '.act-heir.json');
}

// ── Protected-repo marker ─────────────────────────────────────────
// Constellation source repos (Supervisor, Edition, Mall, Extension,
// Memory, Visual_Storytelling) ship `.act-protected.json` at their
// repo root. The marker tells the Extension "do not offer bootstrap
// here; show a padlock so the user knows this is a curator-managed
// repo, not a heir workspace." Schema: { kind, name, role, note,
// bootstrap_allowed }. Returns null if the file is missing or
// unreadable — a missing marker is the normal case for everything
// except the constellation's own repos.
function getProtectedMarkerPath(root) {
    return path.join(root, '.act-protected.json');
}

function readProtectedMarker(root) {
    try {
        const p = getProtectedMarkerPath(root);
        if (!fs.existsSync(p)) return null;
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch { return null; }
}

// ── Edition manifest (authoritative bill-of-materials) ─────────────
// The manifest at brain/config/edition-manifest.json declares which files
// are heir-owned "bootstrap_templates" (copy on first install, never
// overwrite on upgrade). Anything not in that list is edition-owned and
// overwritten on upgrade. Returns null if the manifest is missing/invalid.
function loadEditionManifest() {
    const p = path.join(BRAIN_DIR, 'config', 'edition-manifest.json');
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function getBootstrapTemplateSet(manifest) {
    const s = new Set();
    if (manifest && Array.isArray(manifest.bootstrap_templates)) {
        for (const t of manifest.bootstrap_templates) {
            s.add(String(t).replace(/\\/g, '/'));
        }
    }
    return s;
}

function getEditionRootForInstall() {
    if (_fetchProvenance && _fetchProvenance.tarballRoot) return _fetchProvenance.tarballRoot;
    return path.dirname(BRAIN_DIR);
}

// Map a brain-relative path (e.g. `instructions/foo.md` or `.vscode/settings.json`)
// to its workspace-relative key and absolute destination. Files under `.vscode/`
// land at the workspace root; everything else lands under `.github/`.
function resolveBrainDest(rel, workspaceRoot, ghDir) {
    const norm = rel.replace(/\\/g, '/');
    if (norm === '.vscode' || norm.startsWith('.vscode/')) {
        return { wsRel: norm, dst: path.join(workspaceRoot, norm) };
    }
    return { wsRel: '.github/' + norm, dst: path.join(ghDir, norm) };
}

// ── File operations ────────────────────────────────────────────────

function copyFileSync(src, dst) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
}

/**
 * Merge the heir workspace-settings baseline into the heir's
 * `.vscode/settings.json`. Mirrors the invocation pattern used by
 * `brain/scripts/bootstrap-heir.cjs` and `brain/scripts/upgrade-self.cjs`
 * (Edition v2.6.0+); needed here because the Extension's cmdBootstrap and
 * cmdUpgrade are independent JS implementations that do not invoke the
 * Edition shell scripts. Returns `{ ok, changes, error }` where `changes`
 * is the count of upserted keys (0 = no-op). Best-effort: any failure is
 * reported but does not abort the surrounding command.
 *
 * @param {string} root - heir workspace root
 * @returns {{ ok: boolean, changes: number, error?: string }}
 */
function mergeHeirWorkspaceSettings(root) {
    try {
        const baselinePath = path.join(BRAIN_DIR, 'config', 'heir-workspace-settings-baseline.json');
        if (!fs.existsSync(baselinePath)) return { ok: true, changes: 0 };
        const mergerPath = path.join(BRAIN_DIR, 'scripts', 'shared', 'workspace-settings-merger.cjs');
        if (!fs.existsSync(mergerPath)) return { ok: true, changes: 0 };
        const { mergeWorkspaceSettings, writeMerged } = require(mergerPath);
        const result = mergeWorkspaceSettings(root, baselinePath);
        if (!result.ok) return { ok: false, changes: 0, error: result.error };
        if (result.changes.length === 0) return { ok: true, changes: 0 };
        writeMerged(result);
        return { ok: true, changes: result.changes.length };
    } catch (e) {
        return { ok: false, changes: 0, error: e && e.message ? e.message : String(e) };
    }
}

// ── Shared Memory Bus ──────────────────────────────────────────────
// Resolution delegated to brain/scripts/_registry.cjs (resolveMemoryBus).
// Extension only needs to invoke it during bootstrap.

// ── Commands ───────────────────────────────────────────────────────

/**
 * Bootstrap: copy brain into workspace .github/
 */
async function cmdBootstrap() {
    const root = getWorkspaceRoot();
    if (!root) {
        vscode.window.showErrorMessage('ACT: Open a workspace folder first.');
        return;
    }

    // Per-heir lockfile FIRST (cheap, local fsync). If a concurrent VS Code
    // window holds the lock, we surface that before paying for the ~5MB
    // tarball download. Stale locks (>10min) are broken atomically inside
    // acquireLock; the message below names the path so the user can force
    // recovery if they're certain no other instance is running.
    let lock;
    try {
        lock = acquireLock(root);
    } catch (err) {
        const code = err && /** @type {any} */ (err).code;
        const lockHint = `\n\nIf you're certain no other instance is running, delete ${getLockPath(root)} and retry.`;
        const msg = code === 'CONCURRENT_UPGRADE'
            ? `ACT: brain bootstrap already in progress in another VS Code window. Wait for it to finish, then retry.${lockHint}`
            : `ACT: could not acquire upgrade lock: ${err && err.message ? err.message : err}`;
        vscode.window.showWarningMessage(msg);
        return;
    }

    try {
        // Static-fetch path (ADR-009): when the VSIX ships no bundled brain,
        // resolve BRAIN_DIR by downloading the latest Edition release tarball
        // before any destructive op. Errors here leave the heir untouched.
        try {
            await ensureBrainDir();
        } catch (err) {
            vscode.window.showErrorMessage(`ACT bootstrap: ${err && err.message ? err.message : err}`);
            return;
        }

        try {
            return await _cmdBootstrapBody(root);
        } finally {
            if (_fetchCleanup) _fetchCleanup();
        }
    } finally {
        lock.release();
    }
}

/**
 * Body of cmdBootstrap, split out so the static-fetch ensureBrainDir +
 * try/finally cleanup can wrap the original logic without rewriting it.
 *
 * @param {string} root
 */
async function _cmdBootstrapBody(root) {

    // Refuse on constellation source repos. The padlock in the status bar
    // already telegraphs this; the modal-blocking refusal is the safety net
    // for when a user runs the command from the palette without first
    // noticing the status-bar state.
    //
    // Strict default: presence of any `.act-protected.json` blocks bootstrap
    // unless `bootstrap_allowed: true` is set explicitly. A marker that omits
    // the field is treated as protected. Adding a permissive marker is a
    // deliberate opt-in, not a default.
    const protectedMarker = readProtectedMarker(root);
    if (protectedMarker && protectedMarker.bootstrap_allowed !== true) {
        vscode.window.showWarningMessage(
            `Refusing to bootstrap: ${protectedMarker.name || 'this repo'} is a protected constellation repo (kind: ${protectedMarker.kind || 'unknown'}).\n\n${protectedMarker.note || 'Open a separate workspace and bootstrap there instead.'}`,
            { modal: true }
        );
        return;
    }

    const markerPath = getMarkerPath(root);
    if (fs.existsSync(markerPath)) {
        const marker = readMarkerSafe(markerPath);
        if (!marker) {
            vscode.window.showErrorMessage(
                `ACT: heir marker at ${path.relative(root, markerPath)} is corrupted. Restore from .github-backup-* or re-bootstrap after removing it.`
            );
            return;
        }
        vscode.window.showWarningMessage(
            `This workspace is already an ACT heir (${marker.heir_id}, v${marker.edition_version}). Use "ACT: Upgrade Brain" instead.`
        );
        return;
    }

    // Derive heir-id from folder name
    const folderName = path.basename(root).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const heirId = await vscode.window.showInputBox({
        prompt: 'Heir ID (lowercase, alphanumeric + hyphens)',
        value: folderName,
        validateInput: v => /^[a-z0-9][a-z0-9-]{1,63}$/.test(v) ? null : 'Must be 2-64 chars, lowercase alphanumeric + hyphens',
    });
    if (!heirId) return;

    const heirName = await vscode.window.showInputBox({
        prompt: 'Display name (human-readable)',
        value: path.basename(root),
    });
    if (!heirName) return;

    const confirm = await vscode.window.showWarningMessage(
        `Bootstrap ACT Edition v${getBundledEditionVersion()} into this workspace?\n\n` +
        `This will create .github/ with ${(() => { const c = getBundledCounts(); return `${c.instructions} instructions, ${c.skills} skills, ${c.prompts} prompts, and ${c.agents} agents`; })()}.`,
        { modal: true },
        'Bootstrap'
    );
    if (confirm !== 'Bootstrap') return;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'ACT: Bootstrapping brain...',
        cancellable: false,
    }, async (progress) => {
        const ghDir = getGitHubDir(root);
        const manifest = loadEditionManifest();
        const bootstrapTemplates = getBootstrapTemplateSet(manifest);
        // Load HEIR_OWNED policy from the fetched tarball (or bundled brain
        // on legacy installs). When null (pre-v3.4.x Edition tags), the
        // skip helper degrades to no-skip and we get pre-v9.5.5 verbatim
        // behavior. The 2026-06-29 fix wires this list into the copy loop
        // below; the 2026-06-10 install-side filter shipped in
        // lib/edition-install.js was tested but never called by production.
        const ownership = loadOwnershipPolicy();
        const heirOwnedGlobs = ownership ? ownership.HEIR_OWNED : null;

        // 1. Copy edition-owned brain files
        progress.report({ message: 'Copying brain files...' });
        const brainFiles = listFilesRecursive(BRAIN_DIR);
        let copied = 0;
        let heirOwnedSkipped = 0;
        const copyFailures = [];
        for (const rel of brainFiles) {
            const { wsRel, dst } = resolveBrainDest(rel, root, ghDir);
            if (shouldSkipForHeirOwnership(wsRel, heirOwnedGlobs, bootstrapTemplates)) {
                heirOwnedSkipped++;
                continue;
            }
            const isTemplate = bootstrapTemplates.has(wsRel);
            try {
                if (isTemplate) {
                    // Heir-owned template: only copy if absent
                    if (!fs.existsSync(dst)) {
                        copyFileSync(path.join(BRAIN_DIR, rel), dst);
                        copied++;
                    }
                } else {
                    copyFileSync(path.join(BRAIN_DIR, rel), dst);
                    copied++;
                }
            } catch (err) {
                copyFailures.push({ rel: wsRel, err: err && err.message ? err.message : String(err) });
            }
        }
        if (copyFailures.length > 0) {
            const sample = copyFailures.slice(0, 5).map(f => `${f.rel}: ${f.err}`).join('\n');
            const more = copyFailures.length > 5 ? `\n... and ${copyFailures.length - 5} more` : '';
            vscode.window.showWarningMessage(
                `ACT bootstrap: ${copyFailures.length} file(s) failed to copy. Workspace may be in a partial state — consider removing .github/ and retrying.\n\n${sample}${more}`
            );
        }

        const editionRoot = getEditionRootForInstall();
        const vscodeAssetsCopied = installVscodeAssets(root, manifest, editionRoot);

        // 1b. Seed bootstrap templates from the correct source root.
        // .github/config/cognitive-config.json is staged in templates/ because
        // it is intentionally absent from brain/; .vscode/* templates live in
        // the fetched Edition tarball root and must be copied from there.
        const templateResult = seedBootstrapTemplates(root, manifest, editionRoot, path.join(__dirname, 'templates'), null);
        copied += vscodeAssetsCopied.length + templateResult.seeded.length;
        if (templateResult.failures.length > 0) {
            const sample = templateResult.failures.map(f => `${f.rel}: ${f.err}`).join('\n');
            vscode.window.showWarningMessage(
                `ACT bootstrap: ${templateResult.failures.length} bootstrap template(s) failed to seed.\n\n${sample}`
            );
        }

        // 2. Render marker
        progress.report({ message: 'Creating heir marker...' });
        const versionFile = path.join(ghDir, 'VERSION');
        const editionVersion = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : '1.0.0';
        const marker = {
            spec_version: '1.0',
            edition: 'Alex',
            edition_version: editionVersion,
            heir_id: heirId,
            heir_name: heirName,
            repo_url: '',
            deployed_at: new Date().toISOString(),
            last_sync_at: new Date().toISOString(),
            contact: { owner: '' },
            opt_in: { fleet_inventory: true, auto_upgrade: false },
        };
        // Try to get repo URL
        try {
            const { execSync } = require('child_process');
            marker.repo_url = execSync('git remote get-url origin', { cwd: root, encoding: 'utf8' }).trim();
            const match = marker.repo_url.match(/github\.com[:/]([^/]+)/);
            if (match) marker.contact.owner = match[1];
        } catch { /* no git remote */ }

        // Static-fetch v2 marker fields (ADR-009). When the brain came from
        // a GitHub fetch this cycle, additively merge the v2 fields; when
        // bundled, the v1 shape is preserved unchanged. The merge logic
        // lives in lib/edition-install.js so unit tests can cover it without
        // VS Code APIs (audit F10).
        //
        // Note on dual schema versioning: `spec_version` (kept at '1.0')
        // describes the heir-marker DOCUMENT format owned by the Extension.
        // `marker_schema_version` (bumped to 2) describes the CONTRACT
        // version Edition's extension-contract.json declares. Both live in
        // the same JSON because they belong to different schemas with
        // different owners; readers concerned with the static-fetch contract
        // should read marker_schema_version, not spec_version.
        const extVersion = (_extensionContext && _extensionContext.extension && _extensionContext.extension.packageJSON && _extensionContext.extension.packageJSON.version) || 'unknown';
        const finalMarker = applyStaticFetchMarkerFields(marker, _fetchProvenance, extVersion);

        fs.mkdirSync(path.dirname(markerPath), { recursive: true });
        fs.writeFileSync(markerPath, JSON.stringify(finalMarker, null, 2) + '\n');

        // 2b. Merge heir workspace-settings baseline into .vscode/settings.json.
        // HEIR_OWNED file, per-key merge. Without this, .github/skills/local/<name>/SKILL.md
        // and the matching prompts/agents local/ folders are invisible to chat.
        // Mirrors brain/scripts/bootstrap-heir.cjs (Edition v2.6.0+).
        const wsMerge = mergeHeirWorkspaceSettings(root);
        if (!wsMerge.ok) {
            vscode.window.showWarningMessage(`ACT bootstrap: workspace-settings merge skipped (${wsMerge.error}). Run "ACT: Upgrade Brain" to retry.`);
        }

        // 3. Render copilot-instructions.local.md if absent
        const localCI = path.join(ghDir, 'copilot-instructions.local.md');
        if (!fs.existsSync(localCI)) {
            fs.writeFileSync(localCI, [
                '# Identity (heir-owned)',
                '',
                '<!-- This file is heir-owned. Edition upgrades never overwrite it. -->',
                '',
                '## Project Context',
                '',
                '<!-- One-paragraph summary: what this repo does, who uses it, and why. -->',
                '',
                '## My Preferences',
                '',
                '<!-- Communication style, naming conventions, test framework choices, etc. -->',
                '',
            ].join('\n'));
        }

        // 4. Shared memory bus resolution (git-based)
        progress.report({ message: 'Resolving shared memory bus...' });
        try {
            const registry = require(path.join(BRAIN_DIR, 'scripts', '_registry.cjs'));
            const memResult = registry.resolveMemoryBus(root);
            if (memResult && memResult.message) {
                vscode.window.showInformationMessage(`ACT: ${memResult.message}`);
            }
        } catch { /* best-effort; memory bus is optional */ }

        // Run heir-doctor and surface exit code; non-fatal if it fails.
        // 30s timeout so a wedged subprocess can't hang the bootstrap UI indefinitely.
        const doctorOk = await runHeirDoctor(root);

        const doctorLine = doctorOk === null
            ? ''
            : doctorOk ? ' ✓ heir-doctor passed.' : ' ⚠ heir-doctor reported issues (run /status for details).';

        const ACT_WELCOME = 'Run /welcome (orientation)';
        const ACT_CONFIG = 'Run /configure-vscode';
        const ACT_README = 'Open README';
        const choice = await vscode.window.showInformationMessage(
            `ACT Edition v${editionVersion} bootstrapped. ${copied} files written.${doctorLine}\n\n` +
            `Next: open .github/copilot-instructions.local.md and fill in ## Project Context, then start a Copilot Chat and run /welcome.`,
            ACT_WELCOME, ACT_CONFIG, ACT_README
        );
        if (choice === ACT_WELCOME) {
            await vscode.commands.executeCommand('workbench.action.chat.open', { query: '/welcome' });
        } else if (choice === ACT_CONFIG) {
            await vscode.commands.executeCommand('workbench.action.chat.open', { query: '/configure-vscode' });
        } else if (choice === ACT_README) {
            const readme = path.join(root, 'README.md');
            if (fs.existsSync(readme)) {
                await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(readme));
            } else {
                vscode.window.showWarningMessage('No README.md in this workspace.');
            }
        }
    });
}

/**
 * Load the canonical EDITION_OWNED / HEIR_OWNED policy lists from the bundled
 * brain. These mirror what `brain/scripts/upgrade-self.cjs` uses, so the
 * Extension's JS upgrade path and the Edition shell script see the same
 * ownership boundaries. Returns null if the registry is missing or unreadable
 * (in which case callers should refuse to proceed rather than risk
 * misclassification).
 *
 * BRAIN_DIR is immutable from within an extension-host session (it's inside
 * the extension install dir), so no require.cache invalidation is needed.
 *
 * @returns {{ EDITION_OWNED: string[], HEIR_OWNED: string[] } | null}
 */
function loadOwnershipPolicy() {
    try {
        const regPath = path.join(BRAIN_DIR, 'scripts', '_registry.cjs');
        if (!fs.existsSync(regPath)) return null;
        const reg = require(regPath);
        if (!Array.isArray(reg.EDITION_OWNED) || !Array.isArray(reg.HEIR_OWNED)) return null;
        return { EDITION_OWNED: reg.EDITION_OWNED, HEIR_OWNED: reg.HEIR_OWNED };
    } catch { return null; }
}

// pathMatchesAny + shouldSkipForHeirOwnership live in ./lib/heir-ownership.js
// for unit-testability without the vscode runtime. Required at the top of
// this file.

/**
 * Walk the heir's `.github/` and `.vscode/` and collect every file that is
 * heir-owned. Classification rule: HEIR_OWNED wins over EDITION_OWNED when
 * both match (the local/ pattern is more specific than the parent dir
 * pattern; precedence keeps classification unambiguous). Files that match
 * neither are also treated as heir-owned ("unmatched: preserve" from the
 * script). Always includes the canonical merge-point files even when
 * absent from the heir's tree.
 *
 * @param {string} root - workspace root
 * @param {string[]} editionOwned - EDITION_OWNED glob list
 * @param {string[]} heirOwned - HEIR_OWNED glob list (precedence)
 * @returns {string[]} workspace-relative paths (forward slashes)
 */
function collectHeirOwnedSnapshot(root, editionOwned, heirOwned) {
    const owned = new Set();

    const consider = (absDir, prefix) => {
        if (!fs.existsSync(absDir)) return;
        for (const rel of listFilesRecursive(absDir)) {
            const wsRel = prefix + rel;
            // Heir wins over Edition on overlap; unmatched defaults to heir.
            if (pathMatchesAny(wsRel, heirOwned)) { owned.add(wsRel); continue; }
            if (!pathMatchesAny(wsRel, editionOwned)) owned.add(wsRel);
        }
    };
    consider(path.join(root, '.github'), '.github/');
    consider(path.join(root, '.vscode'), '.vscode/');

    // Always-recover even if policy ever drifts. These are heir merge points.
    for (const f of [
        '.github/.act-heir.json',
        '.github/copilot-instructions.local.md',
        '.github/config/cognitive-config.json',
    ]) {
        if (fs.existsSync(path.join(root, f))) owned.add(f);
    }
    return [...owned];
}

/**
 * Identify heir-added artifacts that live in edition-owned paths and queue
 * them for relocation into the matching `local/` namespace. Surviving an
 * upgrade in their current location would mean the next Edition release
 * could clobber them (if Edition happens to add a same-named artifact);
 * moving them under `local/` makes them upgrade-safe.
 *
 * @param {string} ghDir - absolute path to heir's `.github/`
 * @param {object|null} manifest - parsed edition-manifest.json
 * @returns {Array<{ from: string, to: string }>} relocation pairs (workspace-relative)
 */
function collectHeirRelocations(ghDir, manifest) {
    if (!manifest) return [];
    const relocations = [];
    const editionSkills = new Set(manifest.skills || []);
    const editionInstr = new Set(manifest.instructions || []);
    const editionPrompts = new Set(manifest.prompts || []);
    const editionAgents = new Set(manifest.agents || []);

    // Skills are named subdirectories under .github/skills/. Anything that's
    // not in editionSkills and not the literal `local` folder is heir-added.
    const skillsDir = path.join(ghDir, 'skills');
    if (fs.existsSync(skillsDir)) {
        for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (entry.name === 'local' || editionSkills.has(entry.name)) continue;
            const sub = path.join(skillsDir, entry.name);
            for (const rel of listFilesRecursive(sub)) {
                const from = `.github/skills/${entry.name}/${rel}`;
                const to = `.github/skills/local/${entry.name}/${rel}`;
                relocations.push({ from, to });
            }
        }
    }

    // Instructions, prompts, agents: top-level files (subdir `local/` is
    // already heir-owned and not relocated). Filename must match the
    // expected extension and NOT appear in the manifest.
    for (const [subdir, set, ext] of [
        ['instructions', editionInstr, '.instructions.md'],
        ['prompts', editionPrompts, '.prompt.md'],
        ['agents', editionAgents, '.agent.md'],
    ]) {
        const dir = path.join(ghDir, subdir);
        if (!fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            if (!entry.name.endsWith(ext)) continue;
            if (set.has(entry.name)) continue;
            const from = `.github/${subdir}/${entry.name}`;
            const to = `.github/${subdir}/local/${entry.name}`;
            relocations.push({ from, to });
        }
    }
    return relocations;
}

/**
 * Compute a backup directory path with a timestamp suffix. Uses HH:MM:SS
 * (not just YYYYMMDD like the script) so the Extension can be re-run
 * within the same day without the "wait until tomorrow" friction the
 * script imposes for its CLI workflow.
 *
 * @param {string} root - workspace root
 * @returns {string} absolute path to a non-existent backup directory
 */
function computeBackupDirPath(root) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
        now.getFullYear().toString() +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) + '-' +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds());
    let candidate = path.join(root, `.github-backup-${stamp}`);
    let i = 1;
    while (fs.existsSync(candidate)) {
        candidate = path.join(root, `.github-backup-${stamp}-${i}`);
        i++;
    }
    return candidate;
}

/**
 * Upgrade: backup → install fresh bundled brain → recover heir-owned files.
 *
 * Mirrors the contract of `brain/scripts/upgrade-self.cjs` (atomic
 * backup-install-recover) but installs from the bundled brain instead of
 * cloning Edition from GitHub. This preserves the Extension's pin to a
 * specific Edition version (dual-track semver: Extension v8.x can bundle
 * Edition v2.X.0) while giving heirs the same rollback safety net the
 * script provides.
 *
 * On install failure: the backup is renamed back to `.github/` and an
 * error is surfaced. On success: the backup directory is preserved at
 * `<root>/.github-backup-YYYYMMDD-HHMMSS/` for the heir to inspect and
 * delete manually when satisfied.
 */
async function cmdUpgrade() {
    const root = getWorkspaceRoot();
    if (!root) { vscode.window.showErrorMessage('ACT: Open a workspace folder first.'); return; }

    const markerPath = getMarkerPath(root);
    if (!fs.existsSync(markerPath)) {
        vscode.window.showWarningMessage('Not an ACT heir. Run "ACT: Bootstrap This Workspace" first.');
        return;
    }

    const marker = readMarkerSafe(markerPath);
    if (!marker) {
        vscode.window.showErrorMessage(
            `ACT: heir marker at ${path.relative(root, markerPath)} is corrupted. Restore from .github-backup-* or re-bootstrap after removing it.`
        );
        return;
    }

    // Per-heir lockfile FIRST (cheap, local fsync). If a concurrent VS Code
    // window holds the lock, we surface that before paying for the ~5MB
    // tarball download. Stale locks (>10min) are broken atomically inside
    // acquireLock; the message below names the path so the user can force
    // recovery if they're certain no other instance is running.
    let lock;
    try {
        lock = acquireLock(root);
    } catch (err) {
        const code = err && /** @type {any} */ (err).code;
        const lockHint = `\n\nIf you're certain no other instance is running, delete ${getLockPath(root)} and retry.`;
        const msg = code === 'CONCURRENT_UPGRADE'
            ? `ACT: brain upgrade already in progress in another VS Code window. Wait for it to finish, then retry.${lockHint}`
            : `ACT: could not acquire upgrade lock: ${err && err.message ? err.message : err}`;
        vscode.window.showWarningMessage(msg);
        return;
    }

    try {
        // Static-fetch path (ADR-009): when the VSIX ships no bundled brain,
        // resolve BRAIN_DIR by downloading the latest Edition release tarball
        // before any destructive op. Errors here leave the heir untouched.
        try {
            await ensureBrainDir();
        } catch (err) {
            vscode.window.showErrorMessage(`ACT upgrade: ${err && err.message ? err.message : err}`);
            return;
        }

        try {
            return await _cmdUpgradeBody(root, markerPath, marker);
        } finally {
            if (_fetchCleanup) _fetchCleanup();
        }
    } finally {
        lock.release();
    }
}

/**
 * Body of cmdUpgrade, split out so the static-fetch ensureBrainDir +
 * try/finally cleanup can wrap the original logic without rewriting it.
 *
 * @param {string} root
 * @param {string} markerPath
 * @param {any} marker
 */
async function _cmdUpgradeBody(root, markerPath, marker) {
    const bundledVersion = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
    const currentVersion = marker.edition_version || '0.0.0';

    if (bundledVersion === currentVersion) {
        vscode.window.showInformationMessage(`Already on Edition v${currentVersion}. No upgrade needed.`);
        return;
    }

    // Refuse to silently downgrade. The bundled brain can lag the
    // workspace if the user installs an older Extension build, or if a
    // future Edition release was pulled in via a side channel. Surface
    // the situation but don't replace the heir's newer brain with an
    // older one — that path leads to silent regressions.
    if (!isNewerSemver(bundledVersion, currentVersion)) {
        vscode.window.showInformationMessage(
            `Workspace is on Edition v${currentVersion}; bundled brain is v${bundledVersion}. No upgrade offered.`
        );
        return;
    }

    // Major version check
    const bundledMajor = parseInt(bundledVersion.split('.')[0], 10);
    const currentMajor = parseInt(currentVersion.split('.')[0], 10);
    if (bundledMajor > currentMajor) {
        const proceed = await vscode.window.showWarningMessage(
            `This is a MAJOR upgrade (v${currentVersion} to v${bundledVersion}). Edition-owned files will be replaced; your local/ content and customizations are preserved in a timestamped backup directory.`,
            { modal: true },
            'Upgrade'
        );
        if (proceed !== 'Upgrade') return;
    }

    const manifest = loadEditionManifest();
    const bootstrapTemplates = getBootstrapTemplateSet(manifest);
    const ghDir = getGitHubDir(root);

    // Load the ownership policy from the bundled brain. Required for the
    // backup-install-recover pattern; without it we can't classify heir-owned
    // files correctly and would risk silent data loss. Refuse to proceed.
    const policy = loadOwnershipPolicy();
    if (!policy) {
        vscode.window.showErrorMessage(
            'ACT: cannot load ownership policy from bundled brain (brain/scripts/_registry.cjs missing or invalid). Reinstall the extension and retry.'
        );
        return;
    }

    // Migrate legacy misplacement: prior Extension versions (<= 8.12.0) copied
    // brain/.vscode/* into .github/.vscode/ instead of the workspace .vscode/.
    // Move any survivors back to the right place BEFORE the backup snapshot
    // so the legacy files end up in the right place in the fresh state.
    let migrated = 0;
    const legacyVscodeDir = path.join(ghDir, '.vscode');
    if (fs.existsSync(legacyVscodeDir)) {
        try {
            for (const name of fs.readdirSync(legacyVscodeDir)) {
                const legacy = path.join(legacyVscodeDir, name);
                const target = path.join(root, '.vscode', name);
                try {
                    if (!fs.existsSync(target)) {
                        fs.mkdirSync(path.dirname(target), { recursive: true });
                        fs.copyFileSync(legacy, target);
                        migrated++;
                    }
                    fs.unlinkSync(legacy);
                } catch { /* best-effort per file */ }
            }
            try {
                if (fs.readdirSync(legacyVscodeDir).length === 0) {
                    fs.rmdirSync(legacyVscodeDir);
                }
            } catch { /* leave it alone if not empty */ }
        } catch { /* best-effort */ }
    }

    // ── 1. Snapshot heir-owned files + collect relocations ────────────
    const heirOwnedFiles = collectHeirOwnedSnapshot(root, policy.EDITION_OWNED, policy.HEIR_OWNED);
    const relocations = collectHeirRelocations(ghDir, manifest);

    // Collision check: if a heir simultaneously has `.github/skills/foo/` AND
    // `.github/skills/local/foo/`, both end up writing to the same destination
    // in step 5 (the heir-owned snapshot + the relocation source). Detect and
    // route the relocation to a timestamped sibling so neither side is lost.
    const ownedSet = new Set(heirOwnedFiles);
    const collisionStamp = (() => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return d.getFullYear().toString() + pad(d.getMonth() + 1) + pad(d.getDate()) +
            '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    })();
    const collisionWarnings = [];
    for (const r of relocations) {
        if (ownedSet.has(r.to)) {
            // Insert a `-collision-<stamp>` segment after the first folder
            // under local/ so the relocated copy lands in a sibling dir.
            // Example: .github/skills/local/foo/SKILL.md
            //          → .github/skills/local/foo-collision-YYYYMMDD-HHMMSS/SKILL.md
            const parts = r.to.split('/');
            const localIdx = parts.indexOf('local');
            if (localIdx >= 0 && localIdx + 1 < parts.length) {
                parts[localIdx + 1] = `${parts[localIdx + 1]}-collision-${collisionStamp}`;
                const newTo = parts.join('/');
                collisionWarnings.push(`${r.from} → ${newTo} (existing ${r.to} preserved)`);
                r.to = newTo;
            } else {
                // Fallback: append stamp to filename. Should not be reachable
                // because collectHeirRelocations always routes through local/.
                collisionWarnings.push(`${r.from}: collision at ${r.to} but no local/ segment to rewrite (skipping relocation)`);
            }
        }
    }

    // Make sure relocation source files are in the snapshot so we can move them.
    const heirOwnedSet = new Set(heirOwnedFiles);
    for (const r of relocations) heirOwnedSet.add(r.from);
    const allOwned = [...heirOwnedSet];
    const relocationMap = new Map(relocations.map(r => [r.from, r.to]));

    // ── 2. Copy heir-owned files to a temp holding area ──────────────
    const holdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-act-heir-owned-'));
    const snapshotFailures = [];
    for (const rel of allOwned) {
        const src = path.join(root, rel);
        if (!fs.existsSync(src)) continue;
        try {
            const dst = path.join(holdDir, rel);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
        } catch (err) {
            snapshotFailures.push({ rel, err: err && err.message ? err.message : String(err) });
        }
    }
    if (snapshotFailures.length > 0) {
        // Refuse to proceed — if we can't snapshot, the recovery step will
        // silently lose files. Better to bail before touching anything.
        try { fs.rmSync(holdDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        const sample = snapshotFailures.slice(0, 3).map(f => `${f.rel}: ${f.err}`).join('\n');
        vscode.window.showErrorMessage(
            `ACT upgrade: failed to snapshot ${snapshotFailures.length} heir-owned file(s). Upgrade aborted, nothing changed.\n\n${sample}`
        );
        return;
    }

    // ── 3. Rename .github/ to a timestamped backup ──────────────────
    const backupDir = computeBackupDirPath(root);
    try {
        fs.renameSync(ghDir, backupDir);
    } catch (err) {
        try { fs.rmSync(holdDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        vscode.window.showErrorMessage(
            `ACT upgrade: failed to rename .github/ to backup (${err && err.message ? err.message : err}). Upgrade aborted, nothing changed.`
        );
        return;
    }

    // ── 3b. Mirror snapshotted .vscode/ files into the backup dir ──────
    // Step 3 only renames .github/. Heir-owned .vscode/ files (settings.json,
    // extensions.json) are correctly recovered via the hold dir in step 5,
    // but a user diffing against `.github-backup-*` needs them visible too —
    // otherwise the "review then delete when satisfied" guidance is incomplete
    // for .vscode/ changes. Cheap (typically 1–2 small JSON files).
    for (const rel of allOwned) {
        if (!rel.startsWith('.vscode/')) continue;
        const src = path.join(holdDir, rel);
        if (!fs.existsSync(src)) continue;
        try {
            const dst = path.join(backupDir, rel);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
        } catch { /* best-effort — .vscode/ backup is a convenience, not a guarantee */ }
    }

    // ── 4. Install fresh brain from bundled BRAIN_DIR (rollback on failure) ──
    const brainFiles = listFilesRecursive(BRAIN_DIR);
    // Heir-owned files (workflows/, dependabot.yml, ISSUE_TEMPLATE/,
    // episodic/, local/) must not ship from Edition. Step 5 restores
    // anything the heir already had from the snapshot taken above; this
    // skip prevents Edition's own copies from being written first. Without
    // it, the heir's snapshot would clobber back over Edition's files but
    // any HEIR_OWNED path the heir DIDN'T have would silently land — that's
    // exactly the 2026-06-29 workflow leak.
    const heirOwnedGlobs = policy ? policy.HEIR_OWNED : null;
    let heirOwnedSkipped = 0;
    const installFailures = [];
    try {
        for (const rel of brainFiles) {
            const { wsRel, dst } = resolveBrainDest(rel, root, ghDir);
            if (shouldSkipForHeirOwnership(wsRel, heirOwnedGlobs, bootstrapTemplates)) {
                heirOwnedSkipped++;
                continue;
            }
            // bootstrap_templates are heir-owned merge points; only seed if
            // absent. After we recover from backup in step 5 they will be
            // restored anyway, so this is a belt-and-suspenders no-op.
            if (bootstrapTemplates.has(wsRel) && fs.existsSync(dst)) continue;
            try {
                copyFileSync(path.join(BRAIN_DIR, rel), dst);
            } catch (err) {
                installFailures.push({ rel: wsRel, err: err && err.message ? err.message : String(err) });
            }
        }
    } catch (err) {
        installFailures.push({ rel: '(unknown)', err: err && err.message ? err.message : String(err) });
    }

    if (installFailures.length > 0) {
        // Rollback: remove the partially-installed .github/, rename backup back.
        try { fs.rmSync(ghDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        try { fs.renameSync(backupDir, ghDir); } catch { /* best-effort — backup may now be orphaned */ }
        try { fs.rmSync(holdDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        const sample = installFailures.slice(0, 3).map(f => `${f.rel}: ${f.err}`).join('\n');
        vscode.window.showErrorMessage(
            `ACT upgrade: install failed (${installFailures.length} file(s)). Rolled back to previous state.\n\n${sample}`
        );
        return;
    }

    const editionRoot = getEditionRootForInstall();
    const vscodeAssetsCopied = installVscodeAssets(root, manifest, editionRoot);

    // ── 4b. Seed bootstrap_templates if missing ─────────────────────
    // .github/config/cognitive-config.json is staged in templates/. Non-.github
    // templates (today .vscode/extensions.json + .vscode/settings.json) live in
    // the fetched Edition tarball root. Seed only when absent and not already
    // snapshotted for restore.
    const heirOwnedAlreadySnapshot = new Set(allOwned);
    const templateResult = seedBootstrapTemplates(root, manifest, editionRoot, path.join(__dirname, 'templates'), heirOwnedAlreadySnapshot);
    const templateSeedFailures = templateResult.failures;

    // ── 5. Restore heir-owned files from the holding area (apply relocations) ──
    let recovered = 0;
    let relocated = 0;
    const recoverFailures = [];
    for (const rel of allOwned) {
        const src = path.join(holdDir, rel);
        if (!fs.existsSync(src)) continue;
        const targetRel = relocationMap.has(rel) ? relocationMap.get(rel) : rel;
        const dst = path.join(root, targetRel);
        try {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
            recovered++;
            if (relocationMap.has(rel)) relocated++;
        } catch (err) {
            recoverFailures.push({ rel: targetRel, err: err && err.message ? err.message : String(err) });
        }
    }

    // ── 6. Update marker ────────────────────────────────────────────
    // Re-read because step 5 may have restored a heir-customized marker.
    // Wrapped in try/catch: install succeeded and heir files are recovered,
    // so a marker write failure is not fatal — but it must not throw, or
    // steps 7-9 don't run and the hold dir leaks. Surface as warning; next
    // upgrade will retry the bump.
    let markerWriteFailed = false;
    try {
        const restoredMarker = readMarkerSafe(markerPath) || marker;
        restoredMarker.edition_version = bundledVersion;
        restoredMarker.last_sync_at = new Date().toISOString();
        // Static-fetch v2 marker fields (ADR-009). Additive merge via the
        // pure helper in lib/edition-install.js; see bootstrap path comment
        // (and audit F10) for the rationale.
        const extVersion = (_extensionContext && _extensionContext.extension && _extensionContext.extension.packageJSON && _extensionContext.extension.packageJSON.version) || 'unknown';
        const finalMarker = applyStaticFetchMarkerFields(restoredMarker, _fetchProvenance, extVersion);
        fs.writeFileSync(markerPath, JSON.stringify(finalMarker, null, 2) + '\n');
    } catch (err) {
        markerWriteFailed = true;
        const msg = err && err.message ? err.message : String(err);
        vscode.window.showWarningMessage(
            `ACT upgrade: brain installed and ${recovered} heir-owned file(s) recovered, but the heir marker write failed (${msg}). Run /status to verify; the next upgrade will retry the version bump.`
        );
    }

    // ── 7. Merge heir workspace-settings baseline into .vscode/settings.json ──
    const wsMerge = mergeHeirWorkspaceSettings(root);
    const mergeLine = wsMerge.ok
        ? (wsMerge.changes > 0 ? ` ${wsMerge.changes} workspace-settings key(s) merged.` : '')
        : ` ⚠ workspace-settings merge skipped (${wsMerge.error}).`;

    // ── 8. Cleanup hold dir ─────────────────────────────────────────
    // Preserve the hold dir on any partial failure (marker write, recover,
    // template seed) so the heir can manually recover the missing pieces
    // alongside the backup dir. Cleanup only on a fully-clean upgrade.
    const upgradePartial = markerWriteFailed || recoverFailures.length > 0 || templateSeedFailures.length > 0;
    if (!upgradePartial) {
        try { fs.rmSync(holdDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }

    // ── 9. Validate the upgraded brain ──────────────────────────────
    const doctorOk = await runHeirDoctor(root);
    const doctorLine = doctorOk === null
        ? ''
        : doctorOk ? ' ✓ heir-doctor passed.' : ' ⚠ heir-doctor reported issues (run /status for details).';

    const migratedLine = migrated > 0 ? ` ${migrated} legacy .vscode file(s) relocated.` : '';
    const relocatedLine = relocated > 0 ? ` ${relocated} heir-added artifact(s) moved to local/.` : '';
    const collisionLine = collisionWarnings.length > 0
        ? ` ⚠ ${collisionWarnings.length} relocation collision(s) resolved by timestamp suffix — see Output channel.`
        : '';
    const templateSeedLine = templateSeedFailures.length > 0
        ? ` ⚠ ${templateSeedFailures.length} bootstrap template(s) failed to seed.`
        : '';
    const vscodeAssetsLine = vscodeAssetsCopied.length > 0
        ? ` ${vscodeAssetsCopied.length} VS Code asset(s) refreshed.`
        : '';
    const recoverLine = recoverFailures.length > 0
        ? ` ⚠ ${recoverFailures.length} heir-owned file(s) failed to recover — check backup at ${path.basename(backupDir)}/ and hold dir at ${path.basename(holdDir)}/.`
        : '';
    const holdPreservedLine = upgradePartial
        ? ` Hold dir preserved at ${path.basename(holdDir)}/ for manual review.`
        : '';

    if (collisionWarnings.length > 0) {
        const ch = getActivationOutputChannel();
        ch.appendLine(`[upgrade] ${collisionWarnings.length} relocation collision(s) at ${new Date().toISOString()}:`);
        for (const w of collisionWarnings) ch.appendLine(`  ${w}`);
    }

    vscode.window.showInformationMessage(
        `Upgraded to Edition v${bundledVersion}. ${recovered} heir-owned file(s) recovered.${vscodeAssetsLine}${relocatedLine}${collisionLine}${templateSeedLine}${migratedLine}${mergeLine}${doctorLine}${recoverLine}${holdPreservedLine}\n\nBackup: ${path.basename(backupDir)}/ — review then delete when satisfied.`
    );
}

/**
 * Status-bar menu: QuickPick of common ACT actions, opened from the
 * `$(brain) ACT vX.Y.Z` status-bar item. Each pick routes to an existing
 * command — this is a discovery surface, not new logic.
 */
async function cmdStatusBarMenu() {
    const root = getWorkspaceRoot();
    const protectedMarker = root ? readProtectedMarker(root) : null;
    const isProtected = !!protectedMarker;
    // Protected wins over heir — the constellation repos never host heirs,
    // but a stale `.act-heir.json` left over from migration shouldn't open
    // the bootstrap path on a curator repo.
    const isHeir = !isProtected && root && fs.existsSync(getMarkerPath(root));

    let upgradeAvailable = false;
    let editionVersion = '';
    let bundledVersion = '';
    if (isHeir) {
        const marker = readMarkerSafe(getMarkerPath(root));
        if (marker) {
            editionVersion = marker.edition_version;
            try { bundledVersion = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim(); } catch { /* leave empty */ }
            // Static-fetch fallback: no bundled brain post-ADR-009, but the
            // activation-time version check may have cached the latest
            // Edition tag in globalState. Use that as the "available
            // version" so the Upgrade Brain pick mirrors the status-bar
            // arrow indicator. Without this, the status bar shows
            // "ACT vX.Y.Z ↑" but the QuickPick hides the Upgrade item.
            if (!bundledVersion) {
                const cached = getCachedLatestEditionTag(_extensionContext);
                if (cached) bundledVersion = cached.replace(/^v/, '');
            }
            upgradeAvailable = isNewerSemver(bundledVersion, editionVersion);
        }
    }

    const items = [];

    if (isProtected) {
        // Protected constellation repo: no Bootstrap, no Upgrade. Surface
        // what this repo is and link to its README. Extension's own
        // walkthrough/README remain available below for general orientation.
        items.push({
            label: '$(info) About This Repo',
            description: `${protectedMarker.kind || 'protected'} — ${protectedMarker.role || 'constellation repo'}`,
            action: 'protectedAbout',
        });
        items.push({
            label: '$(book) Open Repo README',
            description: 'README.md at the repo root',
            action: 'repoReadme',
        });
    } else if (isHeir) {
        items.push({
            label: '$(info) Show Status',
            description: `Edition v${editionVersion}${upgradeAvailable ? ` → v${bundledVersion} available` : ''}`,
            action: 'status',
        });
        if (upgradeAvailable) {
            items.push({
                label: '$(arrow-up) Upgrade Brain',
                description: `Pull v${bundledVersion} into this workspace`,
                action: 'upgrade',
            });
        }
        items.push(
            { label: '$(comment-discussion) Run /welcome', description: 'Orientation tour for this brain', action: 'welcome' },
            { label: '$(settings-gear) Run /configure-vscode', description: 'Apply recommended VS Code settings', action: 'configure' },
            { label: '$(book) Open Brain README', description: '.github/copilot-instructions.local.md', action: 'localReadme' },
        );
    } else {
        items.push({
            label: '$(rocket) Bootstrap This Workspace',
            description: 'Install the ACT brain into this folder',
            action: 'bootstrap',
        });
    }

    items.push(
        { label: '$(milestone) Open Welcome Walkthrough', description: 'Extension getting-started guide', action: 'walkthrough' },
        { label: '$(book) Open Extension README', description: 'About Alex — ACT Edition', action: 'extReadme' },
    );

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: isProtected
            ? `Alex ACT — ${protectedMarker.name || 'protected repo'} (curator-managed)`
            : isHeir
                ? `Alex ACT v${editionVersion} • pick an action`
                : 'Alex ACT — not a heir yet • pick an action',
        matchOnDescription: true,
    });
    if (!pick) return;

    switch (pick.action) {
        case 'status': return cmdStatus();
        case 'upgrade': return cmdUpgrade();
        case 'bootstrap': return cmdBootstrap();
        case 'protectedAbout': {
            const lines = [
                `${protectedMarker.name || 'Protected repo'}`,
                `Kind: ${protectedMarker.kind || 'unknown'}`,
                '',
                protectedMarker.role || '',
            ];
            if (protectedMarker.note) lines.push('', protectedMarker.note);
            vscode.window.showInformationMessage(lines.filter(Boolean).join('\n'), { modal: true });
            return;
        }
        case 'repoReadme': {
            const readme = root ? path.join(root, 'README.md') : null;
            if (readme && fs.existsSync(readme)) {
                return vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(readme));
            }
            vscode.window.showWarningMessage('No README.md at the repo root.');
            return;
        }
        case 'welcome':
            return vscode.commands.executeCommand('workbench.action.chat.open', { query: '/welcome' });
        case 'configure':
            return vscode.commands.executeCommand('workbench.action.chat.open', { query: '/configure-vscode' });
        case 'walkthrough':
            return vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'fabioc-aloha.alex-cognitive-architecture#alex-getting-started',
                false
            );
        case 'localReadme': {
            const local = root ? path.join(root, '.github', 'copilot-instructions.local.md') : null;
            if (local && fs.existsSync(local)) {
                return vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(local));
            }
            vscode.window.showWarningMessage('No .github/copilot-instructions.local.md in this workspace.');
            return;
        }
        case 'extReadme': {
            const readme = path.join(__dirname, 'README.md');
            return vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(readme));
        }
    }
}

/**
 * Status: show brain version, heir info, memory bus health
 */
async function cmdStatus() {
    const root = getWorkspaceRoot();
    if (!root) { vscode.window.showErrorMessage('ACT: Open a workspace folder first.'); return; }

    const markerPath = getMarkerPath(root);
    if (!fs.existsSync(markerPath)) {
        vscode.window.showInformationMessage('Not an ACT heir. Run "ACT: Bootstrap This Workspace" to set up.');
        return;
    }

    const marker = readMarkerSafe(markerPath);
    if (!marker) {
        vscode.window.showErrorMessage(
            `ACT: heir marker at ${path.relative(root, markerPath)} is corrupted. Restore from .github-backup-* or re-bootstrap after removing it.`
        );
        return;
    }
    const bundledVersion = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim();
    const ghDir = getGitHubDir(root);
    const instrCount = fs.existsSync(path.join(ghDir, 'instructions'))
        ? fs.readdirSync(path.join(ghDir, 'instructions')).filter(f => f.endsWith('.instructions.md')).length : 0;
    const skillCount = fs.existsSync(path.join(ghDir, 'skills'))
        ? fs.readdirSync(path.join(ghDir, 'skills')).filter(f => { try { return fs.statSync(path.join(ghDir, 'skills', f)).isDirectory() && f !== 'local'; } catch { return false; } }).length : 0;
    const localCount = fs.existsSync(path.join(ghDir, 'skills', 'local'))
        ? fs.readdirSync(path.join(ghDir, 'skills', 'local')).filter(f => { try { return fs.statSync(path.join(ghDir, 'skills', 'local', f)).isDirectory(); } catch { return false; } }).length : 0;

    const upgradeAvailable = isNewerSemver(bundledVersion, marker.edition_version);
    const lines = [
        `Heir: ${marker.heir_name} (${marker.heir_id})`,
        `Edition: v${marker.edition_version}${upgradeAvailable ? ` (v${bundledVersion} available)` : ' (latest)'}`,
        `Skills: ${skillCount} edition + ${localCount} local`,
        `Instructions: ${instrCount}`,
        `Last sync: ${marker.last_sync_at ? marker.last_sync_at.substring(0, 10) : 'never'}`,
    ];

    if (upgradeAvailable) {
        const pick = await vscode.window.showInformationMessage(
            lines.join('\n'),
            'Upgrade Now'
        );
        if (pick === 'Upgrade Now') await cmdUpgrade();
    } else {
        vscode.window.showInformationMessage(lines.join('\n'));
    }
}

// ── Converter Commands ─────────────────────────────────────────────
//
// Each converter ships as a skill: brain/skills/<id>/scripts/<id>.cjs
// (Edition v2.4.0 collapsed the former .github/muscles/ tree into
// per-skill scripts/ folders. The runConverter resolver below honors
// both the bundled brain layout and the workspace `.github/skills/`
// layout written by bootstrap.)

const CONVERTERS = {
    'md-to-word': { skill: 'md-to-word', script: 'md-to-word.cjs', ext: '.docx', label: 'Word' },
    'md-to-html': { skill: 'md-to-html', script: 'md-to-html.cjs', ext: '.html', label: 'HTML' },
    'md-to-eml':  { skill: 'md-to-eml',  script: 'md-to-eml.cjs',  ext: '.eml',  label: 'Email' },
    'md-to-txt':  { skill: 'md-to-txt',  script: 'md-to-txt.cjs',  ext: '.txt',  label: 'Plain Text' },
    'docx-to-md': { skill: 'docx-to-md', script: 'docx-to-md.cjs', ext: '.md',   label: 'Markdown' },
    'html-to-md': { skill: 'html-to-md', script: 'html-to-md.cjs', ext: '.md',   label: 'Markdown' },
};

// Resolve converter script path. Prefer workspace-installed brain so
// heir-local edits to converters take precedence over the bundled copy.
function resolveConverterScript(converter, root) {
    const rel = path.join('skills', converter.skill, 'scripts', converter.script);
    const candidates = [];
    if (root) candidates.push(path.join(root, '.github', rel));
    candidates.push(path.join(BRAIN_DIR, rel));
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

async function runConverter(converterId, fileUri) {
    const converter = CONVERTERS[converterId];
    if (!converter) { vscode.window.showErrorMessage(`Unknown converter: ${converterId}`); return; }

    // Resolve input file
    let inputPath;
    if (fileUri && fileUri.fsPath) {
        inputPath = fileUri.fsPath;
    } else {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            inputPath = editor.document.uri.fsPath;
        } else {
            vscode.window.showErrorMessage('ACT Convert: No file selected.');
            return;
        }
    }

    // Find the converter script (workspace .github/skills/ first, then bundled brain)
    const root = getWorkspaceRoot();
    const scriptPath = resolveConverterScript(converter, root);
    if (!scriptPath) {
        vscode.window.showErrorMessage(
            `ACT Convert: ${converter.skill} script not found in workspace or bundled brain.`
        );
        return;
    }

    // Compute output path
    const inputDir = path.dirname(inputPath);
    const inputBase = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(inputDir, inputBase + converter.ext);

    // Run the converter via spawn() with array args so paths containing spaces,
    // quotes, or shell metacharacters can't be reinterpreted. Stream output into
    // a dedicated OutputChannel so the user sees progress without a shell window.
    const channel = getConverterOutputChannel();
    channel.show(true);
    channel.appendLine(`> ${path.basename(scriptPath)} "${inputPath}" --out "${outputPath}"`);
    vscode.window.showInformationMessage(`ACT: Converting to ${converter.label}...`);

    const child = spawn(process.execPath, [scriptPath, inputPath, '--out', outputPath], {
        cwd: inputDir,
        windowsHide: true,
    });
    child.stdout.on('data', d => channel.append(d.toString()));
    child.stderr.on('data', d => channel.append(d.toString()));
    child.on('error', err => {
        const hint = err.code === 'ENOENT'
            ? ` Node.js executable not found at "${process.execPath}". Reinstall VS Code or check your PATH.`
            : '';
        channel.appendLine(`\n[ACT Convert] spawn error: ${err.message}${hint}`);
        vscode.window.showErrorMessage(`ACT Convert (${converter.label}) failed to start: ${err.message}${hint}`);
    });
    child.on('close', code => {
        channel.appendLine(`\n[ACT Convert] ${converter.label} exited with code ${code}`);
        if (code === 0) {
            vscode.window.showInformationMessage(`ACT: Wrote ${path.basename(outputPath)}`);
        } else {
            vscode.window.showErrorMessage(`ACT Convert (${converter.label}) exited with code ${code}. See "ACT Convert" output channel.`);
        }
    });
}

// Single OutputChannel for all converters; created lazily on first use.
let _converterChannel = null;
function getConverterOutputChannel() {
    if (!_converterChannel) {
        _converterChannel = vscode.window.createOutputChannel('ACT Convert');
    }
    return _converterChannel;
}

// ── heir-doctor runner ────────────────────────────────────────────
//
// Resolves the heir-doctor script from the workspace's installed brain
// (Edition v2.4.0 layout: skills/greeting-checkin/scripts/heir-doctor.cjs)
// or falls back to the bundled brain. Returns true / false / null where
// null means "no doctor found, nothing was run".
async function runHeirDoctor(root) {
    if (!root) return null;
    const rel = path.join('skills', 'greeting-checkin', 'scripts', 'heir-doctor.cjs');
    const candidates = [
        path.join(getGitHubDir(root), rel),
        path.join(BRAIN_DIR, rel),
    ];
    const doctorPath = candidates.find(p => fs.existsSync(p));
    if (!doctorPath) return null;
    try {
        return await new Promise((resolve) => {
            const child = spawn(process.execPath, [doctorPath], { cwd: root, windowsHide: true });
            let settled = false;
            const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
            const timer = setTimeout(() => { try { child.kill(); } catch { /* */ } finish(false); }, 30000);
            // Drain pipes so the child doesn't block on a full stdout buffer.
            child.stdout.on('data', () => {});
            child.stderr.on('data', () => {});
            child.on('close', code => finish(code === 0));
            child.on('error', () => finish(false));
        });
    } catch { return false; }
}

// ── Migration (AlexMaster v8.4.0 → ACT Edition) ────────────
// Defensive load: if migration.js is missing or broken, core commands must still work.
let migration;
try {
    migration = require('./migration');
} catch (e) {
    console.error('ACT: migration module failed to load:', e && e.message ? e.message : e);
    migration = null;
}

let _activationChannel = null;
function getActivationOutputChannel() {
    if (!_activationChannel) {
        _activationChannel = vscode.window.createOutputChannel('ACT Extension');
    }
    return _activationChannel;
}

function logActivationError(channel, phase, err) {
    const message = err && err.message ? err.message : String(err);
    const stack = err && err.stack ? err.stack : '(no stack)';
    channel.appendLine(`[${phase}] ${message}`);
    channel.appendLine(stack);
}

function registerCriticalCommands(context, channel) {
    let registered = 0;
    const register = (id, handler) => {
        try {
            context.subscriptions.push(vscode.commands.registerCommand(id, handler));
            registered++;
        } catch (err) {
            logActivationError(channel, `register:${id}`, err);
        }
    };

    register('alex-act.bootstrap', cmdBootstrap);
    register('alex-act.upgrade', cmdUpgrade);
    register('alex-act.status', cmdStatus);
    register('alex-act.statusBarMenu', cmdStatusBarMenu);
    register('alex-act.openWalkthrough', () => {
        vscode.commands.executeCommand(
            'workbench.action.openWalkthrough',
            'fabioc-aloha.alex-cognitive-architecture#alex-getting-started',
            false
        );
    });

    return registered;
}

// ── Activation ─────────────────────────────────────────────────────

function activate(context) {
    const channel = getActivationOutputChannel();
    channel.appendLine('[activate] Starting activation.');

    // Stash context so static-fetch helpers (ensureBrainDir, getCachedLatestEditionTag)
    // can reach extension state from sync utilities. Cleared in deactivate().
    _extensionContext = context;

    // Sweep any stale per-fetch temp dirs left behind by crashed prior runs.
    // Best-effort; doesn't block activation if tmpdir is unreadable.
    try { sweepStaleTempDirs(); } catch (err) { logActivationError(channel, 'sweepStaleTempDirs', err); }

    let criticalReady = false;
    try {
        const criticalCount = registerCriticalCommands(context, channel);
        criticalReady = criticalCount > 0;

        context.subscriptions.push(
            vscode.commands.registerCommand('alex-act.migrate-from-alex-master', (...args) => {
                if (!migration) { vscode.window.showErrorMessage('ACT: Migration module unavailable.'); return; }
                return migration.migrateFromAlexMaster(...args);
            }),
            vscode.commands.registerCommand('alex-act.rollback-migration', (...args) => {
                if (!migration) { vscode.window.showErrorMessage('ACT: Migration module unavailable.'); return; }
                return migration.rollbackMigration(...args);
            }),
            vscode.commands.registerCommand('alex-act.clean-migration-backup', (...args) => {
                if (!migration) { vscode.window.showErrorMessage('ACT: Migration module unavailable.'); return; }
                return migration.cleanMigrationBackup(...args);
            }),
        );

        // Register converter commands
        for (const [id, _] of Object.entries(CONVERTERS)) {
            context.subscriptions.push(
                vscode.commands.registerCommand(`alex-act.convert.${id}`, (fileUri) => runConverter(id, fileUri))
            );
        }

        // Register no-op stubs for AlexMaster's 30 deprecated commands
        if (migration) migration.registerDeprecatedStubs(context);

        // Fire AlexMaster detection modal (respects "remind later" / "don't ask again")
        if (migration) migration.checkActivationTrigger(context).catch(() => { /* silent */ });

        // Auto-open the Welcome walkthrough on first install or after version bump.
        // Non-devs won't know to run a command, so surface it on startup, once per version.
        try {
            const pkg = require('./package.json');
            const currentVersion = pkg.version;
            const SHOWN_KEY = 'alex-act.walkthroughShownVersion';
            const shownVersion = context.globalState.get(SHOWN_KEY);
            if (shownVersion !== currentVersion) {
                // Defer until VS Code finishes restoring editors.
                // Use onDidChangeActiveTextEditor as a readiness signal with a timeout fallback.
                const openWalkthrough = () => vscode.commands.executeCommand(
                    'workbench.action.openWalkthrough',
                    'fabioc-aloha.alex-cognitive-architecture#alex-getting-started',
                    false
                );
                const readyDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
                    readyDisposable.dispose();
                    clearTimeout(readyTimeout);
                    openWalkthrough();
                });
                const readyTimeout = setTimeout(() => {
                    readyDisposable.dispose();
                    openWalkthrough();
                }, 3000);
                context.globalState.update(SHOWN_KEY, currentVersion);
            }
        } catch { /* silent */ }

        // Static-fetch activation-time check (ADR-009 Phase 1B step 6).
        // Only fires when the bundled brain is absent (true in v9.4.0+
        // shipped VSIXes; sidesteps the dev-clone case where brain/ is
        // present). Calls getLatestTag with ETag caching — typical cost
        // after the first call is one 304 response (zero rate-limit budget).
        // Surfaces an information message when a newer Edition is available,
        // inhibited to once per 24h per (current, latest) version pair.
        if (isStaticFetchMode()) {
            (async () => {
                const root = getWorkspaceRoot();
                if (!root) return;
                const markerPath = getMarkerPath(root);
                if (!fs.existsSync(markerPath)) return;
                const marker = readMarkerSafe(markerPath);
                if (!marker || !marker.edition_version) return;
                try {
                    const extVersion = (context.extension && context.extension.packageJSON && context.extension.packageJSON.version) || '0.0.0';
                    const authToken = await getSilentAuthToken(vscode);
                    const result = await getLatestTag(extVersion, context.globalState, { authToken });
                    const latestClean = (result.tag || '').replace(/^v/, '');
                    const currentClean = marker.edition_version;
                    if (!latestClean || latestClean === currentClean) return;
                    // Inhibit to once-per-24h per version pair.
                    const INHIBIT_KEY = `alex-act.upgradeNudgeShown.${currentClean}.${latestClean}`;
                    const lastShown = context.globalState.get(INHIBIT_KEY);
                    if (lastShown && Date.now() - Number(lastShown) < 24 * 60 * 60 * 1000) return;
                    context.globalState.update(INHIBIT_KEY, Date.now());
                    const choice = await vscode.window.showInformationMessage(
                        `Edition v${latestClean} is available (you're on v${currentClean}). Run "ACT: Upgrade Brain" to update.`,
                        'Upgrade now',
                        'Later'
                    );
                    if (choice === 'Upgrade now') {
                        vscode.commands.executeCommand('alex-act.upgrade');
                    }
                } catch (err) {
                    // Silent on the activation path; a real failure surfaces
                    // when the user invokes Upgrade explicitly. The Diagnose
                    // Fetch command captures the error for inspection.
                    channel.appendLine(`[activate] static-fetch version check failed: ${err && err.message ? err.message : err}`);
                }
            })();
        }

        // ACT: Diagnose Fetch — on-demand diagnostic command (no telemetry
        // alternative per ADR-009 Adoption decisions). Writes a one-shot
        // report to a dedicated OutputChannel; user copy-pastes into bug
        // reports. Never makes a NEW network call — only reports cached
        // state from globalState.
        context.subscriptions.push(vscode.commands.registerCommand('alex-act.diagnoseFetch', async () => {
            const ch = vscode.window.createOutputChannel('Alex ACT: Diagnose Fetch');
            ch.show();
            ch.appendLine(`=== Alex ACT Diagnose Fetch — ${new Date().toISOString()} ===`);
            try {
                const extVersion = (context.extension && context.extension.packageJSON && context.extension.packageJSON.version) || 'unknown';
                ch.appendLine(`Extension version    : ${extVersion}`);
                ch.appendLine(`Mode                  : ${isStaticFetchMode() ? 'static-fetch (no bundled brain)' : 'bundled brain'}`);
                ch.appendLine(`Edition repo          : ${EDITION_REPO.owner}/${EDITION_REPO.repo}`);

                // Auth mode (silent — does not prompt)
                let authMode = 'anonymous';
                try {
                    const session = await vscode.authentication.getSession('github', [], { silent: true });
                    if (session) authMode = 'authenticated (GitHub session present)';
                } catch { /* best effort */ }
                ch.appendLine(`Auth mode             : ${authMode}`);

                // ETag cache (populated by getLatestTag on prior call)
                const cache = context.globalState.get(EDITION_FETCH_CACHE_KEY);
                if (cache) {
                    ch.appendLine(`ETag cache            :`);
                    ch.appendLine(`  tag                : ${cache.tag || '(none)'}`);
                    ch.appendLine(`  commit_sha         : ${cache.commitSha || '(none)'}`);
                    ch.appendLine(`  published_at       : ${cache.publishedAt || '(none)'}`);
                    ch.appendLine(`  etag               : ${cache.etag || '(none)'}`);
                    ch.appendLine(`  last_modified      : ${cache.lastModified || '(none)'}`);
                    ch.appendLine(`  cached_at          : ${cache.cachedAt || '(none)'}`);
                } else {
                    ch.appendLine(`ETag cache            : empty (no prior fetch this install)`);
                }

                // Heir marker, if this workspace is a heir
                const root = getWorkspaceRoot();
                if (root) {
                    const markerPath = getMarkerPath(root);
                    if (fs.existsSync(markerPath)) {
                        ch.appendLine(`\nCurrent heir marker (${path.relative(root, markerPath) || markerPath}):`);
                        try {
                            const m = readMarkerSafe(markerPath) || {};
                            ch.appendLine(`  heir_id            : ${m.heir_id || '(none)'}`);
                            ch.appendLine(`  edition_version    : ${m.edition_version || '(none)'}`);
                            ch.appendLine(`  source             : ${m.source || '(legacy, pre-v9.4 bundled install)'}`);
                            ch.appendLine(`  commit_sha         : ${m.commit_sha || '(none)'}`);
                            ch.appendLine(`  fetched_at         : ${m.fetched_at || '(none)'}`);
                            ch.appendLine(`  auth_mode          : ${m.auth_mode || '(none)'}`);
                            ch.appendLine(`  extension_version  : ${m.extension_version || '(unknown)'}`);
                        } catch (err) {
                            ch.appendLine(`  (marker unreadable: ${err && err.message ? err.message : err})`);
                        }
                    } else {
                        ch.appendLine(`\nThis workspace is not an ACT heir (no .act-heir.json).`);
                    }
                } else {
                    ch.appendLine(`\nNo open workspace.`);
                }

                ch.appendLine(`\n--- End of diagnostic report ---`);
                ch.appendLine(`Paste this output into bug reports per ADR-009.`);
            } catch (err) {
                ch.appendLine(`(diagnose-fetch crashed: ${err && err.message ? err.message : err})`);
            }
        }));

        // Startup: show the ACT status bar item whenever a workspace is open.
        // Four states share one click target (cmdStatusBarMenu adapts to each):
        //   1. Protected constellation repo       → "$(lock) ACT — <Name>"
        //      (Supervisor / Edition / Mall / Extension / Memory / etc.)
        //   2. Workspace not initialized          → "ACT — Bootstrap" (discovery CTA)
        //   3. Workspace is a heir, current       → "ACT v<edition>"
        //   4. Workspace is a heir, upgrade ready → "ACT v<edition> ↑"
        // The protected branch wins over the heir branch when both markers
        // exist (the constellation repos never legitimately host a heir).
        //
        // The item is created once and its text/tooltip are recomputed on
        // workspace-folder changes (Add Folder, Remove Folder, Open Folder)
        // so the 4-state model stays accurate without a window reload.
        try {
            const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
            statusBar.command = 'alex-act.statusBarMenu';
            context.subscriptions.push(statusBar);

            const applyStatusBarState = (currentRoot) => {
                if (!currentRoot) { statusBar.hide(); return; }
                try {
                    const protectedMarker = readProtectedMarker(currentRoot);
                    const heirMarkerPath = getMarkerPath(currentRoot);
                    const marker = !protectedMarker && fs.existsSync(heirMarkerPath)
                        ? readMarkerSafe(heirMarkerPath)
                        : null;
                    let bundledVersion = '';
                    try { bundledVersion = fs.readFileSync(path.join(BRAIN_DIR, 'VERSION'), 'utf8').trim(); } catch { /* leave empty */ }
                    // Static-fetch fallback: no bundled brain, but the
                    // activation-time check may have cached the latest
                    // Edition tag in globalState. Use that as the
                    // "available version" for the upgrade arrow.
                    if (!bundledVersion) {
                        const cached = getCachedLatestEditionTag(context);
                        if (cached) bundledVersion = cached.replace(/^v/, '');
                    }

                    if (protectedMarker) {
                        const name = protectedMarker.name || 'Protected';
                        statusBar.text = `$(lock) ACT — ${name}`;
                        statusBar.tooltip =
                            `Alex ACT — ${name} (protected constellation repo)\n` +
                            (protectedMarker.role || '') +
                            (protectedMarker.note ? `\n\n${protectedMarker.note}` : '') +
                            '\n\nClick for actions';
                    } else if (marker && marker.edition_version) {
                        const upgradeAvailable = isNewerSemver(bundledVersion, marker.edition_version);
                        statusBar.text = upgradeAvailable
                            ? `$(brain) ACT v${marker.edition_version} $(arrow-up)`
                            : `$(brain) ACT v${marker.edition_version}`;
                        statusBar.tooltip = `Alex ACT Edition v${marker.edition_version}${upgradeAvailable ? ` — v${bundledVersion} available` : ''}\nClick for actions`;
                    } else {
                        // Workspace is not an ACT heir yet — surface the bootstrap entry point.
                        statusBar.text = '$(brain) ACT — Bootstrap';
                        statusBar.tooltip = bundledVersion
                            ? `Alex ACT Edition v${bundledVersion} bundled\nWorkspace not initialized — click to bootstrap`
                            : 'Alex ACT Edition\nWorkspace not initialized — click to bootstrap';
                    }
                    statusBar.show();
                } catch { statusBar.hide(); }
            };

            applyStatusBarState(getWorkspaceRoot());

            // Refresh on workspace folder changes so multi-root swaps and
            // Add/Remove Folder operations don't leave stale 4-state info.
            context.subscriptions.push(
                vscode.workspace.onDidChangeWorkspaceFolders(() => {
                    applyStatusBarState(getWorkspaceRoot());
                })
            );
        } catch { /* silent */ }

        channel.appendLine('[activate] Activation completed.');
    } catch (err) {
        logActivationError(channel, 'activate', err);

        if (!criticalReady) {
            const recovered = registerCriticalCommands(context, channel);
            criticalReady = recovered > 0;
            channel.appendLine(`[activate] Recovery registration attempted (${recovered} critical command(s)).`);
        }

        const state = criticalReady
            ? 'Core ACT commands are still available.'
            : 'Core command registration also failed.';
        vscode.window.showWarningMessage(
            `ACT: Extension activated with limited functionality due to a startup error. ${state} See the "ACT Extension" output channel for details.`
        );
    }
}

function deactivate() {
    if (_converterChannel) {
        _converterChannel.dispose();
        _converterChannel = null;
    }
    if (_activationChannel) {
        _activationChannel.dispose();
        _activationChannel = null;
    }
    // Static-fetch cleanup: dispose any leftover per-fetch temp dir
    // (should be empty if cmd wrappers ran their finally blocks, but
    // belt-and-suspenders against extension-host crashes mid-fetch).
    if (_fetchCleanup) {
        try { _fetchCleanup(); } catch { /* best effort */ }
    }
    _extensionContext = null;
}

module.exports = { activate, deactivate };
