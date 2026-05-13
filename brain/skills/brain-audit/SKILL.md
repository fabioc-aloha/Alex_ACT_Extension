---
type: skill
lifecycle: stable
inheritance: inheritable
name: brain-audit
description: Perform a local brain audit for ACT Edition using deterministic QA plus targeted file review, then produce severity-ranked fixes.
tier: standard
applyTo: '**/*audit*brain*,**/*brain*qa*,**/*epistemic*qa*,**/*quality*'
currency: 2026-05-13
lastReviewed: 2026-05-13
---

# Brain Audit

Run a local quality audit of the Edition brain and report issues with concrete, minimal fixes.

## When to Use

- User asks to "audit the brain"
- Before release or migration
- After broad instruction/skill edits
- When behavior feels inconsistent with ACT principles

## Local Audit Protocol

1. Run deterministic checks:
   - `node scripts/brain-qa.cjs`
   - `node scripts/epistemic-qa.cjs`
2. If semantic QA credentials are unavailable, run:
   - `node scripts/semantic-qa.cjs --dry-run --top 25`
3. Validate findings directly in affected files.
4. Report findings ordered by severity with exact file references.
5. Apply approved fixes, then rerun deterministic checks.

## Reporting Standard

Each finding includes:

- Severity (`high`, `medium`, `low`)
- File path
- Why it matters operationally
- Minimal fix

## Boundaries

- Deterministic checks are mandatory.
- Do not block audit completion on external model tokens.
- Separate "must-fix now" from "quality debt".

## Falsifiability

This skill needs revision if, within 90 days:

- High-severity findings from this audit repeatedly reappear after claimed fixes
- Deterministic checks pass but release regressions keep surfacing from unchanged audit gaps
- Audit reports cannot be mapped to concrete file edits

Track outcomes in `docs/ledgers/curation-log.md` when available.
