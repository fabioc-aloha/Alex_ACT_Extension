---
description: "Run a local ACT Edition brain audit via the brain-auditor worker and return severity-ranked fixes"
mode: agent
agent: brain-auditor
lastReviewed: 2026-05-13
---

# Audit Brain

Run a local brain audit for this repository and produce a concise, actionable report.

## Steps

1. Run deterministic checks:

```sh
node scripts/brain-qa.cjs
node scripts/epistemic-qa.cjs
```

2. Attempt semantic queue prep without external dependency:

```sh
node scripts/semantic-qa.cjs --dry-run --top 25
```

3. Validate findings in files and classify by severity (`high`, `medium`, `low`).

4. Report findings first with:

- file path
- why it matters
- minimal fix

5. If user approves, apply fixes and rerun deterministic checks.

## Guardrails

- Do not require external API keys to complete the local audit.
- Do not claim a file is broken without file-level evidence.
- Keep changes minimal and reversible.
