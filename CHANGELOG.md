<!-- markdownlint-configure-file {"MD024": {"siblings_only": true}} -->

# Changelog

All notable changes to Alex — ACT Edition.

## [Unreleased]

## [9.5.3] - 2026-06-20

**Patch [behaviour] — only offer Upgrade Brain when the available Edition is strictly newer.**

Before v9.5.3, every "upgrade available" signal in `extension.js` (status-bar arrow, status-bar QuickPick `Upgrade Brain` pick, `cmdStatus` info message) compared bundled/cached Edition version to the heir marker with `!==`. Any drift triggered the upgrade affordance — including the downgrade direction. A user who pinned an older Extension build, or whose `globalState` cached-tag briefly lagged the workspace marker, saw a phantom "↑" and an Upgrade pick that would have replaced their newer brain with an older one. `_cmdUpgradeBody` itself only short-circuited on exact equality, so invoking `alex-act.upgrade` against an older bundled brain would have proceeded.

### Fixed

- New `isNewerSemver(candidate, current)` helper in `extension.js` parses `MAJOR.MINOR.PATCH` (tolerates leading `v`, ignores pre-release suffixes) and returns `true` only when `candidate` is strictly greater. Invalid/unparseable inputs return `false` — fail closed.
- Four upgrade-signal sites now gate on `isNewerSemver` instead of `!==`:
  - `cmdStatusBarMenu` — `Upgrade Brain` QuickPick item + status-line description
  - `cmdStatus` — `(vX available)` tooltip line + `Upgrade Now` prompt
  - Status-bar item — `$(arrow-up)` indicator + tooltip
  - `_cmdUpgradeBody` — refuses to proceed with an explanatory message when bundled brain is not strictly newer (downgrade guard)

### Heir impact

Heirs see no change when a real upgrade is available. The phantom-upgrade case (rare: requires Extension/cache drift opposite to the usual direction) no longer surfaces a misleading affordance, and the underlying `alex-act.upgrade` command refuses to downgrade if invoked directly.

### Falsifier

Re-evaluate 2026-09-20 (90 days). If a user reports the status bar fails to show the arrow when a legitimate newer Edition tag is cached, the semver parse likely rejected the tag shape — investigate `isNewerSemver` against the failing version string.



**Patch [behaviour] — restore Upgrade Brain item in status-bar QuickPick under static-fetch mode.**

User-reported: clicking the `$(brain) ACT vX.Y.Z ↑` status-bar item opened the action menu but the **Upgrade Brain** pick was missing. The status-bar text correctly read the cached latest Edition tag from `globalState` (populated by the activation-time version check) and showed the up-arrow indicator, but `cmdStatusBarMenu` in `extension.js` read `BRAIN_DIR/VERSION` only. Post-ADR-009 (v9.4.0+) the Extension ships no bundled `brain/` directory, so the read threw, `bundledVersion` stayed empty, `upgradeAvailable` evaluated false, and the QuickPick suppressed the Upgrade item. Status bar and QuickPick were reading different sources of truth for the same signal.

### Fixed

- `cmdStatusBarMenu` now mirrors the status-bar item's static-fetch fallback: when `BRAIN_DIR/VERSION` is absent (the normal case post-v9.4.0), reads the cached latest Edition tag from `globalState` via `getCachedLatestEditionTag(_extensionContext)` and uses that as the available version. The Upgrade Brain pick now appears whenever the status bar shows the up-arrow.

### Heir impact

Heirs running v9.4.0 through v9.5.1 saw the bug; v9.5.2 restores parity. No behavior change to actual install logic — only the discoverability of the existing `alex-act.upgrade` command. Heirs without an upgrade available see no change.

### Falsifier

Re-evaluate 2026-09-12 (90 days). If a user reports the status bar shows the arrow but QuickPick still suppresses Upgrade Brain, the cached-tag fallback didn't fire — investigate the `globalState` key + activation-time version-check path.

## [9.5.1] - 2026-06-10

**Patch [behaviour] — close HEIR_OWNED leak during static-fetch install.**

Before v9.5.1, the brain-subtree copy in `lib/edition-install.js installFromTarball` walked every file under each declared subtree verbatim. When Edition's own `.github/` gained curator-only files matching HEIR_OWNED globs (e.g. `.github/workflows/*.yml`, `.github/dependabot.yml`), those files leaked into every heir on the next Bootstrap or Upgrade. The Extension's recovery pattern (`collectHeirOwnedSnapshot` in `extension.js cmdUpgrade`) only restored HEIR_OWNED files that existed in the heir's snapshot pre-upgrade — a heir with no prior `.github/workflows/` had nothing to restore, so Edition's curator workflows persisted in the heir's tree.

### Fixed

