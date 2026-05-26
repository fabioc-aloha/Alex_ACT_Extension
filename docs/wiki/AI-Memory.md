# AI-Memory

[Project Memory](Project-Memory) is per-workspace: each project has its own `.github/` brain that Alex reads on every conversation in that folder. **AI-Memory is the layer above that.** It is a shared channel that links every ACT-Edition project on your machine, plus a feedback channel back to the people maintaining the framework.

If Project Memory is what Alex remembers about *this* project, AI-Memory is what Alex remembers about *you across projects*, plus what the framework wants to tell you.

## Where it lives

AI-Memory lives on a cloud-synced folder in your home directory. When you run **ACT: Bootstrap This Workspace** for the first time, the extension scans for cloud drives and offers you a pick:

- OneDrive, iCloud, Dropbox, Google Drive, Box, MEGA, pCloud, Nextcloud (whichever it finds).
- `~/AI-Memory` (local only, no cloud sync) as a fallback.

Pick a cloud drive if you want AI-Memory available on every machine you sign in to. Pick local if you would rather keep everything on this one machine. The choice is stored per workspace in `.github/config/cognitive-config.json` (key: `ai_memory_root`). You can move it later by editing that file.

If you bootstrap a second project, the extension finds the existing AI-Memory automatically and joins it. No re-pick.

## Layout

The first bootstrap creates this structure inside the drive you picked:

```
AI-Memory/
├── README.md
├── heirs/
│   └── registry.json          ← fleet registry of your ACT projects
├── announcements/
│   └── alex-act/              ← release notes and guidance (read-only)
├── feedback/
│   └── alex-act/              ← your outbound feedback to the maintainers
├── knowledge/                  ← cross-project notes you mark for reuse
└── insights/                   ← patterns Alex thinks are worth keeping
```

Every workspace you bootstrap registers itself in `heirs/registry.json` with its display name, edition version, and timestamps. That registry is how Alex (and you) can see *all* the projects on this machine that use ACT.

## What it is used for

Three things, in plain language:

### 1. Cross-project continuity

If you mirror a session handoff to AI-Memory (the `/save-session-note` prompt does this), the note is searchable from any other ACT project. Useful when a pattern from one project (say, a debugging recipe or an architectural decision) is worth surfacing when you start work on another.

The mirror is **optional** and **stripped**. See the privacy section below.

### 2. Announcements from the framework maintainers

When a new edition of ACT ships, when a Mall skill is deprecated, or when a critical fix lands, the maintainers drop a markdown file in `announcements/alex-act/`. Alex reads them on session start and surfaces anything new.

You can also run **`/checkin`** in chat at any time to scan announcements explicitly.

### 3. Feedback back to the framework

If you hit a bug, a friction point, a missing skill, or want to propose a new Mall plugin, run **`/feedback`** in chat. Alex captures the session context, strips it for cross-project safety, and writes a structured markdown file to `feedback/alex-act/`. The framework maintainers pick it up from there.

There is also **`/mall-contribute`** for proposing a new Mall plugin specifically.

## Privacy and isolation

AI-Memory is the most privacy-sensitive surface in the extension because notes written here can be read by Alex in *other* projects. Two rules govern what goes into it:

### Cross-project isolation (stripped before write)

When Alex writes to AI-Memory, it strips:

- **File paths with project structure** (`src/payments/checkout/` becomes "a checkout module")
- **Project, repo, and client names** ("ACME Bank" becomes "a fintech project")
- **Domain-specific identifiers** (account IDs, ticket numbers, internal codenames)
- **Niche stack details** that would pin a project (the bespoke internal service name)

What stays: the *pattern*. Skill names, ACT vocabulary, severity, category. The test is *"could someone working on a completely different project act on this?"* If yes, the strip worked.

If you ask Alex to skip stripping (*"just write it raw"*), it will refuse. You can write a raw note to your project's local memory instead.

### PII filter

Contact info, dates of birth, health data, financial data, credentials are **never written to AI-Memory**, even after stripping. Those belong in VS Code SecretStorage, environment variables, or nowhere at all.

### Where the data actually goes

- **The folder is on your cloud provider's drive** (OneDrive, iCloud, etc.) or fully local if you picked `~/AI-Memory`.
- **Nothing is sent to a separate Alex backend.** There is no Alex backend.
- **When you sign in to the same cloud account on another machine, AI-Memory is there.** That is the feature; it is also the surface you should think about before you write anything sensitive.
- **The framework maintainers do not have access to your AI-Memory directly.** Feedback you choose to send via `/feedback` is written to *your* `feedback/alex-act/` folder; the maintainers see it only if you separately upload or share it.

## Useful commands

| You want to... | Run in chat |
| --- | --- |
| See if there are new announcements | `/checkin` |
| Send feedback or a bug report | `/feedback` |
| Propose a new Mall plugin | `/mall-contribute` |
| Capture a cross-project note | `/note` |
| Mirror a session handoff to AI-Memory | `/save-session-note` |
| See AI-Memory health and fleet status | `/status` |
| Re-set up AI-Memory if something is off | `/initialize` |

## Opting out

You have three escape hatches:

1. **Local-only:** pick `~/AI-Memory` at bootstrap. Nothing leaves the machine.
2. **No mirror:** skip the `/save-session-note` mirror step. HANDOFF.md stays in your repo only.
3. **No feedback:** never run `/feedback`. The folder stays empty.

The fleet registry is the one piece that gets written automatically on every bootstrap. If you do not want that, delete `heirs/registry.json` (Alex will not recreate it without another bootstrap).

## Related reading

- [Project Memory](Project-Memory): the per-workspace layer that AI-Memory sits above.
- [Privacy, Troubleshooting, Help](Privacy-Troubleshooting-Help): broader data-flow story including Copilot traffic.
- [The Plugin Mall](The-Plugin-Mall): where `/mall-contribute` proposals land.

---

*Last reviewed: 2026-05-25*
