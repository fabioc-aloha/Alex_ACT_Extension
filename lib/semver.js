// @ts-check
'use strict';

/**
 * Minimal semver helpers for the static-fetch Extension. Zero npm deps;
 * this file is the only semver implementation in the Extension.
 *
 * Scope: parse, compare, and gte against X.Y.Z[-prerelease[.N]] with
 * optional leading `v`. Pre-release ordering follows semver 2.0.0 rules:
 * any pre-release < the same X.Y.Z without pre-release.
 *
 * NOT supported (out of scope for the static-fetch use case):
 *   - build metadata (+sha)
 *   - complex range syntax (^, ~, >=)
 *   - coerce-from-non-semver
 *
 * Callers that need fuller semver behaviour should bring in `semver` from
 * npm; this file is for the small set of comparisons the Extension makes
 * against Edition tags + the `min_extension_version` contract field.
 */

/**
 * Parse a semver string into structured parts. Returns null on malformed
 * input rather than throwing — callers decide how to handle bad versions.
 *
 * @param {string} v
 * @returns {{ major: number, minor: number, patch: number, pre: string[] } | null}
 */
function parse(v) {
    if (typeof v !== 'string') return null;
    const trimmed = v.trim().replace(/^v/, '');
    const m = trimmed.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
    if (!m) return null;
    const major = parseInt(m[1], 10);
    const minor = parseInt(m[2], 10);
    const patch = parseInt(m[3], 10);
    const pre = m[4] ? m[4].split('.') : [];
    return { major, minor, patch, pre };
}

/**
 * Compare two pre-release identifiers per semver 2.0.0 §11.
 * Numeric identifiers compare numerically; alphanumerics compare ASCII.
 * Numeric < alphanumeric when types differ.
 *
 * @param {string} a
 * @param {string} b
 */
function _cmpPreId(a, b) {
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && bNum) {
        const ai = parseInt(a, 10);
        const bi = parseInt(b, 10);
        return ai - bi;
    }
    if (aNum) return -1;
    if (bNum) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

/**
 * Compare two semver strings. Returns -1, 0, or 1.
 * Throws if either input is malformed — comparison is meaningless then.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
function compare(a, b) {
    const pa = parse(a);
    const pb = parse(b);
    if (!pa) throw new Error(`semver.compare: malformed left operand "${a}"`);
    if (!pb) throw new Error(`semver.compare: malformed right operand "${b}"`);
    if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
    if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
    if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
    // Pre-release: any pre < no pre at the same X.Y.Z
    if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
    if (pa.pre.length === 0) return 1;
    if (pb.pre.length === 0) return -1;
    const n = Math.max(pa.pre.length, pb.pre.length);
    for (let i = 0; i < n; i++) {
        if (i >= pa.pre.length) return -1;
        if (i >= pb.pre.length) return 1;
        const c = _cmpPreId(pa.pre[i], pb.pre[i]);
        if (c !== 0) return c < 0 ? -1 : 1;
    }
    return 0;
}

/**
 * True if `a >= b`. Returns false on either malformed input — a refused
 * upgrade is a safer failure than crashing the activation path.
 *
 * @param {string} a
 * @param {string} b
 */
function gte(a, b) {
    try { return compare(a, b) >= 0; }
    catch { return false; }
}

/**
 * Strip leading `v` from a tag-style string. Returns the input unchanged
 * if no leading `v`.
 *
 * @param {string} tag
 */
function strip(tag) {
    if (typeof tag !== 'string') return tag;
    return tag.replace(/^v/, '');
}

module.exports = { parse, compare, gte, strip };
