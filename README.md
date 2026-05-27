# Alex — ACT Edition

![Alex — ACT Edition](https://raw.githubusercontent.com/fabioc-aloha/Alex_ACT_Extension/main/assets/banner-readme.png)

> **Artificial Critical Thinking for GitHub Copilot.** A living brain of skills, instructions, and prompts that teaches your AI to reason honestly.

Most AI assistants are helpful, fast, and confidently wrong in subtle ways. They confirm your assumptions instead of challenging them. They sound certain when they should hedge. A confident wrong answer is worse than an uncertain correct answer.

**ACT Edition changes the default from "sound authoritative" to "show your work."** When the AI doesn't know, it says so. When it's uncertain, it qualifies. When it challenges your framing, it explains why. Debugging a confident hallucination takes hours; verifying a well-reasoned hypothesis takes minutes.

## What you get

- **A cognitive architecture** installed into your project's `.github/` folder — skills, instructions, prompts, agents, and muscles that GitHub Copilot reads on every request
- **The 10 ACT tenets** operationalized as runtime behavior, not just docs
- **A 7-step critical-thinking pass** that fires on medium and high-stakes decisions
- **A Plugin Mall** of optional skills you can adopt on demand
- **Self-upgrading**: `/upgrade` keeps your brain current; existing customizations preserved

## Installing

ACT Edition installs from the Visual Studio Marketplace. Once installed, open any project and run from the command palette:

> **Alex ACT: Bootstrap This Workspace**

The brain copies into `.github/` and the bootstrap toast offers three one-click follow-ups:

- **Run /welcome** — opens Copilot Chat with a read-only orientation tour (identity, what's loaded, three good first prompts)
- **Run /configure-vscode** — applies the fleet-baseline VS Code user-scope settings (Copilot model defaults, agent behaviors)
- **Open README** — the project's own README in a preview pane

Before your first real chat, open `.github/copilot-instructions.local.md` and fill in the `## Project Context` paragraph. Identity grounding from session 1 beats identity grounding at session 10.

## Coming from an older version?

If you previously had **Alex Cognitive Architecture (AlexMaster)** installed, this extension is the direct successor — same Marketplace ID, auto-updates in place. No manual migration needed; the brain overwrites cleanly on upgrade.

If you are upgrading from **v8.x** (Edition v2.x) to **v9.x** (Edition v3.x), see [Migrating to v9](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Migrating-to-v9) for the one breaking change (AI-Memory moved from cloud drives to a git repo).

## Documentation

Full documentation lives in the **[GitHub wiki](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki)**:

- The 10 tenets and what they prevent
- Every shipped instruction and skill, with rationale
- Slash-prompt reference
- Plugin Mall catalog and how to contribute
- Model compatibility and the open `MAN.8.3` capability-floor question
- Brain upgrade lifecycle
- Migrating to v9 (AI-Memory breaking change)

## Source and feedback

- **Source**: [github.com/fabioc-aloha/Alex_ACT_Extension](https://github.com/fabioc-aloha/Alex_ACT_Extension)
- **Issues**: [github.com/fabioc-aloha/Alex_ACT_Extension/issues](https://github.com/fabioc-aloha/Alex_ACT_Extension/issues)
- **Q&A**: [github.com/fabioc-aloha/Alex_ACT_Extension/discussions](https://github.com/fabioc-aloha/Alex_ACT_Extension/discussions)
- **In-product feedback**: `/feedback` in Copilot Chat after install

## License

PolyForm Noncommercial 1.0.0. See [LICENSE](./LICENSE). Non-commercial use is unrestricted; commercial use requires a separate agreement.
