# Alex: Artificial Critical Thinking for GitHub Copilot

> [!IMPORTANT]
> **Deprecated and no longer maintained.** This VS Code Extension and its
> Edition-fetch delivery path receive no new brain fixes, host compatibility
> updates, or feature releases. Version 9.5.9 is the final planned release and
> exists to deliver this migration notice. Do not use **Bootstrap This
> Workspace** or **Upgrade Brain** for new installations. Install the supported
> plugin-native Alex ACT 1.0.0 constellation from
> [Alex ACT Core](https://github.com/fabioc-aloha/Alex_ACT_Core).

## Migrate to plugin-native Alex ACT

1. Commit or back up the workspace and preserve project-owned local
   customizations.
2. Disable or uninstall this Extension so it cannot bootstrap or upgrade the
   retired Edition tree.
3. Remove old Edition-managed brain files only after separating them from
   project-owned `.github` files and local customizations.
4. Follow the [current installation guide](https://github.com/fabioc-aloha/Alex_ACT_Core/blob/main/INSTALL.md):
   register `alex-mall`, install `alex-act-manager@alex-mall` and
   `alex-act-core@alex-mall`, reload the host, then run
   `/alex-act-manager install-constellation`.
5. Restore only the local customizations you still need and verify all six
   activation planes with `/alex-act-manager plugin-status`.

The former Extension wiki is retained as historical documentation. Its
[plugin-native migration guide](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Migrating-to-Plugin-Native-Alex-ACT)
contains the detailed workspace cleanup boundary.

Alex ACT Extension turns GitHub Copilot from a confident assistant into a critical-thinking partner by installing a governed ACT brain into the workspace. It makes uncertainty, alternatives, and challenge visible before confident mistakes ship.

Most AI assistants are helpful, fast, and confidently wrong in subtle ways. They confirm your assumptions instead of challenging them. They sound certain when they should hedge. A confident wrong answer is worse than an uncertain correct answer.

**ACT Edition changes the default from "sound authoritative" to "show your work."** When the AI doesn't know, it says so. When it's uncertain, it qualifies. When it challenges your framing, it explains why. Debugging a confident hallucination takes hours; verifying a well-reasoned hypothesis takes minutes.

## What you get

- **A cognitive architecture** installed into your project's `.github/` folder — skills, instructions, prompts, agents, scripts, and config that GitHub Copilot reads on every request
- **The 10 ACT tenets** operationalized as runtime behavior, not just docs
- **A 7-step critical-thinking pass** that fires on medium and high-stakes decisions
- **The [Plugin Mall](https://github.com/fabioc-aloha/Alex_ACT_Plugin_Mall)** — thousands of trust-scored plugins across dozens of stores, installed on demand at the version you pick
- **Self-upgrading**: `/upgrade` keeps your brain current; existing customizations preserved

### Current brain release

The latest tagged brain is **Edition v4.1.0**. It includes encrypted, on-demand
profiles, the release-blocking ten-tenet canon guard, and exact-name local-secret
resolution. Extension host versions and Edition brain versions are independent;
Bootstrap and Upgrade fetch the latest compatible Edition GitHub Release.

Secret resolution requests one exact variable for one explicit operation. The
order is process environment, explicit file, project `.env`, then the sibling
Memory repository's ignored `.env`. It never enumerates a secret file, imports
all values, mutates `process.env`, prints values, or runs during greeting.

## The Plugin Mall

The core brain is deliberately small. When a project needs more — a new domain, a niche tool, a different opinion — the **[Plugin Mall](https://github.com/fabioc-aloha/Alex_ACT_Plugin_Mall)** is a curated search index over **thousands of plugins from dozens of upstream stores** (Anthropic, Microsoft `awesome-copilot`, community catalogs, and many more). Every plugin carries a published 0–100 trust score built from provenance, maintenance, adoption, license clarity, and frontmatter completeness — so you see *why* one plugin scored higher than another before you install it.

Heirs install from upstream at a pinned version. The Mall never sits in the middle of the supply chain; it just helps you find and judge.

| Slash command | What it does |
| --- | --- |
| `/mall-search <query>` | Search the full catalog by name, tag, or description |
| `/mall-show <name>` | Full metadata + trust signals for one plugin |
| `/mall-install <name>[@<version>]` | Pin a version and install from upstream |
| `/mall-upgrade <name>` | Compare installed SHA vs current default |
| `/mall-list` | Show locally installed plugins with pinned versions |

Browse the catalog: [full index](https://github.com/fabioc-aloha/Alex_ACT_Plugin_Mall/blob/main/catalog/INDEX.md) · [by category](https://github.com/fabioc-aloha/Alex_ACT_Plugin_Mall/tree/main/catalog/categories) · [by store](https://github.com/fabioc-aloha/Alex_ACT_Plugin_Mall/tree/main/catalog/stores) · [trust audit](https://github.com/fabioc-aloha/Alex_ACT_Plugin_Mall/blob/main/scoring/TRUST-AUDIT.md).

## Installing

ACT Edition installs from the Visual Studio Marketplace. Once installed, open any project and run from the command palette:

> **Alex ACT: Bootstrap This Workspace**

The brain copies into `.github/` and the bootstrap toast offers three one-click follow-ups:

- **Run /welcome** — opens Copilot Chat with a read-only orientation tour (identity, what's loaded, three good first prompts)
- **Run /configure-vscode** — applies the fleet-baseline VS Code user-scope settings (Copilot model defaults, agent behaviors)
- **Open README** — the project's own README in a preview pane

Before your first real chat, open `.github/copilot-instructions.local.md` and fill in the `## Project Context` paragraph. Identity grounding from session 1 beats identity grounding at session 10.

### Network requirement

Starting in v9.4.0, the Extension fetches the latest Edition brain from GitHub on first use, rather than shipping a bundled copy that ages with each Marketplace release. The fetch happens transparently when you run **Bootstrap** or **Upgrade Brain**. The Extension needs to reach `api.github.com` and `codeload.github.com`. If you're behind a corporate proxy, ask your network admin to allowlist those two hosts. See [ADR-009](https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/docs/adrs/ADR-009-extension-github-fetch-brain.md) for the rationale.

If a Bootstrap or Upgrade fails for any reason, run **Alex ACT: Diagnose Fetch** from the Command Palette and paste the resulting output into your bug report.

## Coming from an older version?

If you previously had **Alex Cognitive Architecture (AlexMaster)** installed, this extension is the direct successor — same Marketplace ID, auto-updates in place. The old one-click AlexMaster migration command is retired in the static-fetch line. For a clean start, run **ACT: Bootstrap This Workspace** in a fresh project and manually copy any old local customizations you still need.

If you are upgrading from **v8.x** (Edition v2.x) to **v9.x** (Edition v3.x), see [Migrating to v9](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Migrating-to-v9) for the one breaking change (AI-Memory moved from cloud drives to a git repo).

## Documentation

Full documentation lives in the **[GitHub wiki](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki)**:

- The 10 tenets and what they prevent
- Every shipped instruction and skill, with rationale
- Slash-prompt reference
- Plugin Mall catalog and how to contribute
- Model compatibility and the open `MAN.8.3` capability-floor question
- Brain upgrade lifecycle
- Migrating to v9 (AI-Memory breaking change)
- Git-based Memory, encrypted profiles, and local-secret setup

## Source and feedback

- **Source**: [github.com/fabioc-aloha/Alex_ACT_Extension](https://github.com/fabioc-aloha/Alex_ACT_Extension)
- **Issues**: [github.com/fabioc-aloha/Alex_ACT_Extension/issues](https://github.com/fabioc-aloha/Alex_ACT_Extension/issues)
- **Q&A**: [github.com/fabioc-aloha/Alex_ACT_Extension/discussions](https://github.com/fabioc-aloha/Alex_ACT_Extension/discussions)
- **In-product feedback**: `/feedback` in Copilot Chat after install

## License

PolyForm Noncommercial 1.0.0. See [LICENSE](./LICENSE). Non-commercial use is unrestricted; commercial use requires a separate agreement.
