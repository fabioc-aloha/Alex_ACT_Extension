# The Plugin Mall: 300+ specialized skills on demand

The core ACT brain that Alex ships with is deliberately lean by design: a small fixed budget of always-on reasoning discipline that loads on every conversation. Everything else lives in the **Plugin Mall**: a curated catalog of **300+ specialized skills, instructions, and prompts** that Alex pulls in *only when your project actually needs them*.

This is the opposite of the kitchen-sink prompt. Bloated context produces *worse* reasoning, not better. The Mall lets Alex stay sharp on the conversation in front of it, and reach for depth only when depth is warranted.

## What is in the Mall

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

Every plugin is reviewed against the ACT specification before it enters the catalog.

## How to use it

### From the chat (recommended)

Just ask Alex naturally:

> *"Search the Mall for skills relevant to [what you are working on]. What are the top three I should know about?"*

> *"I am about to do a code review on a payment processor. Pull anything from the Mall that would sharpen that."*

> *"I have a difficult conversation with my manager tomorrow. What does the Mall have on this?"*

Alex reads the catalog, picks the most relevant skills, and either loads them for *this conversation* (cheap and reversible) or recommends installing them into your project's brain (persistent across sessions).

Installation happens through Copilot Chat with the slash command Alex will tell you to run:

> `/mall install <skill-name>`

### From the command palette

Press `Ctrl+Shift+P` and run **ACT: Search Plugin Mall**. You get a typeahead over the catalog by name, category, and description. Click **Search Plugin Mall** below to try it right now.

## Two important rules

1. **Do not install everything.** Plugins cost tokens. Your context window is finite. Alex (and the framework) prefer *load when needed* over *always loaded*. The default move is to use a plugin in-conversation; only persist it to your project's brain if you will work in that space repeatedly.

2. **The Mall is curated, not crowdsourced.** Every plugin is reviewed against the ACT spec (the same one Alex's core brain follows) before it lands in the catalog. You will not find a plugin telling Alex to ignore safety rules, skip verification, or flatter you.

## Other practical tools you may have noticed

Alex also ships two everyday utilities that pair well with the Mall:

- **Document conversion.** Right-click any `.md` / `.docx` / `.html` file in the Explorer panel and pick **ACT Convert**. Markdown is the hub: convert `.md` to Word, HTML, plain text, or an `.eml` email message, and bring Word or HTML back to Markdown. Runs locally, costs nothing against your Copilot quota.
- **Persistent project memory.** Run **ACT: Bootstrap This Workspace** from the command palette inside a project folder. Alex starts a notebook in `.github/` and picks up where you left off on every future session. Plain text files you can read, edit, or delete.
- **AI-Memory.** A shared folder on your cloud drive (or local-only) that links every ACT project on your machine. Used for cross-project notes and feedback to the framework maintainers.

All three are documented in detail on the wiki.

**Read more on the wiki:**
[The Plugin Mall](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/The-Plugin-Mall) · [Project Memory](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Project-Memory) · [AI-Memory](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/AI-Memory) · [Document Conversion](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Document-Conversion)
