# The Edition Template

The brain that Alex ships with is not built inside the Extension. It is built in a separate public repository called **Alex_ACT_Edition**, then bundled into the Extension at release time. This page explains the relationship, how versioning works, and how to use Edition directly without the Extension.

## Two repos, two versions

| Repo | What it is | Version track |
| --- | --- | --- |
| **Alex_ACT_Edition** | The canonical brain: instructions, skills, prompts, agents, scripts, config | Edition version (e.g. v3.0.0) |
| **Alex_ACT_Extension** | The VS Code Marketplace delivery channel that bundles the brain | Extension version (e.g. v9.0.0) |

The Extension pins a specific Edition tag at build time. The brain files inside `brain/` are byte-identical to that tag. You can verify this yourself:

```bash
# Inside the Extension repo
node scripts/audit-brain-faithfulness.cjs
```

The audit compares every file in `brain/` against the pinned Edition tag and reports mismatches.

## Why two version numbers?

The Extension has its own lifecycle (activation code, commands, walkthrough, Marketplace metadata) independent of the brain content. A brain refresh that adds a new skill is an Edition bump; a bug fix in `extension.js` that does not change the brain is an Extension-only bump.

| Change | What bumps |
| --- | --- |
| New skill, instruction, or prompt in the brain | Edition (minor or major) |
| Breaking change to brain contracts (removed files, renamed conventions) | Edition (major) + Extension (major) |
| Fix in `extension.js` only | Extension (patch) |
| New Extension command or walkthrough step | Extension (minor) |

The CHANGELOG in the Extension repo documents both tracks. Each entry names the brain version it bundles.

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

1. The Supervisor cuts an Edition release (tagged, e.g. `v3.0.0`).
2. The Extension rebuilds its `brain/` folder against the new tag.
3. The Extension ships to the Marketplace with a new version number.
4. On next VS Code update, users get the new brain automatically.
5. Running `/upgrade` in chat applies the new brain to the workspace's `.github/` folder.

Steps 1-4 happen without user action. Step 5 is opt-in per workspace — Alex never overwrites your local customizations without asking.

## Edition marker

Every bootstrapped workspace contains `.github/.act-heir.json` — a marker file that records which Edition version was last applied:

```json
{
  "edition_version": "3.0.0",
  "bootstrapped_at": "2026-05-27T10:00:00Z",
  "upgraded_at": "2026-05-27T10:00:00Z"
}
```

The `/upgrade` command reads this marker to determine whether a newer Edition is available and what changed since the last upgrade.

## Source

- **Edition repo**: [github.com/fabioc-aloha/Alex_ACT_Edition](https://github.com/fabioc-aloha/Alex_ACT_Edition)
- **Extension repo**: [github.com/fabioc-aloha/Alex_ACT_Extension](https://github.com/fabioc-aloha/Alex_ACT_Extension)
