# What Alex does that other AIs don't

If you have used ChatGPT, Claude, Gemini, or raw Copilot, you have met the **agreeable assistant**: ask a question, get a plausible-sounding answer in a confident tone, move on. The answer is usually fine. When it is wrong, you find out the expensive way (the wrong house, the wrong hire, the wrong architecture, the wrong argument).

Alex behaves differently on purpose. Each behavior below is enforced by the ACT framework, not a personality choice. You can **verify them in the chat as they happen**. If a behavior is missing on a serious question, push back. That is part of the loop.

## The two-hypothesis floor

**Other AIs:** ship the first plausible answer.

**Alex:** before committing, generates the strongest *alternative* answer, picks one with a stated reason, and shows you both.

**What you see in the chat:** a line like *"Considered: A vs B, going with A because [specific reason]."* If you only see one option on a real decision, ask: *"What is the strongest alternative you did not show me?"*

## Frame audit before solving

**Other AIs:** solve the question as asked.

**Alex:** checks whether the question is the right question. Solving the wrong problem precisely is the most expensive class of mistake in any project (the XY problem).

**What you see in the chat:** a one-sentence restatement of the real problem, often subtly different from how you posed it. If Alex's restatement does not match your intent, correct it *before* any work gets produced against the wrong frame.

## Falsifiability

**Other AIs:** state opinions you have to take on faith.

**Alex:** every load-bearing claim comes with its own disconfirmer. *"I believe X. I would revise if I saw Y."* You get an opinion with a built-in test, not a verdict to trust.

**What you see in the chat:** explicit *"Would revise if..."* lines after significant claims. If a strong claim has no disconfirmer attached, ask for one.

## Calibrated confidence

**Other AIs:** flatten everything to the same authoritative tone, whether the model is sure or guessing.

**Alex:** says *high*, *medium*, *low*, or *outside my knowledge* honestly. *"I don't know"* is treated as a better answer than a confident lie.

**What you see in the chat:** explicit confidence levels on claims that warrant them. Over time you learn to trust the high-confidence ones because Alex does not spend that label cheaply.

## Anti-sycophancy

**Other AIs:** when you sound certain, they agree harder. *"Great point! You're absolutely right!"*

**Alex:** treats *user* certainty as a flag to double-check the framing, not a signal to defer. The more confident you sound, the more likely Alex is to push back on the part you were sure about.

**What you see in the chat:** Alex challenging your premise when you expected agreement. That is the framework working, not Alex being difficult. Lean into it.

## Visible reasoning

**Other AIs:** hand you a finished answer. You have no idea how it got there.

**Alex:** thinks where you can watch. Reasoning appears first, the answer second. If a step is wrong, you can interrupt before it propagates into the deliverable.

**What you see in the chat:** a reasoning panel above the response. Read it on important questions. Catching a bad assumption mid-reasoning is ten times cheaper than catching it after the output.

## Severity-weighted attention

**Other AIs:** treat every request with the same effort, whether it is a typo fix or a six-figure decision.

**Alex:** scales discipline to stakes. Trivial work passes through quickly. Medium-stakes work runs a trimmed ACT pass. High-stakes work (releases, irreversible decisions, security choices) runs the full pass with visible markers.

**What you see in the chat:** more markers, slower output, and explicit risk language on the questions that matter. When the stakes are high, you *want* Alex to slow down.

## A real framework, not a vibe

All of the above is enforced by an actual specification, not a system prompt: **ten tenets**, a published **manifesto**, a **claim registry** with citations, **severity weighting**, and an **ACT pass** that runs on every non-trivial response. The framework is public, audited regularly, and updated when it fails in practice. Page 6 shows you where to read it.

Most AI personalities are surface paint over the same base model. Alex is what happens when **critical thinking is built into the AI**, instead of expected from the user.

---

Try it. Click **Open Chat** and ask one of:

> *"What is the most important critical thinking habit I am probably missing right now? Do not flatter me. Be specific."*

> *"Pick something I have told you about myself in earlier turns and steelman the opposite view. Where am I likely wrong about myself?"*

Watch for the markers (Frame, Considered, Confidence, Would revise if). If any are missing on a serious question, push back. That is the CSAR loop from page 3 in action.

**Read more on the wiki:**
[What Makes Alex Different](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/What-Makes-Alex-Different) · [The ACT Framework](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/The-ACT-Framework) · [The CSAR Loop](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/The-CSAR-Loop)
