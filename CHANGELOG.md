# Changelog

All notable changes to Alex ACT Edition.

## [1.2.1] - 2026-05-13

### Added

- **Brain audit baseline**: Bundled Edition updates including the `brain-auditor` agent and brain-audit trifecta workflow.

### Fixed

- **Brain sync completeness**: Extension `brain/` now mirrors latest Edition `.github` contents (excluding episodic state).
- **Metadata drift**: Updated extension-facing counts and docs to 35 instructions, 18 skills, 23 prompts, 4 agents, 21 muscles.

### Changed

- Refreshed extension README from latest Edition content (marketplace banner path preserved as PNG).

## [1.2.0] - 2026-05-05

### Added

- **tool-awareness instruction**: New instruction for VS Code tool system awareness (deferred tools, external ingest). Brings instruction count from 33 to 34.

### Changed

- Version alignment with Alex_ACT_Edition v1.2.0.

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
