# External API Registry

Centralized source-of-truth for external APIs, models, and services referenced by skills/instructions/muscles in this brain.

## How This Works

- **Each row tracks one vendor or API surface.** Use one table per category (image models, video models, TTS, etc.).
- **`Last Checked`** must be an ISO date `YYYY-MM-DD`. The date itself is the freshness signal.
- **`Brain Files`** is a comma-separated list of `skills/<name>` or `instructions/<name>` that depend on this entry. Used to compute the blast radius of drift.
- **`Source URL`** must be reachable with a `HEAD` request. The audit muscle (`/audit-apis`) can probe these on demand.

## Maintenance Loop

```text
node .github/muscles/audit-api-drift.cjs                  # report stale entries
node .github/muscles/audit-api-drift.cjs --probe          # also HEAD-check source URLs
/audit-apis                                               # full LLM-driven refresh
```

The script catches **time-based drift** (entries older than 30 days). The `/audit-apis` prompt catches **content drift** (new model versions, deprecated endpoints, breaking changes) — that's the LLM's job, not the script's.

## Freshness Policy

| Age of `Last Checked` | Status |
| --- | --- |
| ≤ 30 days | Fresh |
| 31–90 days | Stale (warn) |
| > 90 days | Expired (fail) |

Override the threshold with `--max-age-days=N`.

## Registries

The Edition baseline ships these external dependencies. Each entry tracks one tool, package, or API surface. The `audit-api-drift` muscle reports staleness; the `/audit-apis` prompt drives the semantic refresh.

### CLI Tools

| Tool | Min Version | Source URL | Last Checked | Brain Files |
| --- | --- | --- | --- | --- |
| Pandoc | 2.19+ | <https://github.com/jgm/pandoc/releases> | 2026-05-01 | muscles/docx-to-md, muscles/md-to-word, muscles/md-to-html, muscles/md-to-eml, muscles/md-to-txt, muscles/html-to-md, muscles/converter-qa |
| mermaid-cli (mmdc) | 11.x+ | <https://github.com/mermaid-js/mermaid-cli/releases> | 2026-05-01 | muscles/md-to-word (SVG render), muscles/md-to-html (--mermaid-png), muscles/converter-qa, skills/markdown-mermaid |
| GitHub CLI (gh) | 2.x+ | <https://github.com/cli/cli/releases> | 2026-05-01 | instructions/mall-installation, prompts/mall-search, prompts/mall-install |

### npm Packages

| Package | Purpose | Source URL | Last Checked | Brain Files |
| --- | --- | --- | --- | --- |
| jszip | Word .docx generation (ZIP container) | <https://www.npmjs.com/package/jszip> | 2026-05-01 | muscles/md-to-word |

### GitHub APIs

| API | Endpoint | Last Checked | Brain Files |
| --- | --- | --- | --- |
| GitHub REST (Contents) | `repos/{owner}/{repo}/contents/{path}` | 2026-05-01 | instructions/mall-installation, prompts/mall-search, prompts/mall-install |
| GitHub REST (Repos) | `repos/{owner}/{repo}` | 2026-05-01 | scripts/upgrade-self, scripts/bootstrap-heir |

| Tool | Tested Version | Source URL | Last Checked | Brain Files |
| --- | --- | --- | --- | --- |

-->

## When a Mall Skill Adds an API

When you install a plugin from the [Alex ACT Plugin Mall](https://github.com/fabioc-aloha/Alex_Skill_Mall) that wraps an external API, the plugin's README will tell you which row(s) to add to this registry. Add them under the appropriate category, set `Last Checked` to today's date, and run `/audit-apis` to verify.

If a skill wraps an API not covered by any existing category, add a new `## <Category>` heading with the same five-column table structure.
