// @ts-check
'use strict';

/**
 * Minimal pure-Node tar.gz extractor for the static-fetch Extension.
 * Zero npm deps. Handles POSIX/USTAR tar blocks emitted by GitHub's
 * `codeload.github.com/<owner>/<repo>/tar.gz/refs/tags/<tag>` endpoint.
 *
 * Scope (deliberately small):
 *   - Regular files (typeflag '0' or null/0x00) and directories ('5')
 *   - PAX/GNU long-name records ('L', 'K', 'x') — read and ignored;
 *     GitHub release tarballs from non-monorepo Edition do not need
 *     >100 char paths. If they ever do, the extractor falls back to
 *     the legacy 100-char name field.
 *
 * Out of scope (deliberate):
 *   - Symlinks, hard links, char/block devices, FIFOs (typeflags 1,2,3,4,6)
 *     — rejected with EditionContractError so a malicious tarball cannot
 *     introduce them. Edition is a markdown + JS brain; no such entries
 *     are legitimate.
 *
 * Security:
 *   - Zip-slip defense: every entry's resolved destination must be a
 *     descendant of the extraction root. Otherwise: throw, no file written.
 *
 * Format reference: https://www.gnu.org/software/tar/manual/html_node/Standard.html
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

const BLOCK = 512;

/**
 * Stream-decompress a .tar.gz from a Node `Readable` stream into `destDir`.
 * Returns a Promise that resolves to the count of files written.
 *
 * @param {NodeJS.ReadableStream} gzippedStream
 * @param {string} destDir
 * @returns {Promise<number>}
 */
function extractTarGzStream(gzippedStream, destDir) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(destDir, { recursive: true });
        const destRoot = path.resolve(destDir);

        const gunzip = zlib.createGunzip();
        let buffer = Buffer.alloc(0);
        let bytesWritten = 0;
        let filesWritten = 0;
        let pendingLongName = null;
        let aborted = false;

        const fail = (err) => {
            if (aborted) return;
            aborted = true;
            try { gunzip.destroy(); } catch { /* best effort */ }
            reject(err);
        };

        gzippedStream.on('error', fail);
        gunzip.on('error', fail);

        gunzip.on('data', (chunk) => {
            if (aborted) return;
            buffer = Buffer.concat([buffer, chunk]);
            try {
                while (buffer.length >= BLOCK) {
                    const header = buffer.slice(0, BLOCK);
                    // End-of-archive: two consecutive zero blocks. A single
                    // zero header (name byte 0) is the typical signal in
                    // practice; we accept it.
                    if (header[0] === 0) {
                        // Drain the rest silently — gzip stream may carry
                        // padding after the end marker.
                        buffer = Buffer.alloc(0);
                        return;
                    }
                    const name = _readString(header, 0, 100);
                    const sizeOctal = _readString(header, 124, 12);
                    const size = parseInt(sizeOctal.trim(), 8) || 0;
                    const typeflag = String.fromCharCode(header[156] || 0x30);
                    const prefix = _readString(header, 345, 155);

                    // Need full data + padding before consuming
                    const padded = Math.ceil(size / BLOCK) * BLOCK;
                    if (buffer.length < BLOCK + padded) {
                        // wait for more data
                        return;
                    }

                    const data = buffer.slice(BLOCK, BLOCK + size);
                    buffer = buffer.slice(BLOCK + padded);

                    if (typeflag === 'L' || typeflag === 'x' || typeflag === 'g' || typeflag === 'K') {
                        // PAX/GNU extended header. 'L' = long name for next entry.
                        // 'K' = long link target. 'x'/'g' = PAX records.
                        // We only honour 'L' (long file name); others are read+ignored.
                        if (typeflag === 'L') {
                            pendingLongName = data.toString('utf8').replace(/\0+$/, '');
                        }
                        continue;
                    }

                    let fullName = pendingLongName != null
                        ? pendingLongName
                        : (prefix ? prefix + '/' + name : name);
                    pendingLongName = null;

                    // Normalize separators; reject absolute or .. components
                    fullName = fullName.replace(/\\/g, '/').replace(/\/+$/, '');
                    if (!fullName) continue;

                    if (typeflag === '5' || fullName.endsWith('/')) {
                        // Directory
                        const dirAbs = _safeResolve(destRoot, fullName);
                        fs.mkdirSync(dirAbs, { recursive: true });
                        continue;
                    }

                    if (typeflag !== '0' && typeflag !== '\0' && typeflag !== '') {
                        // Unsupported entry type. Sym/hard links etc — refuse.
                        // GitHub release tarballs of the Edition repo do not
                        // contain these; rejecting them is the zip-slip-grade
                        // defence applied to the broader set of unsafe entries.
                        fail(new Error(
                            `Unsupported tar entry type '${typeflag}' for ${fullName}. Edition tarballs should contain regular files and directories only.`
                        ));
                        return;
                    }

                    const fileAbs = _safeResolve(destRoot, fullName);
                    fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
                    fs.writeFileSync(fileAbs, data);
                    bytesWritten += size;
                    filesWritten += 1;
                }
            } catch (err) {
                fail(err);
            }
        });

        gunzip.on('end', () => {
            if (aborted) return;
            resolve(filesWritten);
        });

        gzippedStream.pipe(gunzip);
    });
}

