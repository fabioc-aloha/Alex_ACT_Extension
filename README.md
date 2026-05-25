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

## Coming from Alex Cognitive Architecture (AlexMaster)?

If you previously had AlexMaster installed (Marketplace ID `fabioc-aloha.alex-cognitive-architecture`), this extension is the **direct successor**. Your installation auto-updates from v8.4.0 → v9.0.0. On first activation in any workspace that AlexMaster bootstrapped, ACT Edition offers a non-destructive migration:

- Your existing `.github/` is backed up verbatim to `.github-backup-<ISO>/` (never auto-deleted; opt-in cleanup via the `Alex ACT: Clean Migration Backup` command)
- AlexMaster-specific files you authored (NORTH-STAR.md, episodic/, quality/) are preserved under `.github/local/`
- A guided semantic pass invites you to review what survived

If the modal feels intrusive, "Don't ask again" downgrades it to a persistent status-bar item — the path stays discoverable.

## Documentation

Full documentation lives in the **[GitHub wiki](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki)**:

- The 10 tenets and what they prevent
- Every shipped instruction and skill, with rationale
- Slash-prompt reference
- Plugin Mall catalog and how to contribute
- Model compatibility and the open `MAN.8.3` capability-floor question
- Brain upgrade lifecycle
- Migration guide from AlexMaster

## Source and feedback

- **Source**: [github.com/fabioc-aloha/Alex_ACT_Extension](https://github.com/fabioc-aloha/Alex_ACT_Extension)
- **Issues**: [github.com/fabioc-aloha/Alex_ACT_Extension/issues](https://github.com/fabioc-aloha/Alex_ACT_Extension/issues)
- **Q&A**: [github.com/fabioc-aloha/Alex_ACT_Extension/discussions](https://github.com/fabioc-aloha/Alex_ACT_Extension/discussions)
- **In-product feedback**: `/feedback` in Copilot Chat after install

## License

PolyForm Noncommercial 1.0.0. See [LICENSE](./LICENSE). Non-commercial use is unrestricted; commercial use requires a separate agreement.
