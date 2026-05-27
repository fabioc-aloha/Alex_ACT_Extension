// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');

// ── Recursive directory listing with symlink-loop protection ───────
// Tracks resolved real paths and caps recursion depth to prevent infinite
// loops from circular symlinks/junctions. A real Edition brain is ≤4 levels
// deep; depths past WARN are almost certainly a misconfigured symlink.
const MAX_RECURSION_DEPTH = 50;
const WARN_RECURSION_DEPTH = 20;
let _warnedDeep = false;

/**
 * List all files under `dir` relative to `base`, with symlink-cycle and
 * depth protection. Returns forward-slash-separated relative paths.
 *
 * @param {string} dir - directory to walk
 * @param {string} [base] - root for relative paths (defaults to `dir`)
 * @param {Set<string>} [_seen] - internal: visited real-path set
 * @param {number} [_depth] - internal: current recursion depth
 * @returns {string[]}
 */
function listFilesRecursive(dir, base, _seen, _depth) {
    base = base || dir;
    _seen = _seen || new Set();
    _depth = _depth || 0;
    let results = [];
    if (!fs.existsSync(dir)) return results;
    if (_depth > MAX_RECURSION_DEPTH) return results;
    if (_depth === WARN_RECURSION_DEPTH && !_warnedDeep) {
        _warnedDeep = true;
        console.warn(`ACT: directory walk reached depth ${WARN_RECURSION_DEPTH} at ${dir} — possible symlink loop or unexpectedly deep tree.`);
    }
    let real;
    try { real = fs.realpathSync(dir); } catch { return results; }
    if (_seen.has(real)) return results;
    _seen.add(real);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(listFilesRecursive(full, base, _seen, _depth + 1));
        } else {
            results.push(path.relative(base, full).replace(/\\/g, '/'));
        }
    }
    return results;
}

module.exports = { listFilesRecursive };
