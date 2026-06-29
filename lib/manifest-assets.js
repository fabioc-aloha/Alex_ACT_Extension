'use strict';

const fs = require('fs');
const path = require('path');

function copyFileSync(src, dst) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
}

/**
 * Refresh Edition-owned VS Code assets from the fetched Edition root.
 * These are not inside BRAIN_DIR when BRAIN_DIR points at `<tarball>/.github`,
 * so production install paths must copy them from the tarball root explicitly.
 *
 * @param {string} heirRoot
 * @param {object|null} manifest
 * @param {string} editionRoot
 * @returns {string[]} workspace-relative paths copied
 */
function installVscodeAssets(heirRoot, manifest, editionRoot) {
    const copied = [];
    for (const basename of (manifest && Array.isArray(manifest.vscode_assets) ? manifest.vscode_assets : [])) {
        const name = String(basename);
        const src = path.join(editionRoot, '.vscode', name);
        const dst = path.join(heirRoot, '.vscode', name);
        if (!fs.existsSync(src)) continue;
        copyFileSync(src, dst);
        copied.push(path.posix.join('.vscode', name));
    }
    return copied;
}

/**
 * Seed first-install bootstrap templates from the correct source root.
 * `.github/config/cognitive-config.json` is staged in Extension `templates/`
 * because it is intentionally absent from the brain bundle. Non-.github
 * templates (`.vscode/extensions.json`, `.vscode/settings.json`) live in the
 * fetched Edition tarball root and must be copied from there.
 *
 * @param {string} heirRoot
 * @param {object|null} manifest
 * @param {string} editionRoot
 * @param {string} templatesDir
 * @param {Set<string>|null} alreadyOwned - paths snapshotted from the heir before upgrade
 * @returns {{seeded: string[], failures: Array<{rel: string, err: string}>}}
 */
function seedBootstrapTemplates(heirRoot, manifest, editionRoot, templatesDir, alreadyOwned) {
    const seeded = [];
    const failures = [];
    for (const tpl of (manifest && Array.isArray(manifest.bootstrap_templates) ? manifest.bootstrap_templates : [])) {
        const norm = String(tpl).replace(/\\/g, '/');
        if (alreadyOwned && alreadyOwned.has(norm)) continue;
        const dst = path.join(heirRoot, norm);
        if (fs.existsSync(dst)) continue;
        const src = norm.startsWith('.github/')
            ? path.join(templatesDir, path.basename(norm))
            : path.join(editionRoot, norm);
        if (!fs.existsSync(src)) continue;
        try {
            copyFileSync(src, dst);
            seeded.push(norm);
        } catch (err) {
            failures.push({ rel: norm, err: err && err.message ? err.message : String(err) });
        }
    }
    return { seeded, failures };
}

module.exports = { installVscodeAssets, seedBootstrapTemplates };
