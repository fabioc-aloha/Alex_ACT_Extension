/**
 * _registry.cjs — best-effort heir registry in shared AI-Memory.
 *
 * Resolves the user's AI-Memory root (OneDrive, iCloud, Dropbox, or ~/AI-Memory)
 * and upserts the heir's row in <root>/heirs/registry.json. Best-effort: never
 * throws on failure — the registry is optional fleet-tracking, not load-bearing.
 *
 * Used by bootstrap-heir.cjs and upgrade-self.cjs.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();

// Known cloud drive folder name patterns (order = priority for auto-selection).
// Discovery also scans for any OneDrive* folder not in this list.
const KNOWN_CLOUD_PATTERNS = [
    // OneDrive variants (personal, family, business) -- "OneDrive" or "OneDrive - *"
    { pattern: /^OneDrive/i, provider: 'OneDrive' },
    // iCloud variants (macOS, Windows)
    { pattern: /^iCloud/i, provider: 'iCloud' },
    // Dropbox
    { pattern: /^Dropbox/i, provider: 'Dropbox' },
    // Google Drive (Drive for desktop)
    { pattern: /^Google Drive/i, provider: 'Google Drive' },
    { pattern: /^My Drive/i, provider: 'Google Drive' },
    // Box
    { pattern: /^Box( Sync)?$/i, provider: 'Box' },
    // MEGA
    { pattern: /^MEGA/i, provider: 'MEGA' },
    // pCloud
    { pattern: /^pCloud/i, provider: 'pCloud' },
    // Nextcloud
    { pattern: /^Nextcloud/i, provider: 'Nextcloud' },
];

/**
 * Resolve AI-Memory root, honoring cognitive-config.json overrides.
 * @param {string} [heirRoot] - heir repo root to find cognitive-config.json
 */
function resolveAiMemoryRoot(heirRoot) {
    // 1. Check cognitive-config.json override
    if (heirRoot) {
        const configPath = path.join(heirRoot, '.github', 'config', 'cognitive-config.json');
        if (fs.existsSync(configPath)) {
            try {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (cfg.ai_memory_root) {
                    const pinned = path.join(HOME, cfg.ai_memory_root, 'AI-Memory');
                    if (fs.existsSync(pinned) && fs.statSync(pinned).isDirectory()) {
                        return pinned;
                    }
                }
            } catch { /* fall through to candidate scan */ }
        }
    }

    // 2. Candidate scan: discover all cloud drives, return first with AI-Memory
    const drives = discoverCloudDrives(heirRoot);
    for (const d of drives) {
        if (d.hasAiMemory) return path.join(d.path, 'AI-Memory');
    }

    // 3. Local fallback
    const local = path.join(HOME, 'AI-Memory');
    if (fs.existsSync(local) && fs.statSync(local).isDirectory()) {
        return local;
    }

    return null;
}

/**
 * Upsert a heir row. Returns { ok: true, path } or { ok: false, reason }.
 * Honors marker.opt_in.fleet_inventory (default true). Never throws.
 */
function upsertHeir(marker, repoPath) {
    try {
        if (marker && marker.opt_in && marker.opt_in.fleet_inventory === false) {
            return { ok: false, reason: 'opted-out' };
        }
        const root = resolveAiMemoryRoot(repoPath);
        if (!root) {
            return { ok: false, reason: 'no-ai-memory' };
        }
        const heirsDir = path.join(root, 'heirs');
        const registryPath = path.join(heirsDir, 'registry.json');
        fs.mkdirSync(heirsDir, { recursive: true });

        let registry = { schema: '1.0', heirs: {} };
        if (fs.existsSync(registryPath)) {
            try {
                registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
                if (!registry.heirs) registry.heirs = {};
            } catch {
                // corrupt — start fresh, don't lose write
                registry = { schema: '1.0', heirs: {} };
            }
        }

        const heirId = marker.heir_id;
        if (!heirId) return { ok: false, reason: 'no-heir-id' };

        registry.heirs[heirId] = {
            heir_id: heirId,
            heir_name: marker.heir_name || heirId,
            edition: marker.edition || 'Alex_ACT_Edition',
            edition_version: marker.edition_version || '0.0.0',
            repo_url: marker.repo_url || '',
            repo_path: repoPath || '',
            deployed_at: marker.deployed_at || new Date().toISOString(),
            last_sync_at: marker.last_sync_at || new Date().toISOString(),
            owner: (marker.contact && marker.contact.owner) || '',
        };
        registry.last_updated = new Date().toISOString();

        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
        return { ok: true, path: registryPath };
    } catch (e) {
        return { ok: false, reason: `error: ${e.message}` };
    }
}

