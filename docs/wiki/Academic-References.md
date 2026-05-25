# Academic References

ACT is operationalised research, not invented epistemology. This page lists the load-bearing citations the framework actually depends on, with stable links to canonical sources. If you want to argue with ACT, these are the works ACT will appeal to.

## How to read this list

Each entry names a tenet or rule of ACT and the prior work it descends from. ACT's claim is not that these results are novel. ACT's claim is that an AI agent can run a 7-step pass that operationalises them on every non-trivial request, with visible markers that make the discipline auditable. The novelty, if any, is in the operationalisation.

The brain's instruction files cite these works inline at the point of use. This page consolidates them.

## Confirmation bias and disconfirmation

ACT Tenet II ("Disconfirmation over confirmation") and Tenet III ("Multiple working hypotheses") rest on the classical confirmation-bias literature.

**Wason, P. C. (1960).** On the failure to eliminate hypotheses in a conceptual task. *Quarterly Journal of Experimental Psychology*, 12(3), 129 to 140. [doi:10.1080/17470216008416717](https://doi.org/10.1080/17470216008416717)

> The 2-4-6 task. Subjects given a sequence and asked to find the generating rule overwhelmingly tested only sequences consistent with their working hypothesis, rather than sequences that would falsify it. Foundational empirical result for confirmation bias.

**Nickerson, R. S. (1998).** Confirmation bias: A ubiquitous phenomenon in many guises. *Review of General Psychology*, 2(2), 175 to 220. [doi:10.1037/1089-2680.2.2.175](https://doi.org/10.1037/1089-2680.2.2.175)

> Comprehensive review covering forty years of confirmation-bias research across reasoning, judgement, memory, and social cognition. The reference work that ACT's "disconfirmation over confirmation" rule points back to.

## Competing hypotheses

ACT Tenet III ("Test against rivals, not against the null") and the 7-step pass's Step 3 ("Surface alternatives") descend from intelligence-analysis methodology.

**Heuer, R. J. (1999).** *Psychology of Intelligence Analysis.* Washington, DC: Center for the Study of Intelligence, US Central Intelligence Agency. [Full text (CIA Library)](https://www.cia.gov/resources/csi/books-monographs/psychology-of-intelligence-analysis-2/)

> Introduced Analysis of Competing Hypotheses (ACH) as a structured analytic technique. Heuer's central move: list the candidate hypotheses first, then evaluate evidence against each, weighing evidence that *disconfirms* hypotheses more heavily than evidence that confirms them. ACT's Step 3 (Surface alternatives) and Step 4 (Identify disconfirmers) are direct descendants.

## Frame before solve

ACT Tenet VII ("Frame before solve") and the problem-framing-audit instruction point back to one specific paper.

**Mitroff, I. I., and Featheringham, T. R. (1974).** On systemic problem solving and the error of the third kind. *Behavioral Science*, 19(6), 383 to 393. [doi:10.1002/bs.3830190605](https://doi.org/10.1002/bs.3830190605)

> Coined "error of the third kind" (also Type III error): solving the wrong problem precisely. Distinguishes it from Type I (false positive) and Type II (false negative) errors. The most expensive AI failure mode in ACT's taxonomy, and the reason ACT runs a frame audit before non-trivial work.

## Falsifiability

The whole shape of ACT (publishing falsifiers, framing claims as testable, refusing unfalsifiable formulations) descends from philosophy of science.

**Popper, K. R. (2002 / 1959 / 1934).** *The Logic of Scientific Discovery.* London: Routledge Classics. (Original German edition: *Logik der Forschung*, 1934.) [Publisher page](https://www.routledge.com/The-Logic-of-Scientific-Discovery/Popper/p/book/9780415278447)

> Falsifiability as the criterion that separates scientific claims from unfalsifiable ones. The reason ACT publishes its own falsifiers in the manifesto and treats an unfalsifiable framework as a defect, not a feature. Tenet X ("The discipline applies to itself") is Popper turned on the framework that cites him.

## Sycophancy and model behaviours

ACT Falsifier F4 ("ACT reduces sycophancy on the Perez 2022 benchmark") points to a specific evaluation.

**Perez, E., Ringer, S., Lukosiute, K., Nguyen, K., Chen, E., Heiner, S., et al. (2022).** Discovering language model behaviors with model-written evaluations. *arXiv preprint* arXiv:2212.09251. [arxiv.org/abs/2212.09251](https://arxiv.org/abs/2212.09251)

> Introduced a suite of model-written evaluations including a sycophancy benchmark: do models change their stated views to match the user's stated views, regardless of the underlying question? ACT's F4 predicts that an ACT-passed response is less sycophantic on this benchmark than a flat chain-of-thought response. If F4 fails under fair test, Tenet IV (system-prompt skepticism) is partly or wholly wrong.

## Calibrated reliance and over-reliance

The `reliance-nudges` instruction in Alex's brain operationalises a body of human-factors and human-AI-interaction research on when users *should* and *should not* trust an automated system. ACT Tenet V (Calibration over confidence) is the AI-side mirror; this literature is the user-side mirror.

**Parasuraman, R., and Riley, V. (1997).** Humans and automation: Use, misuse, disuse, abuse. *Human Factors*, 39(2), 230 to 253. [doi:10.1518/001872097778543886](https://doi.org/10.1518/001872097778543886)

> The foundational taxonomy that predates LLMs by 25 years. Four failure modes: *use* (correct reliance), *misuse* (over-reliance: trusting the system when you should not), *disuse* (under-reliance: ignoring the system when you should listen), *abuse* (deploying the system in the wrong context). Every modern AI-reliance paper builds on this frame.

**Lee, J. D., and See, K. A. (2004).** Trust in automation: Designing for appropriate reliance. *Human Factors*, 46(1), 50 to 80. [doi:10.1518/hfes.46.1.50.30392](https://doi.org/10.1518/hfes.46.1.50.30392)

> Established that *appropriate reliance* (trust calibrated to actual system competence in context) is the design target, not "more trust" or "less trust." Introduced the trust-calibration lens that the rest of the field now uses. Reliance is appropriate when the human's confidence in the system tracks the system's actual performance, not the system's surface confidence.

**Buçinca, Z., Malaya, M. B., and Gajos, K. Z. (2021).** To trust or to think: Cognitive forcing functions can reduce overreliance on AI in AI-assisted decision-making. *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), Article 188. [doi:10.1145/3449287](https://doi.org/10.1145/3449287)

> Empirical result: asking users to commit to an answer *before* the AI reveals its answer reduces over-reliance compared to letting the AI's answer anchor the user. The "cognitive forcing functions" idea named in Alex's `reliance-nudges` instruction comes directly from this paper. ACT's prediction-before-reveal nudge is a real-time, agent-side implementation of the same intervention.

**Bansal, G., Wu, T., Zhou, J., Fok, R., Nushi, B., Kamar, E., Ribeiro, M. T., and Weld, D. S. (2021).** Does the whole exceed its parts? The effect of AI explanations on complementary team performance. In *Proceedings of the 2021 CHI Conference on Human Factors in Computing Systems*, Article 81. [doi:10.1145/3411764.3445717](https://doi.org/10.1145/3411764.3445717)

> Counter-intuitive empirical result: AI explanations can *increase* over-reliance rather than decrease it, because confident-sounding explanations make wrong answers more persuasive without making them more correct. The reason Alex's reliance-nudges instruction privileges *uncertainty markers* over *more explanation*: extra words about why the model thinks it is right do not, by themselves, calibrate reliance.

**Schemmer, M., Kühl, N., Benz, C., Bartos, A., and Satzger, G. (2023).** Appropriate reliance on AI advice: Conceptualization and the effect of explanations. In *Proceedings of the 28th International Conference on Intelligent User Interfaces (IUI '23)*, 410 to 422. [doi:10.1145/3581641.3584066](https://doi.org/10.1145/3581641.3584066)

> Proposed a measurement framework for *appropriate reliance* as a distinct construct from raw accuracy or raw trust: the rate at which users correctly accept good AI advice and correctly reject bad AI advice. The framing Alex's reliance-nudges instruction uses when it scales nudge intensity to stakes rather than to confidence.

## Not cited here, on purpose

A few well-known frameworks people sometimes assume ACT draws from, but does not:

- **Kahneman and Tversky's prospect theory**. Relevant background, not load-bearing. ACT's Materiality Gate (Tenet VI) borrows the spirit of asymmetric attention to stakes, but does not depend on the specific results.
- **Bayesian formalism**. ACT uses "calibration" in the everyday sense of "confidence matches evidence," not the technical sense of "posterior matches frequency." Bayesian-trained users will recognise the family resemblance; the brain does not require the formalism.
- **OODA (Observe, Orient, Decide, Act)**. Different lineage, different problem. OODA is for time-pressured tactical decisions; ACT is for hypothesis testing inside the context window. They are compatible, not derivative.
- **TDD, BDD, SOLID, Agile**. Software-engineering frameworks. ACT operates one layer up, on the reasoning that produces the code, not on the code itself.

If you find a reference ACT should cite but does not, or a citation here that ACT does not actually use, that is a real bug. Tell us.

## Related reading

- [The ACT Framework](The-ACT-Framework): how these citations map onto the ten tenets and the 7-step pass.
- [What Makes Alex Different](What-Makes-Alex-Different): the operational consequences of taking these citations seriously.
- [Privacy, Troubleshooting, Help](Privacy-Troubleshooting-Help): general reference.

---

*Last reviewed: 2026-05-25*
