#!/usr/bin/env node
/**
 * bootstrap-heir.cjs — initialize a new ACT-Edition heir.
 *
 * Run from a fresh clone of Alex_ACT_Edition. Targets an existing or new
 * directory, copies edition-owned files, and renders the .act-heir.json marker.
 *
 * Usage:
 *   node .github/scripts/bootstrap-heir.cjs \
 *       --target <path> \
 *       --heir-id <slug> \
 *       --heir-name "Display Name" \
 *       --repo-url https://github.com/owner/repo \
 *       --owner <github-handle> \
 *       [--apply]
 *
 * Without --apply, the script reports what it would do (dry-run by default).
 *
 * After bootstrap, the heir owns the directory. Subsequent upgrades happen
 * via `node .github/scripts/upgrade-self.cjs` from the heir's own repo root.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { upsertHeir, resolveAiMemoryRoot, discoverCloudDrives, initAiMemory } = require('./_registry.cjs');

const IDENTITY_TEMPLATE = `# Identity (heir-owned)

<!--
  This file is heir-owned. Edition upgrades never overwrite it.
  Use it to layer YOUR identity, project context, and preferences
  on top of the Edition's copilot-instructions.md.
-->

## Project Context

<!-- One-paragraph summary: what this repo does, who uses it, and why. -->

## Domain Vocabulary

<!-- Project-specific terms, abbreviations, or product names that
     would otherwise be ambiguous. -->

## My Preferences

<!-- Communication style, code-review priorities, naming conventions,
     test framework choices, etc. -->

## Constraints

<!-- Hard rules: "never use X", "always do Y first". -->
`;

// ── Project signal detection + ACT.md generation ───────────────────
function detectProjectSignals(dir) {
    const signals = { languages: [], domains: [], hasReadme: false, readmeSnippet: '' };
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];

    if (files.includes('package.json')) signals.languages.push('node');
    if (files.includes('requirements.txt') || files.includes('setup.py') || files.includes('pyproject.toml')) signals.languages.push('python');
    if (files.some(f => f.endsWith('.bicep'))) signals.languages.push('bicep');
    if (files.some(f => f.endsWith('.csproj') || f.endsWith('.sln'))) signals.languages.push('dotnet');
    if (files.includes('Cargo.toml')) signals.languages.push('rust');
    if (files.includes('go.mod')) signals.languages.push('go');

    if (files.includes('infra') || files.includes('infrastructure')) signals.domains.push('infrastructure');
    if (files.some(f => /health|medical|clinical/i.test(f))) signals.domains.push('healthcare');
    if (files.some(f => /data|analytics|notebook/i.test(f))) signals.domains.push('data');
    if (files.some(f => /docs|articles|thesis|research/i.test(f))) signals.domains.push('documentation');
    if (files.some(f => /website|src|app|pages/i.test(f))) signals.domains.push('web');
    if (files.includes('.github')) {
        const ghDir = path.join(dir, '.github');
        if (fs.existsSync(path.join(ghDir, 'workflows'))) signals.domains.push('ci-cd');
    }

    if (files.includes('README.md')) {
        signals.hasReadme = true;
        try {
            signals.readmeSnippet = fs.readFileSync(path.join(dir, 'README.md'), 'utf8').slice(0, 300);
        } catch { }
    }

    return signals;
}

function generateActMd(heirId, heirName, version, signals) {
    const pluginSuggestions = [];

    if (signals.domains.includes('healthcare')) {
        pluginSuggestions.push({ name: 'healthcare-informatics', cat: 'domain-expertise', why: 'Clinical data patterns and health knowledge structure' });
        pluginSuggestions.push({ name: 'pii-privacy-regulations', cat: 'security-privacy', why: 'Health data sensitivity rules' });
    }
    if (signals.domains.includes('data')) {
        pluginSuggestions.push({ name: 'data-analysis', cat: 'data-analytics', why: 'Data exploration and analysis patterns' });
        pluginSuggestions.push({ name: 'data-visualization', cat: 'data-analytics', why: 'Chart and dashboard design' });
    }
    if (signals.domains.includes('documentation')) {
        pluginSuggestions.push({ name: 'doc-hygiene', cat: 'documentation', why: 'Prevent documentation drift and broken links' });
        pluginSuggestions.push({ name: 'literature-review', cat: 'academic-research', why: 'Systematic review methodology' });
    }
    if (signals.domains.includes('web')) {
        pluginSuggestions.push({ name: 'service-worker-offline-first', cat: 'platform-tooling', why: 'PWA and offline patterns' });
    }
    if (signals.domains.includes('infrastructure')) {
        pluginSuggestions.push({ name: 'infrastructure-as-code', cat: 'cloud-infrastructure', why: 'IaC patterns and Bicep/ARM' });
    }
    if (signals.languages.includes('python')) {
        pluginSuggestions.push({ name: 'data-analysis', cat: 'data-analytics', why: 'Python data analysis patterns' });
    }
    if (signals.domains.includes('ci-cd')) {
        pluginSuggestions.push({ name: 'git-workflow', cat: 'devops-process', why: 'Git branching and release patterns' });
    }

    // Deduplicate by name
    const seen = new Set();
    const unique = pluginSuggestions.filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });

    // Fallback if no signals detected
    if (unique.length === 0) {
        unique.push({ name: 'doc-hygiene', cat: 'documentation', why: 'Prevent documentation drift' });
        unique.push({ name: 'code-review', cat: 'code-quality', why: 'Structured code review patterns' });
    }

    let md = `# ACT Recommendations for ${heirName}\n\n`;
    md += `## Your Brain\n\n`;
    md += `Edition v${version} is installed with the v1 brain (35 instructions, 18 skills, 23 prompts, 4 worker agents).\n\n`;
    md += `## First Steps\n\n`;
    md += `1. **Fill in your identity**: Edit \`.github/copilot-instructions.local.md\` with your project context, domain vocabulary, preferences, and constraints. This is heir-owned and survives Edition upgrades.\n`;
    md += `2. **Browse the Plugin Mall**: Run \`/mall search <keyword>\` to find plugins relevant to your project.\n`;
    md += `3. **Install a plugin**: Run \`/mall install <name>\` to add capabilities from the Mall.\n\n`;
    md += `## Recommended Plugins\n\n`;
    md += `Based on your project structure:\n\n`;
    md += `| Plugin | Category | Why |\n`;
    md += `| --- | --- | --- |\n`;
    for (const p of unique) {
        md += `| \`${p.name}\` | ${p.cat} | ${p.why} |\n`;
    }
    md += `\n`;
    md += `## Commands to Try\n\n`;
    md += `\`\`\`text\n`;
    md += `/mall search ${signals.domains[0] || 'quality'}\n`;
    md += `/convert to word\n`;
    md += `/meditate\n`;
    md += `\`\`\`\n\n`;
    md += `## Upgrade\n\n`;
    md += `To pull future Edition releases:\n\n`;
    md += `\`\`\`bash\nnode .github/scripts/upgrade-self.cjs --apply\n\`\`\`\n`;

    return md;
}


function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}
const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

// Script lives at <edition-root>/.github/scripts/bootstrap-heir.cjs
const EDITION_ROOT = path.resolve(__dirname, '..', '..');
const TARGET = arg('--target', null);
const HEIR_ID = arg('--heir-id', null);
const HEIR_NAME = arg('--heir-name', null);
const REPO_URL = arg('--repo-url', null);
const OWNER = arg('--owner', null);

if (!TARGET || !HEIR_ID) {
    console.error('Required: --target <path> --heir-id <slug>');
    console.error('Recommended: --heir-name --repo-url --owner');
    process.exit(2);
}

if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(HEIR_ID) || HEIR_ID.length < 2) {
    console.error(`Invalid --heir-id "${HEIR_ID}". Must be lowercase alphanumeric + hyphens, 2-64 chars.`);
    process.exit(2);
}

const targetAbs = path.resolve(TARGET);
const policyPath = path.join(EDITION_ROOT, '.github', 'config', 'sync-policy.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const editionVersion = fs.readFileSync(path.join(EDITION_ROOT, '.github', 'VERSION'), 'utf8').trim();
const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

console.log(`ACT Heir Bootstrap`);
console.log(`Edition: ${EDITION_ROOT}`);
console.log(`Edition version: ${editionVersion}`);
console.log(`Target: ${targetAbs}`);
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log('');

if (fs.existsSync(targetAbs)) {
    const heirMarker = path.join(targetAbs, '.github', '.act-heir.json');
    if (fs.existsSync(heirMarker)) {
        console.error(`Refusing to bootstrap: target already has .github/.act-heir.json`);
        console.error(`Use .github/scripts/upgrade-self.cjs from inside the heir to update.`);
        process.exit(2);
    }
}

function expandGlob(pattern) {
    // Minimal glob: '**' = recurse, '*' = single segment wildcard.
    // Returns relative paths from EDITION_ROOT that exist and match.
    const literal = pattern.replace(/\\/g, '/');
    if (!literal.includes('*')) {
        return fs.existsSync(path.join(EDITION_ROOT, literal)) ? [literal] : [];
    }
    const parts = literal.split('/');
    const results = [];
    function walk(dir, idx) {
        if (idx >= parts.length) return;
        const seg = parts[idx];
        const full = path.join(EDITION_ROOT, dir);
        if (!fs.existsSync(full)) return;
        const entries = fs.readdirSync(full, { withFileTypes: true });
        if (seg === '**') {
            for (const e of entries) {
                const rel = path.posix.join(dir, e.name);
                if (e.isDirectory()) {
                    walk(rel, idx);
                    walk(rel, idx + 1);
                } else if (idx + 1 >= parts.length || parts[idx + 1] === e.name) {
                    results.push(rel);
                }
            }
        } else if (seg === '*' || seg.includes('*')) {
            const re = new RegExp('^' + seg.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            for (const e of entries) {
                if (!re.test(e.name)) continue;
                const rel = path.posix.join(dir, e.name);
                if (idx === parts.length - 1) {
                    if (e.isFile()) results.push(rel);
                } else if (e.isDirectory()) {
                    walk(rel, idx + 1);
                }
            }
        } else {
            for (const e of entries) {
                if (e.name !== seg) continue;
                const rel = path.posix.join(dir, e.name);
                if (idx === parts.length - 1) {
                    if (e.isFile()) results.push(rel);
                } else if (e.isDirectory()) {
                    walk(rel, idx + 1);
                }
            }
        }
    }
    walk('', 0);
    return results;
}

const filesToCopy = new Set();
for (const pattern of policy.edition_owned) {
    for (const rel of expandGlob(pattern)) {
        filesToCopy.add(rel);
    }
}

const sortedFiles = [...filesToCopy].sort();
console.log(`Edition files to install: ${sortedFiles.length}`);
const sample = sortedFiles.slice(0, 10);
sample.forEach((f) => console.log(`  ${f}`));
if (sortedFiles.length > sample.length) console.log(`  ... and ${sortedFiles.length - sample.length} more`);
console.log('');

const markerPath = path.join(targetAbs, '.github', '.act-heir.json');
const marker = {
    $schema: 'https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/fleet/schema/act-heir.schema.json',
    spec_version: '1.0',
    edition: 'Alex_ACT_Edition',
    edition_version: editionVersion,
    heir_id: HEIR_ID,
    heir_name: HEIR_NAME || HEIR_ID,
    repo_url: REPO_URL || '',
    deployed_at: now,
    last_sync_at: now,
    contact: {
        owner: OWNER || '',
        feedback_channel: 'issues',
    },
    opt_in: {
        fleet_inventory: true,
        announcements: true,
        telemetry: false,
    },
    notes: '',
};

console.log(`Marker to render: ${path.relative(targetAbs, markerPath)}`);
console.log(`  heir_id: ${marker.heir_id}`);
console.log(`  edition_version: ${marker.edition_version}`);
console.log(`  deployed_at: ${marker.deployed_at}`);
console.log('');

if (!APPLY) {
    console.log('DRY-RUN complete. Re-run with --apply to write.');
    process.exit(0);
}

fs.mkdirSync(targetAbs, { recursive: true });
let copied = 0;
for (const rel of sortedFiles) {
    const src = path.join(EDITION_ROOT, rel);
    const dst = path.join(targetAbs, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied += 1;
}

// Heir-owned templates: copy from Edition source on first bootstrap if missing.
// These files become heir-owned the moment they land — upgrade-self.cjs will
// never touch them again. Skip any glob (e.g. **/local/**) without source files.
let templatesRendered = 0;
for (const pattern of (policy.heir_owned || [])) {
    for (const rel of expandGlob(pattern)) {
        const src = path.join(EDITION_ROOT, rel);
        const dst = path.join(targetAbs, rel);
        if (!fs.existsSync(src)) continue;
        if (fs.existsSync(dst)) continue;
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        templatesRendered += 1;
    }
}

fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n');

// Render copilot-instructions.local.md template if it doesn't already exist.
// Heir-owned — only created on first bootstrap, never overwritten.
const identityPath = path.join(targetAbs, '.github', 'copilot-instructions.local.md');
let identityRendered = false;
if (!fs.existsSync(identityPath)) {
    fs.writeFileSync(identityPath, IDENTITY_TEMPLATE);
    identityRendered = true;
}

// Best-effort: register this heir in shared AI-Memory/heirs/registry.json.
let registryResult = upsertHeir(marker, targetAbs);

// AI-Memory setup: if no AI-Memory folder exists, discover cloud drives and
// create the folder structure. Honors --ai-memory <name> flag for explicit choice.
const aiMemFlag = (function () {
    const i = process.argv.indexOf('--ai-memory');
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();

if (registryResult.reason === 'no-ai-memory' || aiMemFlag) {
    const drives = discoverCloudDrives(targetAbs);

    // Determine which drive to use
    let chosenDrive = null;
    if (aiMemFlag) {
        // Explicit flag: match by name (case-insensitive partial match)
        chosenDrive = drives.find(d => d.name.toLowerCase().includes(aiMemFlag.toLowerCase()));
        if (!chosenDrive) {
            // Treat the flag value as a literal folder name (might not be in discovery)
            const flagDir = path.join(os.homedir(), aiMemFlag);
            if (fs.existsSync(flagDir)) {
                chosenDrive = { name: aiMemFlag, path: flagDir, provider: 'custom', hasAiMemory: false };
            } else {
                console.error(`--ai-memory "${aiMemFlag}" does not match any discovered drive or existing folder.`);
                console.log('Available drives:');
                drives.forEach((d, i) => console.log(`  ${i + 1}. ${d.name} (${d.provider})${d.hasAiMemory ? ' [AI-Memory exists]' : ''}`));
            }
        }
    } else if (drives.length > 0) {
        // Auto-select: prefer a drive that already has AI-Memory
        const withAiMem = drives.find(d => d.hasAiMemory);
        if (withAiMem) {
            chosenDrive = withAiMem;
        } else if (drives.length === 1) {
            chosenDrive = drives[0];
        } else {
            // Multiple drives, none has AI-Memory: list them and pick the first
            console.log('');
            console.log('Multiple cloud drives found:');
            drives.forEach((d, i) => console.log(`  ${i + 1}. ${d.name} (${d.provider})`));
            console.log(`Auto-selecting: ${drives[0].name}`);
            console.log('To override, re-run with: --ai-memory "<drive-name>"');
            chosenDrive = drives[0];
        }
    }

    if (chosenDrive && !chosenDrive.hasAiMemory) {
        console.log('');
        console.log(`Creating AI-Memory in: ${chosenDrive.name}/AI-Memory`);
        const result = initAiMemory(chosenDrive.name);
        if (result.ok) {
            console.log(`Created AI-Memory structure (${result.created.length} items) at: ${result.root}`);
        }
    } else if (chosenDrive && chosenDrive.hasAiMemory) {
        console.log(`AI-Memory already exists at: ${chosenDrive.name}/AI-Memory`);
    }

    // Persist the choice in cognitive-config.json
    if (chosenDrive) {
        const cogConfigPath = path.join(targetAbs, '.github', 'config', 'cognitive-config.json');
        if (fs.existsSync(cogConfigPath)) {
            try {
                const cfg = JSON.parse(fs.readFileSync(cogConfigPath, 'utf8'));
                cfg.ai_memory_root = chosenDrive.name;
                fs.writeFileSync(cogConfigPath, JSON.stringify(cfg, null, 4) + '\n');
                console.log(`Pinned ai_memory_root: "${chosenDrive.name}" in cognitive-config.json`);
            } catch { /* best-effort */ }
        }
        // Retry registry upsert now that AI-Memory is set up
        registryResult = upsertHeir(marker, targetAbs);
    }

    if (!chosenDrive && drives.length === 0) {
        console.log('');
        console.log('No cloud drive found (OneDrive, iCloud, Dropbox, Google Drive, Box, etc.).');
        console.log('To enable fleet communication:');
        console.log('  Option 1: Create ~/AI-Memory/ manually');
        console.log('  Option 2: node .github/scripts/_registry.cjs --init <folder-name>');
    }
}

