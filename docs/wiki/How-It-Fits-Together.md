# How It Fits Together

Alex is not one thing. It is six pieces in three layers, each with a clearly defined job. This page maps the whole system in one place. If you ever get confused about "where does X live" or "why is there a separate repo for Y", start here.

## The six pieces at a glance

| Piece | What it is | Where it lives | Who edits it |
| --- | --- | --- | --- |
| **Edition** | The canonical brain — instructions, skills, prompts, agents, scripts | [`Alex_ACT_Edition`](https://github.com/fabioc-aloha/Alex_ACT_Edition) GitHub repo, versioned (e.g. v3.2.0) | The framework maintainers (you read it) |
| **Extension** | The VS Code Marketplace tool that fetches Edition and provides the commands | [`Alex_ACT_Extension`](https://github.com/fabioc-aloha/Alex_ACT_Extension) GitHub repo + Marketplace listing, versioned (e.g. v9.4.0) | The framework maintainers (you install it) |
| **Plugin Mall** | The optional catalog of 300+ extra skills, instructions, prompts | [`Alex_ACT_Plugin_Mall`](https://github.com/fabioc-aloha/Alex_ACT_Plugin_Mall) GitHub repo | The framework maintainers (you browse and install) |
| **Project memory** (`.github/`) | The per-project brain Alex actually reads each turn | Your workspace's `.github/` folder | You (it is plain text) |
| **Shared memory bus** (`Alex_ACT_Memory`) | Cross-project channel for announcements, feedback, profile, cross-project insights | `../Alex_ACT_Memory` sibling git repo | You + the framework (via announcements) |
| **Copilot memory** (`/memories/`) | VS Code's built-in memory tool — user prefs, repo facts, session scratch | Managed by the GitHub Copilot extension itself | You (Alex writes via the memory tool) |

The first three live on **GitHub** as source of truth. The next three live **on your machine** as Alex's working memory. The Extension is the bridge.

## Layer 1 — Source (what ships)

### Edition: the brain template

Edition is the canonical body of skills, instructions, prompts, and agents that defines how Alex reasons. It is authored by the Supervisor (the upstream curator), versioned independently, and tagged for release on GitHub. Edition has **no install step of its own** — you receive it through the Extension, or you can clone the template directly and copy `.github/` into a project manually.

See [The Edition Template](The-Edition-Template) for version mechanics and direct-use instructions.

### Extension: the delivery channel

The Extension is the VS Code Marketplace package you install. Its job is narrow: provide the commands (`Bootstrap This Workspace`, `Upgrade Brain`, `Diagnose Fetch`, `Open Welcome Guide`), fetch the latest Edition release from GitHub when you bootstrap or upgrade, install the brain into your project's `.github/`, and check periodically (silently, ETag-conditional, once per 24h) whether a newer Edition release is available.

**Starting in v9.4.0, the Extension does not bundle the brain.** It downloads the tagged Edition release from `codeload.github.com` on demand, validates the manifest contract, then installs. The benefit: Edition releases reach your workspace immediately on tag-push, with no waiting for a Marketplace review cycle. See [ADR-009](https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/docs/adrs/ADR-009-extension-github-fetch-brain.md) for the rationale and the network-requirement trade-off.

### Plugin Mall: the catalog of extras

The core brain (Edition) is deliberately lean. Everything else — niche debugging recipes, domain-specific patterns, specialized prompts — lives in the Plugin Mall as opt-in skills you install on demand. The Mall has its own curation pipeline (trust scoring, drift audits, deprecation) and surfaces results through `/mall-search`, `/mall-show`, `/mall-install`.

See [The Plugin Mall](The-Plugin-Mall) for catalog, scoring, and contribution flow.

## Layer 2 — Local working memory (what runs)

### Project memory: `.github/` in your workspace

When you bootstrap a workspace, the Extension copies Edition into your project's `.github/` folder. Everything Alex reads on every conversation in that project lives there:

- `copilot-instructions.md` — project identity
- `instructions/` — always-on rules
- `skills/` — on-demand knowledge bodies
- `prompts/` — slash-command workflows
- `agents/` — delegation targets
- `scripts/` — local helpers

This is your project's brain. It is plain text. You can edit it. It is per-workspace, local-only, and never uploaded by Alex. If you push your project to a git remote, `.github/` goes with it — anyone who can read the repo can read the brain. Project memory is **local by default, not private by nature**.

See [Project Memory](Project-Memory) for the full layout and editing patterns.

### Shared memory bus: `Alex_ACT_Memory`

Project memory is per-workspace. The shared memory bus is the layer above: a sibling git repo at `../Alex_ACT_Memory` that links every ACT workspace on your machine. It carries:

- **Announcements** from the framework (new Edition releases, deprecations, breaking changes)
- **Your profile** — preferences that apply across all projects
- **Feedback** you send via `/feedback` (lives in *your* repo; framework maintainers only see it if you push and share)
- **Cross-project insights** — patterns Alex spots in one project that apply elsewhere

You don't configure it. The Extension resolves it by convention on first session. If the clone fails (no network, no SSH key), Alex continues without it.

See [AI-Memory](AI-Memory) for layout, the cross-project isolation filter, and PII rules.

### Copilot memory: VS Code's `/memories/` tiers

This is separate from everything above. The GitHub Copilot extension (which Alex sits on top of) ships its own memory tool with **three persistence scopes**:

| Tier | Scope | Persists | Auto-loaded |
| --- | --- | --- | --- |
| `/memories/` (user) | All workspaces, all conversations | Yes, indefinitely | Yes, first ~200 lines on every session |
| `/memories/repo/` | Current workspace | Yes, indefinitely | No (listed in context; read on demand) |
| `/memories/session/` | Current conversation only | Cleared at conversation end | No (listed in context; read on demand) |

Alex writes here through the Copilot memory tool. The natural mapping:

- **User tier** — workflow preferences, communication style, tool patterns (the kind of thing that follows you everywhere)
- **Repo tier** — build commands, code conventions, architecture facts (codebase-specific knowledge worth keeping past the current session)
- **Session tier** — in-progress notes, scratch state for the current conversation only

If you need state that **the next session must pick up from**, do not write it to `/memories/session/` — write it to `HANDOFF.md` at the repo root instead. Session memory is by-design ephemeral.

## Layer 3 — Why this split exists

Each piece does one thing and only one thing. The split is deliberate:

| If this changed... | ...it would not require... |
| --- | --- |
| New skill added to Edition | Extension republish (just an Edition tag) |
| Extension bug fixed | Brain rebuild or Edition bump |
| New Mall plugin available | Edition or Extension changes |
| You changed a project convention | Anything outside `.github/` in that project |
| You changed a cross-project preference | Touching any project's `.github/` |
| Copilot updated its memory model | Anything in Alex itself |

The previous architecture bundled the brain inside the Extension, which meant every brain edit required a Marketplace republish (~24h review cycle). ADR-009 separated them: brain content now reaches you on the same timeline as a `git push` from the Supervisor.

## Related reading

- [The Edition Template](The-Edition-Template) — Edition mechanics and direct-use
- [The Plugin Mall](The-Plugin-Mall) — the catalog of optional extras
- [Project Memory](Project-Memory) — your workspace's `.github/` brain
- [AI-Memory](AI-Memory) — the shared cross-project bus
- [Privacy, Troubleshooting, Help](Privacy-Troubleshooting-Help) — where data goes and what to do when something breaks

---

*Last reviewed: 2026-05-31*
