---
type: instruction
lifecycle: stable
inheritance: inheritable
description: Brain audit routing -- run local deterministic QA, validate findings in files, and prioritize fixes by severity.
application: When the user asks for a brain audit, quality audit, or consistency review of Edition artifacts.
applyTo: '**/*audit*brain*,**/*brain*qa*,**/*epistemic*qa*,**/*quality*review*'
currency: 2026-05-13
lastReviewed: 2026-05-13
---

# Brain Audit Routing

For any brain-audit request:

1. Run deterministic checks first (`brain-qa`, `epistemic-qa`).
2. If semantic credentials are missing, continue with local-only coverage (`semantic-qa --dry-run`).
3. Validate each finding in the target file before proposing changes.
4. Apply minimal fixes to high-severity findings first, then medium, then low.
5. Rerun deterministic checks after edits.

The audit is complete only after findings are either fixed or explicitly documented as deferred with rationale.
