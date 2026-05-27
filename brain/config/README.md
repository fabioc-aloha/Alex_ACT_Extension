# `.github/config/`

Brain-runtime configuration files. Read by always-on instructions and slash prompts.

## Ownership

| File | Owner | Behavior on upgrade | Read by |
|------|-------|---------------------|---------|
| `edition-manifest.json` | Edition | Overwritten | `.github/scripts/build-edition-manifest.cjs` (generator), `.github/scripts/upgrade-self.cjs`, `.github/skills/greeting-checkin/scripts/heir-doctor.cjs` |
| `welcome-baseline.json` | Edition | Overwritten | `.github/prompts/configure-vscode.prompt.md`, `.github/prompts/configure-vscode-verify.prompt.md` |
| `cognitive-config.json` | Heir | First-installed, then frozen | `knowledge-coverage.instructions.md` (e.g. `showConfidenceBadge`), `feedback.prompt.md`, `initialize.prompt.md`, `mall-contribute.prompt.md`, `.github/scripts/_registry.cjs` (AI-Memory bus resolution) |
| `README.md` | Edition | Overwritten | This file |

## Sync policy lives in code, not config

The edition-owned vs heir-owned glob lists used to live in `.github/config/sync-policy.json`. They moved inline to `.github/scripts/_registry.cjs` as the `EDITION_OWNED` and `HEIR_OWNED` exports. Policy now lives with the scripts that consume it (`bootstrap-heir.cjs`, `upgrade-self.cjs`, `heir-doctor.cjs`) — one source of truth, no risk of code-vs-config drift.

## Adding Your Own Configs

If you author a local instruction or skill that needs a config file, drop it in `.github/config/local/` so Edition upgrades never touch it. Heir-owned by convention.

## Notes

- The Edition copy of `cognitive-config.json` is a template rendered by `bootstrap-heir.cjs` on first install. Once a heir has its own copy, Edition upgrades leave it alone (declared `HEIR_OWNED` in `_registry.cjs`).
- VS Code editor assets (markdown preview theme, workspace settings, recommended extensions) belong in `.vscode/`, not here. Edition ships `.vscode/markdown-light.css` (edition-owned, refreshed on `/upgrade`) for Mermaid-friendly markdown preview; activate it via `"markdown.styles": [".vscode/markdown-light.css"]` in your settings. The `/polish-mermaid-setup` prompt documents the activation step.
