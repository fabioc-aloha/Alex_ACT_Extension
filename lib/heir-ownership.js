// lib/heir-ownership.js
// HEIR_OWNED vs EDITION_OWNED ownership classification, extracted from
// extension.js so it can be unit-tested without the vscode runtime.
//
// Origin: 2026-06-29. The 2026-06-10 install-side HEIR_OWNED filter shipped
// in `lib/edition-install.js` `installFromTarball` (98 tests passed) — but
// `cmdBootstrap` and `cmdUpgrade` in extension.js have their own copy loops
// that never call `installFromTarball`. Every heir on Extension v9.5.0–v9.5.4
// received Edition's `.github/workflows/{brain-qa,release-gate}.yml` plus
// `.github/dependabot.yml`. This module exposes the matchers as testable
// functions that extension.js requires and invokes in its actual copy paths.

'use strict';

/**
 * Test whether a workspace-relative path matches any of the supplied glob
 * patterns. Supports `**` (recursive) and `*` (single-segment) wildcards.
 * Patterns and input are normalised to forward slashes. Vocabulary mirrors
 * the patterns Edition's `_registry.cjs` HEIR_OWNED / EDITION_OWNED arrays
 * actually use today.
 *
 * @param {string} wsRel - workspace-relative path (forward slashes)
 * @param {string[]} patterns - glob patterns
 * @returns {boolean}
 */
function pathMatchesAny(wsRel, patterns) {
    if (!patterns || patterns.length === 0) return false;
    const norm = String(wsRel).replace(/\\/g, '/');
    for (const raw of patterns) {
        const p = String(raw).replace(/\\/g, '/');
        if (p.endsWith('/**')) {
            const prefix = p.slice(0, -3);
            if (norm === prefix || norm.startsWith(prefix + '/')) return true;
        } else if (p.includes('*')) {
            const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
            if (new RegExp('^' + escaped + '$').test(norm)) return true;
        } else if (norm === p) {
            return true;
        }
    }
    return false;
}

/**
 * Decide whether a brain file should be skipped during install because the
 * heir owns that slot, not Edition. The HEIR_OWNED filter has precedence
 * over EDITION_OWNED for the leak class shipped 2026-06-10 (workflows/,
 * dependabot.yml, ISSUE_TEMPLATE/, episodic/, local/ namespaces): Edition's
 * own instance of these files is curator territory and must not ship to
 * heirs verbatim.
 *
 * Bootstrap templates are HEIR_OWNED by classification but get
 * first-install-only semantics; they must NOT be skipped here — the caller
 * handles them. Order: caller checks bootstrap_templates first, then this
 * skip check.
 *
 * If the policy is unavailable (legacy Edition tags before v3.4.x lacked
 * the HEIR_OWNED export), callers degrade to verbatim copy by passing
 * `null` (or empty array) for `heirOwnedPatterns`. This preserves
 * pre-v9.5.x behavior on old Edition tags rather than introducing a hard
 * refusal.
 *
 * @param {string} wsRel - workspace-relative path, forward slashes
 *   (e.g. `.github/workflows/brain-qa.yml`).
 * @param {string[] | null} heirOwnedPatterns - HEIR_OWNED glob list from
 *   Edition's `_registry.cjs`. When null/empty, returns `false` (no-skip).
 * @param {Set<string> | null} bootstrapTemplates - set of bootstrap-template
 *   workspace-relative paths. Matches are NOT skipped (caller decides).
 * @returns {boolean} true ⇒ caller should skip the file.
 */
function shouldSkipForHeirOwnership(wsRel, heirOwnedPatterns, bootstrapTemplates) {
    if (!heirOwnedPatterns || heirOwnedPatterns.length === 0) return false;
    if (bootstrapTemplates && bootstrapTemplates.has(wsRel)) return false;
    return pathMatchesAny(wsRel, heirOwnedPatterns);
}

module.exports = { pathMatchesAny, shouldSkipForHeirOwnership };
