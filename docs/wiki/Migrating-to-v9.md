# Migrating to v9

Extension v9.0.0 (Edition v3.0.0) replaces the OneDrive-based AI-Memory with a git-based shared memory repo. This is a **breaking change** — the old cloud-drive discovery code is removed.

## What changed

| Before (v8.x / Edition v2.x) | After (v9.0 / Edition v3.0) |
| --- | --- |
| AI-Memory on OneDrive / iCloud / Dropbox | AI-Memory in `../Alex_ACT_Memory` git repo |
| `cognitive-config.json` → `ai_memory_root` | Removed — path is by convention |
| Bootstrap scans for cloud drives | Bootstrap clones from GitHub (or creates local) |
| `heirs/registry.json` for fleet tracking | Removed — fleet is a separate concern |
| Self-registration on every bootstrap | Removed — no registration needed |

## Do I need to do anything?

### If you never used AI-Memory features

Nothing. The new version works out of the box. On first session start, Alex creates a local memory scaffold automatically.

### If you had OneDrive AI-Memory with content you want to keep

One-time manual migration (takes 2 minutes):

1. **Find your old AI-Memory folder**
   - Check `cognitive-config.json` in any heir for the old `ai_memory_root` value
   - Common location: `C:\Users\<you>\OneDrive\AI-Memory\`

2. **Copy announcements** (optional — the new repo already has them)
   ```bash
   cp AI-Memory/announcements/alex-act/*.md ../Alex_ACT_Memory/announcements/
   ```

3. **Copy your profile**
   ```bash
   # Windows (PowerShell):
   $user = $env:USERNAME
   New-Item -ItemType Directory -Force "../Alex_ACT_Memory/profile/$user"
   Copy-Item "AI-Memory/user-profile.json" "../Alex_ACT_Memory/profile/$user/user-profile.json"
   Copy-Item "AI-Memory/profile.md" "../Alex_ACT_Memory/profile/$user/profile.md"
   ```

4. **Copy knowledge packages** (if you had any custom ones)
   ```bash
   cp -r AI-Memory/knowledge/* ../Alex_ACT_Memory/knowledge/
   ```

5. **Commit**
   ```bash
   cd ../Alex_ACT_Memory
   git add -A
   git commit -m "Migrate content from OneDrive AI-Memory"
   git push   # if you have a remote configured
   ```

6. **Archive your old OneDrive folder** — you can delete it after confirming everything works, or just leave it as read-only backup.

### What NOT to migrate

| Old content | Why |
| --- | --- |
| `heirs/registry.json` | No longer used; fleet tracking is separate |
| `project-registry.json` | Deprecated |
| `SCHEMA.md` | Replaced by the repo README |
| `global-knowledge.md` | Belongs in `/memories/` (per-workspace) |
| `learning-goals.md`, `notes.md` | Personal files; use your own notes |

## What if the clone fails?

Alex handles this gracefully:

| Situation | What happens |
| --- | --- |
| No network on first run | Creates local scaffold; works offline; syncs later |
| No SSH key configured | Same as above; logs a warning |
| Remote not configured | Local-only operation; no sync across machines |
| Git not installed | Falls back to local folder (no version history) |

You're never blocked from working. Shared memory is additive — without it, Alex just doesn't have cross-project context.

## Reverting to v8.x

If you need to go back:

1. Install Extension v8.x from the Marketplace (pin the version)
2. Your old OneDrive AI-Memory still works (it was never deleted automatically)
3. The `../Alex_ACT_Memory` repo stays on disk but v8.x ignores it

## FAQ

**Q: Do I lose my announcements?**
A: No. The new repo was seeded with all existing announcements during the migration.

**Q: Do I lose my profile/preferences?**
A: Only if you don't copy them over. See step 3 above.

**Q: Can I still use OneDrive for sync?**
A: The git repo *can* live inside a OneDrive-synced folder, but we don't recommend it (git + cloud sync = conflict risk). Use GitHub (private repo) for cross-machine sync instead.

**Q: What about the `/initialize` command?**
A: Removed. The bootstrap is automatic. If something is wrong, delete `../Alex_ACT_Memory` and restart — Alex will re-clone or re-scaffold.

---

*Last reviewed: 2026-05-27*
