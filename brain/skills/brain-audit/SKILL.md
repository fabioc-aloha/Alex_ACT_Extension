---
name: brain-audit
description: Perform a local brain audit for ACT Edition using deterministic QA plus targeted file review, then produce severity-ranked fixes.
lastReviewed: 2026-05-29
---

<!-- brain-qa: allow AlexMaster -- documents the 2026-05-18 retirement as a stale-architecture pattern to flag in audits -->

# Brain Audit

Run a local quality audit of the Edition brain and report issues with concrete, minimal fixes.

## When to Use

- User asks to "audit the brain"
- Before release or migration
- After broad instruction/skill edits
- When behavior feels inconsistent with ACT principles

## Local Audit Protocol

1. Start from the `/audit-brain` prompt, which routes to the `brain-auditor` worker.
2. Gather local deterministic evidence from repository state:
   - frontmatter completeness and freshness (`lastReviewed`, required fields per artefact type)
   - manifest consistency (`.github/config/edition-manifest.json` vs shipped artifacts)
   - cross-reference integrity (files referenced by prompts/instructions/skills exist)
   - sibling-repo xrefs: references to `../Alex_ACT_Memory/...` are valid; check the sibling repo if checked out, otherwise treat as out-of-band
   - stale-architecture flags: references to OneDrive / iCloud / Dropbox for AI-Memory discovery (removed in Extension v9.0.0), `heirs/registry.json` fleet self-registration (removed v9.0.0), or AlexMaster as upstream authority (retired 2026-05-18) without an `<!-- brain-qa: allow ... -->` marker
3. Validate findings directly in affected files.
4. Report findings ordered by severity with exact file references.
5. Apply approved fixes, then rerun the same local evidence checks to confirm closure.

## Reporting Standard

Each finding includes:

- Severity (`high`, `medium`, `low`)
- File path
- Why it matters operationally
- Minimal fix

## Boundaries

- Local deterministic evidence is mandatory.
- Do not block audit completion on external model tokens.
- Separate "must-fix now" from "quality debt".

## Falsifiability

This skill needs revision if, within 90 days:

- High-severity findings from this audit repeatedly reappear after claimed fixes
- Deterministic checks pass but release regressions keep surfacing from unchanged audit gaps
- Audit reports cannot be mapped to concrete file edits

Track outcomes in `docs/ledgers/curation-log.md` when available.
