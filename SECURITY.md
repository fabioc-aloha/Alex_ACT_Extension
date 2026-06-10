# Security Policy — Alex_ACT_Extension

This is the VS Code Marketplace surface for the Alex_ACT constellation. The Extension is a **static tool** per [Alex_ACT_Supervisor/docs/adrs/ADR-009-extension-github-fetch-brain.md](https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/docs/adrs/ADR-009-extension-github-fetch-brain.md): the VSIX ships host code only and fetches the Edition brain from GitHub at install/upgrade time.

## Threat model summary

Two trust boundaries:

1. **VS Code Marketplace** — Marketplace signs the published VSIX. A user who installs `fabioc-aloha.alex-cognitive-architecture` trusts that bytes were not tampered between maintainer signing and install.
2. **GitHub** (for Edition fetch) — `lib/edition-source.js` hardcodes a single value: the Edition repo URL. Everything else (latest tag, brain content, contract) is discovered from GitHub at runtime. A compromise of the Edition repo ships compromised brain to every heir on next upgrade — accepted risk per ADR-009.

The Extension's own attack surface:

- Host code in `extension.js`, `lib/`, `migration/`, `templates/`
- The Edition Contract validator (`lib/edition-install.js`) — refuses to install if the fetched manifest fails schema or floor checks
- The hardcoded `EDITION_REPO` constant — the only Extension change that switches Edition sources, and therefore the only Edition-pointing value worth tampering with

## How to report a vulnerability or suspected compromise

In order of preference:

1. **GitHub private vulnerability reporting** — go to the [Alex_ACT_Extension](https://github.com/fabioc-aloha/Alex_ACT_Extension) `Security` tab → `Report a vulnerability`.
2. **Email** — `fabio@correa.io` with `[ACT-SECURITY]` in the subject line.
3. **Inbound feedback channel** — only available to users who have wired the optional `Alex_ACT_Memory` shared repo. Write a file to `Alex_ACT_Memory/feedback/` with frontmatter `category: security` and `severity: high|critical`.

Do not open a public issue or PR for security reports. Sanitize logs (strip secrets, usernames, internal URLs).

## Response SLA

| Severity | Maintainer ack | First mitigation update |
| --- | --- | --- |
| Critical (active compromise, tampered VSIX, EDITION_REPO drift) | 24 hours | 72 hours |
| High (sandbox escape, privilege escalation, fetch bypass) | 48 hours | 7 days |
| Medium / Low | 7 days | next Extension release |

Single-curator project — SLA is best-effort, not contractual.

## What to report

- Tampered VSIX bytes (signature mismatch, unexpected files, unsigned commits in the published version)
- The hardcoded `EDITION_REPO` constant in `lib/edition-source.js` pointing at anything other than `github.com/fabioc-aloha/Alex_ACT_Edition`
- Edition Contract validator bypass (Extension installs a brain whose manifest violates `min_extension_version`, declares paths outside `brain_subtrees`, or has wrong `marker_schema`)
- Prompt-injection or RCE in host code (`extension.js`, `lib/*.js`, `migration.js`)
- Compromise of the `fabioc-aloha` GitHub account or the `alex-cognitive-architecture` Marketplace publisher

## Where to report related issues

- Brain content shipped through fetch (skills/instructions/prompts/agents): report to [Alex_ACT_Edition/SECURITY.md](https://github.com/fabioc-aloha/Alex_ACT_Edition/blob/main/SECURITY.md)
- Framework / curator policy: report to [Alex_ACT_Supervisor/SECURITY.md](https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/SECURITY.md)

## Scope

In scope:

- The VSIX published as `fabioc-aloha.alex-cognitive-architecture`
- The Extension host code in this repo
- The static-fetch trust model (Marketplace + GitHub trust boundaries)

Out of scope:

- The Edition brain content itself (route upstream)
- VS Code itself, GitHub itself, the Marketplace itself
- Heir workspaces that installed the Extension (those are user-owned)

## License

This project ships under [PolyForm-Noncommercial-1.0.0](LICENSE). The security policy applies regardless of license terms.

## Falsifiability

This policy is decoration if 12 months pass with zero security reports AND no incident occurred. Re-evaluate by **2027-06-10**. If decoration is the verdict, sunset and replace with a one-paragraph `## Security` section in `README.md`.