// Generate ACT.md onboarding note with project-aware recommendations.
const actMdPath = path.join(targetAbs, 'ACT.md');
if (!fs.existsSync(actMdPath)) {
    const signals = detectProjectSignals(targetAbs);
    const actMd = generateActMd(HEIR_ID, HEIR_NAME || HEIR_ID, editionVersion, signals);
    fs.writeFileSync(actMdPath, actMd);
    console.log('Generated ACT.md with project-tailored recommendations.');
}

console.log(`Wrote ${copied} edition files + ${templatesRendered} heir-owned template${templatesRendered === 1 ? '' : 's'} + 1 marker${identityRendered ? ' + identity template' : ''} to ${targetAbs}`);
if (registryResult.ok) {
    console.log(`Registered in fleet: ${registryResult.path}`);
} else if (registryResult.reason === 'opted-out') {
    console.log('Skipped fleet registration (opt_in.fleet_inventory: false in marker)');
} else if (registryResult.reason === 'no-ai-memory') {
    console.log('Skipped fleet registration (no AI-Memory folder found in OneDrive/iCloud/Dropbox/~).');
} else {
    console.log(`Skipped fleet registration: ${registryResult.reason}`);
}
console.log('');
console.log('');
console.log('Next steps:');
console.log(`  cd ${targetAbs}`);
console.log('  git init && git add . && git commit -m "Bootstrap from Alex_ACT_Edition ' + editionVersion + '"');
console.log('  # then: node .github/scripts/upgrade-self.cjs to pull future Edition releases');
console.log('');
console.log('Feedback channel: drop markdown files in AI-Memory/feedback/alex-act/ on shared OneDrive.');
console.log('Announcements:    read AI-Memory/announcements/alex-act/ for fleet-wide updates.');
