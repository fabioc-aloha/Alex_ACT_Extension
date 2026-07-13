# AI-Memory

The current implementation is the **Alex_ACT_Memory** sibling repository.
[Project Memory](Project-Memory) is per-workspace; Alex ACT Memory carries
cross-project announcements, stripped feedback, durable knowledge, provisional
insights, and optional encrypted profiles.

It is local-first. A Git remote is optional. If multiple clones use one remote,
repository access defines the audience; separate local clones are not an
isolation boundary.

> **Version note:** Edition v4.1.0 supports encrypted profiles and exact-name
> local-secret fallback to Memory's ignored `.env`. Resolution order is process,
> explicit file, project `.env`, then Memory `.env`; project values retain
> precedence.

## Where it lives (v9.0.0+)

AI-Memory lives in a **git repository** as a sibling clone next to your project workspaces:

```text
C:\Development\
├── Your-Project/           ← your workspace
├── Alex_ACT_Edition/       ← the brain template
└── Alex_ACT_Memory/        ← shared memory (this)
```

The conventional path is `../Alex_ACT_Memory` relative to your workspace.
Edition resolves an existing sibling by convention.

### How it gets there

Normal resolution is read-only: an existing sibling is returned, otherwise
Memory is unavailable and the workspace continues without shared channels.
Cloning, pulling, or scaffolding requires an explicit setup operation with
mutation enabled. Session start does not silently create or update repositories.

To set up the canonical repository manually:

```powershell
git clone https://github.com/fabioc-aloha/Alex_ACT_Memory.git ../Alex_ACT_Memory
```

### Previous versions (before v9.0.0)

Before v9.0.0, AI-Memory lived on a cloud-synced folder (OneDrive, iCloud, Dropbox, etc.) discovered during bootstrap. That approach had reliability issues with path resolution, silent sync failures, and OneDrive-specific quirks. The git-based approach is simpler, faster, and works the same way as Edition and the Plugin Mall.

If you're upgrading from an older version, see [Migrating to v9](Migrating-to-v9).

## Layout

```text
Alex_ACT_Memory/
├── .env.example       ← tracked placeholders and local-secret instructions
├── CONTRACT.md        ← ownership, privacy, retention, and secret rules
├── announcements/     ← release notes and guidance
├── feedback/          ← stripped friction reports and suggestions
├── insights/          ← provisional cross-project patterns
├── knowledge/         ← durable knowledge packages
├── profile/
│   └── <username>/
│       └── user-profile.encrypted.json
└── docs/
    └── MIGRATION.md   ← one-time migration guide from cloud-drive Memory
```

The real `.env` is local, ignored, and untracked. It is not a shared channel and
does not synchronize through Git. There is no `heirs/registry.json`; fleet
tracking is a separate Supervisor concern.

## What it is used for

### 1. Cross-project continuity

Your encrypted profile (`profile/<username>/user-profile.encrypted.json`) may
store user-authorized identity fields and preferences. It is decrypted only
when you or an explicit workflow requests profile-backed preferences. Greeting
does not decrypt profiles, and profile writes are local and atomic; they never
commit or push automatically.

Knowledge packages in `knowledge/` are also cross-project — curated reference material Alex can consult regardless of which workspace you're in.

### 2. Announcements from the framework

When a new edition ships, when a Mall skill is deprecated, or when a critical fix lands, the announcement appears in `announcements/`. Alex reads them on session start and surfaces anything new.

You can also run **`/checkin`** in chat at any time to check for announcements.

### 3. Feedback to the framework

If you hit a bug, a friction point, or want to propose something, run **`/feedback`** in chat. Alex writes a structured report to `feedback/`. The framework maintainers pick it up from there.

### 4. Insights and patterns

When Alex spots a pattern worth keeping across projects (a debugging recipe, an architectural decision), it can write to `insights/`. These are readable from any workspace.

### 5. Machine-local secrets

The tracked `.env.example` contains placeholders and setup instructions. Copy
it to `.env`, replace values only in the ignored copy, and verify the real file
is not tracked:

```powershell
Copy-Item ../Alex_ACT_Memory/.env.example ../Alex_ACT_Memory/.env
git -C ../Alex_ACT_Memory check-ignore --quiet --no-index .env
git -C ../Alex_ACT_Memory ls-files --error-unmatch .env  # must fail
```

The Edition v4.1.0 resolver requests one exact variable for one explicit operation.
Resolution order is process, explicit file, project `.env`, then Memory `.env`.
It never enumerates the file, imports all values, mutates `process.env`, prints
values, or runs during greeting. Project values override Memory values.

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

Contact information, dates of birth, health data, financial data, credentials,
and secrets are never written to shared tracked channels. User-authorized
profile identity/preferences may exist only in encrypted envelopes. Credentials
belong in ignored local environment files, VS Code SecretStorage, or an
enterprise secret manager, never in profiles or tracked content.

### Where the data actually goes

- **The repo is local on your machine** (plus a Git remote if you configure one).
- **Nothing is sent to a separate Alex backend.** There is no Alex backend.
- **If you push to a remote, every authorized repository reader can read tracked channels and opaque encrypted envelopes.** Repository visibility and collaborator permissions define that audience.
- **Memory `.env` stays local.** Git does not synchronize it. Any local process with filesystem access to both the heir and Memory clone may be able to request a known secret after the fallback is released.

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
- **No profile use:** do not authorize profile decryption; missing authorization uses defaults without blocking other channels.
- **No shared local secrets:** do not create Memory `.env`; use process, project `.env`, SecretStorage, or an enterprise store instead.

## Related reading

- [How It Fits Together](How-It-Fits-Together): the six pieces in one map — Edition, Extension, Mall, project memory, this shared bus, and VS Code's Copilot memory tiers.
- [Project Memory](Project-Memory): the per-workspace layer that this bus sits above.
- [Privacy, Troubleshooting, Help](Privacy-Troubleshooting-Help): broader data-flow story.
- [Migrating to v9](Migrating-to-v9): upgrading from OneDrive-based AI-Memory.
- [The Plugin Mall](The-Plugin-Mall): where `/mall-contribute` proposals land.

---

Last reviewed: 2026-07-13