- `lib/edition-install.js` now loads `HEIR_OWNED` from the fetched tarball's `.github/scripts/_registry.cjs` (best-effort) and filters the brain-subtree copy source-side. Files matching any HEIR_OWNED glob are skipped during the copy; the heir's own files at those paths (recovered by `cmdUpgrade`'s backup-install-recover pattern) remain authoritative. Defense in depth alongside the existing recovery pass.
- Graceful degradation: Edition tags older than the registry export (or any registry that fails to load) fall back to verbatim copy, preserving pre-v9.5.1 behavior.
- New supported glob shapes: literal paths and `path/**` (matches every Edition HEIR_OWNED entry as of 2026-06-10). Other glob shapes (e.g. `*.yml`) are not matched and would need explicit handling.

### Added

- `_loadHeirOwnedGlobs(tarballRoot)` and `_matchesHeirOwnedGlob(rel, patterns)` helpers exported from `lib/edition-install.js` for tests + diagnostics.
- 9 new unit tests in `test/edition-install.test.js` covering: literal-path matching, `path/**` glob matching, unsupported-glob non-matching, missing-registry graceful fallback, malformed-registry graceful fallback, valid-registry happy path, end-to-end HEIR_OWNED file exclusion during install, pre-v9.5.1-compatible verbatim copy when registry absent, and local/ overlay protection. Full Extension suite: 98 tests pass (was 89).

### Heir impact

Heirs running v9.5.1+ on next `/upgrade` against Edition v3.4.1+ get a clean subtree (no curator workflows / dependabot.yml in their tree). Heirs running v9.5.0 or earlier still leak workflows from Edition until they update via Marketplace; the leaked files are heir-owned per Edition's `_registry.cjs`, so heirs can safely `rm` them after they update.

### Falsifier

The filter is decorative if 90 days pass (re-evaluate 2026-09-10) with zero heir-owned files in Edition tarballs (the only file Edition currently emits matching the filter is `.github/dependabot.yml` shipped this same day, and the workflows added the same day). If so, narrow scope or sunset.

## [9.5.0] - 2026-06-09

**Minor [behaviour] — Bootstrap and Upgrade now install `.vscode/` files declared by Edition.**

Closes a regression introduced with the static-fetch cutover (v9.4.0). The Edition manifest has been declaring `vscode_assets` (`.vscode/markdown-light.css`) and `bootstrap_templates` (`.vscode/extensions.json`, `.vscode/settings.json`, `.github/config/cognitive-config.json`) for some time, but `lib/edition-install.js` only honored `brain_subtrees`. The result on a fresh bootstrap or upgrade: heirs got `.github/` correctly but `.vscode/` was empty — no recommended extensions prompt, no Mermaid/markdown settings, no light-mode markdown stylesheet. Pre-v9.4.0 (bundled-brain era) the build script copied `.vscode/` into the VSIX; static-fetch dropped that path with nothing to replace it.

### What heirs see after upgrading

Run `ACT: Upgrade Brain` once on the upgraded Extension. The Extension now also installs:

- `.vscode/markdown-light.css` — Edition-owned, refreshed on every install (`vscode_assets` semantics)
- `.vscode/extensions.json` — first-install only; if you already edited it, your version is preserved
- `.vscode/settings.json` — first-install only; same heir-preservation rule
- `.github/config/cognitive-config.json` — present on every install (this file lives inside the `.github` subtree, so Edition's version always wins)

Existing heirs that bootstrapped on v9.4.0/9.4.1 and never got these files will get them on the next `ACT: Upgrade Brain`. Heirs that hand-created their own `.vscode/settings.json` keep it (first-install semantics protect heir edits).

### Added

- `[behaviour]` `lib/edition-install.js` now reads two additional manifest fields per the [ADR-009 amendment 2026-06-09](https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/docs/adrs/ADR-009-extension-github-fetch-brain.md#edition-contract):
  - `manifest.vscode_assets` — array of basenames under `.vscode/`. Refresh-always semantics: copied on every install and upgrade. Optional; absent or `[]` is a no-op for backward-compat with pre-2026-06-09 Edition releases.
  - `manifest.bootstrap_templates` — array of repo-relative paths. First-install-only semantics: copied only when the target file does not already exist in the heir. Heir edits are preserved on upgrade. Optional; absent or `[]` is a no-op.
- `[behaviour]` Validation for both new fields runs **before any destructive op**, symmetric to the existing `brain_subtrees` checks. Path-traversal (`..`), absolute paths, and (for `vscode_assets`) path separators are rejected. Files declared but absent from the tarball throw typed errors (`MANIFEST_INVALID_VSCODE_ASSET`, `MANIFEST_VSCODE_ASSET_MISSING`, `MANIFEST_INVALID_BOOTSTRAP_TEMPLATE`, `MANIFEST_BOOTSTRAP_TEMPLATE_MISSING`).
- `[behaviour]` `installFromTarball` return shape extended with `vscodeAssetsCopied`, `bootstrapTemplatesInstalled`, `bootstrapTemplatesSkipped` for diagnostic logging.

### Tests

- Added 12 unit tests covering: absent fields are a no-op, declared files install correctly, refresh-always vs first-install-only semantics, heir customizations preserved by `bootstrap_templates`, path-traversal rejected for both fields, missing files in tarball produce typed errors, and the edge case where `bootstrap_templates` entries inside a `brain_subtrees` path get overwritten by the subtree copy first. Total: 86/86 tests pass (was 74/74).

### Brain contract

- `min_extension_version` unchanged (still 9.4.0). Older Extensions continue to install Edition releases — they just won't copy `.vscode/` files. New Extensions get more.
- Manifest fields `vscode_assets` and `bootstrap_templates` remain **optional** in the contract. Legacy Edition releases without them work unchanged.

### Why this is a minor bump, not a patch

Heirs notice the change (new files appear in `.vscode/` after upgrade), and bootstrap/upgrade behavior changed. Per `version-management.instructions.md` "would a heir notice?" test, that's minor.

## [9.4.1] - 2026-06-02

**Patch [behaviour] — heir-marker `commit_sha` provenance fix: resolve via tag ref (immutable) before falling back to branch ref.**

### Fixed

- `[behaviour]` `lib/edition-fetch.js` `resolveCommitSha`: when GitHub Releases are created without `--target <sha>` (the platform default — `target_commitish` defaults to the branch name, typically `main`), the prior implementation resolved that branch to its current HEAD. The recorded SHA matched the released tag only by coincidence; the moment `main` moved past the latest tag, every Bootstrap and Upgrade would record the wrong commit. Fixed by trying `/git/ref/tags/<tag>` first (immutable; resolves annotated tags through the standard one-extra-deref). Falls back to the branch ref only when the tag lookup fails. Both paths remain non-fatal — `commit_sha` is diagnostic-only and Bootstrap never blocks on it.

### Changed

- `[clarification]` Renamed `_resolveCommitSha` to `resolveCommitSha` and exported it for direct unit testing. No behavioral change to existing consumers; `getLatestTag` is the only caller.

### Tests

- Added 3 unit tests covering the SHA-passthrough fast path, null-safety on empty/invalid inputs, and the bogus-40-char-non-hex rejection. Network-dependent paths (tag-ref + branch-ref) covered by integration tests against the live Edition repo.

### Why this matters

GitHub's REST API treats `target_commitish` as effectively read-only after a Release is published (HTTP 500 on `gh release edit --target <sha>` when the tag pre-exists). This means provenance pinning **cannot** be repaired via Release-object curation; it has to happen in the consumer (the Extension). Captured in `Alex_ACT_Supervisor/.github/skills/release-ritual/SKILL.md` Step 7.5.

## [9.4.0] - 2026-06-01

**Minor [constitutional] — Extension becomes a static tool; brain now fetched from GitHub at runtime per [ADR-009](https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/docs/adrs/ADR-009-extension-github-fetch-brain.md).**

The VSIX no longer ships a bundled `brain/` directory. On `Bootstrap This Workspace` or `Upgrade Brain`, the Extension downloads the latest tagged Alex_ACT_Edition release from GitHub, validates the manifest contract (spec 1.4 minimum), and installs the declared subtrees into the heir workspace. Edition releases now reach heirs immediately on tag-push — no more 24-hour Marketplace cycle for brain content.

**End-user behavior is unchanged**: same command names, same workflow, same brain. The migration is silent on first upgrade; users learn the difference only if a fetch fails (in which case the new error UX names the failure and points at `ACT: Diagnose Fetch`).

### Network requirement

Bootstrap and Upgrade need to reach `api.github.com` and `codeload.github.com`. If you're behind a corporate proxy, ask your network admin to allowlist those two hosts. Offline / air-gapped installs are not supported (explicit accepted cost per ADR-009).

### Added

- **`ACT: Diagnose Fetch` command**: writes a one-shot diagnostic report (extension version, mode, GitHub auth mode, ETag cache contents, heir marker fields) to a dedicated OutputChannel. Run this when reporting Bootstrap or Upgrade issues; paste the output into the bug report.
- **Activation-time version check**: when a heir workspace is open, the Extension silently checks for a newer Edition release on startup and surfaces an information message ("Edition vNEW is available …") with **Upgrade now** / **Later** buttons. Inhibited to once per 24h per `(current, latest)` version pair. Uses ETag-conditional requests, so the typical cost is zero rate-limit budget after the first call.
- **Opportunistic GitHub auth**: if you're already signed in to GitHub in VS Code, the Extension uses your session token for fetches, lifting the anonymous 60 req/hr ceiling to authenticated 5,000 req/hr. Never prompts.
- **New marker fields in `.act-heir.json`**: `source` (`github-fetch` vs `bundled` legacy), `commit_sha` (resolved from the fetched release), `fetched_at` (ISO timestamp), `auth_mode`, `extension_version`, `marker_schema_version` (set to `2` when v2 fields are written). Surfaced via `Diagnose Fetch`. The pre-existing `spec_version` field is retained at `1.0` (document format owned by the Extension); `marker_schema_version` is the contract version owned by Edition's `extension-contract.json`.

### Changed

- **VSIX size**: ~brain payload removed. Faster install, faster updates.
- **Extension version reflects host-code changes only** (true dual-track decoupling per ADR-009 Adoption decision). Edition's iteration cadence is now independent of Marketplace review.
- **`build-extension.cjs`**: `.vscodeignore` now excludes `brain/**`; the brain faithfulness audit step is replaced with an info-log explaining it's moot under the static-fetch model.

### Compatibility

- **Heirs on existing v9.3.0 bundled installs**: upgrade to v9.4.0, then run `ACT: Upgrade Brain` once. The upgrade fetches from GitHub instead of from the bundled `brain/` — semantics are identical from the heir's perspective.
- **Minimum Edition version**: 3.2.0 (the first Edition release with manifest spec 1.4 + the static-fetch contract fields). Older Edition releases are rejected with a clear error pointing to the next release.

### Failure modes (each gets a typed user-facing message)

- Network unreachable / corporate proxy blocking github.com → message names the required allowlist hosts.
- GitHub rate-limited → message tells you signing in raises the limit; will retry automatically after the rate-limit reset.
- Edition release tarball missing or unpublished → message tells you to check `Diagnose Fetch` output and retry.
- Edition release missing contract fields (legacy pre-v3.2.0) → message tells you to wait for the next Edition release.
- Extension too old for the Edition's `min_extension_version` → message tells you to update the Extension via VS Code first.
- Two VS Code windows on the same heir racing on upgrade → second window sees a per-heir lockfile and surfaces a clear "already in progress" message. No torn brain.

All failure paths run **before** any destructive op, so a failed Bootstrap or Upgrade leaves your existing brain unchanged.

## [9.3.0] - 2026-05-29

**Minor [behaviour] — Edition refresh v3.0.1 → v3.1.0 (Phase 5a Plugin Mall catalog prompts + shared-core audit fixes).**

Pairs with Edition v3.1.0. Bundles the brain refresh shipped in Edition `3cc2977` earlier today. Two distinct workstreams in one Edition tag:

1. **Plugin Mall v3 catalog integration (Phase 5a)** — `/mall-search` rewritten + `/mall-show` new; both read the trust-scored Mall catalog (`catalog/index.json` + `catalog/stores/*.json`) per ADR-008. Heirs see Mall-curated entries first with full trust-signal breakdown.
2. **Shared-core audit fixes** — five findings from this morning's brain-auditor dispatch against Edition closed by Edition v3.1.0 and now bundled here: `worldview-integration` → `worldview` (F1 high severity, broken xref in always-on `system-prompt-skepticism.instructions.md`); `/reframe` → `/problem-framing-audit` (F2 mirror gap); brain-auditor + brain-audit Phase 7b stale-architecture row + Mall sibling-repo handling (F4); critical-thinking 3-leg → 2-leg triad (F5, awareness skill body never shipped); converter Related-skill cleanup in docx-to-md + md-to-word (F3, 6 dead refs).

### Changed

- **Brain refresh**: bundled Edition pinned from `v3.0.1` → `v3.1.0`. Manifest-driven copy + faithfulness audit clean (148 declared, 147 byte-identical, 1 HEIR_OWNED skipped). Heirs on Edition `v3.0.1` upgrading via `/upgrade` receive the new prompts + shared-core fixes.

### Heir-visible behaviour delta

- A heir running `/mall-search code-review` after `/upgrade` sees Mall-curated entries at the top with trust scores (vs legacy CATALOG.json keyword match).
- New `/mall-show <name>` command surfaces full signal breakdown — heirs can audit *why* a plugin scored what it scored before installing.
- Always-on `system-prompt-skepticism` no longer references nonexistent `worldview-integration.instructions.md`.
- `critical-thinking` documentation no longer describes a 3-leg triad with an `awareness` leg that doesn't ship.

### Release context

Triggered by the extension-auditor severity calibration shipped in Supervisor `12638de` today. Calibration says: 2+ unbundled commits including a previously-rated HIGH severity audit fix (F1) → staleness severity HIGH → recommend release this week. Cut today against Edition v3.1.0 (released ~30 min earlier).

## [9.2.0] - 2026-05-29

**Minor [behaviour] — Edition refresh v3.0.0 → v3.0.1, plus protected-repo migration guard.**

Pairs with Edition v3.0.1. Bundles the refreshed brain (additive: new `.act-protected.json` contract at Edition root, new `doc-hygiene` routing instruction, `anti-hallucination` skill mirrored from brain-auditor, terminology rename "AI-Memory" → "shared memory bus" across 9 heir-facing instructions / prompts). Also closes a defect where `migration.js` offered AlexMaster migration on protected constellation repos.

### Changed

- **Brain refresh**: bundled Edition pinned from `v3.0.0` → `v3.0.1`. Manifest-driven copy + faithfulness audit clean (147 declared, 146 byte-identical, 1 HEIR_OWNED skipped). Heirs on Edition `v3.0.0` upgrading via `/upgrade` receive the new contract + instruction + skill + terminology rename.
- **`migration.js` — protected-repo guard.** `checkActivationTrigger` now short-circuits when `.act-protected.json` exists at the workspace root, so the AlexMaster-detection modal never fires in constellation repos (Supervisor / Edition / Mall / Extension / Memory). `migrateFromAlexMaster` adds the same check as defense-in-depth for palette / keybinding invocation, with a user-visible warning naming the protected repo. Closes a defect where Edition matched AlexMaster strong-signal heuristics (legacy `.github/skills/` layout, chronicles) and was offered as a migration target.

### Heir-visible behaviour delta

- Constellation repos no longer surface the "This workspace looks like an AlexMaster install" modal on startup.
- `alex-act.migrate-from-alex-master` palette command refuses to run in constellation repos with a clear modal.
- Heirs on Edition `v3.0.0` receive Edition `v3.0.1` artifacts on next `/upgrade`.

## [9.1.1] - 2026-05-29

**Patch [behaviour] — protected-repo marker + backup-parity upgrade.**

Closes ADR-XXX-extension-upgrade-strategy (deferred from v9.0.0). Two additive features; brain v3.0.0 stays pinned (no Edition refresh).

### Added

- **`.act-protected.json` constellation marker.** Constellation source repos (Supervisor / Edition / Mall / Extension / Memory) ship this marker so the Extension can refuse Bootstrap on curator-managed repos. Schema: `{ spec_version, kind, name, role, bootstrap_allowed: false, note }`. The Extension reads it via new helpers `getProtectedMarkerPath` and `readProtectedMarker`. Schema doc lives in the constellation repos.
- **Status-bar four-state model.** Status-bar item now adapts to: (1) protected constellation repo — `$(lock) ACT — <Name>` with curator-managed tooltip; (2) workspace not initialized — `ACT — Bootstrap` discovery CTA; (3) heir current — `$(brain) ACT v<edition>`; (4) heir upgrade-ready — `$(brain) ACT v<edition> $(arrow-up)`. Single status-bar item, single click target (`alex-act.statusBarMenu`), four states.
- **Status-bar menu “About This Repo” action** on protected repos. Surfaces the marker's `name` / `kind` / `role` / `note` in a modal so the user knows what curator-managed repo they're in.

### Changed

- **`cmdBootstrap` refuses on protected repos.** Reads `.act-protected.json` before any work; if present and `bootstrap_allowed !== true`, surfaces a modal warning and exits. Strict default: missing-field is treated as protected (opt-in via explicit `bootstrap_allowed: true`).
- **`cmdUpgrade` rewritten for backup-parity with `upgrade-self.cjs`.** Prior behaviour overwrote edition-owned files in place. New flow mirrors the canonical heir upgrade script:
  1. Load EDITION_OWNED / HEIR_OWNED policy from bundled brain `scripts/_registry.cjs` (refuse to proceed if missing)
  2. Snapshot every heir-owned file (`.github/` + `.vscode/`) to a temp hold dir
  3. Collect relocations: heir-added artefacts in edition-owned paths get queued for move into matching `local/` namespace
  4. Detect collisions: if a relocation target already exists in the heir snapshot, route the relocated copy to a `-collision-<timestamp>` sibling so neither side is lost
  5. Rename `.github/` to `.github-backup-YYYYMMDD-HHMMSS/` (timestamped, never overwrites)
  6. Install fresh bundled brain to `.github/`; rollback by reverse-rename on any install failure
  7. Mirror snapshotted `.vscode/` files into the backup dir (for diff-review convenience)
  8. Seed any missing `bootstrap_templates` from staged `templates/` dir (mirrors `cmdBootstrap` Step 1b)
  9. Restore heir-owned files from hold dir (with relocations applied)
  10. Update `.act-heir.json` marker
  11. Run `mergeHeirWorkspaceSettings` (Step 5b, unchanged from v9.0.0)
  12. Cleanup hold dir; run `runHeirDoctor`
  - On install failure: full rollback (remove half-installed `.github/`, reverse-rename backup, surface error).
  - On recovery failure: heir-owned files preserved in both backup dir AND hold dir until next session.
  - Success message reports recovered count, relocated count, collision count (if any), template seed count, doctor result, and backup dir name.
  - Backup dir name now includes seconds (`YYYYMMDD-HHMMSS`) so multiple upgrades per day don't collide with the script's date-only naming.

### Fixed (audit follow-up, pre-publish)

- **Status bar refreshes on workspace-folder changes** (Medium). The four-state model is now recomputed via `onDidChangeWorkspaceFolders` instead of only at activation, so Add Folder / Remove Folder / Open Folder swaps no longer leave a stale `$(lock)` / `$(brain)` state on screen. The status bar item is created once and mutated in place.
- **Heir marker write is guarded** (Medium). The post-rename `fs.writeFileSync` on `.github/.act-heir.json` was unprotected — an exception there would skip steps 7-9 and leak the hold dir. Wrapped in try/catch; install + recovery still succeed, marker bump is surfaced as a warning, hold dir is preserved on any partial failure (marker / recover / template seed) so the heir can manually reconcile alongside the backup dir.
- **`.act-protected.json` excluded from VSIX** (Low). Runtime reads the workspace-root marker (where the user opened the folder), not the bundled one, so shipping it added dead weight and could mislead installed users into thinking the extension itself is "protected." `build-extension.cjs` Step 5 now appends `.act-protected.json` to the generated `.vscodeignore`.

### Brain version

Unchanged from v9.1.0 — Edition v3.0.0 (145 files, byte-identical to tagged manifest).

## [9.1.0] - 2026-05-28

**Minor [behaviour] — architecture hardening + AlexMaster migration pipeline.**

### Added

- **AlexMaster → ACT Edition migration pipeline** (`migration.js` + `migration/`). One-click migration for users still on AlexMaster v8.4.0: detects signature files, backs up the old brain, installs Edition brain, and produces a `MIGRATION-REVIEW.md` summary. Includes rollback and backup-cleanup commands.
- **`lib/fs-utils.js`** — shared recursive file listing with symlink-loop protection (MAX_DEPTH=50). Eliminates code duplication between `extension.js` and `migration.js`.

### Fixed

- **Activation error boundary** (HIGH): top-level try/catch in `activate()` with recovery guidance and degraded-mode status bar indicator.
- **VSIX excludes test files** (HIGH): `.vscodeignore` now excludes `migration/dry-run.cjs` and `migration/vscode-stub.cjs`.
- **MD5 → SHA-256** in `cmdUpgrade` integrity check — removes use of broken hash algorithm.
- **Transactional brain install**: `installEditionBrain` now copies to a temp directory then renames atomically, preventing half-written states on crash.
- **`getBundledEditionVersion`** logs warnings instead of silently returning `unknown` when VERSION file is missing or empty.
- **OutputChannel disposal** in `deactivate()` — prevents resource leaks on extension host restart.
- **Walkthrough race condition**: `openWalkthrough` waits for `onDidChangeActiveTextEditor` with a 3-second timeout fallback instead of a blind 500ms delay.
- **Spawn ENOENT handling**: Git/child_process failures now provide actionable guidance ("Is git installed and on PATH?").

### Brain version

Unchanged from v9.0.0 — Edition v3.0.0 (145 files, byte-identical).

## [9.0.0] - 2026-05-27

**Major [behaviour] — bundles Edition v3.0.0 brain. Breaking: AI-Memory moves from cloud drives to git repo.**

### Breaking changes

- **AI-Memory discovery removed.** OneDrive / iCloud / Dropbox scanning code deleted. AI-Memory now lives in a sibling `../Alex_ACT_Memory` git repo by convention. See [Migrating to v9](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Migrating-to-v9) for the one-time migration (2 minutes).
- **`heirs/registry.json` fleet self-registration removed.** Fleet tracking is a separate concern handled by the Supervisor.

### Removed

- **`migration/` folder** (2,720 lines) — legacy AlexMaster-to-ACT migration wizard. No longer needed; all active users have migrated.
- **`migration.js`** (803 lines) — orchestrator for the above.
- README section referencing the migration modal updated to point at the wiki migration guide.

### Brain version

Brain pinned to **Edition v3.0.0** (was v2.6.0). Manifest spec_version 1.3, edition_version 3.0.0. 145 brain files on disk, byte-identical to the tagged Edition manifest (audit clean: 145/145 byte-identical, 0 mismatched, 0 missing, 1 HEIR_OWNED skipped).

### Brain-side highlights (v3.0.0 vs v2.6.0)

- VERSION file consolidated to `.github/VERSION` (single source of truth for brain version).
- AI-Memory cloud-drive discovery replaced with git-sibling convention.
- Fleet self-registration hooks removed from lifecycle scripts.

## [8.13.1] - 2026-05-27

**Patch [behaviour] — hotfix: wire heir workspace-settings merger into the Extension surface.** Extension-only patch; brain payload unchanged (still v2.6.0). v8.13.0 shipped the brain payload (baseline JSON + merger module) but the Extension's `cmdBootstrap` and `cmdUpgrade` functions are independent JS implementations of the bootstrap/upgrade lifecycle that never invoked the merger. Heirs installing or upgrading via the GUI commands received the new brain files but their `.vscode/settings.json` was not updated, leaving the chat.*FilesLocations keys unwritten and the v8.13.0 / Edition v2.6.0 skill-discovery fix functionally non-operative for Marketplace heirs.

### Extension surface changes

- **NEW `mergeHeirWorkspaceSettings(root)` helper in `extension.js`** — lazy-loads `brain/scripts/shared/workspace-settings-merger.cjs` from the bundled brain, reads `brain/config/heir-workspace-settings-baseline.json`, and invokes the canonical merger. Best-effort: surface as a warning on failure, never abort the surrounding command. Both files are guarded with `fs.existsSync` so older brain payloads (without the merger) degrade silently to no-op.
- **`cmdBootstrap`** invokes the helper after the marker write (Step 2b), mirroring `bootstrap-heir.cjs` order. New heirs bootstrapped via the Extension now receive the three discovery keys on first install.
- **`cmdUpgrade`** invokes the helper after the marker update, before `runHeirDoctor`, mirroring `upgrade-self.cjs` Step 5b order. The upgrade success message now appends `" <N> workspace-settings key(s) merged"` when keys are upserted.

### Heir-visible behaviour delta

| Before v8.13.1 | After v8.13.1 |
| --- | --- |
| `ACT: Bootstrap This Workspace` left `.vscode/settings.json` untouched; heirs had to run `node .github/scripts/bootstrap-heir.cjs` manually to backfill the keys | Bootstrap merges the three `chat.*FilesLocations` keys into `.vscode/settings.json` automatically |
| `ACT: Upgrade Brain` from v8.12.x to v8.13.0 wrote the new brain files but left workspace settings stale | Upgrade detects the baseline and merges any missing keys idempotently; upgrades on heirs already current report no-op |

### Notes

- **No Edition bump.** Brain payload byte-identical to v8.13.0 / Edition v2.6.0; only `extension.js` and `CHANGELOG.md` changed.
- **Affected users.** Heirs who installed v8.13.0 before v8.13.1 ships will need to either reinstall v8.13.1 and run `ACT: Upgrade Brain` (idempotent — safe), or run `node .github/scripts/upgrade-self.cjs --apply` once to invoke the canonical script-side merger.
- **Backup behaviour unchanged.** `cmdUpgrade` is still per-file MD5-compare in-place overwrite (HEIR_OWNED files skipped); rollback via `git`. The atomic-backup divergence between Extension `cmdUpgrade` and Edition `upgrade-self.cjs` is tracked separately for a future ADR.

## [8.13.0] - 2026-05-27

**Minor [behaviour] — bundles Edition v2.6.0 brain.** Edition refresh release: brain payload moves from v2.5.0 to v2.6.0, adding the heir workspace-settings baseline that fixes the silent `.github/skills/local/<name>/SKILL.md` discovery bug. No Extension surface changes. Marketplace v8.13.0 bundles brain v2.6.0 per ADR-004 dual-track.

### Brain version

Brain pinned to **Edition v2.6.0** (was v2.5.0). Manifest spec_version 1.3, edition_version 2.6.0. 145 brain files on disk, byte-identical to the tagged Edition manifest (audit clean: 145/145 byte-identical, 0 mismatched, 0 missing, 1 HEIR_OWNED skipped).

### Brain-side highlights (v2.6.0)

- **NEW `.github/config/heir-workspace-settings-baseline.json`** — declarative baseline of the three `chat.{agentSkills,promptFiles,agentFiles}FilesLocations` keys with two-root maps (`.github/X` and `.github/X/local`). Closes the VS Code Copilot 1.118+ skill-discovery bug where files placed in `.github/skills/local/<name>/SKILL.md` were silently invisible (skills/prompts/agents do a one-level walk; only instructions recurse). Carries verification context and a falsifier date in `$comment`.
- **NEW `.github/scripts/shared/workspace-settings-merger.cjs`** — idempotent per-key deep-merge module called from both lifecycle scripts. Strips JSONC comments, preserves heir ownership of `.vscode/settings.json` (HEIR_OWNED-file mutation done by per-key upsert; never overwrites unrelated heir keys).
- **`bootstrap-heir.cjs` and `upgrade-self.cjs`** invoke the merger after their marker-write steps. New heirs get the keys on first bootstrap; existing heirs get backfilled on next `ACT: Upgrade Brain`.
- **`mall-installation.instructions.md`** — new `### Discovery setup` section documents the one-level walk, the three keys, automatic merge behaviour, and a manual fallback for heirs on Edition < 2.6.0.

### Heir-visible behaviour delta

After upgrading, the heir's `.vscode/settings.json` will gain three new keys if absent. Existing values for those specific keys are **replaced** with Edition's two-root maps (per-key replacement semantics, not deep object merge inside the key). All other keys in the heir's settings are untouched.

### Compatibility

- VS Code < 1.118 silently ignores the new settings keys (no error).
- Heirs that already had custom values for the three keys: see `mall-installation.instructions.md` § Discovery setup for the manual override path.

### Surface

No Extension surface code changes. Same commands, same activation, same walkthrough.

**Patch [behaviour] — replicate Edition's `.github/` and `.vscode/` layout correctly on bootstrap and upgrade.** Prior versions had two related defects: (1) bundled `brain/.vscode/markdown-light.css` and `brain/.vscode/settings.json` were copied into `.github/.vscode/` inside the heir's brain instead of the workspace-root `.vscode/` folder where VS Code expects them; (2) Edition's heir-owned `.github/config/cognitive-config.json` template was never seeded because it is intentionally absent from `brain/` per the faithfulness audit contract, leaving heirs without the schema-correct config for AI-Memory routing and confidence-badge toggles. This patch fixes both: `.vscode/*` now lands at the workspace root, and `.github/` bootstrap templates are staged in the Extension's `templates/` directory at build time and seeded on first install only.

### What changed

- **`cmdBootstrap`** routes each bundled brain file to its correct workspace destination via the new `resolveBrainDest()` helper: `.vscode/*` → workspace root, everything else → `.github/`. Files declared in the Edition manifest's `bootstrap_templates` list are copy-if-absent (heir-owned), not overwritten.
- **`cmdBootstrap`** also seeds `.github/` bootstrap templates from the Extension's `templates/` directory (currently `cognitive-config.json`). These files are intentionally absent from `brain/` per `audit-brain-faithfulness.cjs`, so the build pipeline now stages them separately.
- **`cmdUpgrade`** uses the same routing and skips `bootstrap_templates` entirely (preserves user edits). One-time migration: any file under `.github/.vscode/` is moved to `<workspace>/.vscode/`.
- **`build-extension.cjs`** Step 3b cleaned up to handle only `.vscode/` entries; new Step 3c stages `.github/` bootstrap templates under `templates/` so they ship with the VSIX without polluting `brain/`. Faithfulness audit passes (143/143 byte-identical to Edition v2.5.0).
- **New helpers in `extension.js`**: `loadEditionManifest()`, `getBootstrapTemplateSet()`, `resolveBrainDest()`.

### Migration notes

- **For users on v8.12.0 or earlier**: run `ACT: Upgrade Brain` once after installing v8.12.1. The upgrade reports how many legacy `.vscode/` files it relocated. No data loss — files are copied first, then the legacy copy is removed. The relocated `settings.json` is preserved as-is; if you want Edition's current defaults, delete it and re-bootstrap a fresh workspace (or merge by hand).
- **For users with no `.github/config/cognitive-config.json`**: this patch does NOT retroactively seed the file on upgrade (heir-owned files are never written on upgrade by contract). To get Edition's current template, delete the file (if a partial one exists) and re-bootstrap a fresh workspace, or copy it manually from `<extension-install>/templates/cognitive-config.json`.
- **For heirs**: no action required. The fix is in the Extension surface code, not the brain payload. Brain remains v2.5.0.

## [8.12.0] - 2026-05-27

**Minor [behaviour] — bundles Edition v2.5.0 brain.** Edition refresh release: brain payload moves from v2.4.0 to v2.5.0, adding two baseline skills (`systematic-debugging`, `security-and-hardening`), VS Code 1.122 awareness in the always-on instruction set, and three shared-core mirrors from Supervisor (`pii-memory-filter`, `falsifiability-deadlines`, `severity-tagged-commits`). No Extension surface changes — same commands, same activation, same walkthrough. Marketplace v8.12.0 bundles brain v2.5.0 per ADR-004 dual-track.

### Brain version

Brain pinned to **Edition v2.5.0** (was v2.4.0). Manifest spec_version 1.3, edition_version 2.5.0. 143 brain files on disk, byte-identical to the tagged Edition manifest (audit clean).

### Brain-side highlights (v2.5.0)

- **`systematic-debugging` skill** (adopted from `MALL/obra-superpowers`) — four-phase root-cause-first method with iron law "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST". Closes a baseline gap; heirs no longer default to symptom-fixing.
- **`security-and-hardening` skill** (adopted from `MALL/addyosmani-agent-skills`) — OWASP-aware security-first practices with a three-tier boundary system (Always Do / Ask First / Never Do), input validation patterns, secrets management, dependency-audit triage.
- **VS Code 1.122 conveniences surfaced** in `tool-awareness` (`/models` slash, BYOK air-gapped, local agent host watchpoint) and `lint-discipline` ("Search only in changed files" toggle for lint scope). No rule changes, additive shortcuts only.
- **Shared-core mirrors from Supervisor**: `pii-memory-filter` cross-link to `memory-triggers`; `falsifiability-deadlines` description cleaned; `severity-tagged-commits` intentional-divergence marker.

Full Edition release notes: see `Alex_ACT_Edition` v2.5.0 tag.

### Migration notes

- **For users**: no action required. Auto-updates from v8.11.3.
- **For heirs**: new skills are auto-available after VSIX update; no `/upgrade` needed for the Extension's bundled brain (Extension ships the brain inert at `brain/`). Heirs that synced from Edition pre-v2.5.0 can still pull via their existing `/upgrade` flow.

**Patch [clarification] — code review cosmetics on top of v8.11.2.** Fixes deferred from the v8.11.2 review: hardens converter execution against shell metacharacters, adds a depth-warning to the symlink guard, sidecars the full migration classification next to the truncated markdown, and stops tracking the build-generated `.vscodeignore`. No functional changes for already-working code paths.

### Changed

- **Converter execution** (`extension.js#runConverter`) — replaced `terminal.sendText()` (which interpolated paths into a shell command line) with `child_process.spawn()` taking array args, streaming stdout/stderr into a dedicated `ACT Convert` OutputChannel. Paths with spaces, quotes, or shell metacharacters can no longer be reinterpreted by the host shell. Users now see exit code + a written-file notification on success and a clear error notification on non-zero exit.
- **Symlink/depth guard** (`extension.js#listFilesRecursive`) — added `WARN_RECURSION_DEPTH=20` console warning. A real Edition brain is ≤4 levels deep; depths past 20 are almost certainly a misconfigured symlink/junction. Logs once per process to make the cause loud rather than silent.
- **`.vscodeignore`** — no longer tracked in git. `build-extension.cjs` regenerates it on every build, so the committed copy was dead weight and a drift hazard. Added to `.gitignore`.

### Added

- **`MIGRATION-REVIEW.json` sidecar** (`migration.js#writeMigrationReview`) — written alongside `MIGRATION-REVIEW.md` with the complete classification (no truncation). The markdown summary still truncates each section at 50 entries for human readability; the JSON is the authoritative artifact for tooling and audit on installs with >50 customised or custom files.
- **`loadV840Index` defensive-filter rationale** (`migration.js`) — docblock now explains why the `brain-files/` prefix filter is safe (v8.4.0 manifest is a frozen historical artifact; no forward-compatibility risk).

<!-- markdownlint-disable-next-line MD024 -->
### Brain version

Brain pinned to Edition v2.4.0 (unchanged from v8.11.1/.2). No brain content changes; pure surface cleanup.

<!-- markdownlint-disable-next-line MD024 -->
### Migration notes

- **For users**: no action required. Auto-updates from v8.11.2.

## [8.11.2] - 2026-05-27

**Patch [behaviour] — fix converter + heir-doctor paths after Edition v2.4.0 layout shift.** Edition v2.4.0 collapsed `.github/muscles/` into per-skill `scripts/` folders (each converter now lives at `skills/<id>/scripts/<id>.cjs`; heir-doctor at `skills/greeting-checkin/scripts/heir-doctor.cjs`). The extension still resolved those scripts at the old `muscles/` path, so on v8.11.1 all six **ACT Convert** context-menu commands silently no-op'd and bootstrap's post-install health check never actually ran. This release rewires both code paths to the new locations and adds the same health check to upgrade. Also tightens marker reads (corrupted `.act-heir.json` now produces a clear error instead of a stack trace) and surfaces per-file copy failures during bootstrap so a partially-installed `.github/` is visible to the user.

### Fixed

- **Converters** (`extension.js#CONVERTERS` and `runConverter`) — six commands (`alex-act.convert.md-to-word`, `.md-to-html`, `.md-to-eml`, `.md-to-txt`, `.docx-to-md`, `.html-to-md`) now resolve their scripts under `skills/<id>/scripts/<id>.cjs`, checking the workspace `.github/skills/` first and falling back to the bundled brain. Previously they pointed at the obsolete `.github/muscles/` directory which no longer ships in Edition v2.4.0; every conversion silently failed.
- **Bootstrap post-install health check** (`extension.js#cmdBootstrap`) — `heir-doctor.cjs` is now found at `skills/greeting-checkin/scripts/heir-doctor.cjs` instead of the old `muscles/heir-doctor.cjs`. On v8.11.1 the `fs.existsSync` guard skipped the check entirely, so users got `null` instead of a pass/fail line.
- **Bootstrap confirm modal** — no longer reports "and 0 muscles" alongside the real counts. The `muscles` row was a leftover from the pre-v2.4.0 brain layout and always rendered as `0`.
- **Corrupted `.act-heir.json`** — `cmdBootstrap`, `cmdUpgrade`, `cmdStatusBarMenu`, and the startup status-bar registration all now read the marker through a single defensive helper (`readMarkerSafe`). A malformed marker produces a one-line user-facing error pointing at the backup directory; previously it threw an unhelpful red modal mid-command.
- **Migration marker fallback** (`migration.js#writeMigrationMarker`) — when `brain/VERSION` is somehow missing (build error, partial install), the marker now records `edition_version: 'unknown'` instead of a hardcoded `'9.0.0'`. The v9.0.0 line was claimed-then-abandoned per the v8.11.0 semver note; recording it as the migration target was misleading.

### Added

- **Health check after upgrade** (`extension.js#cmdUpgrade`) — `heir-doctor` now runs after the file copy completes and surfaces a `✓` / `⚠` line in the success notification. Upgrade was previously the one command that *didn't* validate its own output.
- **Per-file copy failure reporting** (`extension.js#cmdBootstrap`) — the bootstrap copy loop now catches per-file errors and reports the first five with counts at the end. A partial `.github/` install caused by antivirus locking or a permission issue is now visible to the user instead of failing the whole `withProgress` with one cryptic message.
- **`resolveConverterScript` / `runHeirDoctor` helpers** (`extension.js`) — shared resolution logic that honors workspace-installed brain over the bundled copy. Heir-local edits to a converter or to heir-doctor now take precedence.

### Changed

- **Stale comments** — refreshed the migration module's header docblock and the in-line section banner in `extension.js` to drop the "ships in v9.0.0" references. The migration code itself is unchanged; only the comments. v9.0.x was tagged and superseded per the v8.11.0 semver note; the surviving v8.11.x line bundles Edition v2.4.0.

### Brain version

Brain pinned to Edition v2.4.0 (unchanged from v8.11.1). No brain content changes; this is a surface-layer fix in the extension's path resolution.

### Migration notes

- **For users**: no action required. Auto-updates from v8.11.1. After update, the six ACT Convert context-menu commands will work for the first time on this Edition; previously-installed heirs do not need to re-bootstrap.
- **Manual workaround for v8.11.1 users** (until update lands): convert from the chat side via `/<keyword>` (e.g. `/md-to-word`) or run the script directly via `node .github/skills/<id>/scripts/<id>.cjs <input>`.

## [8.11.1] - 2026-05-26

**Patch [behaviour] — manifest-driven brain payload + bundled `.vscode/`.** Build script now reads Edition's `.github/config/edition-manifest.json` as the authoritative bill of materials and copies only the files it declares (instructions, prompts, agents, skills, scripts, configs, plus `copilot-instructions.md` and `VERSION`). The previous recursive sweep of `.github/` shipped whatever happened to live in Edition's tree; the manifest-driven copy makes Edition the single source of truth and fails the build loudly if a declared file is missing. Also added a new Step 3b that copies `.vscode/settings.json` (per `bootstrap_templates`) and `.vscode/markdown-light.css` (per `vscode_assets`) into `brain/.vscode/` so heir workspaces get the markdown rendering and welcome settings on install. Faithfulness now verified at the git-blob level: 138/138 byte-identical against Edition v2.4.0 tag (one intentional exclusion: `config/cognitive-config.json`, which is `HEIR_OWNED` per manifest spec).

### Changed

- **`build-extension.cjs` Step 3 "Copy brain files"** — replaced ad-hoc `walk + fs.copyFileSync` with a manifest-driven loop reading `edition-manifest.json`. Missing manifested files → `process.exit(1)` instead of silent omission.
- **`build-extension.cjs` Step 3b "Copy .vscode/ assets"** (new) — copies `manifest.bootstrap_templates` (`.vscode/settings.json`) and `manifest.vscode_assets` (`markdown-light.css`) into `brain/.vscode/`. Missing manifested files → fatal.
- **LF preservation on Windows** — `git clone` invoked with `-c core.autocrlf=false` so brain bytes match Edition's committed LF line endings regardless of the builder's global git config. Without this, fresh Windows clones convert LF→CRLF on checkout and ship byte-different brain content.

### Added

- **`brain/.vscode/settings.json`** (bundled) — first-install template for heir VS Code workspaces.
- **`brain/.vscode/markdown-light.css`** (bundled) — markdown rendering theme.
- **`scripts/audit-brain-faithfulness.cjs`** (new) — git-blob-SHA audit comparing `brain/` against the Edition tag declared in `brain/VERSION`. Exits non-zero on any mismatch. Wire into CI or pre-release gate.

### Removed

- **`brain/config/cognitive-config.json`** — no longer bundled. This file is `HEIR_OWNED` per the manifest's `bootstrap_templates` contract (heirs generate their own at first install). Previous builds shipped it because the recursive sweep didn't honor the manifest's edition-shipped vs. heir-owned distinction.

### Brain version

Brain pinned to Edition v2.4.0 (same as v8.11.0). Brain content unchanged from v8.11.0 except for line-ending normalization (CRLF → LF, matching Edition's committed bytes) and the addition of `.vscode/` assets.

### Migration notes

- **For users**: no action required. Auto-updates from v8.11.0. `.vscode/` assets land in the workspace on install; existing user `.vscode/settings.json` is not overwritten — the bundled file is a template for first-install, not a runtime override.
- **For anyone forking the build**: the new `audit-brain-faithfulness.cjs` script is the recommended verification step before publishing any VSIX. Run `node scripts/audit-brain-faithfulness.cjs` after build; non-zero exit means the bundled brain doesn't match the tagged Edition source.

**Minor [behaviour] — remove bundled Plugin Mall catalog.** Mall evolves faster than Extension release cadence, so any snapshot bundled in the VSIX is stale by definition. Removed `catalog/CATALOG.json` (234 KB, 297 plugins) along with the `alex-act.mall-search` command, the QuickPick UI, and the status-bar menu entry. Mall discovery now goes exclusively through Copilot Chat (`/mall search <keyword>`, `/mall install <skill>`) which queries the live Mall via the brain's `mall-installation` instruction — always fresh, no staleness ceiling.

<!-- markdownlint-disable-next-line MD024 -->
### Removed

- **`catalog/CATALOG.json`** (234 KB, 297-plugin snapshot from build time) — replaced by live Copilot Chat queries against the Mall repo.
- **Command `alex-act.mall-search`** — removed from `contributes.commands`. Users with custom keybindings pointing at this command will see a "command not found" error; rebind to `workbench.action.chat.open` and prefix with `/mall search`.
- **Status-bar menu entry "$(search) Search Plugin Mall"** — the QuickPick now skips straight from `/configure-vscode` to `Open Brain README`.
- **`cmdMallSearch()` function in `extension.js`** (~50 lines) and its `CATALOG_PATH` constant.
- **`MALL_REMOTE`, `CATALOG_DST`, `MALL_CATALOG` constants** + Step 4 "Bundle Mall catalog" in `build-extension.cjs`. Build now clones Edition only, in roughly half the time.
- **`!catalog/**` allowlist entry** in the generated `.vscodeignore`.

<!-- markdownlint-disable-next-line MD024 -->
### Changed

- **Welcome walkthrough step "plugin-mall"**: CTA changed from `[Search Plugin Mall](command:alex-act.mall-search)` to `[Open Copilot Chat](command:workbench.action.chat.open)` with prompt for `/mall search` and `/mall install`. Completion event removed (step is now informational; walkthrough no longer gates on the dead command).
- **Build script docstring** updated to document why Mall is no longer bundled. Steps renumbered 1-9 (was 1-10) after removing Step 4.

<!-- markdownlint-disable-next-line MD024 -->
### Migration notes

- **For users**: nothing breaks. Plugin Mall search still works via `/mall search` in Copilot Chat — same workflow heirs have always used. The dedicated VS Code command and status-bar entry are gone; the chat path is now the only path.
- **For anyone bundling a catalog snapshot in fork**: see the v8.11.0 build script for the pure-Edition build pattern. Mall snapshot can still be regenerated on demand if a fork needs offline Mall search.

### Semver note

This release removes a published command (`alex-act.mall-search`), which is technically a breaking change. Bumped as **minor (8.11.0) rather than major (9.0.0)** because: (a) the v9.x line on this repo was previously claimed and abandoned (v9.0.0/v9.1.0 tagged 2026-05-25 then superseded by v8.9.x), making a v9 bump confusing; (b) functional Mall search continues uninterrupted via chat; (c) no user data or workflow is lost. If a user-visible breakage surfaces in the wild, future releases will reconsider the bump rule.

## [8.10.0] - 2026-05-26

**Minor [behaviour] — bundle Edition v2.4.0 brain.** Pairs with [Edition v2.4.0](https://github.com/fabioc-aloha/Alex_ACT_Edition/releases/tag/v2.4.0). Substantial brain refresh: 45 Edition commits since v2.3.0 (25 [behaviour] + 20 [clarification]). Per-type review/creator pairs (instruction/prompt/agent + skills = four-way symmetry), `.github/muscles/` collapsed into `scripts/`, `.github/config/` pruned (goals.json, sync-policy.json, markdown-light.css all removed; policy inlined into `_registry.cjs`), `welcome-baseline.json` gains Claude Agent safety locks (`allowAutoPermissions`/`allowDangerouslySkipPermissions`) + `skillTool` lock, `markdown-mermaid` SKILL.md trimmed 1648 → 327 lines (refs extracted), `edition-manifest.json` extended to file-level bill-of-materials (`spec_version` 1.0 → 1.3) covering 139/139 shipped files across `.github/` + `.vscode/`. Mall catalog refreshed: 297 plugins. No breaking changes for existing Extension users; auto-updates from v8.9.11. No marketplace-surface changes in this release (status-bar, walkthrough, commands unchanged) — pure brain refresh.

### Added

- **3 baseline skills** mirrored from Supervisor: `code-review`, `git-workflow`, `status-reporting`. Each with always-on routing instruction. Closes a real heir-baseline gap.
- **6 per-type review/creator pair skills**: `instruction-review`/`instruction-creator`, `prompt-review`/`prompt-creator`, `agent-review`/`agent-creator` (per ADR-007). Brain users gain Supervisor's curation surface.
- **`deep-review` skill** — adversarial code review with three parallel perspectives (Advocate, Skeptic, Architect). Complements single-pass `code-review` for high-stakes PRs.
- **`doc-hygiene` skill** — anti-drift rules, link integrity, count elimination, living-document maintenance.
- **3 new slash-prompts**: `/review-instruction`, `/review-prompt`, `/review-agent` — complete four-way symmetry with existing `/review-skill`.
- **`markdown-mermaid/references/mermaid-reference.md`** (1339 lines) — deep-dive content extracted from SKILL.md.

### Changed

- **22 prompts** stripped deprecated `mode: agent` frontmatter (deprecated per current Microsoft Learn prompt-files spec).
- **23 prompts gain `## Would Revise If`** + `lastReviewed: 2026-05-26` (per `falsifiability-deadlines` instruction).
- **8 always-on shared-core instructions** mirrored byte-identical with Supervisor: `act-foundations`, `act-pass`, `critical-thinking`, `epistemic-calibration`, `privacy-responsible-ai`, `proactive-awareness`, `system-prompt-skepticism`, `falsifiability-deadlines`. Concrete 90-day falsifier windows (2026-08-26).
- **4 worker agents tightened against Gate 6 (Tool Allowlist Minimality)** — `document-assembler` drops unused `search/codebase`; `illustrator` trims to `read`-only; `markdown-author` drops `search/*` + `search/usages`. `brain-auditor` retains `edit`.

### Removed

- **`audit-apis` workflow** (registry + muscle + prompt) — bundled into v8.9.x but no longer in Edition v2.4.0.
- **`migrate-from-alex-master.prompt.md`** — obsolete migration tool.
- **`academic-paper-drafting` skill** — 683 lines vs 500 cap; user-approved removal in Edition v2.4.0.
- **3 dead config files**: `goals.json`, `mcp.json.template`, `sync-policy.json` (policy inlined to `_registry.cjs`).
- **`.github/muscles/` folder** collapsed into `scripts/` (4 → 0 files); brain artifact types reduce to 4 (skills, instructions, prompts, agents).

## [8.9.11] - 2026-05-25

**Patch [docs] — walkthrough refinement + wiki audit fixes.** Walkthrough pages (`media/walkthrough/01..06.md`) trimmed from ~3850 to ~1487 words (~61% reduction) by hoisting depth out to the GitHub wiki and keeping the in-extension pages at a high-level orientation. Wiki source (`docs/wiki/*.md`) audited and corrected: `Getting-Started` now matches the actual marketplace displayName ("Alex — ACT Edition"); `The-Plugin-Mall` fixes the `/mall install` → `/mall-install` slash-command syntax and drops `meditation` from the example list (not in the Mall catalog); `Project-Memory` replaces non-existent `/release-preflight` and `/triage-feedback` prompt examples with shipping ones (`/checkin`, `/meditate`, `/feedback`, `/note`); `AI-Memory` removes a misleading cross-page link. New `scripts/publish-wiki.ps1` mirrors `docs/wiki/` to the GitHub wiki repo (idempotent, supports `-DryRun`). No code changes — docs and scripts only.

## [8.9.10] - 2026-05-25

**Patch [behaviour] — icon anti-aliasing fix.** Marketplace icon (`assets/icon.png`) was a PaletteAlpha (indexed) PNG with binary 1-bit transparency, causing visible stair-step jaggies on the rounded corners and diagonal chevron strokes. Rebuilt as RGBA truecolor at 256×256 using a 4× supersampled soft mask (Lanczos downscale) for the rounded rect plus alpha-channel blur (sigma 0.6) on the chevron art. Borders and chevron edges now render with proper anti-aliased gradients. No code changes — asset-only.

## [9.1.0] - 2026-05-25

**Minor [behaviour] — status-bar menu, dynamic bootstrap modal, action-button success toast, and Edition v2.3.0 brain.** Pairs with [Edition v2.3.0](https://github.com/fabioc-aloha/Alex_ACT_Edition/releases/tag/v2.3.0) which renamed `/welcome` to a read-only orientation tour and introduced `/configure-vscode` for the old settings behaviour. No breaking changes for existing users; the Marketplace listing auto-updates from v9.0.0 to v9.1.0.

### Added

- **Status-bar menu**: clicking the `$(brain) ACT vX.Y.Z` status-bar item now opens a QuickPick of common actions (Show Status, Upgrade Brain when available, Run /welcome, Run /configure-vscode, Search Plugin Mall, Open Brain README, Open Walkthrough, Open Extension README). Previously the click ran `cmdStatus` directly — discoverable but a dead-end. The new menu surfaces every chat-command and converter command behind a single click. An `$(arrow-up)` glyph is appended to the status-bar text when an upgrade is available, so users see the cue without hovering for the tooltip. New command `alex-act.statusBarMenu` registered in `package.json` so it also shows in the command palette.

### Changed

- **`cmdBootstrap` modal now reads version + counts dynamically from the bundled brain.** Previously hardcoded `v1.2.1` and a fixed file-count breakdown (`35 instructions, 18 skills, 23 prompts, 4 agents, and 21 muscles`) that drifted with every Edition release. Now reads `brain/VERSION` and counts files in `brain/{instructions,skills,prompts,agents,muscles}/` at call time.
- **Bootstrap success toast replaced with action-button info message + `heir-doctor` run.** The dead-end "Start a Copilot Chat session to begin" message gave the user no actionable next step. The new toast:
  - Runs `heir-doctor.cjs` post-bootstrap and surfaces a pass/issue line
  - Offers three one-click buttons: **Run /welcome** (orientation tour, opens Copilot Chat with the slash-command pre-filled), **Run /configure-vscode** (applies user-scope VS Code settings), **Open README** (markdown preview)
  - Reminds the user to fill in `## Project Context` in `.github/copilot-instructions.local.md` before the first real chat
- **README**: updated install section to describe the new three-button toast and the pre-chat checklist.
- **Bundled brain refreshed to Edition v2.3.0**: `brain/VERSION` is now `2.3.0`; new `brain/prompts/welcome.prompt.md` (read-only orientation tour); new `brain/prompts/configure-vscode.prompt.md` and `configure-vscode-verify.prompt.md` (renamed from the old settings `/welcome`); `brain/prompts/welcome-verify.prompt.md` removed; `brain/config/edition-manifest.json` regenerated; `brain/muscles/heir-doctor.cjs` warning text updated.

### Notes

The `/welcome` and `/configure-vscode` buttons in the new toast trigger Copilot chat with the slash-command pre-filled. The prompts they invoke ship in the bundled brain at v2.3.0 — the toast and the brain are coherent in this VSIX.

---

## [9.0.0] - 2026-05-24 (pending Marketplace publish)

### Alex — ACT Edition is the direct successor to Alex Cognitive Architecture (AlexMaster)

This release re-points the Marketplace listing `fabioc-aloha.alex-cognitive-architecture` (78 installed seats, 2,818 served downloads, last published v8.4.0 on 2026-04-26) at the modern ACT Edition codebase. Installed users auto-update from v8.4.0 to v9.0.0.

### Why the version jumps from 2.0.5 to 9.0.0

This repo (`Alex_ACT_Extension`) developed in parallel at v1.x–v2.0.5 under the Marketplace ID `fabioc-aloha.alex-act-edition`. That ID is being retired. The new published version takes over the AlexMaster Marketplace ID, where monotonic semver requires the next version to be **greater than v8.4.0**. v9.0.0 satisfies that constraint and signals the major identity shift. The v1.x–v2.x git history is preserved in this repo's tags and is **not** the same product as the AlexMaster v1.x–v8.x history.

### Changed

- **Marketplace identity**: `fabioc-aloha.alex-act-edition` v2.0.5 → `fabioc-aloha.alex-cognitive-architecture` v9.0.0 (reused AlexMaster ID)
- **Display name**: `Alex ACT Edition` → `Alex — ACT Edition`
- **License**: MIT → **PolyForm Noncommercial 1.0.0** (preserved from AlexMaster; non-commercial use remains unrestricted)
- **Icon**: AlexMaster blue-rocket icon adopted for visual continuity with installed seats
- **Categories**: `Machine Learning, Other` → `AI, Chat, Extension Packs, Education`
- **Engines**: `vscode ^1.95.0` → `^1.117.0` (AlexMaster's floor; matches installed-seat baseline)
- **Repository field**: now points at `github.com/fabioc-aloha/Alex_ACT_Extension`; homepage points at the wiki
- **README**: rewritten thin — Marketplace listing now points at the wiki for depth

### Added

- **`extensionPack`**: bundles `GitHub.copilot-chat`, `ms-vscode.powershell`, `redhat.vscode-yaml`, `bierner.markdown-mermaid`, `DavidAnson.vscode-markdownlint` for first-time installers (parity with AlexMaster v8.4.0)
- **`migration/alex-master-signature.json`**: signature manifest that the migration logic uses to detect a workspace previously bootstrapped by AlexMaster

### Pre-publish addenda (rolled in before first Marketplace publish)

- **Brain bundle**: refreshed from `v2.2.0` (was `v2.1.0`). Carries: added `no-deferred-debt` always-on instruction; `tool-awareness` documents VS Code 1.118+ skill picker surfacing; removed 6 always-on instructions not earning their tokens (`debugging`, `creative-loop`, `partnership-charter`, `alternatives-and-tradeoffs`, `scope-management`, `technical-writing`); retired heir migration tooling (`migrate-to-edition.cjs`, `MIGRATION.md`, `finalize-migration.prompt.md`).
- **`build-extension.cjs`**: `--ref <tag>` now applies only to the Edition clone (was incorrectly applied to Mall, causing Mall clone to fail on Edition-only tags). Version-mismatch WARN replaced with informational NOTE — `package.json.version` (Marketplace identity sequence) and `brain/VERSION` (Edition semver) are dual-track by design per ADR-004.

### Migration flow (existing AlexMaster seats)

When ACT Edition v9.0.0 activates in a workspace it identifies as AlexMaster-bootstrapped:

1. Modal: **"This workspace looks like AlexMaster. Migrate now?"** — Migrate now / Later / Don't ask again
2. On confirm, the `.github/` directory is backed up verbatim to `.github-backup-<ISO>/` (never auto-deleted)
3. AlexMaster-specific authored content (`NORTH-STAR.md`, `episodic/`, `quality/`, `ABOUT.md`, `EXTERNAL-API-REGISTRY.md`) is preserved under `.github/local/`
4. The ACT Edition brain is written into `.github/`
5. A guided semantic pass (`/finalize-migration` prompt) invites the user to review what survived

"Don't ask again" downgrades the prompt to a persistent `Alex ACT: Migration Available` status-bar item.

### Removed

- Old MIT LICENSE file (replaced with PolyForm)
- Old `repository`/`homepage` pointing at a deprecated GitHub repo

### Known gaps

- Tag history shows `v1.x → v2.0.5 → v9.0.0` with no `v3-v8` in this repo (the v8.x lineage lives in the AlexMaster repo, not here). The CHANGELOG entries below v9.0.0 describe the `Alex_ACT_Extension` development arc, not AlexMaster history.

---

## [2.0.5] - 2026-05-21

**Patch — 25 shared-core brain files gain `## Would Revise If` falsifier sections.** Mirror of Supervisor D2(a) commit `c6327bb`. Each WRI names specific failure modes that would invalidate the file's advice — not boilerplate. Brain epistemic-qa coverage rises 45.5% → ~91% in Edition. No behavioral change for heirs: the files still direct the same actions; the WRI is an epistemic addition that names the conditions under which each rule should be revisited.

Closes the C1 falsifiability gap identified in brain-qa 2026-05-21 findings (decision D2 option a, both phases). Satisfies the Cardinal Rule 3 quarterly CT-trifecta refinement requirement for Q2 2026 — the four CT-trifecta files (critical-thinking instruction + skill, problem-framing-audit, system-prompt-skepticism) are among the 25 with file-specific WRIs.

### Added

- **`## Would Revise If` section in 23 always-on instructions** — act-foundations, ai-writing-avoidance, alternatives-and-tradeoffs, brain-audit, communication-craft, creative-loop, critical-thinking, emotional-intelligence, epistemic-calibration, knowledge-coverage, lint-discipline, markdown-mermaid, partnership-charter, pii-memory-filter, privacy-responsible-ai, proactive-awareness, problem-framing-audit, reliance-nudges, scope-management, session-health-monitoring, system-prompt-skepticism, tool-awareness, tool-awareness-categories
- **`## Would Revise If` section in `skills/critical-thinking/SKILL.md`** — covers the 7 disciplines + Discipline -1 frame audit
- **`## Would Revise If` section in `skills/markdown-mermaid/polish-mermaid-setup.prompt.md`** — falsifier for the workflow prompt

### Verification

- `brain-qa.cjs`: exit 0, 0 stale of 137 files
- `epistemic-qa.cjs` (Edition): 100/100 score, warns 4 → 3 (the `critical-thinking/SKILL.md` mirror brought along Supervisor's D1 OVR01 reword fix)
- `test-edition-applyto-coverage.cjs`: 18/18 PASS, 0 capability gaps
- `coherence-check.cjs`: 0 hard, 0 soft

### Upgrade

```pwsh
node .github/scripts/upgrade-self.cjs
```

No `--allow-major` needed. No `/welcome` re-run needed. WRI sections are additive content; existing heir behavior unchanged.

---

## [2.0.4] - 2026-05-19

**Patch — README Model Compatibility section gains the Copilot Language Models spec snapshot.** Adds the factual model surface (context window, capability flags, in/out/cache costs) visible in VS Code 1.121's Language Models view (`Settings → GitHub Copilot → Language Models`). Documentation-only patch; no brain behavior change.

### Added

- **`README.md` — Model Compatibility § "Snapshot: Copilot Language Models (2026-05-19)"** — 22-row table covering every Copilot model in the VS Code 1.121 picker:
  - Context window (range: 68K → 1M)
  - Tools and Vision capability flags (universal across the lineup — not differentiators)
  - Input / output / cache cost in credits per 1M tokens (range: In 25–500, Out 200–3000, Cache 2.5–125)
  - Retirement warnings for GPT-4.1, GPT-5.2, GPT-5.2-Codex (all closing 2026-06-01)
- One-paragraph framing below the table noting what is **universal** (Tools + Vision present everywhere) vs what is **variable** (context, in/out/cache cost), and pointing at the capability-floor benchmark (`MAN.8.3`) as the deferred work that will turn this spec sheet into an ACT-fit recommendation.

### Notes for heirs

- **Verify against your own Language Models view** before depending on these values. Model availability and pricing can change between releases.
- Costs are **credits per 1M tokens** (Copilot internal accounting) — different from the *premium request multiplier* surface documented at `docs.github.com/copilot/reference/ai-models/supported-models`. Both surfaces matter; this snapshot covers the credits view.
- The table is **factual spec data, not a recommendation**. The v2.0.3 architectural-needs framing in the same section is still the active recommendation. Measured ACT-discipline floor remains the open `MAN.8.3` question.

### Heir impact

Documentation-only. No `/upgrade` reconfiguration needed.

### Audit trail

- Companion to v2.0.3 README guidance (`10bbe2e`)
- Supervisor `README.md` updated in parallel with identical table (single source of truth across both repos)
- Source: VS Code 1.121 Language Models settings view, screenshot dated 2026-05-19
- Cross-referenced against GitHub Docs `supported-models` page for retirement dates and plan availability
- `test-edition-applyto-coverage`: 18/18 PASS (unaffected — no brain-file changes)
- `brain-qa`: exit 0 (79 + 58 files)

---

## [2.0.3] - 2026-05-19

**Patch — README gains an honest Model Compatibility section.** Adds explicit guidance for heirs about which Copilot models the brain is known to work with, what architectural needs the brain has, and what we have **not** measured. Closes a documentation gap; does not change any brain behavior or settings.

### Added

- **`README.md`** — new top-level section **Model Compatibility** between the cognitive-architecture intro and the Commands table. Contents:
  - Explicit "we have not characterised the minimum model" disclaimer citing `MAN.8.3` in the Claims Registry
  - What we tested with: Claude Opus 4.7 (1M context) for v1.5.0 reasoning baseline + v2.0.0 release benchmark
  - Architectural needs: tool calling, long context (≥ 64K, ideally ≥ 128K), instruction adherence, multi-step reasoning
  - Practical recommendation: reasoning-class models (Claude Sonnet 4+, Claude Opus, GPT-4.1, GPT-4o or equivalent) for primary agent work; `gpt-4o-mini` reserved for the `chat.utilityModel` / `chat.utilitySmallModel` slots per v2.0.2 baseline (NOT for primary agent work)
  - Open question: call for heir feedback with reports of "this worked on X" / "this failed on Y" routed to `AI-Memory/feedback/alex-act/`

### Heir impact

Documentation-only. No behavior change. Heirs on v2.0.2 reading the new section will learn what model class is recommended; no `/upgrade` reconfiguration is needed beyond pulling the new README.

### What this is not

This release does **not** establish a measured minimum model. The `MAN.8.3` claim remains open. The architectural-needs framing is the honest current state. A planned capability-floor benchmark (tracked in Supervisor `HANDOFF.md` outstanding item #8) will replace this guidance with measured floor on a future Edition release.

### Audit trail

- Companion to v2.0.2 baseline (`178cb76`) and v2.0.1 brain rules (`f9aaffd`)
- Supervisor README updated in parallel with curator-facing framing
- Provenance: user directed 2026-05-19 evening "A and then another day we refine it with B" — this is Option A (ship honest architectural-needs guidance now); Option B (run capability-floor benchmark to close `MAN.8.3`) deferred to a future session
- `test-edition-applyto-coverage`: 18/18 PASS (unaffected — no `applyTo` or brain-file changes)

---

## [2.0.2] - 2026-05-19

**Patch — welcome baseline gains three VS Code 1.120/1.121 settings.** Three keys added to `.github/config/welcome-baseline.json` so all heirs get them on next `/welcome` (or fresh setup). Companion to v2.0.1 (which updated the brain rules describing these capabilities); v2.0.2 wires the matching settings into the heir bootstrap.

### Changed

- **`.github/config/welcome-baseline.json`** — added three keys to the `settings` object:
  - `chat.tools.compressOutput.enabled: true` (1.120 Preview) — enables terminal output compression for `git diff` / `ls -l` / `npm install` and the 1.121 expansion (test runners, build tools, linters, Docker, package managers). The brain's file-redirect fallback remains valid for cases where compression strips data the agent needs.
  - `chat.utilityModel: "gpt-4o-mini"` (1.121) — routes title generation, rename suggestions, and settings search to a smaller cheap model. Heirs can override locally if `gpt-4o-mini` isn't in their model surface (VS Code falls back to default).
  - `chat.utilitySmallModel: "gpt-4o-mini"` (1.121) — same rationale for the small-model slot.
- **Baseline `$comment`** updated to acknowledge that preview/experimental toggles can be included when explicitly requested by user policy and noted in CHANGELOG (was: "Stable settings only — keep preview/experimental toggles off unless explicitly requested"). `chat.tools.compressOutput.enabled` is the first such inclusion.

### Heir impact

Heirs running `/welcome` (first-session bootstrap or new-machine setup) get all three settings. Heirs running `/welcome-verify` will see the three keys flagged as `missing` until they re-run `/welcome`. Existing user-level overrides for these keys are preserved by the merge step in `/welcome` (it merges, doesn't overwrite values that already differ — well, actually it does overwrite to match baseline; heirs who want a different utility model should set it AFTER `/welcome`). No `--allow-major` needed; standard `/upgrade` covers the baseline file.

### Override guidance

Heirs who want a different utility model (e.g. running on BYOK with a different small-model name) should set their override in personal `settings.json` AFTER running `/welcome`. The `/welcome` merge is overwrite-to-baseline, so the override needs to be re-applied if `/welcome` runs again.

### Validation

Dogfooded the `/welcome` reference command (verbatim from `welcome.prompt.md`) against the curator's personal `settings.json` before shipping — all three keys landed correctly as JSON booleans/strings (lowercase `true`, quoted model names). No existing keys disturbed.

### Audit trail

- Companion to v2.0.1 (brain rules) — commits `b6dafc3` (Supervisor) + `f9aaffd` (Edition)
- Proposal: original `vscode-1.120-1.121-adoption-2026-05-19.md` recommended these as personal-settings-only; user directed (2026-05-19) to bake into the heir baseline instead
- Brain-qa: exit 0 across 79 Supervisor + 58 Edition files (no brain file changes in v2.0.2)
- `test-edition-applyto-coverage`: 18/18 PASS, 0 capability gaps (no `applyTo` changes)

---

## [2.0.1] - 2026-05-19

**Patch — VS Code 1.120/1.121 feature adoption.** Three brain files updated to reflect VS Code capabilities that shipped between 2026-05-13 and 2026-05-19. Mirrored byte-for-byte from Supervisor per the shared-core direction-of-edit rule. Zero behavior change for heirs — additive informational text + one factual correction + one extension-recommendation update.

### Changed

- **`terminal-command-safety.instructions.md`** — documents two new VS Code mechanisms that work alongside the existing rules:
  - NEW section *VS Code 1.120 + 1.121 Terminal Output Compression (Preview)* names `chat.tools.compressOutput.enabled` and the 1.121 expansion to `pytest` / `jest` / `cargo test` / `tsc` / `cargo build` / `make` / linters / Docker / package managers, plus auto-dispose of background terminals.
  - *Terminal Hanging* rule #1 now notes that VS Code 1.121+ auto-promotes sync→background after a configurable idle-silence period; the agent-intent rule remains correct and is still required on older builds.
  - *Falsifier — Backtick Hazard* watermark bumped from "through 1.118" to "through 1.121" with note that 1.120/1.121 ship no fix for `microsoft/vscode#295620`. The temp-file pattern remains mandatory.
- **`session-health-monitoring.instructions.md`** — *Proxy Heuristics* opener corrected: VS Code 1.120 made BYOK token counts visible in the Chat-view context-window control. Opener now distinguishes BYOK (ground truth available) from non-BYOK / older builds (proxy heuristics still apply). Table below unchanged.
- **`markdown-mermaid/SKILL.md`** — *VS Code Extension Setup* updated: VS Code 1.121 ships built-in Mermaid rendering in Markdown previews per `microsoft/vscode#293028`. Recommendation list keeps mermaidchart (chart authoring), vstirbu (standalone preview tab), and non-Mermaid tools (PlantUML, Graphviz, D2). `bierner.markdown-mermaid` removed — the built-in renderer covers its use case.

### Out of scope (deliberate)

Three 1.120/1.121 features documented in the proposal but **not adopted** pending field data: `chat.tools.riskAssessment.enabled` (overlaps act-pass severity), Claude auto-permission mode (overlaps act-pass), and workspace-level forcing of `chat.tools.compressOutput.enabled` (still preview).

### Heir impact

None for the contract. Heirs on v2.0.0 reading the updated rules gain awareness of upstream-handled mechanisms; the rules themselves continue to fire correctly. No `--allow-major` needed; standard `/upgrade` covers it.

### Proposal + audit trail

- Proposal: `docs/proposals/vscode-1.120-1.121-adoption-2026-05-19.md`
- Supervisor commit: `b6dafc3` (origin/main)
- Brain-qa: exit 0 across 79 Supervisor + 58 Edition files
- `test-applyto-coverage`: 15/15 PASS, 0 capability gaps
- `test-edition-applyto-coverage`: 18/18 PASS, 0 capability gaps

---

## [2.0.0] - 2026-05-19

**Major — reasoning-quality release.** Same brain shape (36 instructions, 18 skills, 23 prompts, 16 muscles, 4 agents), same heir API surface, same `/upgrade` mechanism. Behavior changes are improvements to always-on reasoning disciplines that close measured coverage gaps in benchmark scenarios while reducing total credits-per-solved-problem. Major version bump signals that heirs upgrade via `--allow-major` and acknowledges that v2 reasoning IS measurably different from v1.5.0 (sharper verify-before-report, frame audits on explain frames, output-discipline gates).

Validated by:

- Compose verification benchmark (5 scenarios): **13/15 → 15/15 composite**, **-22.5% credits** (228.5 → 177.0)
- S360 real-world adoption: heir adopted on `main` 2026-05-19 and self-promoted `.act-heir.json` from `2.0.0-candidate` → `2.0.0` after multi-commit follow-through validation
- Tenet X demonstration in S360: v2 brain refused a stale templated instruction from Supervisor (exactly the failure mode the new rules were designed to catch)
- Terminal-safety fix empirical validation: 3 post-fix commits in S360 with `$env:TEMP` pattern, zero `.commit-msg.tmp` leaks (verified via `git show --stat`)

### Breaking

- **None for the heir contract.** File inventory unchanged. Heir-side `.act-heir.json`, scripts, `local/` skills, `HANDOFF.md`, `episodic/`, `workflows/` all preserved on upgrade.
- **Behavior changes are intentional** and visible: heirs will notice more verify-before-report patterns firing on search/summary work, more explicit frame-audit markers on "explain X" / "tell me how Y works" prompts, more by-name citations during disagreement-mode refusals. Net effect per benchmark + S360: better outcomes at lower cost, but takes a session to feel natural.
- **`--allow-major` required** on `node .github/scripts/upgrade-self.cjs` for heirs upgrading from any v1.x to v2.0.0.

### Added

- **`epistemic-calibration.instructions.md` Output-discipline subsection** (Phase 3.3) — Anti-Hallucination Signals table split into Input-discipline (existing 5 rows: claims about generation) and Output-discipline (3 new rows: claims about reporting):
  - `"No matches found"` / `"Verified clean"` / `"Nothing returned"` → verify search scope before reporting absence; cite paths/globs/file-count
  - `"The doc says X"` / `"Per README"` / `"According to spec"` → cross-check doc against filesystem; cite both
  - `"I checked and..."` / `"Verified that..."` → name what was actually checked; unattributed verification is theatre
  - Plus 4th Core Principle: *"A search that didn't run looks identical to a search that found nothing — verify the scope before reporting absence."*
- **`problem-framing-audit.instructions.md` Explain/Summarize Frame subsection** (Phase 5 Option C) — complementary discipline for summarization patterns the Output-discipline literal triggers don't catch:
  - Literal trigger phrases: `"Explain X"`, `"Tell me how Y works"`, `"Describe Z"`, `"Summarize <doc>"`, `"Read <file> and..."`, `"Walk me through..."`, `"What does <doc> say about..."`
  - Required action: name source file(s) read + cross-check ≥1 structural claim against filesystem; if doc and filesystem disagree, surface the gap and report both
  - Visible marker: `**Verified against**: <doc path> + <filesystem check>`
- **`terminal-command-safety.instructions.md` temp-file location guidance** — closes a heir-reported defect (the `git commit -F tmpfile` + `git add -A` interaction silently committed temp message files into commits):
  - Warning paragraph: place temp files outside the working tree (`$env:TEMP\<slug>.txt` on Windows, `/tmp/<slug>.txt` on Unix) OR add the pattern to `.gitignore` before staging
  - Preferred PowerShell template using `Join-Path $env:TEMP` + `Set-Content -NoNewline` + `git commit -F` + `Remove-Item`

### Changed

- **3 instruction files** updated (see Added above for the substantive changes):
  - `.github/instructions/epistemic-calibration.instructions.md`
  - `.github/instructions/problem-framing-audit.instructions.md`
  - `.github/instructions/terminal-command-safety.instructions.md`
- **`.github/VERSION`** bumped 1.5.0 → 2.0.0.
- **File inventory unchanged** at 36 instructions / 18 skills / 23 prompts / 16 muscles / 4 agents.
- **Always-on token growth: ~+908 tokens/session** (~+3632 bytes across the 3 instruction files). Trade is net-positive per benchmark: -22.5% credits across the 5-scenario Compose set; breakeven at ~1 avoided corrective turn per 10 sessions; observed rate in benchmark + S360 is 2-3+ per 10.

### Scope correction

A pre-flight diff during release prep reported 46 files differing between Edition v1.5.0 and the v2 candidate workspace. On verification (parent-commit checkout + spot-check) the 43 "accumulated v2-candidate dev" files were already byte-identical to Edition v1.5.0; the apparent difference was line-ending normalization (CRLF in Edition vs LF in the v2 candidate scratch workspace) that git smooths over at commit time. The **actual v2.0.0 release scope is 3 instruction files** (Phase 3.3 + Phase 5 + terminal-safety) plus VERSION + CHANGELOG. This entry was corrected before push.

### Upgrade

```pwsh
node .github/scripts/upgrade-self.cjs --allow-major
```

Heirs preserve all of: `skills/local/`, `.act-heir.json`, `HANDOFF.md`, `episodic/`, `workflows/`, `scripts/` (heir-specific), `docs/`, all non-`.github/` content. Heir-doctor may surface cosmetic warnings on first run if the heir's `edition-manifest.json` is stale; they clear after upgrade completes.

### Why

The v1 line optimized brain size; v2 optimizes brain *outcomes*. The Phase 1 baseline benchmark surfaced one real coverage gap (output-verification — verify before reporting search/doc claims, scored 2/3 not 3/3 in S4 and S7). Phase 2 dual audit of all 17 always-on rules produced 1 Grow / 8 Compose / 8 Unchanged / 0 Shrink / 0 Restructure — confirming the brain isn't bloated, it's a tightly composed system where every rule earns its cost. Phase 3 applied the Grow (epistemic-calibration Output-discipline). Phase 5 added the complementary Explain/Summarize frame for surface patterns the Phase 3 literal triggers miss. Terminal-safety added the temp-file location guidance to close a heir-reported defect that hit S360 twice.

The release reaches Edition because S360 adopted v2 candidate in real-world product work on 2026-05-19 and demonstrated all the predicted improvements PLUS a real Tenet X self-correction moment (v2 brain refused a stale Supervisor instruction). Real-world signal outweighs synthetic benchmark for ship/no-ship decisions.

### Falsifiability

This release is wrong if any of the following occur within 14 days:

- ≥2 heirs report behavior regressions traceable to Phase 3.3 or Phase 5 changes (triggers partial rollback or v2.0.1 fix-forward)
- The terminal-safety fix doesn't prevent a `.commit-msg.tmp`-class leak in a heir that upgrades to v2.0.0
- S360 reverts its `.act-heir.json` marker from `2.0.0` back to `2.0.0-candidate` or below (the bellwether heir)
- A fleet-cost regression appears that wasn't visible in the 5-scenario benchmark (triggers the Phase 6.2 light re-baseline that was deferred)

If any fire: cut v2.0.1 with fix; document in Supervisor's `brain-qa-changelog.md` tagged `[V2-REGRESSION]`.

### References

- Launch proposal: `docs/proposals/edition-v2-launch-2026-05-19.md`
- Benchmark data: `benchmark/v2-candidate-baseline.md`
- Plan: `PLAN-v2-REASONING.md`

---

## [1.5.0] - 2026-05-18

Minor — converter-qa harness restoration + complete-coverage tests for all converters (PNG + SVG image handling verified end-to-end).

### Added

- **converter-qa suites for previously uncovered converters**:
  - `md-to-html.cjs: end-to-end + image handling` — structural HTML (DOCTYPE, CSS, headings, lists, tables, links, blockquotes, code), PNG embedding (data URI or referenced), SVG handling (inline / data URI / `<img>` ref)
  - `md-to-txt.cjs: strip formatting + preserve image alt text` — formatting markers removed (`**`, `*`, backticks, `#`, `|`), content + image alt text preserved
  - `html-to-md.cjs: structure + image preservation` — headings (ATX or setext), bold/italic, bullet + numbered lists, tables (pipe / simple / grid form), links, blockquotes, code, PNG + SVG image refs preserved with alt text
  - `docx-to-md.cjs: round-trip + image extraction` — md → docx → md via md-to-word leg + docx-to-md leg; headings, lists, tables, and image extraction (or inline ref preservation) verified
- **`md-to-word.cjs: [toc] marker warn-and-ignore` suite** — confirms v1.4.0 behavior (warning logged when `[toc]` marker found without `--toc`, marker stripped from body, output docx has no TOC field)
- **Font + margin value assertions** added to `md-to-word.cjs: table styling regression` suite — header `w:sz="18"` (9pt), data `w:sz="17"` (8.5pt), cell margins `w:w="20"` (1pt T/B) + `w:w="60"` (3pt L/R). Catches the v1.4.0 numeric changes that previously flowed through silently
- **`createImageFixtures` helper** in converter-qa — generates a minimal 1x1 PNG (67 bytes, embedded as binary literal) + a labeled SVG fixture for use across the new converter suites
- **SVG image section** added to `docs/testing/md-to-word-coverage.md` regression corpus

### Removed

- **4 dead test suites** referencing modules that no longer exist:
  - `Shared: replicate-core.cjs` (3 suites: base, batch retry & validation, negative-prompt & prompt-file)
  - `Shared: svg-pipeline.cjs`
  - These were pre-Edition artifacts from a Replicate AI image-gen + SVG pipeline that has been out of the brain for some time. The harness FATALed on the first missing module, blocking the entire test run
- **2 obsolete callout assertions** in `Shared: markdown-preprocessor.cjs` suite — `::: tip` and `> [!WARNING]` callout transformation tests. The preprocessor never implemented these (always returned input unchanged), and the syntaxes aren't part of any active Edition workflow. If callout rendering is needed in the future, separate feature request
- **2 file-inventory checks** for `shared/replicate-core.cjs` and `visual-memory.json` (also no longer exist)

### Changed

- `converter-qa.cjs` internal version 1.2.0 → 1.3.0; JSDoc updated to reflect new suite list and assertion count (284 → 256 after dead-suite removal + new-suite additions; net: cleaner)

### Why

User request: "make sure all other converters do a complete job" with explicit "mds can contain svg and png images, make sure they are supported by the converters." Before this release, only `md-to-word` and `md-to-eml` had dedicated suites; the other 4 converters had zero coverage, and the harness FATALed at startup so even existing suites couldn't run end-to-end. Result: **256 PASS, 0 FAIL, 4 SKIP** (skips are pandoc-availability checks when pandoc is missing in CI, plus adm-zip on systems without it).

### Falsifiability

If a converter regresses on PNG or SVG handling in a future change, the new suites will catch it. If callout syntax becomes a real requirement, add the feature to `markdown-preprocessor.cjs` and re-add the assertions (or new ones) — the prior version is in git history.

---

## [1.4.0] - 2026-05-18

Minor — `md-to-word` table tightening + `[toc]` marker honors documented default.

### Changed

- **`muscles/md-to-word.cjs` table styling** (internal muscle version 5.4.0 → 5.5.0):
  - Header font: 10pt → **9pt** (`w:sz` 20 → 18) — still bold white on Microsoft blue
  - Data cell font: 9pt → **8.5pt** (`w:sz` 18 → 17)
  - Cell margins: T/B 40 twips (2pt) → **20 twips (1pt)**, L/R 80 twips (4pt) → **60 twips (3pt)**
  - Visible effect: denser, more reference-document-style tables; same colors, borders, and zebra striping
- **`muscles/md-to-word.cjs` `[toc]` marker semantic**: previously, a `[toc]` line in the source silently set `args.toc = true`. Now the marker line is still stripped from the source, but TOC is **not** auto-enabled. A warning is logged so the heir can either pass `--toc` explicitly or remove the marker. Aligns the skill with its documented default (`--toc | off`).
  - Version-management note: classified as **minor** rather than major because the `[toc]` auto-detect was never in the skill's documented Options table — it was a side-effect of the preprocessor. Removing an undocumented side-effect to honor the documented default is a quality fix, not a breaking change to the documented contract. Heirs whose source files use `[toc]` AND who don't pass `--toc` will see the warning in their next conversion run and can adjust trivially. If a heir reports regression within 14 days, fallback is v1.4.1 reverting just the `[toc]` semantic.
- `skills/md-to-word/SKILL.md` — Options table notes new `[toc]` marker behavior; Table Formatting section reflects 9pt/8.5pt fonts and 1pt/3pt padding; Version History gains v5.5.0 row; currency + lastReviewed stamped 2026-05-18.

### Added

- `docs/testing/md-to-word-coverage.md` — regression corpus exercising every markdown feature the skill claims to support (H1-H6, inline formatting, all list types, tables with alignment and pagination, code blocks in multiple languages, blockquotes including nested, horizontal rules, footnotes, PNG image refs, Mermaid flowchart / sequence / state / class diagrams). Includes a 21-item verification checklist for post-conversion spot-check, and a TOC-marker behavior test procedure.

---

## [1.3.4] - 2026-05-18

Patch — heir discoverability of the AI-Memory formal contract.

### Changed

- `skills/ai-memory-setup/SKILL.md` — added "Formal contract" subsection pointing heirs at `AI-Memory/SCHEMA.md` (the Supervisor-maintained contract document covering subfolder ownership, frontmatter, and lifecycle rules). Folder Structure tree updated to show `SCHEMA.md` at root.
- `skills/ai-memory-setup/SKILL.md` § Write Feedback — aligned filename format and frontmatter description to the canonical shape in SCHEMA.md (filename now `YYYY-MM-DD-<heir-id>-<short-slug>.md`; frontmatter keys `date`, `heir_id`, `severity`, `category` — lowercase, matches what Supervisor expects when triaging).

No behavior change. Purely heir-facing documentation alignment so the deployed spec and the Supervisor-side contract agree.

---

## [1.3.3] - 2026-05-18

Final cleanup of the handoff-tier convention introduced in v1.2.2. Reading side now agrees with the writing side: prior-session context comes from repo-root `HANDOFF.md` first, session memory only as legacy fallback.

### Fixed

- **`instructions/proactive-awareness.instructions.md`** Cross-Session Context Recovery (PA1): Step 1 now checks repo-root `HANDOFF.md` first (the canonical cross-session handoff per `memory-triggers.instructions.md`). Session memory becomes Step 2, labeled as "legacy/secondary signal" with an explicit note that any handoff content there predates the v1.2.2 tier convention. Surface-context table updated to recognize `HANDOFF.md present with recent content` as the primary trigger.

### Why

v1.2.2 + v1.3.1 + v1.3.2 fixed the *write* side (where handoff content goes). The *read* side (`proactive-awareness` Step 1) was still pointing at `/memories/session/` as the primary source for prior-session context. Symmetry now holds: write to `HANDOFF.md`, read from `HANDOFF.md`.

### Verification

- brain-qa exit 0 (58 Edition files)
- test-edition-applyto-coverage 18/18 PASS, 0 gaps

---

## [1.3.2] - 2026-05-18

Internal consistency fix for the handoff-tier convention shipped in v1.2.2 + v1.3.1. Two files still routed handoff content to ephemeral session memory — the exact pattern s360 originally flagged.

### Fixed

- **`skills/meditation/SKILL.md`** Extract routing table: replaced `Session continuity for next chat → /memories/session/<name>.md` with `Cross-session handoff (next session needs to know) → repo file (HANDOFF.md at repo root) — NOT session memory`. The skill's Extract step now agrees with its Handoff step (Step 5) and with `memory-triggers.instructions.md` / `save-session-note.prompt.md`.
- **`skills/meditation/SKILL.md`** Step 5 (Handoff): renamed `SESSION-HANDOFF.md` → `HANDOFF.md`. v1.3.1's rename had missed this SKILL.md file (caught in heir-aware spot-check).
- **`instructions/session-health-monitoring.instructions.md`** Graceful Handoff section: was telling the agent to write state + completed work + next steps + pending decisions to `/memories/session/[name].md` (which clears at conversation end). Now routes to repo-root `HANDOFF.md` with an explicit "session memory is for in-conversation scratch only" clarifier.

### Verification

- brain-qa exit 0 (58 Edition files)
- test-edition-applyto-coverage 18/18 PASS, 0 gaps
- Zero `write /memories/session/...` handoff misroutings remaining in the live brain tree (verified via grep)

---

## [1.3.1] - 2026-05-18

Naming clarity + zero-behavior-change refactor. Per proposal `docs/proposals/prompt-overlap-audit-2026-05-18.md` (Supervisor side).

### Changed

- **Session-handoff artifact unified on `HANDOFF.md`** (was `SESSION-HANDOFF.md`). Per user instruction: "saved in root... always use root, like we did here". Updated 4 files in lockstep:
  - `instructions/meditation.instructions.md`
  - `prompts/meditate.prompt.md`
  - `prompts/note.prompt.md`
  - `prompts/save-session-note.prompt.md`

  This unifies with the convention `memory-triggers.instructions.md` ships in v1.2.2 (cross-session continuity → repo file `HANDOFF.md`, not session memory). The two filenames were a naming inconsistency introduced earlier today; v1.3.1 fixes it.

  `save-session-note.prompt.md` includes a legacy-migration note: if a heir still has `SESSION-HANDOFF.md` at root from before this rename, the prompt mentions it during confirm — the heir manually reviews and either merges into `HANDOFF.md` or deletes the legacy file. Never silently discards content.

- **`welcome` baseline extracted to config** — the user-scope VS Code settings payload that `/welcome` applies and `/welcome-verify` audits previously lived duplicated in both prompt files. Future drift trap removed by extracting to `.github/config/welcome-baseline.json` as the single source of truth. Both prompts now load from there. Updated `sync-policy.json` to mark the new config file as `edition_owned` (overwritten on upgrade).

### Added

- **`.github/config/welcome-baseline.json`** — the VS Code user settings baseline applied by `/welcome` and audited by `/welcome-verify`. Edit once, both prompts pick it up.

---

## [1.3.0] - 2026-05-18

Tier 3 token rationalization: port of verified Supervisor trims plus load-bearing Tenet X discipline added to the always-on ACT pass. Always-on body tokens: 12,467 → 11,863 (-604, -4.8%). Zero capability regression — verified by `scripts/test-edition-applyto-coverage.cjs` (18/18 scenarios pass). Per proposal `docs/proposals/edition-optimization-2026-05-18.md` (Supervisor side, Batch 2).

### Added

- **`act-pass.instructions.md` § Self-Application (Tenet X always-on hook)**: 6-row pattern/signal/correction table (reasoning theatre, hedge laundering, authority deference, symmetric balance, adversarial-probe skip, self-flattering meta-cognition) so the always-on pass enforces the Tenet X discipline. Previously this discipline lived only in `act-foundations` (which is now scoped on the Supervisor side; will be evaluated for Edition in a later batch).
- **`tool-awareness-categories.instructions.md`** (NEW, scoped): Common deferred tool categories table moved out of `tool-awareness.instructions.md` to a scoped sibling that loads only on tool/MCP/GitHub/browser/notebook work. Always-on file shrinks; reference table still available where needed.

### Changed

- **`communication-craft.instructions.md`** trimmed (989 → 660 tokens): dropped Explaining Concepts §2, Tone Anti-Patterns, Integration table; kept SBI + stakes + voice + audience lead + needs/solutions tables. LLM-inherited communication behaviors no longer need always-on reinforcement.
- **`session-health-monitoring.instructions.md`** trimmed (774 → 398 tokens): dropped High-Token-Cost Operations table (duplicates `tool-awareness`), Session Memory Template (operational on-demand), Integration section; kept proxy heuristics + warning signs + checkpoints + handoff.
- **`emotional-intelligence.instructions.md`** trimmed (658 → 468 tokens): collapsed Adaptation Rules verbose sections to single 4-row table; kept signal detection table + mimicry prevention as one paragraph.
- **`knowledge-coverage.instructions.md`** trimmed (425 → 244 tokens): compressed KS2 pre-response assessment + KS3 visible-badge logic to taxonomy table + brief rule.
- **`tool-awareness.instructions.md`** trimmed (499 → 263 tokens): moved Common Deferred Tool Categories table to new scoped `tool-awareness-categories.instructions.md`; kept core Rules + External Ingest.

### Falsifiability watch (2 weeks)

If reasoning quality degrades within 2 weeks (sycophancy returns, alternatives missed, instructions ignored), the most likely culprit is the `act-pass` Tenet X addition or the `tool-awareness` split. Revert in that order. Falsifier closes 2026-06-01.

---

## [1.2.2] - 2026-05-18

### Fixed

- **`memory-triggers.instructions.md`**: Clarified that session-handoff documents live in repo `HANDOFF.md`, not in `/memories/session/` (which is cleared at conversation end). Per heir feedback (s360, 2026-05-09 `handoff-tier-confusion`): the natural phrase "session handoff" reads like exactly what session memory is for, but session memory is by-design ephemeral. The Memory Tier Selection table now distinguishes "Cross-session handoff (next session needs to know)" from "In-conversation scratch (current session only)". New § "Cross-Session Continuity" makes the rule explicit. Trigger Conditions table now points the "Session > 30 min OR end-of-session" trigger at the repo file rather than a generic "Handoff" prompt.

---

## [1.2.1] - 2026-05-13

### Added

- **Brain audit trifecta**: Added `brain-audit.instructions.md`, `skills/brain-audit/SKILL.md`, and `/audit-brain` workflow support.
- **Dedicated audit worker**: Added `agents/brain-auditor.agent.md` for deterministic local Edition audits.
- **Mall refresh workflow**: Added drift-aware `/mall refresh` support and docs wiring for curated-subset states.

### Fixed

- **Audit robustness**: Hardened Edition audit flows for template context and npm probe handling.

### Changed

- Propagated Supervisor-side audit remediations into Edition artifacts.

---

## [1.2.0] - 2026-05-05

### Added

- **Mall contribute prompt**: New `/mall contribute` command for submitting plugins to the Plugin Mall.
- **Tool awareness instruction**: New `tool-awareness.instructions.md` documenting deferred tools and external ingest.

### Fixed

- **Instruction count**: 33 → 34 across documentation (README, copilot-instructions).
- **converter-qa stale currency tag**: Updated to current date.

### Removed

- **`/fleet` prompt**: Moved to Supervisor scope (not heir-relevant).

---

## [1.1.0] - 2026-05-05

### Added

- **Tool awareness instruction**: New `tool-awareness.instructions.md` documents deferred tools (require `tool_search` before use) and external ingest for remote/virtual workspaces (VS Code 1.118/1.119).
- **VS Code 1.118 agentic execution sub-tool note** in `terminal-command-safety.instructions.md`: documents output pre-filtering behavior and when redirect-to-file fallback is still needed.
- **AI-Memory knowledge index**: Heirs now pointed to `AI-Memory/knowledge/index.json` for on-demand reference material.
- **Extension scaffold relocated**: VS Code extension moved to independent repo `Alex_ACT_Extension`.

### Fixed

- **23 epistemic-integrity findings resolved** across 19 brain files (ABS01x4, OVR01x1, REV01x18): added revision conditions, qualified absolute claims, and sourced authority claims. Epistemic integrity score: 91 to 100/100.
- **Stale references**: `/find-skill` to `/mall search`, `/install-from-mall` to `/mall install`, corrected skill/instruction counts.
- **Cross-platform improvements**: Path resolution and file handling.

### Changed

- Removed `.github-v0` pre-refactor brain backup (no longer needed post-v1.0.0).
- Project docs (PLAN, decisions/) relocated to the development workspace.

---

## [1.0.0] - 2026-05-02

The v1 brain refactor: a complete restructure of the cognitive architecture for clarity, token efficiency, and maintainability. Every instruction, skill, prompt, and muscle was re-evaluated, clustered, trimmed, or consolidated.

### Breaking

- **Architecture table replaced**: `copilot-instructions.md` now describes 8 functional clusters (was 7 generic domains). Heir `copilot-instructions.local.md` that reference old domain names ("Reasoning", "Learning", "Growth") should update.
- **6 converter instructions consolidated into 1**: `docx-to-md`, `html-to-md`, `md-to-html`, `md-to-txt`, `md-to-word`, `md-to-eml` instructions replaced by single `converter.instructions.md`. Format-specific logic stays in skills. Heirs with custom converter references should update to `/convert`.
- **`plugin-store-routing` removed**: Absorbed into `mall-installation.instructions.md`. Heirs referencing it by name should update.
- **5 instructions demoted from always-on to conditional**: `alternatives-and-tradeoffs`, `agent-delegation`, `partnership-charter`, `worldview`, `creative-loop`. They still fire on relevant file patterns and conversational context, but no longer consume always-on token budget.
- **`upgrade-self.cjs` major-version path now backs up and recreates**: Major bumps trigger backup + fresh install + recovery of heir-owned content (was in-place overwrite). Requires `--allow-major`.
- **`.github/episodic/**` is now heir-owned**: Was edition-owned (silently wiped on upgrade). Meditations, post-mortems, and calibration logs are preserved.

### Added

- **AI-Memory setup**: new standard skill (`ai-memory-setup`) with 8-provider cloud drive discovery (OneDrive, iCloud, Dropbox, Google Drive, Box, MEGA, pCloud, Nextcloud), auto-create, CLI (`_registry.cjs --discover/--init/--resolve`), and `cognitive-config.json` persistence (`ai_memory_root`, `ai_memory_exclude`).
- **`bootstrap-heir.cjs --ai-memory` flag**: Explicit cloud drive selection during bootstrap. Auto-creates AI-Memory and persists the choice.
- **`ACT.md` onboarding note**: Generated on bootstrap with project-aware plugin recommendations based on detected tech stack.
- **Heir-added artifact relocation**: `upgrade-self.cjs` detects artifacts heirs placed in edition-owned paths and relocates them to `local/` automatically (incremental and major paths).
- **Deprecated file cleanup**: `upgrade-self.cjs` removes files that Edition no longer ships.
- **Pass 3.5 (Episodic Memory)** in `finalize-migration.prompt.md`: Guides heirs to restore episodic files during migration.
- **Plugin Mall v2 integration**: `/mall search` and `/mall install` prompts, `plugin.json` manifests, shape/engines/token_cost metadata, CATALOG.json v2.1.
- **Worker subagents**: `markdown-author`, `illustrator`, `document-assembler` for delegated mechanical work.
- **`edition-manifest.json`**: Machine-readable inventory of shipped skills, prompts, agents. Used by `heir-doctor.cjs` (replaces stale hardcoded allowlists).
- 17 skills (was 11), 20 prompts (was 19), 3 agents (new), 20 muscles.

### Fixed

- Mall repo name: all `gh api` and `git clone` URLs updated from `Alex_ACT_Plugin_Mall` to `Alex_Skill_Mall` (the actual GitHub repo name).
- Episodic wipe on upgrade: moved `.github/episodic/**` from `edition_owned` to `heir_owned` in `sync-policy.json`.
- Episodic drop on migration: removed `episodic/` from `EXTENSION_ONLY` patterns in `migrate-to-edition.cjs`.
- `heir-doctor.cjs` false positives: now reads `edition-manifest.json` instead of hardcoded allowlists.
- AI-Memory path resolution: standardized across all artifacts (was 6 different hardcoded candidate lists). Now all flow through `cognitive-config.json` override + auto-discovery.
- Windows reparse points: cloud drive folders with `ReparsePoint` attribute (common for OneDrive) now detected by `_registry.cjs`.

### Changed

- Always-on token budget: 25,835 (v0.9.1) to 13,886 (v1.0.0). 46% reduction.
- Context-loaded artifacts: 79 (v0.9.1) to 73 (v1.0.0). 10 converters consolidated, 1 absorbed.
- Instructions: 37 (v0.9.1) to 33 (v1.0.0). DRY pass removed redundancy.
- `copilot-instructions.md` Architecture table: 7 generic domains replaced with 8 functional clusters matching actual artifact organization.
- `README.md`: Updated all artifact counts, removed stale references.

## [0.9.9] - 2026-05-02

Phase 0-9b of the v1 brain refactor. All 59 capabilities migrated and verified.

## [0.9.1] - 2026-04-30

Fleet pull-based architecture, heir self-update, Mall v2 design.

## [0.9.0] - 2026-04-30

Edition brain reset from AlexMaster. Clean baseline for v1 refactor.

## [0.7.0] - 2026-04-28

Initial Mall integration, converter improvements, mermaid fidelity.

## [0.6.2] - 2026-04-29

Mermaid viewport fix, ZWSP checkbox fix, banner cross-reference.
