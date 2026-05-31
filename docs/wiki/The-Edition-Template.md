# The Edition Template

The brain that Alex ships with is not built inside the Extension. It is built in a separate public repository called **Alex_ACT_Edition**, then fetched by the Extension from GitHub on demand. This page explains the relationship, how versioning works, and how to use Edition directly without the Extension.

## Two repos, two versions

| Repo | What it is | Version track |
| --- | --- | --- |
| **Alex_ACT_Edition** | The canonical brain: instructions, skills, prompts, agents, scripts, config | Edition version (e.g. v3.2.0) |
| **Alex_ACT_Extension** | The VS Code Marketplace delivery channel that fetches the brain on demand | Extension version (e.g. v9.4.0) |

Starting with Extension v9.4.0, the Extension does **not** bundle the brain in the VSIX. On `Bootstrap This Workspace` or `Upgrade Brain`, it downloads the latest tagged Edition release from GitHub, validates the manifest contract (spec 1.4 minimum), and installs the declared subtrees into your project. See [ADR-009](https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/docs/adrs/ADR-009-extension-github-fetch-brain.md) for the rationale.

If a fetch fails, run **Alex ACT: Diagnose Fetch** from the Command Palette — it reports cache state, last fetch outcome, GitHub auth mode, and the heir marker fields needed to triage the failure.

## Why two version numbers?

The Extension has its own lifecycle (activation code, commands, walkthrough, Marketplace metadata) independent of the brain content. An Edition release that adds a new skill ships immediately to all heirs through the fetch path — no Extension republish required. An `extension.js` fix or new command bumps the Extension only.

| Change | What bumps |
| --- | --- |
| New skill, instruction, or prompt in the brain | Edition (minor or major) |
| Breaking change to brain contracts (removed files, renamed conventions) | Edition (major) + Extension (major, if it raises `min_extension_version`) |
| Fix in `extension.js` only | Extension (patch) |
| New Extension command or walkthrough step | Extension (minor) |

The CHANGELOG in the Extension repo documents Extension changes. Edition's CHANGELOG documents brain changes. The Extension is no longer pinned to a specific Edition tag — heirs always receive the latest Edition release that satisfies `min_extension_version`.

## How to check your version

In VS Code, open the chat and ask:

> *"What Edition version is this brain?"*

Alex reads `.github/VERSION` (inside your project's bootstrapped brain) and reports it. You can also check directly:

```bash
cat .github/VERSION
```

## Using Edition directly (without the Extension)

Edition is a **public GitHub template repository**. If you prefer not to use the Marketplace extension, you can use the template directly:

1. **Use as template** — click "Use this template" on [github.com/fabioc-aloha/Alex_ACT_Edition](https://github.com/fabioc-aloha/Alex_ACT_Edition) to create a new repo with the brain pre-installed.
2. **Copy `.github/`** — clone Edition and copy its `.github/` folder into any existing project.
3. **Stay current** — pull from the Edition repo when new versions release (or use the Extension's `/upgrade` command if you switch to the Marketplace path later).

The Extension adds convenience (one-click bootstrap, upgrade command, walkthrough, Marketplace auto-updates) but the brain works identically whether delivered by the Extension or copied manually from the template.

## Upgrade lifecycle

When a new Edition version ships:

1. The Supervisor cuts an Edition release (tagged, e.g. `v3.2.0`).
2. The Edition release tarball is immediately reachable at `codeload.github.com/fabioc-aloha/Alex_ACT_Edition/tar.gz/refs/tags/vX.Y.Z`.
3. On VS Code startup in a heir workspace, the Extension silently checks for a newer Edition release (ETag-conditional, 24h-inhibited per `(current, latest)` version pair).
4. If a newer release exists, an information message offers **Upgrade now** / **Later** — no Marketplace republish required.
5. Running `/upgrade` in chat (or clicking **Upgrade now**) applies the new brain to the workspace's `.github/` folder. Alex never overwrites your local customizations without asking.

The Extension itself only republishes when its host code changes (new command, fixed bug, raised `min_extension_version` floor).

## Edition marker

Every bootstrapped workspace contains `.github/.act-heir.json` — a marker file that records which Edition version was last applied and how it got there. As of Extension v9.4.0 the marker uses `marker_schema_version: 2` (the contract version is declared by Edition's `extension-contract.json` and read at install time):

```json
{
  "spec_version": "2",
  "heir_id": "your-heir",
  "edition_version": "3.2.0",
  "source": "github-fetch",
  "commit_sha": "abc123...",
  "fetched_at": "2026-05-31T10:00:00Z",
  "auth_mode": "anonymous",
  "extension_version": "9.4.0",
  "marker_schema_version": 2
}
```

The `/upgrade` command and the activation-time version check read `edition_version` to determine whether a newer Edition is available; `ACT: Diagnose Fetch` surfaces the full marker for bug reports. Workspaces bootstrapped by older Extensions carry the v1 shape (no `source` / `commit_sha` / `fetched_at` / `auth_mode` / `marker_schema_version`); the migration to v2 is silent on first upgrade.

## Source

- **Edition repo**: [github.com/fabioc-aloha/Alex_ACT_Edition](https://github.com/fabioc-aloha/Alex_ACT_Edition)
- **Extension repo**: [github.com/fabioc-aloha/Alex_ACT_Extension](https://github.com/fabioc-aloha/Alex_ACT_Extension)
