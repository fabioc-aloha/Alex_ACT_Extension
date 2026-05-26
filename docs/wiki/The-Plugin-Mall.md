# The Plugin Mall

The core ACT brain that Alex ships with is deliberately lean by design: a small fixed budget of always-on reasoning discipline that loads on every conversation. Everything else lives in the **Plugin Mall**: a curated catalog of **300+ specialized skills, instructions, and prompts** that Alex pulls in *only when your project actually needs them*.

This is the opposite of the kitchen-sink prompt. Bloated context produces *worse* reasoning, not better. The Mall lets Alex stay sharp on the conversation in front of it, and reach for depth only when depth is warranted.

## Why it works this way

Three load-bearing reasons:

1. **Token economy.** Every plugin loaded into the context window costs space that could go to your problem. A small, sharp brain that pulls depth on demand outperforms a giant brain that carries everything always.
2. **Curation over volume.** Every plugin is reviewed against the ACT specification before it enters the catalog. You will not find a Mall plugin telling Alex to ignore safety rules, skip verification, or flatter you.
3. **Project fit.** A novel-writer and a security architect do not need the same skills. The Mall lets each project pull its own depth without bloating everyone's context.

## What is in the Mall

The catalog spans sixteen categories. Counts grow as new plugins are reviewed in and stale ones retire, so this page lists categories without numbers.

| Category | What is inside |
| --- | --- |
| **devops-process** | Release rituals, CI/CD, deployment discipline, semver, rollback playbooks |
| **security-privacy** | Threat modeling, privacy reviews, OWASP scoring, PII handling, secret hygiene |
| **documentation** | Technical writing, ADRs, README structure, doc hygiene audits |
| **code-quality** | Code review, adversarial review, refactoring recipes, test strategy |
| **data-analytics** | Analysis, visualization, hypothesis testing, visual vocabulary |
| **cloud-infrastructure** | AWS, Azure, GCP, IaC patterns, architecture review, cost analysis |
| **media-graphics** | Visual design, branding, Mermaid diagrams, presentation craft |
| **ai-agents** | MCP servers, agent design, evaluation rubrics, LLM tooling |
| **domain-expertise** | Specialized knowledge bodies for specific industries |
| **reasoning-metacognition** | Critical-thinking deep dives, dialog engineering, deep thinking, meditation |
| **platform-tooling** | VS Code, GitHub, dev environment tuning, extension authoring |
| **supervisor-fleet** | Coordinating teams of agents, fleet status, version management |
| **architecture-patterns** | System design, API design, event-driven, microservices |
| **converters** | Format transformations, data shape changes |
| **communication-people** | Feedback, difficult conversations, performance reviews, executive comms |
| **academic-research** | Research methods, IRB proposals, literature review, defense prep |

## How to use it

### From the chat (recommended)

Just ask Alex naturally:

> *"Search the Mall for skills relevant to [what you are working on]. What are the top three I should know about?"*

> *"I am about to do a code review on a payment processor. Pull anything from the Mall that would sharpen that."*

> *"I have a difficult conversation with my manager tomorrow. What does the Mall have on this?"*

Alex reads the catalog, picks the most relevant skills, and either loads them for *this conversation* (cheap and reversible) or recommends installing them into your project's brain (persistent across sessions, see [Project Memory](Project-Memory)).

### From the command palette

Press `Ctrl+Shift+P` (Mac: `Cmd+Shift+P`) and run **ACT: Search Plugin Mall**. You get a typeahead over the catalog by name, category, and description. Useful when you know roughly what you want and prefer to browse rather than describe it.

### Installing into your project brain

If Alex recommends installing a skill persistently, it will give you a slash command to run in the chat:

```
/mall-install <skill-name>
```

That copies the skill files into your project's `.github/skills/` folder so they survive across sessions. To uninstall, ask Alex:

> *"Uninstall the [skill-name] plugin from this project."*

Or delete the folder under `.github/skills/<skill-name>` manually.

## In-conversation use vs. persistent install

| Use it in-conversation | Install it persistently |
| --- | --- |
| One-off task | Recurring work in this space |
| Trying a skill out | Trusted and proven |
| Exploring whether it fits | Default behavior expected for this project |
| Small context footprint OK | Worth permanent tokens for this project |

The default move is **in-conversation**. Only install persistently when you have repeated need.

## Two important rules

1. **Do not install everything.** Plugins cost tokens. Your context window is finite. Alex (and the framework) prefer *load when needed* over *always loaded*. Resist the urge to stockpile.
2. **The Mall is curated, not crowdsourced.** Every plugin is reviewed against the same ACT specification Alex's core brain follows. No safety-bypass plugins, no jailbreak plugins, no sycophancy plugins, no *"ignore previous instructions"* plugins. If it does not hold up under ACT review, it does not land.

## Examples of plugins that exist

A small sample, to make the catalog concrete:

- **code-review**: systematic correctness, security, and growth review (not just style enforcement).
- **deep-review**: adversarial review with three parallel perspectives (Advocate, Skeptic, Architect).
- **markdown-mermaid**: clean documentation, render diagrams, prevent silent failures.
- **release-preflight**: pre-checks, version consistency, deployment discipline.
- **mcp-builder**: build MCP servers for LLM tool integration (Python, Node, .NET).
- **rag-architecture**: design retrieval-augmented generation systems that hold up under load.
- **bicep-avm-mastery**: Azure infrastructure-as-code with Azure Verified Modules.
- **security-threat-modeler**: structured threat modeling with OWASP-style scoring.
- **kql**: Kusto Query Language for Azure Data Explorer and Log Analytics.
- **status-reporting**: stakeholder-friendly project status updates and progress reports.

The Mall's depth is real where it claims to be: MCP server-building, RAG architecture, Azure infrastructure, threat modeling, KQL analytics, academic writing in APA, technical writing in Markdown and Mermaid. It does not pretend to cover frameworks it does not actually carry. The full list grows; the curation gate does not change.

## Related reading

- [Project Memory](Project-Memory): where installed skills live and how they survive across sessions.
- [The ACT Framework](The-ACT-Framework): the specification every Mall plugin is reviewed against.

---

*Last reviewed: 2026-05-25*
