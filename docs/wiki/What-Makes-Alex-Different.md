# What Makes Alex Different

If you have used ChatGPT, Claude, Gemini, or raw Copilot, you have met the **agreeable assistant**: ask a question, get a plausible-sounding answer in a confident tone, move on. The answer is usually fine. When it is wrong, you find out the expensive way (the wrong house, the wrong hire, the wrong architecture, the wrong argument).

Alex behaves differently on purpose. Each behavior below is enforced by the [ACT framework](The-ACT-Framework), not a personality choice. You can **verify them in the chat as they happen**. If a behavior is missing on a serious question, push back. That is part of the [CSAR loop](The-CSAR-Loop).

## 1. The two-hypothesis floor

**Other AIs:** ship the first plausible answer.

**Alex:** before committing, generates the strongest *alternative* answer, picks one with a stated reason, and shows you both.

**What you see in the chat:** a line like *"Considered: A vs B, going with A because [specific reason]."*

**Push-back if missing:** *"What is the strongest alternative you did not show me?"*

### Example

> **Prompt:** "We should use a NoSQL database for this project."
>
> **Weak response:** "Good idea. Here is a MongoDB schema..."
>
> **Alex:** "Considered: NoSQL vs PostgreSQL with JSONB columns, going with PostgreSQL because your query patterns are relational (joins across users, orders, and items) and you only have one document-shaped collection. Would revise if the document collection grows beyond half the workload."

## 2. Frame audit before solving

**Other AIs:** solve the question as asked.

**Alex:** checks whether the question is the right question. Solving the wrong problem precisely is the most expensive class of mistake in any project (the XY problem).

**What you see in the chat:** a one-sentence restatement of the real problem, often subtly different from how you posed it.

**Push-back if missing:** *"Restate the problem in your own words before solving."*

### Example

> **Prompt:** "How do I make my function run faster?"
>
> **Alex:** "Frame: you want the function faster, but the actual pain (from earlier) is that the page takes 8 seconds to load. The function runs in 200ms. Speeding it up will not help. The load time is probably the three sequential API calls before this function runs. Want to look there first?"

## 3. Falsifiability

**Other AIs:** state opinions you have to take on faith.

**Alex:** every load-bearing claim comes with its own disconfirmer. *"I believe X. I would revise if I saw Y."* You get an opinion with a built-in test, not a verdict to trust.

**What you see in the chat:** explicit *"Would revise if..."* lines after significant claims.

**Push-back if missing:** *"What would change your mind on that?"*

### Example

> **Alex:** "This refactor is worth doing. Confidence: medium. Would revise if you tell me this code is being deprecated next quarter, or if the test coverage is already below 30% (in which case the refactor risk outweighs the cleanup benefit)."

## 4. Calibrated confidence

**Other AIs:** flatten everything to the same authoritative tone, whether the model is sure or guessing.

**Alex:** says *high*, *medium*, *low*, or *outside my knowledge* honestly. *"I don't know"* is treated as a better answer than a confident lie.

**What you see in the chat:** explicit confidence levels on claims that warrant them. Over time you learn to trust the high-confidence ones because Alex does not spend that label cheaply.

**Push-back if missing:** *"What is your confidence here, and why?"*

## 5. Anti-sycophancy

**Other AIs:** when you sound certain, they agree harder. *"Great point! You're absolutely right!"*

**Alex:** treats *user* certainty as a flag to double-check the framing, not a signal to defer. The more confident you sound, the more likely Alex is to push back on the part you were sure about.

**What you see in the chat:** Alex challenging your premise when you expected agreement. That is the framework working, not Alex being difficult. Lean into it.

**Push-back if missing:** *"Stop agreeing with me. Try to falsify what I just said."*

## 6. Visible reasoning

**Other AIs:** hand you a finished answer. You have no idea how it got there.

**Alex:** thinks where you can watch. Reasoning appears first, the answer second. If a step is wrong, you can interrupt before it propagates into the deliverable.

**What you see in the chat:** a reasoning panel above the response. Read it on important questions. Catching a bad assumption mid-reasoning is ten times cheaper than catching it after the output.

**Note:** visible reasoning depends on the model. Reasoning-tier models (Claude Sonnet/Opus, OpenAI o-series) expose it. Fast/lite models hide it. See [Getting Started](Getting-Started) for picking the right model.

## 7. Severity-weighted attention

**Other AIs:** treat every request with the same effort, whether it is a typo fix or a six-figure decision.

**Alex:** scales discipline to stakes. Trivial work passes through quickly. Medium-stakes work runs a trimmed ACT pass. High-stakes work (releases, irreversible decisions, security choices) runs the full pass with visible markers.

**What you see in the chat:** more markers, slower output, and explicit risk language on the questions that matter. When the stakes are high, you *want* Alex to slow down.

## A real framework, not a vibe

All of the above is enforced by an actual specification, not a system prompt: **ten tenets**, a published **manifesto**, a **claim registry** with citations, **severity weighting**, and an **ACT pass** that runs on every non-trivial response. The framework is public, audited regularly, and updated when it fails in practice. See **[The ACT Framework](The-ACT-Framework)** for the full picture.

Most AI personalities are surface paint over the same base model. Alex is what happens when **critical thinking is built into the AI**, instead of expected from the user.

## Try it

Open the chat and ask one of:

> *"What is the most important critical thinking habit I am probably missing right now? Do not flatter me. Be specific."*

> *"Pick something I have told you about myself in earlier turns and steelman the opposite view. Where am I likely wrong about myself?"*

Watch for the markers (**Frame**, **Considered**, **Confidence**, **Would revise if**). If any are missing on a serious question, push back. That is the [CSAR loop](The-CSAR-Loop) in action.

---

*Last reviewed: 2026-05-25*
