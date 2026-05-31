# Project Memory

Alex remembers your project across sessions through a folder called `.github/` in your workspace. It is plain text. You can read it, edit it, or delete it.

## Why it exists

A conversation that forgets itself is useful for one-off questions and useless for real work. Project memory is what lets Alex say *"based on what you told me last week about the budget constraints..."* instead of asking you to repeat yourself every session.

The memory is **per-project**, **local to your machine**, and **plain text**. There is no cloud sync, no separate Alex account, no telemetry. If you delete the folder, the memory is gone.

## How to start

Inside any project folder, open the chat and ask:

> *"Bootstrap this workspace."*

Or run **ACT: Bootstrap This Workspace** from the command palette (`Ctrl+Shift+P`, Mac: `Cmd+Shift+P`).

Alex creates a `.github/` folder with the following structure:

```
.github/
├── copilot-instructions.md   ← project identity and conventions
├── instructions/              ← always-on rules (lint, style, voice)
├── skills/                    ← domain knowledge pulled in on demand
├── prompts/                   ← ready-made slash-command workflows
├── agents/                    ← specialized sub-agents for delegated work
├── scripts/                   ← local helpers (linters, converters, project maintenance)
└── config/                    ← settings (optional)
```

## What lives where

### `copilot-instructions.md`

The project's identity file. Names what this project *is*, who it is for, the cardinal rules, the non-goals. Alex reads this on every conversation in this workspace. Edit it when the project's character changes.

### `instructions/`

Always-on rules that apply to every response in this project. Voice (no em-dashes, contractions OK), linting expectations, naming conventions, security baselines. Each file has a YAML front-matter `applyTo` glob that scopes when the rule fires.

### `skills/`

Domain knowledge bodies that Alex pulls in *on demand*. A `skills/code-review/SKILL.md` is read when Alex decides it needs code-review knowledge for the current turn. Not loaded otherwise. This is where [Plugin Mall](The-Plugin-Mall) installs go.

### `prompts/`

Ready-made prompts you can invoke with a slash command in chat. `/checkin`, `/meditate`, `/feedback`, `/note`. They are reusable workflows you (or Alex) author once and run repeatedly.

### `agents/`, `scripts/`

The operational layer. `agents/` defines specialized sub-agents Alex can delegate to. `scripts/` holds local executables — converters, linters, scaffolders, and project-maintenance helpers that run on your machine without an AI call. You usually do not edit these by hand; Bootstrap and Plugin Mall installs populate them.

## How Alex uses the memory

Two layers:

1. **Identity (always loaded).** `copilot-instructions.md` and the `instructions/` folder load into every conversation. This is what makes Alex behave consistently across sessions.
2. **On-demand depth (loaded when relevant).** Skills get pulled in only when Alex's reasoning concludes they apply. A `code-review` skill loads when the conversation is about reviewing code, not when you are drafting an email.

> **Note on postmortems and chronicles.** Alex can write postmortems and decision notes into your project (for example, dropping a file like `.github/episodic/2026-05-25-decision.md` if you ask it to). These are *not* auto-loaded; you can reference them explicitly in a conversation or have Alex re-read them when context warrants. Treat them as searchable archive, not as part of the identity layer.

## Editing the memory

It is plain text. Open any file in VS Code and edit it. The changes are picked up on the next conversation turn (no restart needed).

Common edits:

- **Add a convention.** Append a line to `instructions/voice.instructions.md` like *"Never use phrase X."* It becomes a rule from the next response forward.
- **Capture a decision.** Ask Alex to drop a markdown file (e.g. `.github/notes/<date>-<topic>.md`) documenting the decision and the reasoning. Reference it in a future conversation when context warrants.
- **Remove a skill.** Delete the folder under `skills/<skill-name>/`. The skill stops being available next turn.

## Privacy

Plain English:

- The `.github/` folder lives **on your machine**. Nothing in it is uploaded to a cloud or shared with anyone.
- When Alex reads from it, the content goes into the same Copilot chat traffic as any other prompt. That traffic is governed by [GitHub Copilot's privacy policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- If you commit `.github/` to a git repo and push it, your *teammates and the repo viewers* can see the content. The folder is not secret by nature; it is just local-by-default.

What this means in practice: do not write secrets into the memory (API keys, passwords, personal data you would not paste into any other text file). Use VS Code SecretStorage or environment variables for those, not the brain.

For more on privacy, see [Privacy, Troubleshooting, Help](Privacy-Troubleshooting-Help).

## Deleting the memory

Two ways:

- **Surgical:** delete individual files or folders under `.github/` you no longer want. Alex picks up the absence on the next turn.
- **Total reset:** delete the whole `.github/` folder. Alex forgets everything project-specific and behaves like a fresh install in this workspace.

Neither action is destructive beyond the local folder. You can always bootstrap again.

## Project memory vs Copilot memory

Project memory (`.github/`) is **not** the same thing as VS Code's Copilot memory tool. They sit at different layers and you'll see both surfaced in the chat:

| Surface | What it is | Scope | Edited by |
| --- | --- | --- | --- |
| **Project memory** (`.github/`) | The brain Alex reads on every turn in this workspace | Per-project, on disk | You (plain text) |
| **Copilot memory** (`/memories/`) | VS Code's built-in memory tool with three persistence tiers | User / repo / session | Alex via the memory tool |

Copilot memory has three scopes:

- `/memories/` — **user tier**: workflow preferences, communication style, tool patterns. Survives across all workspaces and conversations. First ~200 lines auto-load on every session.
- `/memories/repo/` — **repo tier**: build commands, code conventions, architecture facts. Scoped to the current workspace; persists across conversations; read on demand.
- `/memories/session/` — **session tier**: in-progress notes for the current conversation only. Cleared at conversation end.

The two layers are complementary, not redundant: project memory holds the **brain** (how Alex reasons in this codebase), Copilot memory holds **preferences and facts** (what Alex remembers about you and this codebase across sessions). When you ask Alex to "remember" something, it picks the right surface based on scope — a workflow preference goes to `/memories/`, a project convention can go to either `.github/instructions/` (always-on rule) or `/memories/repo/` (recallable fact).

For cross-project handoffs and announcements, neither surface is the right one — see [AI-Memory](AI-Memory) for the shared bus that links every ACT workspace on your machine. For the full six-piece architecture (Edition, Extension, Mall, project memory, shared memory, Copilot memory), see [How It Fits Together](How-It-Fits-Together).

## Related reading

- [How It Fits Together](How-It-Fits-Together): the six pieces in one map, including where Copilot memory fits.
- [The Plugin Mall](The-Plugin-Mall): where skills come from before they get installed into `.github/skills/`.
- [AI-Memory](AI-Memory): the shared cross-project channel that sits above per-project memory.
- [The CSAR Loop](The-CSAR-Loop): the conversational discipline that benefits most from persistent memory.

---

*Last reviewed: 2026-05-31*
