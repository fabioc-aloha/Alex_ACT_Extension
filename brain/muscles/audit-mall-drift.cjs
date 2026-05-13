#!/usr/bin/env node
/**
 * audit-mall-drift.cjs
 *
 * Mechanical drift detector for heir-installed Mall plugins in .github/skills/local/<plugin>/.
 *
 * What it does (mechanical):
 *   - Loads Mall CATALOG.json (local clone first, optional gh API fallback).
 *   - Reads local plugin manifests from .github/skills/local/<plugin>/plugin.json.
 *   - Classifies each local plugin as:
 *     IN_SYNC | CURATED_SUBSET | UPDATED_UPSTREAM | DEPRECATED_UPSTREAM | UNMANAGED_LOCAL_PLUGIN
 *   - Emits summary + table (or JSON with --json).
 *
 * What it does NOT do (semantic):
 *   - Apply updates.
 *   - Remove plugins.
 *   - Decide policy.
 *
 * @inheritance inheritable
 * @currency 2026-05-13
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const quiet = args.includes('--quiet');
const allowGh = args.includes('--allow-gh');
const catalogArg = args.find((a) => a.startsWith('--catalog='));

function usage() {
    console.log(`Usage: node .github/muscles/audit-mall-drift.cjs [options]

Options:
  --catalog=<path>   Use specific CATALOG.json path
  --allow-gh         Fallback to GitHub API if local catalog is not found
  --json             Emit JSON report
  --quiet            Summary line only (ignored with --json)
  --help, -h         Show this message

Exit codes:
    0  all managed plugins are IN_SYNC/CURATED_SUBSET (or no managed plugins)
  1  one or more UPDATED_UPSTREAM / DEPRECATED_UPSTREAM / UNMANAGED_LOCAL_PLUGIN
  2  catalog unavailable or local manifest parse error
`);
}

if (args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
}

function fileExists(p) {
    try {
        fs.accessSync(p, fs.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

function readJson(p) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function arrayEqual(a, b) {
    const aa = Array.isArray(a) ? [...a].sort() : [];
    const bb = Array.isArray(b) ? [...b].sort() : [];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i += 1) {
        if (aa[i] !== bb[i]) return false;
    }
    return true;
}

function tryLoadCatalog() {
    const candidates = [];
    if (catalogArg) candidates.push(path.resolve(process.cwd(), catalogArg.split('=')[1]));
    candidates.push(path.join(process.cwd(), 'CATALOG.json'));
    candidates.push(path.join(process.cwd(), '..', 'Alex_ACT_Plugin_Mall', 'CATALOG.json'));
    candidates.push(path.join('C:\\Development', 'Alex_ACT_Plugin_Mall', 'CATALOG.json'));
    candidates.push(path.join(os.homedir(), 'Alex_ACT_Plugin_Mall', 'CATALOG.json'));

    for (const p of candidates) {
        if (fileExists(p)) {
            return { catalog: readJson(p), source: p };
        }
    }

    if (!allowGh) {
        return null;
    }

    try {
        const b64 = cp.execFileSync(
            'gh',
            ['api', 'repos/fabioc-aloha/Alex_Skill_Mall/contents/CATALOG.json', '--jq', '.content'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        ).trim();
        const json = Buffer.from(b64, 'base64').toString('utf8');
        return { catalog: JSON.parse(json), source: 'gh:repos/fabioc-aloha/Alex_Skill_Mall/CATALOG.json' };
    } catch {
        return null;
    }
}

function scanLocalPluginDirs(localSkillsDir) {
    const rows = [];
    if (!fileExists(localSkillsDir)) return rows;

    const dirs = fs.readdirSync(localSkillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b));

    for (const d of dirs) {
        const pluginDir = path.join(localSkillsDir, d);
        const manifestPath = path.join(pluginDir, 'plugin.json');

        if (!fileExists(manifestPath)) {
            rows.push({
                name: d,
                state: 'UNMANAGED_LOCAL_PLUGIN',
                source_path: '(local-only)',
                delta: 'No local plugin.json; cannot compare to Mall catalog',
                plugin_dir: pluginDir,
                managed: false,
            });
            continue;
        }

        let manifest;
        try {
            manifest = readJson(manifestPath);
        } catch (err) {
            throw new Error(`Invalid JSON in ${manifestPath}: ${err.message}`);
        }

        rows.push({
            name: String(manifest.name || d),
            plugin_dir: pluginDir,
            manifest_path: manifestPath,
            manifest,
            managed: true,
        });
    }

    return rows;
}

function classify(rows, catalogIndex) {
    const out = [];

    for (const r of rows) {
        if (!r.managed) {
            out.push(r);
            continue;
        }

        const c = catalogIndex.get(r.name);
        if (!c) {
            out.push({
                ...r,
                source_path: '(not found in catalog)',
                state: 'DEPRECATED_UPSTREAM',
                delta: 'Plugin name not found in current CATALOG.json',
            });
            continue;
        }

        if (c.deprecated === true || c.lifecycle === 'deprecated') {
            out.push({
                ...r,
                source_path: c.path || '(unknown)',
                state: 'DEPRECATED_UPSTREAM',
                delta: 'Catalog marks plugin as deprecated',
            });
            continue;
        }

        const m = r.manifest;
        const deltas = [];

        if ((m.shape || '') !== (c.shape || '')) {
            deltas.push(`shape ${(m.shape || '(none)')}->${(c.shape || '(none)')}`);
        }
        if ((m.tier || '') !== (c.tier || '')) {
            deltas.push(`tier ${(m.tier || '(none)')}->${(c.tier || '(none)')}`);
        }
        if (Number(m.token_cost || 0) !== Number(c.token_cost || 0)) {
            deltas.push(`token_cost ${Number(m.token_cost || 0)}->${Number(c.token_cost || 0)}`);
        }
        if ((m.requires_edition || '') !== (c.requires_edition || '')) {
            deltas.push(`requires_edition ${(m.requires_edition || '(none)')}->${(c.requires_edition || '(none)')}`);
        }
        if (!arrayEqual(m.requires_plugins, c.requires_plugins)) {
            deltas.push('requires_plugins changed');
        }
        if (!arrayEqual(m.artifacts, c.artifacts)) {
            deltas.push('artifacts changed');
        }

        // Curated-subset mode: local artifact shape is intentionally smaller than upstream.
        // If the manifest snapshot matches upstream today, report as CURATED_SUBSET.
        const snapshot = m.upstream_snapshot || null;
        const isCuratedSubset = String(m.sync_mode || '').toLowerCase() === 'curated-subset';
        const explicitSnapshotPresent = Boolean(
            snapshot &&
            Number.isFinite(Number(snapshot.skills)) &&
            Number.isFinite(Number(snapshot.agents)) &&
            typeof snapshot.has_mcp === 'boolean'
        );

        if (isCuratedSubset && explicitSnapshotPresent) {
            out.push({
                ...r,
                source_path: c.path || '(unknown)',
                state: 'CURATED_SUBSET',
                delta: 'Curated subset mode with upstream snapshot metadata',
                catalog: c,
            });
            continue;
        }

        out.push({
            ...r,
            source_path: c.path || '(unknown)',
            state: deltas.length ? 'UPDATED_UPSTREAM' : 'IN_SYNC',
            delta: deltas.join('; '),
            catalog: c,
        });
    }

    return out;
}

function summarize(rows) {
    const summary = {};
    for (const r of rows) {
        summary[r.state] = (summary[r.state] || 0) + 1;
    }
    return summary;
}

function printTable(rows) {
    if (!rows.length) {
        console.log('No local plugins detected under .github/skills/local/.');
        return;
    }

    const data = rows.map((r) => ({
        name: r.name,
        state: r.state,
        source_path: r.source_path || '',
        delta: r.delta || '',
    }));

    const widths = {
        name: Math.max('name'.length, ...data.map((x) => x.name.length)),
        state: Math.max('state'.length, ...data.map((x) => x.state.length)),
        source_path: Math.max('source_path'.length, ...data.map((x) => x.source_path.length)),
        delta: Math.max('delta'.length, ...data.map((x) => x.delta.length)),
    };

    const pad = (s, n) => String(s).padEnd(n, ' ');
    console.log(`${pad('name', widths.name)}  ${pad('state', widths.state)}  ${pad('source_path', widths.source_path)}  delta`);
    console.log(`${'-'.repeat(widths.name)}  ${'-'.repeat(widths.state)}  ${'-'.repeat(widths.source_path)}  ${'-'.repeat(widths.delta)}`);
    for (const r of data.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name))) {
        console.log(`${pad(r.name, widths.name)}  ${pad(r.state, widths.state)}  ${pad(r.source_path, widths.source_path)}  ${r.delta}`);
    }
}

function main() {
    const catalogPayload = tryLoadCatalog();
    if (!catalogPayload) {
        const msg = 'Mall catalog not found. Provide --catalog=<path> or use --allow-gh.';
        if (jsonMode) {
            console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
            console.error(`ERROR: ${msg}`);
        }
        process.exit(2);
    }

    const catalog = catalogPayload.catalog;
    if (!catalog || !Array.isArray(catalog.plugins)) {
        const msg = `Invalid catalog schema at ${catalogPayload.source}`;
        if (jsonMode) {
            console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
            console.error(`ERROR: ${msg}`);
        }
        process.exit(2);
    }

    const catalogIndex = new Map(catalog.plugins.map((p) => [String(p.name || ''), p]));
    const localSkillsDir = path.join(process.cwd(), '.github', 'skills', 'local');

    let scanned;
    try {
        scanned = scanLocalPluginDirs(localSkillsDir);
    } catch (err) {
        if (jsonMode) {
            console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
        } else {
            console.error(`ERROR: ${err.message}`);
        }
        process.exit(2);
    }

    const rows = classify(scanned, catalogIndex);
    const summary = summarize(rows);
    const actionable = (summary.UPDATED_UPSTREAM || 0) + (summary.DEPRECATED_UPSTREAM || 0) + (summary.UNMANAGED_LOCAL_PLUGIN || 0);

    if (jsonMode) {
        console.log(JSON.stringify({
            ok: true,
            catalog_source: catalogPayload.source,
            local_root: localSkillsDir,
            summary,
            total: rows.length,
            actionable,
            rows: rows.map((r) => ({
                name: r.name,
                state: r.state,
                source_path: r.source_path || null,
                delta: r.delta || '',
                plugin_dir: r.plugin_dir,
                manifest_path: r.manifest_path || null,
            })),
        }, null, 2));
    } else if (!quiet) {
        console.log('audit-mall-drift');
        console.log(`  catalog: ${catalogPayload.source}`);
        console.log(`  local: ${localSkillsDir}`);
        console.log('');
        const states = ['IN_SYNC', 'CURATED_SUBSET', 'UPDATED_UPSTREAM', 'DEPRECATED_UPSTREAM', 'UNMANAGED_LOCAL_PLUGIN'];
        for (const s of states) {
            if (summary[s]) console.log(`  ${s}: ${summary[s]}`);
        }
        console.log(`  TOTAL: ${rows.length}`);
        console.log('');
        printTable(rows);
    }

    process.exit(actionable > 0 ? 1 : 0);
}

main();
