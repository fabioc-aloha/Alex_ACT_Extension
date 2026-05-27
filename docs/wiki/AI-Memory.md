# AI-Memory

[Project Memory](Project-Memory) is per-workspace: each project has its own `.github/` brain that Alex reads on every conversation in that folder. **AI-Memory is the layer above that.** It is a shared channel that links every ACT-Edition project on your machine, plus a feedback channel back to the people maintaining the framework.

If Project Memory is what Alex remembers about *this* project, AI-Memory is what Alex remembers about *you across projects*, plus what the framework wants to tell you.

## Where it lives (v9.0.0+)

AI-Memory lives in a **git repository** as a sibling clone next to your project workspaces:

```
C:\Development\
├── Your-Project/           ← your workspace
├── Alex_ACT_Edition/       ← the brain template
└── Alex_ACT_Memory/        ← shared memory (this)
```

The path is always `../Alex_ACT_Memory` relative to your workspace. No configuration needed — Alex finds it by convention.

### How it gets there

When you start a session, Alex resolves the memory bus automatically:

1. **Already cloned?** → pulls latest changes (silent, non-blocking)
2. **Not cloned but remote configured?** → clones from GitHub and informs you
3. **No remote, never set up?** → creates a local scaffold and informs you

You don't need to do anything. If the clone fails (no network, no SSH key), Alex continues without shared memory — no crash, no block.

### Previous versions (before v9.0.0)

Before v9.0.0, AI-Memory lived on a cloud-synced folder (OneDrive, iCloud, Dropbox, etc.) discovered during bootstrap. That approach had reliability issues with path resolution, silent sync failures, and OneDrive-specific quirks. The git-based approach is simpler, faster, and works the same way as Edition and the Plugin Mall.

If you're upgrading from an older version, see [Migrating to v9](Migrating-to-v9).

## Layout

```
Alex_ACT_Memory/
├── announcements/     ← release notes and guidance from the framework
├── feedback/          ← your friction reports and suggestions
├── insights/          ← cross-project patterns worth keeping
├── knowledge/         ← curated knowledge packages
│   ├── index.json     ← package registry
│   └── <name>/        ← one folder per package
├── profile/
│   └── <username>/    ← your preferences and identity
└── docs/
    └── MIGRATION.md   ← one-time migration guide from OneDrive
```

There is no `heirs/registry.json` — fleet tracking is a separate concern that doesn't live in the memory bus.

## What it is used for

### 1. Cross-project continuity

Your user profile (`profile/<username>/user-profile.json`) stores preferences that apply everywhere: communication style, learning preferences, tool choices. Alex reads it on session start and adapts. When you state a new preference in any project, Alex writes it back to your profile.

Knowledge packages in `knowledge/` are also cross-project — curated reference material Alex can consult regardless of which workspace you're in.

### 2. Announcements from the framework

When a new edition ships, when a Mall skill is deprecated, or when a critical fix lands, the announcement appears in `announcements/`. Alex reads them on session start and surfaces anything new.

You can also run **`/checkin`** in chat at any time to check for announcements.

### 3. Feedback to the framework

If you hit a bug, a friction point, or want to propose something, run **`/feedback`** in chat. Alex writes a structured report to `feedback/`. The framework maintainers pick it up from there.

### 4. Insights and patterns

When Alex spots a pattern worth keeping across projects (a debugging recipe, an architectural decision), it can write to `insights/`. These are readable from any workspace.

## Privacy and isolation

AI-Memory is the most privacy-sensitive surface because notes written here can be read by Alex in *other* projects.

### Cross-project isolation (stripped before write)

When Alex writes to AI-Memory, it strips:

- **File paths with project structure** (`src/payments/checkout/` becomes "a checkout module")
- **Project, repo, and client names** ("ACME Bank" becomes "a fintech project")
- **Domain-specific identifiers** (account IDs, ticket numbers, internal codenames)
- **Niche stack details** that would pin a project

What stays: the *pattern*. The test is *"could someone working on a completely different project act on this?"*

### PII filter

Contact info, dates of birth, health data, financial data, credentials are **never written to AI-Memory**. Those belong in VS Code SecretStorage, environment variables, or nowhere at all.

### Where the data actually goes

- **The repo is local on your machine** (plus GitHub if you configured a remote).
- **Nothing is sent to a separate Alex backend.** There is no Alex backend.
- **If you push to GitHub (private repo), it syncs across machines.** That is the feature.
- **The framework maintainers do not have access to your memory.** Feedback you send via `/feedback` is in *your* repo; they see it only if you push and share access.

## Useful commands

| You want to... | Run in chat |
| --- | --- |
| See if there are new announcements | `/checkin` |
| Send feedback or a friction report | `/feedback` |
| Propose a new Mall plugin | `/mall-contribute` |
| Capture a cross-project note | `/note` |
| Mirror a session handoff | `/save-session-note` |
| See memory bus status | `/status` |

## Opting out

- **Local-only:** don't configure a remote. Memory stays on this machine only.
- **No feedback:** never run `/feedback`. The folder stays empty.
- **No profile sharing:** delete `profile/<username>/user-profile.json`. Alex uses defaults.

## Related reading

- [Project Memory](Project-Memory): the per-workspace layer that AI-Memory sits above.
- [Privacy, Troubleshooting, Help](Privacy-Troubleshooting-Help): broader data-flow story.
- [Migrating to v9](Migrating-to-v9): upgrading from OneDrive-based AI-Memory.
- [The Plugin Mall](The-Plugin-Mall): where `/mall-contribute` proposals land.

---

*Last reviewed: 2026-05-27*
