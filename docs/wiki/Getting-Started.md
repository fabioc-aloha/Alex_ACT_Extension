# Getting Started

Five minutes from zero to a real conversation with Alex.

## 1. Install the extension

If you arrived here from a fresh VS Code install:

1. Open VS Code.
2. Open the Extensions view (`Ctrl+Shift+X`, Mac: `Cmd+Shift+X`).
3. Search for **Alex: Cognitive Architecture**.
4. Click **Install**.

When the extension loads it opens a welcome walkthrough. You can re-open it any time with `Ctrl+Shift+P` then *Alex: Open Welcome Guide*.

## 2. Sign in to GitHub Copilot

GitHub Copilot is now built into VS Code (no separate extension required). You do need a GitHub account signed in:

- Bottom-left of VS Code, click the **account icon** (small person silhouette).
- Pick **Sign in with GitHub** and follow the browser prompt.

Already signed in? Clicking the icon shows your GitHub username. You are done.

## 3. Pick a Copilot subscription

Tiers control two things: how many requests you can make per month, and which AI models you are allowed to use. **Model access is the part that matters for ACT.**

| Tier | What you get | Best for |
| --- | --- | --- |
| **Copilot Free** | Limited monthly chat and completions, basic models only | Trying Alex, occasional questions |
| **Copilot Pro** | Higher monthly limits, access to stronger models | Regular use, real decisions |
| **Copilot Pro+** | Premium reasoning models, longer context, highest limits | Heavy use, long projects, complex thinking |
| **Business / Enterprise** | Org-managed, premium models, admin controls | Work-issued accounts |

Current pricing, monthly limits, and exact model lists per tier live at [github.com/features/copilot/plans](https://github.com/features/copilot/plans). The free tier is a real way to try Alex; if you outgrow it, Pro is usually enough for serious work.

## 4. Pick a reasoning model (this is where most people miss the upgrade)

In the chat panel, look near the input box for the **model picker** (it shows the current model name, like `Claude Sonnet 4.x` or `GPT-5`). Click it.

**For critical thinking, choose a reasoning model.** They expose more of their thinking, generate stronger alternatives, resist the "agreeable assistant" failure mode, and hold the ACT framework cleanly. Look for these markers in the model name:

- `Sonnet`, `Opus` (Anthropic, currently the strongest fit for ACT).
- `o3`, `o4`, `reasoning`, `thinking` (OpenAI and Google reasoning families).
- Longer context (anything advertising 200K+ tokens).

**Avoid for serious work:** anything labelled `mini`, `lite`, `haiku`, `flash`, or "fast." Those are tuned for speed and price, not reasoning depth. They cut corners on hypothesis generation, frame audits, and pre-mortems. Fine for a quick lookup, wrong tool for a decision.

If you are on **Copilot Free** and only see basic models, that is okay for a first taste. Expect Alex's discipline (two-hypothesis, frame audit, calibrated confidence) to land more crisply once you upgrade to a tier with real reasoning models.

## 5. Quick verification

- **Copilot icon** bottom-right of the VS Code window. No warning means it is awake. Warning sign? Click it.
- **Chat panel** opens with `Ctrl+Alt+I` (Mac: `Cmd+Alt+I`).
- **Model picker** shows in the chat. If it is blank, pick one.

## 6. Your first real conversation

Open the chat and try one of these. They are designed to surface Alex's discipline in the first few turns:

> *"What is the most important critical thinking habit I am probably missing right now? Do not flatter me. Be specific. Ask me a question first if you need to."*

> *"I am about to make a decision about [thing]. Steelman the case against. Tell me what I am probably not seeing."*

> *"I want to plan a project: [one-sentence description]. Run a frame audit before you suggest anything. Is this even the right problem?"*

Watch what shows up in the chat: a frame restatement, a second hypothesis, a confidence level, a *would revise if* line. Those are the ACT markers. They are the framework working.

## Next steps

- New to the conversational discipline? Read **[The CSAR Loop](The-CSAR-Loop)**.
- Curious about what makes Alex different from raw Copilot? Read **[What Makes Alex Different](What-Makes-Alex-Different)**.
- Working in a non-English language? **[Working in Other Languages](Working-in-Other-Languages)**.

---

*Last reviewed: 2026-05-25*
