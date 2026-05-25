# Working in Other Languages

Alex speaks whatever language the underlying AI model speaks well, which on current Claude and GPT-class models is essentially every major one: Portuguese (European and Brazilian), Spanish, French, German, Italian, Dutch, Japanese, Chinese, Korean, Arabic, Russian, Hindi, and many more.

## How it works

### Just switch

Write your first message in the language you want and Alex answers in kind. No setting to flip, no language flag to set. If the conversation drifts back to English and you want it to stay in your language, just say so:

> *"Responde em português, por favor."*

> *"Responde en español, por favor."*

> *"Antworte bitte auf Deutsch."*

> *"日本語で答えてください。"*

Alex will switch and stay switched.

### The ACT discipline travels with the language

The framework markers translate naturally. Same machinery, your language.

| English | Portuguese | Spanish | French |
| --- | --- | --- | --- |
| *"Considered: A vs B, going with A because..."* | *"Considerado: A vs B, vou com A porque..."* | *"Considerado: A vs B, voy con A porque..."* | *"Considéré: A vs B, je choisis A parce que..."* |
| *"Frame: ..."* | *"Reformulação do problema: ..."* | *"Reformulación: ..."* | *"Reformulation: ..."* |
| *"Confidence: high / medium / low"* | *"Confiança: alta / média / baixa"* | *"Confianza: alta / media / baja"* | *"Confiance: élevée / moyenne / faible"* |
| *"Would revise if..."* | *"Mudaria de ideia se..."* | *"Cambiaría de opinión si..."* | *"Je réviserais si..."* |
| *"I don't know."* | *"Não sei."* | *"No sé."* | *"Je ne sais pas."* |

The markers are not English idioms with translated decoration. They are the same epistemic commitments expressed natively. *"Mudaria de ideia se..."* is a real Portuguese-sounding hedge, not a literal back-translation.

### Mix freely

Technical terms (library names, framework jargon, variable names, file paths, command-line snippets) usually stay in English even in a Portuguese or Spanish conversation. That is natural and Alex will not fight you on it. *"Vou usar o `pandas` para fazer o `groupby` e depois um `merge`"* is perfectly normal and Alex follows along.

### The brain is in English

The instructions, skills, and prompts that shape Alex's behavior are English files. Alex reads them in English and *applies the discipline in whatever language you write to it in*. You do not need to translate anything yourself. The framework is language-independent; the substrate it runs on is English.

### Quality note

Best raw output quality is in English for highly technical edge cases (deep compiler internals, niche academic statistics in obscure subfields, esoteric standards documents). For everything else (creative writing, professional prose, research, financial reasoning, coaching, personal decisions, ordinary code), major languages like Portuguese, Spanish, French, German, Japanese, and Chinese are plenty strong.

If you are doing something niche and the output feels weaker than usual, try restating the prompt in English to see if quality jumps. If it does, that is your signal to either work in English for that specific task or to be more explicit in your non-English prompt.

## Working multilingual on one project

You can mix languages in the same conversation. Common pattern:

- Project memory and code in English (because the tools assume English).
- Conversation with Alex in Portuguese (because you think and talk in Portuguese).
- Final deliverable in whatever the audience reads.

Alex handles the mode-switching cleanly. It is not unusual to ask in Portuguese, get the reasoning in Portuguese, and have Alex name the code variables in English without breaking flow.

## Project memory in multiple languages

The `.github/` folder ([Project Memory](Project-Memory)) is plain text. You can write parts of it in your language if that makes more sense for the project (a Portuguese cookbook project should have a Portuguese `copilot-instructions.md`). Alex reads either way. Mixing the always-on English brain with a Portuguese project identity works without friction.

## Pushback also works in any language

The push-back phrases from [Privacy, Troubleshooting, Help](Privacy-Troubleshooting-Help) translate. In Portuguese:

- *"Isso está errado porque [motivo]."*
- *"Você está confiante demais. O que faria você mudar de ideia?"*
- *"Pressione mais. Tente falsificar sua própria afirmação."*
- *"Qual é a posição contrária mais forte?"*

Same loop, your language. The framework is not English-shaped; it is critical-thinking-shaped.

---

*Last reviewed: 2026-05-25*
