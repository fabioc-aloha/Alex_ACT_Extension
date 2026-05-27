/**
 * workspace-settings-merger.cjs — deep-merge a workspace-settings baseline
 * into a heir's `.vscode/settings.json` non-destructively.
 *
 * Used by:
 *   - bootstrap-heir.cjs (on init, after HEIR_OWNED templates land)
 *   - upgrade-self.cjs (on upgrade, after the marker is refreshed)
 *
 * Why a shared module: `.vscode/settings.json` is HEIR_OWNED (see _registry.cjs
 * EDITION_OWNED / HEIR_OWNED arrays). Edition never overwrites the file
 * wholesale, so per-key baseline keys must be merged. This module is the
 * single implementation both lifecycle scripts call.
 *
 * Behaviour:
 *   - Reads `.github/config/heir-workspace-settings-baseline.json`
 *   - Loads heir's existing `.vscode/settings.json` (creating empty object if
 *     absent; tolerating JSONC `//` and block comments)
 *   - For each top-level key in `settings`: if the baseline value is an object,
 *     deep-merge its child keys; otherwise scalar-replace
 *   - Returns the merge result without writing — caller decides whether to
 *     persist (lets dry-run paths reuse the same logic)
 *
 * Companion to: docs/proposals/heir-local-skills-discovery-2026-05-27.md
 * (authored in Alex_ACT_Supervisor, shipped via Edition v2.6.0).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function stripJsonc(text) {
    // strip block comments
    text = text.replace(/\/\*[\s\S]*?\*\//g, '');
    // strip // line comments (naive; settings.json rarely has // inside string values)
    text = text.replace(/^\s*\/\/.*$/gm, '');
    return text;
}

/**
 * Compute the merge result without writing.
 *
 * @param {string} repoRoot - heir repo root (where `.vscode/settings.json` lives)
 * @param {string} baselinePath - absolute path to the baseline JSON
 * @returns {object} { ok, settingsFile, existed, hadComments, changes, merged, error? }
 *   - changes: array of { key, sub|null, from, to } describing each upsert
 *   - merged: the would-be-written object
 *   - hadComments: true if the existing settings.json contained JSONC comments
 *     (caller may want to warn the heir that comments will be lost on write)
 */
function mergeWorkspaceSettings(repoRoot, baselinePath) {
    let baseline;
    try {
        baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch (e) {
        return { ok: false, error: `Cannot read baseline at ${baselinePath}: ${e.message}` };
    }
    const targetKeys = baseline.settings || {};

    const vscodeDir = path.join(repoRoot, '.vscode');
    const settingsFile = path.join(vscodeDir, 'settings.json');

    let existing = {};
    let hadComments = false;
    const existed = fs.existsSync(settingsFile);
    if (existed) {
        const raw = fs.readFileSync(settingsFile, 'utf8');
        hadComments = /\/\/|\/\*/.test(raw);
        try {
            existing = JSON.parse(stripJsonc(raw)) || {};
        } catch (e) {
            return {
                ok: false,
                error: `${settingsFile} is not valid JSON/JSONC: ${e.message}`,
            };
        }
    }

    const changes = [];
    const merged = { ...existing };

    for (const [key, desiredVal] of Object.entries(targetKeys)) {
        if (
            desiredVal &&
            typeof desiredVal === 'object' &&
            !Array.isArray(desiredVal)
        ) {
            const current =
                merged[key] &&
                typeof merged[key] === 'object' &&
                !Array.isArray(merged[key])
                    ? merged[key]
                    : {};
            const next = { ...current };
            for (const [subKey, subVal] of Object.entries(desiredVal)) {
                if (next[subKey] !== subVal) {
                    changes.push({ key, sub: subKey, from: next[subKey], to: subVal });
                    next[subKey] = subVal;
                }
            }
            merged[key] = next;
        } else {
            if (merged[key] !== desiredVal) {
                changes.push({ key, sub: null, from: merged[key], to: desiredVal });
                merged[key] = desiredVal;
            }
        }
    }

    return { ok: true, settingsFile, existed, hadComments, changes, merged };
}

/**
 * Persist a merge result to disk.
 *
 * @param {object} result - return value of mergeWorkspaceSettings
 */
function writeMerged(result) {
    const dir = path.dirname(result.settingsFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        result.settingsFile,
        JSON.stringify(result.merged, null, 2) + '\n',
        'utf8'
    );
}

/**
 * Format a one-line summary suitable for console.log.
 *
 * @param {object} result - return value of mergeWorkspaceSettings
 * @param {string} verb - "Would apply" / "Applied" / "Already current"
 */
function formatChangeSummary(result, verb) {
    if (!result.ok) return `Workspace settings merge: ${result.error}`;
    if (result.changes.length === 0) {
        return `Workspace settings: already current (${result.settingsFile})`;
    }
    const lines = [
        `${verb} ${result.changes.length} workspace-settings change(s) to ${result.settingsFile}:`,
    ];
    for (const c of result.changes) {
        const where = c.sub ? `${c.key}["${c.sub}"]` : c.key;
        lines.push(`  ${where}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`);
    }
    if (result.hadComments) {
        lines.push(
            '  Note: existing settings.json contained JSONC comments; they were not preserved.'
        );
    }
    return lines.join('\n');
}

module.exports = { mergeWorkspaceSettings, writeMerged, formatChangeSummary };
