# The CSAR Loop

Most people jump straight to **Act**. They tell Alex what to do and start collecting output. That is **vibe coding**: producing turn after turn with no shared understanding of what is being built, no check that the right thing is being built, and no reflection on whether what got built actually works. The output looks like progress. It usually is not.

The cure is a four-beat conversational loop from the ACT framework: **CSAR**. Every meaningful working session with Alex should run through it.

- **C**: Clarify
- **S**: Summarize
- **A**: Act
- **R**: Reflect

This is not a checklist you run once at the start of a project. It is the rhythm of every working conversation, and it cycles many times before the work is done. Skipping any of the four is where the work breaks.

## C: Clarify

**Before doing anything, surface what is unclear.** Alex should be asking you questions. You should be asking Alex questions back. If your first message is *"build me X"* and the response is immediately code, that is a red flag, not a feature.

### Conversational moves that belong here

> *"Before you start, name the assumptions you are making about [the data / the audience / the goal / the constraints]. I will correct any that are wrong."*

> *"I have three constraints I have not mentioned yet: [list]. How does that change what you would recommend?"*

> *"What is the most important question I have not asked about this?"*

### Exit criterion

You leave Clarify when both of you can state, in one sentence, what is being built and why, *without contradicting each other*.

## S: Summarize

**Restate the problem before solving it.** This is the frame audit. Alex gives you back its understanding of the task, in its own words, before producing anything. You do the same: read the frame back in your own words. Mismatch shows up here, while it is still cheap to fix.

### Conversational moves that belong here

> *"Before you act, restate what we are doing in one sentence, including success criteria and the top risk."*

> *"Here is what I think we agreed on: [your restatement]. Where am I wrong?"*

> *"What is the load-bearing assumption in our plan? If it is false, what falls?"*

### Exit criterion

You leave Summarize when the frame is shared, written down, and you can both name *what evidence would prove the frame wrong*.

## A: Act

**Now do the work, with the frame visible.** The agreed plan from Summarize stays on the table. Alex produces the deliverable (code, draft, analysis, decision, design). You watch for drift. When the work pulls away from the frame, name it out loud.

### Conversational moves that belong here

> *"Working from the frame we just agreed on, produce [the thing]. Flag anywhere the work pulls away from the plan."*

> *"Stop. We just made a decision that was not in the original frame. Was that intentional?"*

> *"You changed direction mid-output. What changed your mind, and was it a good change?"*

### Exit criterion

Act ends when the deliverable exists in a state you can actually evaluate, not before. *Compiles* is not *works*. *Drafted* is not *done*.

## R: Reflect

**Check what happened.** This is where most conversations fail. The deliverable arrives, everyone says "looks good", and the work moves on. Reflect is non-negotiable. Without it, you cannot tell good work from confident-looking work.

### Conversational moves that belong here

> *"Run a postmortem on the output. Where is it weakest? What would a hostile reviewer attack first?"*

> *"What did you do that was actually load-bearing, versus what just looked thorough?"*

> *"What surprised you while doing this? What should we remember for next time?"*

> *"Confidence check: how sure are you, and what would change that?"*

### Exit criterion

Reflect ends with one of these: a confirmed good result, a list of fixes to make, a captured lesson, or a decision to go back to Clarify because the frame itself was wrong.

## CSAR is a loop, not a line

A real conversation cycles through CSAR many times. Reflect often sends you back to Clarify because the output revealed an assumption you did not know you were making. That is the loop working, not a failure. Each pass leaves you with a sharper frame, a stronger deliverable, and a clearer view of what is still unknown.

```
Clarify  →  Summarize  →  Act  →  Reflect
   ↑                                  │
   └──────────────────────────────────┘
```

## The anti-pattern: spotting when you have dropped the loop

You have slid back into vibe coding when:

- Alex never asks you a question (**Clarify dropped**).
- You cannot say in one sentence what is being built (**Summarize dropped**).
- You and Alex produce turn after turn with no reference to a shared plan (**Act with no frame**).
- The conversation ends with *"thanks, looks good"* and nothing gets pressure-tested (**Reflect dropped**).

When you notice any of these, stop. Say:

> *"We dropped the loop. Let's restart from Clarify."*

That single move, run honestly, is what separates **working with Alex** from **generating output with Alex**.

## CSAR by domain

The loop is the same; what fills each beat changes by context.

### Software project

- **Clarify**: what does success look like, who is the user, what is in scope, what is explicitly out.
- **Summarize**: the one-sentence architecture, the top risk, the test that would prove it works.
- **Act**: write the code, watch for scope creep, name surprises as they happen.
- **Reflect**: tests pass, but is the design fragile? Where will the next bug live?

### Writing a proposal or essay

- **Clarify**: who reads this, what do they need to believe, what is the strongest objection.
- **Summarize**: thesis in one sentence, three load-bearing claims, the disconfirmer for each.
- **Act**: draft. Watch for tone drift, claim inflation, missing citations.
- **Reflect**: would a hostile reviewer accept this? Where is it weakest?

### Career or personal decision

- **Clarify**: what are you actually choosing between, what assumptions are you making about each option.
- **Summarize**: the decision in one sentence, the cost of being wrong each direction.
- **Act**: make the call, write down *why*, with the disconfirmers.
- **Reflect**: revisit in a defined window (one week, one month). What signal would tell you to revise?

### Research or analysis

- **Clarify**: what is the question, what evidence would answer it, what evidence would falsify it.
- **Summarize**: the hypothesis, the method, the failure mode of the method.
- **Act**: run the analysis. Document anomalies as they appear.
- **Reflect**: how robust is the conclusion? What would a skeptical reviewer demand next?

## Related reading

- **[What Makes Alex Different](What-Makes-Alex-Different)**: the seven behaviors that show up inside CSAR.
- **[The ACT Framework](The-ACT-Framework)**: where CSAR comes from.

---

*Last reviewed: 2026-05-25*
