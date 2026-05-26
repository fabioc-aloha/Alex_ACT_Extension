# Set up GitHub Copilot: subscription and model

GitHub Copilot ships **built into VS Code**. You don't install it as an extension. Three things to do:

1. **Sign in to GitHub.** Click the account icon (bottom-left of VS Code) and **Sign in with GitHub**.
2. **Pick a Copilot subscription.** Tiers control monthly request limits *and* which AI models you can use. Free works for a first taste; Pro is usually enough for serious work. Current pricing and model lists per tier: [github.com/features/copilot/plans](https://github.com/features/copilot/plans).
3. **Choose a reasoning model.** This is where most people miss the upgrade.

## Picking a model for critical thinking

In the chat panel, find the **model picker** near the input box. For ACT, choose a reasoning model:

- **Use:** `Sonnet`, `Opus` (Anthropic), or anything tagged `o3`, `o4`, `reasoning`, `thinking`.
- **Avoid for serious work:** anything labelled `mini`, `lite`, `haiku`, `flash`, or "fast." Tuned for speed, not depth.

## Verify it's working

- **Copilot icon** bottom-right of VS Code: no warning means it's awake.
- **Chat panel**: `Ctrl+Alt+I` (Mac: `Cmd+Alt+I`) or click **Open Chat** below.

**Wiki:** [Getting Started](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Getting-Started) · [Privacy, Troubleshooting, Help](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Privacy-Troubleshooting-Help)
