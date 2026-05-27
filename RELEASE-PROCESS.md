# Release Process

How to cut a release of Alex — ACT Edition for the VS Code Marketplace.

## Prerequisites

- Node.js 18+
- `git` on PATH
- `npx vsce` available (`npm i -g @vscode/vsce`)
- Sibling clones: `../Alex_ACT_Edition`, `../Alex_ACT_Supervisor`

## Quick Release (happy path)

```pwsh
cd C:\Development\Alex_ACT_Extension

# 1. Run the release pipeline (builds brain, produces VSIX)
node release.cjs --bump minor

# 2. Update CHANGELOG.md with release notes

# 3. Commit, tag, push
git add brain/ package.json CHANGELOG.md
$m = Join-Path $env:TEMP "release.txt"
Set-Content -Path $m -Value "[behaviour] release v9.1.0: <summary>" -NoNewline
git commit -F $m
Remove-Item $m
git tag v9.1.0
git push origin main
git push origin v9.1.0

# 4. Publish to Marketplace
npx vsce publish --packagePath alex-act-edition-9.1.0.vsix
```

## The Release Script

`release.cjs` orchestrates all deterministic gates. It validates the full pipeline from brain-qa through VSIX packaging, stopping on first failure.

### Usage

```pwsh
node release.cjs                              # full release
node release.cjs --dry-run                    # validate only, no side effects
node release.cjs --dry-run --skip-vsix        # fast pre-check (skips vsce package)
node release.cjs --bump patch|minor|major     # auto-bump package.json version
node release.cjs --edition-tag v3.0.0         # explicit Edition tag (default: reads ../Alex_ACT_Edition/VERSION)
node release.cjs --skip-wiki                  # skip wiki publish step
```

### Gates

| # | Stage | Gate | Fatal? |
|---|---|---|---|
| 1 | 0 | Brain QA passes (Supervisor + Edition) | Yes |
| 2 | 1-2 | Edition tag exists and is fetchable | Yes |
| 3 | 1-2 | Edition VERSION matches tag | No |
| 4 | 1-2 | Edition manifest is current (no structural drift) | No |
| 5 | 3 | Version bump applied (if `--bump`) | Yes |
| 6 | 3 | Build brain bundle (manifest-driven copy + internal audit) | Yes |
| 7 | 3 | Standalone faithfulness audit (blob-SHA comparison) | Yes |
| 8 | 3 | brain/VERSION matches Edition VERSION | No |
| 9 | 3 | Walkthrough files exist at declared paths | No |
| 10 | 4 | `vsce package` produces VSIX | Yes |
| 11 | 5 | Wiki source structure (docs/wiki/ + _Sidebar.md) | No |
| 12 | 5 | Wiki publish (runs publish-wiki.ps1) | No |

Fatal gates stop the pipeline. Non-fatal gates report but continue.

## Version Model (Dual-Track)

Two independent semver lines:

| Line | File | Tracks | Current |
|---|---|---|---|
| **Edition** (brain) | `brain/VERSION` | Brain content changes | v3.0.0 |
| **Extension** (Marketplace) | `package.json` → `version` | Marketplace identity | v9.0.0 |

They diverge by design:

- **Edition refresh** (new brain content): bump Extension minor, brain/VERSION updates automatically
- **Surface-only patch** (build script, walkthrough, .vscodeignore): bump Extension patch, brain unchanged
- **Surface-only major** (removed command, breaking config): bump Extension major, brain unchanged

## Release Types

### Edition refresh (most common)

A new Edition release exists and Extension needs to bundle it.

```pwsh
node release.cjs --bump minor
# CHANGELOG: link Edition release notes, summarize highlights
```

### Surface-only patch

Build script fix, walkthrough tweak, dependency bump. No brain change.

```pwsh
node release.cjs --bump patch --skip-vsix  # validate first
node release.cjs --bump patch              # then build VSIX
```

### Wiki-only (no VSIX)

Documentation refresh that doesn't warrant a Marketplace version bump.

```pwsh
pwsh scripts/publish-wiki.ps1
# Optionally add a [clarification] CHANGELOG entry
```

## CHANGELOG Format

```markdown
## [9.1.0] - 2026-05-28

**Minor [behaviour] — Bundle Edition v3.0.0.** AI-Memory migration, new skills.

### Changed
- Brain refreshed to Edition v3.0.0
- Updated AI-Memory integration to git-based sibling clone
```

Severity tags: `[behaviour]` (runtime/install change), `[clarification]` (docs-only), `[typo]`.

## Commit Message Format

```
[severity] release vX.Y.Z: one-line summary

Optional body with details.
```

## What NOT To Do

| Anti-pattern | Why |
|---|---|
| Edit files under `brain/` directly | brain/ is build output. Edit Edition, rebuild. |
| `git add -A` | Stages unrelated working-tree state. Add explicitly. |
| Bump Extension version to match Edition version | Dual-track: they diverge by design. |
| Skip the faithfulness audit | Copy != faithful. CRLF and missing files hide there. |
| Publish without running `release.cjs` first | The script catches issues vsce won't. |

## Troubleshooting

| Problem | Fix |
|---|---|
| Gate 1 fails (brain-qa) | Fix flagged files in Supervisor/Edition, re-run |
| Gate 6 fails ("manifested file missing") | Edition tag is stale. Cut a new Edition release after running `build-edition-manifest.cjs`. |
| Gate 7 fails (blob SHA mismatch) | Delete `brain/`, re-run. If persists: check for hand-edits in brain/ or CRLF contamination. |
| Gate 10 fails (vsce package) | Usually `.vscodeignore` needs updating, or a referenced file is missing. |
| Wiki publish fails | Network issue or wiki repo permissions. Run `pwsh scripts/publish-wiki.ps1 -DryRun` to diagnose. |

## File Map

| File | Role |
|---|---|
| `release.cjs` | Release orchestrator (this process, automated) |
| `build-extension.cjs` | Manifest-driven brain assembly + internal audit |
| `scripts/audit-brain-faithfulness.cjs` | Standalone blob-SHA faithfulness check |
| `scripts/publish-wiki.ps1` | Wiki sync to GitHub Wiki repo |
| `brain/` | Build output (gitignored locally, committed at release) |
| `media/walkthrough/` | Welcome walkthrough (ships in VSIX) |
| `docs/wiki/` | GitHub Wiki source (published out-of-band) |
