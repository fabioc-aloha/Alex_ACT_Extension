#!/usr/bin/env node
/**
 * audit-api-drift.cjs
 *
 * Mechanical drift detector for .github/EXTERNAL-API-REGISTRY.md.
 *
 * What it does (mechanical):
 *   - Parses every five-column registry table under a `## <Category>` heading.
 *   - Computes days since `Last Checked` for each row.
 *   - Optionally probes each `Source URL` with an HTTP HEAD (with --probe).
 *   - Reports fresh / stale / expired / unreachable entries.
 *   - Exits 0 (all fresh), 1 (stale found), 2 (expired or unreachable found).
 *
 * What it does NOT do (semantic — that's /audit-apis's job):
 *   - Read changelog or release pages and decide whether the listed models are still current.
 *   - Update model lists, source URLs, or skill files.
 *   - Reason about breaking changes between versions.
 *
 * @inheritance inheritable
 * @currency 2026-04-28
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const REGISTRY_PATH = path.resolve(process.cwd(), '.github', 'EXTERNAL-API-REGISTRY.md');

// ---- args ----
const args = process.argv.slice(2);
const PROBE = args.includes('--probe');
const QUIET = args.includes('--quiet');
const maxAgeArg = args.find(a => a.startsWith('--max-age-days='));
const STALE_DAYS = maxAgeArg ? parseInt(maxAgeArg.split('=')[1], 10) : 30;
const EXPIRED_DAYS = STALE_DAYS * 3; // 90 days at default

if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node audit-api-drift.cjs [options]

Reads .github/EXTERNAL-API-REGISTRY.md (in cwd) and reports drift.

Options:
  --probe                  HTTP HEAD each Source URL (network)
  --max-age-days=N         Stale threshold in days (default 30; expired = 3x)
  --quiet                  Only print the summary line
  --help, -h               This message

Exit codes:
  0  all entries fresh (or registry empty)
  1  one or more entries stale
  2  one or more entries expired or unreachable
`);
    process.exit(0);
}

// ---- read registry ----
if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`ERROR: ${REGISTRY_PATH} not found. Run from a heir repo root.`);
    process.exit(2);
}
const md = fs.readFileSync(REGISTRY_PATH, 'utf8');

// ---- parse ----
// Strategy: walk lines. Track current ## heading. When we see a table whose
// header row contains "Last Checked", capture data rows that follow until a
// blank line or new heading. Skip rows inside HTML comments.
function parseRegistry(text) {
    const lines = text.split(/\r?\n/);
    const entries = [];
    let category = null;
    let inComment = false;
    let inTable = false;
    let columnIndex = null; // index of "Source URL" / "Last Checked" / "Brain Files"

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();

        // HTML comments — skip entire block
        if (line.includes('<!--')) inComment = true;
        if (inComment) {
            if (line.includes('-->')) inComment = false;
            continue;
        }

        // Headings reset table state
        const headingMatch = /^##\s+(.+?)\s*$/.exec(line);
        if (headingMatch) {
            category = headingMatch[1];
            inTable = false;
            columnIndex = null;
            continue;
        }

        // Blank line ends a table
        if (line === '') {
            inTable = false;
            columnIndex = null;
            continue;
        }

        // Detect header row of a tracking table — require BOTH Source URL and Last Checked
        if (!inTable && /^\|/.test(line) && /Last Checked/i.test(line) && /Source URL/i.test(line)) {
            const cols = line.split('|').slice(1, -1).map(c => c.trim());
            const idxSource = cols.findIndex(c => /^source url/i.test(c));
            const idxChecked = cols.findIndex(c => /^last checked/i.test(c));
            const idxFiles = cols.findIndex(c => /^brain files/i.test(c));
            const idxVendor = 0;
            // Next non-separator row begins data rows
            columnIndex = { vendor: idxVendor, source: idxSource, checked: idxChecked, files: idxFiles, count: cols.length };
            inTable = 'header-seen';
            continue;
        }

        // Skip the separator row (---|---|---)
        if (inTable === 'header-seen' && /^\|[\s:|-]+\|$/.test(line)) {
            inTable = true;
            continue;
        }

        // Data rows
        if (inTable === true && /^\|/.test(line)) {
            const cols = line.split('|').slice(1, -1).map(c => c.trim());
            if (cols.length !== columnIndex.count) continue; // malformed row
            entries.push({
                category,
                vendor: columnIndex.vendor >= 0 ? cols[columnIndex.vendor] : '',
                sourceUrl: extractUrl(columnIndex.source >= 0 ? cols[columnIndex.source] : ''),
                lastChecked: columnIndex.checked >= 0 ? cols[columnIndex.checked] : '',
                brainFiles: columnIndex.files >= 0 ? cols[columnIndex.files] : '',
                rawLine: line,
            });
        }
    }
    return entries;
}

function extractUrl(cell) {
    // Match <https://...>, [text](https://...), or bare https://...
    const angle = /<(https?:\/\/[^>]+)>/.exec(cell);
    if (angle) return angle[1];
    const md = /\((https?:\/\/[^)]+)\)/.exec(cell);
    if (md) return md[1];
    const bare = /(https?:\/\/\S+)/.exec(cell);
    if (bare) return bare[1].replace(/[),.;]+$/, '');
    return '';
}

function parseDate(str) {
    // Accept ISO YYYY-MM-DD primarily; fall back to "Mon YYYY" or "Month DD, YYYY"
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    const monYear = /^([A-Za-z]+)\s+(\d{4})$/.exec(str);
    if (monYear) {
        const m = monthIndex(monYear[1]);
        if (m >= 0) return new Date(Date.UTC(+monYear[2], m, 1));
    }
    const fullDate = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(str);
    if (fullDate) {
        const m = monthIndex(fullDate[1]);
        if (m >= 0) return new Date(Date.UTC(+fullDate[3], m, +fullDate[2]));
    }
    return null;
}

function monthIndex(name) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return months.indexOf(name.toLowerCase().slice(0, 3));
}

function daysSince(date) {
    const ms = Date.now() - date.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ---- HEAD probe (optional) ----
function probeUrl(url, timeoutMs = 8000) {
    return new Promise((resolve) => {
        let parsed;
        try { parsed = new URL(url); } catch { return resolve({ ok: false, reason: 'invalid-url' }); }
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => {
            // Treat 2xx, 3xx as reachable. 405 (Method Not Allowed) means HEAD not supported but server is up.
            const ok = (res.statusCode >= 200 && res.statusCode < 400) || res.statusCode === 405;
            resolve({ ok, status: res.statusCode });
        });
        req.on('error', (err) => resolve({ ok: false, reason: err.code || err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
        req.end();
    });
}

// ---- main ----
async function main() {
    const entries = parseRegistry(md);

    if (entries.length === 0) {
        if (!QUIET) console.log('Registry is empty (no tracked entries). Skipping audit.');
        process.exit(0);
    }

    const fresh = [];
    const stale = [];
    const expired = [];
    const unparsable = [];

    for (const e of entries) {
        const d = parseDate(e.lastChecked);
        if (!d) { unparsable.push(e); continue; }
        const age = daysSince(d);
        e.ageDays = age;
        if (age > EXPIRED_DAYS) expired.push(e);
        else if (age > STALE_DAYS) stale.push(e);
        else fresh.push(e);
    }

    // Optional probes
    const unreachable = [];
    if (PROBE) {
        if (!QUIET) console.log(`Probing ${entries.length} source URLs (HEAD)...`);
        for (const e of entries) {
            if (!e.sourceUrl) { unreachable.push({ ...e, probeReason: 'no-url' }); continue; }
            const r = await probeUrl(e.sourceUrl);
            if (!r.ok) unreachable.push({ ...e, probeReason: r.reason || `status-${r.status}` });
        }
    }

    // ---- report ----
    if (!QUIET) {
        if (fresh.length) {
            console.log(`\n[FRESH] ${fresh.length} entries (≤${STALE_DAYS} days):`);
            fresh.forEach(e => console.log(`  ${e.category} / ${e.vendor} — ${e.ageDays}d`));
        }
        if (stale.length) {
            console.log(`\n[STALE] ${stale.length} entries (${STALE_DAYS}-${EXPIRED_DAYS} days):`);
            stale.forEach(e => console.log(`  ${e.category} / ${e.vendor} — ${e.ageDays}d (last: ${e.lastChecked})`));
        }
        if (expired.length) {
            console.log(`\n[EXPIRED] ${expired.length} entries (>${EXPIRED_DAYS} days):`);
            expired.forEach(e => console.log(`  ${e.category} / ${e.vendor} — ${e.ageDays}d (last: ${e.lastChecked})`));
        }
        if (unparsable.length) {
            console.log(`\n[UNPARSABLE DATE] ${unparsable.length} entries:`);
            unparsable.forEach(e => console.log(`  ${e.category} / ${e.vendor} — "${e.lastChecked}"`));
        }
        if (PROBE && unreachable.length) {
            console.log(`\n[UNREACHABLE] ${unreachable.length} entries:`);
            unreachable.forEach(e => console.log(`  ${e.category} / ${e.vendor} — ${e.sourceUrl} (${e.probeReason})`));
        }
    }

    const total = entries.length;
    const okCount = fresh.length;
    const staleCount = stale.length + unparsable.length;
    const failCount = expired.length + unreachable.length;

    console.log(`\nSummary: ${okCount}/${total} fresh, ${staleCount} stale, ${failCount} fail` +
        (PROBE ? '' : ' (re-run with --probe to also HEAD-check source URLs)'));

    if (failCount > 0) process.exit(2);
    if (staleCount > 0) process.exit(1);
    process.exit(0);
}

main().catch(err => {
    console.error('FATAL:', err.message);
    process.exit(2);
});