/**
 * Discover cloud drive folders on this machine by scanning HOME directory.
 * Returns an array of { name, path, provider, hasAiMemory } sorted by provider priority.
 * Honors ai_memory_exclude from cognitive-config.json.
 * @param {string} [heirRoot] - heir repo root for reading cognitive-config.json
 */
function discoverCloudDrives(heirRoot) {
    // Read exclusion list from cognitive-config
    let excludeSet = new Set();
    if (heirRoot) {
        const configPath = path.join(heirRoot, '.github', 'config', 'cognitive-config.json');
        if (fs.existsSync(configPath)) {
            try {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (Array.isArray(cfg.ai_memory_exclude)) {
                    excludeSet = new Set(cfg.ai_memory_exclude.map(s => s.toLowerCase()));
                }
            } catch { /* ignore */ }
        }
    }

    const drives = [];
    let entries;
    try {
        entries = fs.readdirSync(HOME, { withFileTypes: true });
    } catch {
        return drives;
    }

    for (const entry of entries) {
        // Use statSync to resolve reparse points (OneDrive folders on Windows
        // are often ReparsePoints that readdirSync.isDirectory() misses)
        let isDir = false;
        try {
            isDir = entry.isDirectory() || fs.statSync(path.join(HOME, entry.name)).isDirectory();
        } catch { continue; }
        if (!isDir) continue;
        if (excludeSet.has(entry.name.toLowerCase())) continue;

        // Match against known patterns
        let provider = null;
        for (const kp of KNOWN_CLOUD_PATTERNS) {
            if (kp.pattern.test(entry.name)) {
                provider = kp.provider;
                break;
            }
        }
        if (!provider) continue;

        const driveDir = path.join(HOME, entry.name);
        const aiMemDir = path.join(driveDir, 'AI-Memory');
        drives.push({
            name: entry.name,
            path: driveDir,
            provider,
            hasAiMemory: fs.existsSync(aiMemDir) && fs.statSync(aiMemDir).isDirectory(),
        });
    }

    // Sort: drives with AI-Memory first, then by provider priority
    const providerOrder = ['OneDrive', 'iCloud', 'Dropbox', 'Google Drive', 'Box', 'MEGA', 'pCloud', 'Nextcloud'];
    drives.sort((a, b) => {
        if (a.hasAiMemory !== b.hasAiMemory) return a.hasAiMemory ? -1 : 1;
        return providerOrder.indexOf(a.provider) - providerOrder.indexOf(b.provider);
    });

    // macOS: check ~/Library/Mobile Documents/com~apple~CloudDocs (real iCloud path)
    // if no iCloud* folder was found in HOME
    if (!drives.some(d => d.provider === 'iCloud')) {
        const macICloud = path.join(HOME, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
        try {
            if (fs.existsSync(macICloud) && fs.statSync(macICloud).isDirectory()) {
                const aiMemDir = path.join(macICloud, 'AI-Memory');
                drives.push({
                    name: 'Library/Mobile Documents/com~apple~CloudDocs',
                    path: macICloud,
                    provider: 'iCloud',
                    hasAiMemory: fs.existsSync(aiMemDir) && fs.statSync(aiMemDir).isDirectory(),
                });
            }
        } catch { /* not macOS or no iCloud */ }
    }

    return drives;
}

/**
 * Create the AI-Memory folder structure in the given cloud drive.
 * @param {string} driveName - cloud drive folder name (e.g. 'OneDrive - Correa Family') or full path
 * @returns {{ ok: boolean, root: string, created: string[] }}
 */
function initAiMemory(driveName) {
    const root = driveName.includes(path.sep)
        ? path.join(driveName, 'AI-Memory')
        : path.join(HOME, driveName, 'AI-Memory');
    const dirs = [
        '',
        'feedback',
        path.join('feedback', 'alex-act'),
        'announcements',
        path.join('announcements', 'alex-act'),
        'heirs',
        'knowledge',
        'insights',
    ];
    const created = [];
    for (const d of dirs) {
        const full = path.join(root, d);
        if (!fs.existsSync(full)) {
            fs.mkdirSync(full, { recursive: true });
            created.push(d || 'AI-Memory/');
        }
    }
    // Create README files in key directories (only if missing)
    const readmes = {
        'README.md': '# AI-Memory\n\nShared fleet communication channel for ACT-Edition heirs.\n\n- `feedback/alex-act/` -- heirs write friction reports here\n- `announcements/alex-act/` -- Supervisor writes fleet-wide notes here\n- `heirs/` -- registry.json tracks deployed heirs\n- `knowledge/` -- shared knowledge base\n',
        [path.join('feedback', 'README.md')]: '# Feedback\n\nHeirs drop one markdown file per feedback item in `alex-act/`.\nThe Supervisor triages, ships fixes, and deletes processed files.\n',
        [path.join('feedback', 'alex-act', 'README.md')]: '# ACT Heir Feedback Inbox\n\nDrop feedback here. One markdown file per item.\nSupervisor triages and deletes after processing.\n',
        [path.join('announcements', 'alex-act', 'README.md')]: '# ACT Fleet Announcements\n\nRelease notes, breaking changes, and fleet-wide guidance.\nHeirs read on session start.\n',
    };
    for (const [rel, content] of Object.entries(readmes)) {
        const full = path.join(root, rel);
        if (!fs.existsSync(full)) {
            fs.writeFileSync(full, content);
            created.push(rel);
        }
    }
    return { ok: true, root, created };
}

module.exports = { resolveAiMemoryRoot, upsertHeir, discoverCloudDrives, initAiMemory };

// ── CLI mode ───────────────────────────────────────────────────────
// node _registry.cjs --discover          List cloud drives
// node _registry.cjs --init <name>       Create AI-Memory in named drive
// node _registry.cjs --resolve [dir]     Resolve AI-Memory root
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--discover')) {
        const drives = discoverCloudDrives();
        if (drives.length === 0) {
            console.log('No cloud drives found.');
        } else {
            console.log('Cloud drives found:\n');
            drives.forEach((d, i) => {
                const tag = d.hasAiMemory ? ' [AI-Memory exists]' : '';
                console.log(`  ${i + 1}. ${d.name} (${d.provider})${tag}`);
            });
        }
        console.log(`\n  Local fallback: ~/AI-Memory ${fs.existsSync(path.join(HOME, 'AI-Memory')) ? '[exists]' : '[not created]'}`);
    } else if (args.includes('--init')) {
        const idx = args.indexOf('--init');
        const name = args[idx + 1];
        if (!name) { console.error('Usage: --init <drive-name>'); process.exit(1); }
        const result = initAiMemory(name);
        if (result.ok) {
            console.log(`Created AI-Memory at: ${result.root}`);
            console.log(`Items: ${result.created.join(', ')}`);
        } else {
            console.error('Failed to create AI-Memory');
            process.exit(1);
        }
    } else if (args.includes('--resolve')) {
        const idx = args.indexOf('--resolve');
        const dir = args[idx + 1] || process.cwd();
        const root = resolveAiMemoryRoot(dir);
        console.log(root || '(not found)');
    } else {
        console.log('Usage:');
        console.log('  node _registry.cjs --discover          List cloud drives');
        console.log('  node _registry.cjs --init <name>       Create AI-Memory in named drive');
        console.log('  node _registry.cjs --resolve [dir]     Resolve AI-Memory root');
    }
}
