# Migration Review — AlexMaster → ACT Edition

> Template for capturing what survived your AlexMaster → ACT Edition migration. Fill this out after running `/finalize-migration` (or `/migrate-from-alex-master`) in Copilot Chat. When complete, optionally drop a copy into `AI-Memory/feedback/alex-act/` so Supervisor can learn from your migration.

**Date**: <YYYY-MM-DD>
**Workspace**: <project name or path — strip anything sensitive before sharing>
**Source version**: AlexMaster v<X.Y.Z> (check `.github-backup-<ISO>/.github/brain-version.json`)
**Target version**: Alex — ACT Edition v9.0.0
**Backup location**: `.github-backup-<ISO>/`

---

## 1. Preserved files

Everything that landed in `.github/local/`. Mark each with its disposition.

| Path under `.github/local/` | Original purpose | Disposition |
| --- | --- | --- |
| <e.g. NORTH-STAR.md> | <your project's north-star statement> | Keep as-is |
| <e.g. episodic/postmortem-2025-12-01.md> | <historical record> | Archive, no longer active |
| <e.g. instructions/team-conventions.instructions.md> | <project-specific lint and review rules> | Refactored into `.github/instructions/team-conventions.instructions.md` |

Add as many rows as you have preserved files. Dispositions to choose from:

- **Keep as-is** — file still applies, ACT Edition does not author the same content
- **Archive** — historical value only, no longer active
- **Refactored** — content merged into ACT Edition or rewritten as a custom skill/instruction
- **Delete** — no longer needed; safe to remove from `local/`

---

## 2. Dropped files

These AlexMaster files were deliberately not preserved. If you authored content here that you need, document the gap.

| Dropped path | Did you author content there? | If yes, where did it go? |
| --- | --- | --- |
| `.github/brain-version.json` | No | n/a |
| `.github/hooks.json` | <yes/no> | <Mall plugin? custom muscle? feedback to Supervisor?> |
| `.github/hooks/` | <yes/no> | <same> |

---

## 3. Conflicts surfaced

Cases where a `local/` file overlapped with an ACT Edition file. How did you resolve each?

| Local file | ACT Edition equivalent | Resolution |
| --- | --- | --- |
| <e.g. local/instructions/critical-thinking-rules.instructions.md> | `.github/instructions/critical-thinking.instructions.md` | Kept ACT Edition; project-specific notes moved to `/memories/repo/critical-thinking-project-notes.md` |

---

## 4. Open questions

Anything you weren't sure about. Use this section to write down what you need Supervisor or the wiki to clarify.

- <e.g. "I had a custom muscle for Azure cost reporting — is there a Mall plugin for that?">
- <e.g. "My `hooks/` directory had pre-commit logic. What's the ACT Edition equivalent?">

---

## 5. Sentiment

One sentence on how the migration went. This is feedback signal for Supervisor, not a performance review.

> <e.g. "Smooth — modal was clear, backup gave me confidence, semantic pass caught two overlaps I would have missed.">

---

## 6. Feedback for Supervisor

Optional. If you want Supervisor to learn from this migration, copy this completed file into your `AI-Memory/feedback/alex-act/` inbox. Supervisor triages weekly via the `/triage-feedback` cadence.

**Sanitize before sharing**: strip workspace names, project-specific paths, client identifiers, or anything else covered by `cross-project-isolation.instructions.md`.

---

*Template version: 1.0 (2026-05-24). Source: `Alex_ACT_Extension/templates/MIGRATION-REVIEW.md`.*