/**
 * Read a NUL-terminated ASCII string from a buffer slice.
 *
 * @param {Buffer} buf
 * @param {number} offset
 * @param {number} length
 */
function _readString(buf, offset, length) {
    const slice = buf.slice(offset, offset + length);
    const nul = slice.indexOf(0);
    return slice.slice(0, nul === -1 ? length : nul).toString('utf8');
}

/**
 * Resolve `rel` against `root` and verify the result stays inside `root`.
 * Throws otherwise. This is the zip-slip defence.
 *
 * @param {string} root - absolute path of the extraction root
 * @param {string} rel - tar entry path (may contain `..`)
 */
function _safeResolve(root, rel) {
    const target = path.resolve(root, rel);
    const sep = path.sep;
    if (target !== root && !target.startsWith(root + sep)) {
        throw new Error(
            `Tar entry "${rel}" resolves outside extraction root (zip-slip). ` +
            `target=${target} root=${root}`
        );
    }
    return target;
}

/**
 * Fetch and extract a .tar.gz from an HTTPS URL into `destDir`. Follows
 * up to 5 redirects. Returns the count of files written. Rejects with
 * a typed error string on HTTP failure.
 *
 * @param {string} url
 * @param {string} destDir
 * @param {{ headers?: Record<string, string>, timeoutMs?: number, maxRedirects?: number }} [opts]
 * @returns {Promise<number>}
 */
function fetchAndExtract(url, destDir, opts) {
    const headers = (opts && opts.headers) || {};
    const timeoutMs = (opts && opts.timeoutMs) || 60000;
    const maxRedirects = (opts && typeof opts.maxRedirects === 'number') ? opts.maxRedirects : 5;

    return new Promise((resolve, reject) => {
        const get = (u, redirectsLeft) => {
            let settled = false;
            const req = https.get(u, { headers }, (res) => {
                const status = res.statusCode || 0;
                if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
                    res.resume();
                    return get(res.headers.location, redirectsLeft - 1);
                }
                if (status !== 200) {
                    settled = true;
                    res.resume();
                    return reject(_httpError(status, res.headers, u));
                }
                extractTarGzStream(res, destDir).then((n) => {
                    if (settled) return;
                    settled = true;
                    resolve(n);
                }).catch((err) => {
                    if (settled) return;
                    settled = true;
                    reject(err);
                });
            });
            req.setTimeout(timeoutMs, () => {
                if (settled) return;
                settled = true;
                req.destroy(new Error(`tar fetch timed out after ${timeoutMs}ms: ${u}`));
            });
            req.on('error', (err) => {
                if (settled) return;
                settled = true;
                reject(err);
            });
        };
        get(url, maxRedirects);
    });
}

/**
 * Build a typed HTTP error with rate-limit + retry headers attached as
 * properties so callers can pattern-match without re-parsing.
 */
function _httpError(status, headers, url) {
    const err = new Error(`HTTP ${status} from ${url}`);
    /** @type {any} */ (err).status = status;
    /** @type {any} */ (err).headers = headers;
    /** @type {any} */ (err).url = url;
    return err;
}

module.exports = { extractTarGzStream, fetchAndExtract };
