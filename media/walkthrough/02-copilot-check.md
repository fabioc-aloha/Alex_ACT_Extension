# Set up GitHub Copilot: subscription and model

GitHub Copilot now ships **built into VS Code**. You don't install it as an extension anymore. What you do need:

1. **Sign in** to GitHub
2. **Pick a Copilot subscription** that matches how you'll use Alex
3. **Choose a model** built for reasoning, not speed

Skipping the last one is the most common reason people say "the AI feels shallow." Models matter. A lot.

## 1. Sign in to GitHub

Bottom-left of VS Code, click the **account icon** (small person silhouette). Pick **Sign in with GitHub** and follow the browser prompt.

Already signed in? Clicking the icon shows your GitHub username. You're done.

## 2. Pick a Copilot subscription

Tiers control two things: how many requests you can make per month, and which AI models you're allowed to use. **Model access is the part that matters for ACT.**

| Tier | What you get | Best for |
| --- | --- | --- |
| **Copilot Free** | Limited monthly chat + completions, basic models only | Trying Alex, occasional questions |
| **Copilot Pro** | Higher monthly limits, access to stronger models | Regular use, real decisions |
| **Copilot Pro+** | Premium reasoning models, longer context, highest limits | Heavy use, long projects, complex thinking |
| **Business / Enterprise** | Org-managed, premium models, admin controls | Work-issued accounts |

Current pricing, monthly limits, and exact model lists per tier live at [github.com/features/copilot/plans](https://github.com/features/copilot/plans). The free tier is a real way to try Alex; if you outgrow it, Pro is usually enough for serious work.

## 3. Pick a reasoning model (this is where most people miss the upgrade)

In the chat panel, look near the input box for the **model picker** (it shows the current model name, like `Claude Sonnet 4.x` or `GPT-5`). Click it. You'll see what your tier gives you.

**For critical thinking, choose a reasoning model.** They expose more of their thinking, generate stronger alternatives, resist the "agreeable assistant" failure mode, and hold the ACT framework cleanly. Look for these markers in the name:

- `Sonnet`, `Opus` (Anthropic, currently the strongest fit for ACT)
- `o3`, `o4`, `reasoning`, `thinking` (OpenAI and Google reasoning families)
- Longer context (anything advertising 200K+ tokens)

**Avoid for serious work:** anything labelled `mini`, `lite`, `haiku`, `flash`, or "fast." Those are tuned for speed and price, not reasoning depth. They cut corners on hypothesis generation, frame audits, and pre-mortems. Fine for a quick lookup, wrong tool for a decision.

If you're on **Copilot Free** and only see basic models, that's okay for a first taste. Expect Alex's discipline (two-hypothesis, frame audit, calibrated confidence) to land more crisply once you upgrade to a tier with real reasoning models.

## 4. Quick verification

- **Copilot icon** bottom-right of the VS Code window. No warning means it's awake. Warning sign? Click it.
- **Chat panel** opens with `Ctrl+Alt+I` (Mac: `Cmd+Alt+I`) or via the **Open Chat** button on this page.
- **Model picker** shows in the chat. If it's blank, pick one.

Once you're signed in and on a reasoning model, you're ready to put Alex to work. Next step.

**Read more on the wiki:**
[Getting Started](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Getting-Started) · [Privacy, Troubleshooting, Help](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Privacy-Troubleshooting-Help)
