// @ts-check
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { extractTarGzStream } = require('../lib/tar-extract');

// ── Minimal in-memory tar.gz builder for tests ─────────────────────────
// Writes a sequence of (header + padded data) blocks, plus the trailing
// zero block, then gzips it. Sufficient for ustar regular files and
// directories — matches what GitHub's release tarballs emit.

const BLOCK = 512;

function _padBlock(buf) {
    const remainder = buf.length % BLOCK;
    if (remainder === 0) return buf;
    return Buffer.concat([buf, Buffer.alloc(BLOCK - remainder)]);
}

function _octal(value, width) {
    // tar uses NUL-terminated octal in a fixed width (width includes the NUL).
    const s = value.toString(8).padStart(width - 1, '0');
    return Buffer.from(s + '\0', 'ascii');
}

function _writeString(buf, str, offset, length) {
    const ascii = Buffer.from(str, 'ascii');
    ascii.copy(buf, offset, 0, Math.min(ascii.length, length));
}

function _header(name, size, typeflag) {
    const h = Buffer.alloc(BLOCK);
    _writeString(h, name, 0, 100);
    _octal(0o644, 8).copy(h, 100);      // mode
    _octal(0, 8).copy(h, 108);          // uid
    _octal(0, 8).copy(h, 116);          // gid
    _octal(size, 12).copy(h, 124);      // size
    _octal(0, 12).copy(h, 136);         // mtime
    h.write('        ', 148, 8, 'ascii'); // checksum placeholder
    h.write(typeflag, 156, 1, 'ascii');
    h.write('ustar\0', 257, 6, 'ascii');
    h.write('00', 263, 2, 'ascii');
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += h[i];
    _octal(sum, 8).copy(h, 148);
    return h;
}

/**
 * @param {Array<{ name: string, content?: string | Buffer, type?: 'file' | 'dir' | '5' | '2' }>} entries
 */
function buildTarGz(entries) {
    const blocks = [];
    for (const entry of entries) {
        const isDir = entry.type === 'dir' || entry.type === '5' || entry.name.endsWith('/');
        const typeflag = entry.type === '2' ? '2' : (isDir ? '5' : '0');
        const data = isDir ? Buffer.alloc(0) : Buffer.from(entry.content || '');
        blocks.push(_header(entry.name, data.length, typeflag));
        if (data.length > 0) blocks.push(_padBlock(data));
    }
    blocks.push(Buffer.alloc(BLOCK * 2)); // trailing zero blocks
    const tar = Buffer.concat(blocks);
    return zlib.gzipSync(tar);
}

function bufferToStream(buf) {
    const { Readable } = require('node:stream');
    return Readable.from([buf]);
}

// ── Tests ─────────────────────────────────────────────────────────────

test('extracts a single regular file', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-test-'));
    try {
        const gz = buildTarGz([{ name: 'hello.txt', content: 'world' }]);
        const n = await extractTarGzStream(bufferToStream(gz), dest);
        assert.equal(n, 1);
        assert.equal(fs.readFileSync(path.join(dest, 'hello.txt'), 'utf8'), 'world');
    } finally {
        fs.rmSync(dest, { recursive: true, force: true });
    }
});

test('extracts nested files with directory entries', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-test-'));
    try {
        const gz = buildTarGz([
            { name: 'pkg/', type: 'dir' },
            { name: 'pkg/sub/', type: 'dir' },
            { name: 'pkg/sub/a.md', content: '# A' },
            { name: 'pkg/sub/b.md', content: '# B' }
        ]);
        const n = await extractTarGzStream(bufferToStream(gz), dest);
        assert.equal(n, 2);
        assert.equal(fs.readFileSync(path.join(dest, 'pkg/sub/a.md'), 'utf8'), '# A');
        assert.equal(fs.readFileSync(path.join(dest, 'pkg/sub/b.md'), 'utf8'), '# B');
    } finally {
        fs.rmSync(dest, { recursive: true, force: true });
    }
});

test('extracts files with auto-created parent directories', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-test-'));
    try {
        const gz = buildTarGz([
            // No explicit directory entries — the extractor must mkdirp.
            { name: 'a/b/c/d.txt', content: 'deep' }
        ]);
        const n = await extractTarGzStream(bufferToStream(gz), dest);
        assert.equal(n, 1);
        assert.equal(fs.readFileSync(path.join(dest, 'a/b/c/d.txt'), 'utf8'), 'deep');
    } finally {
        fs.rmSync(dest, { recursive: true, force: true });
    }
});

test('zip-slip defense: rejects ../ entries with no file written', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-test-'));
    const sentinel = path.join(os.tmpdir(), 'should-not-exist-' + Date.now());
    try {
        const gz = buildTarGz([
            { name: '../' + path.basename(sentinel), content: 'PWND' }
        ]);
        await assert.rejects(
            () => extractTarGzStream(bufferToStream(gz), dest),
            /zip-slip/
        );
        assert.equal(fs.existsSync(sentinel), false, 'zip-slip target must not be created');
    } finally {
        fs.rmSync(dest, { recursive: true, force: true });
    }
});

test('rejects symlink-style entries (typeflag 2)', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-test-'));
    try {
        const gz = buildTarGz([{ name: 'evil-link', type: '2' }]);
        await assert.rejects(
            () => extractTarGzStream(bufferToStream(gz), dest),
            /Unsupported tar entry type/
        );
    } finally {
        fs.rmSync(dest, { recursive: true, force: true });
    }
});

test('extracts a large-ish file across multiple chunks', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-test-'));
    try {
        const content = 'X'.repeat(BLOCK * 5 + 17); // odd-padded across multiple blocks
        const gz = buildTarGz([{ name: 'big.bin', content }]);
        const n = await extractTarGzStream(bufferToStream(gz), dest);
        assert.equal(n, 1);
        assert.equal(fs.readFileSync(path.join(dest, 'big.bin'), 'utf8'), content);
    } finally {
        fs.rmSync(dest, { recursive: true, force: true });
    }
});
