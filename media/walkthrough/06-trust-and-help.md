# Honest answers: data, failure, where to learn more

## Where your data goes

Plain English:

- **Chat messages** flow through GitHub Copilot to an AI provider (OpenAI, Anthropic, or Google, depending on the model you pick). GitHub's privacy policy applies. By default, your conversations are not used for model training.
- **Alex's memory** of your project (the `.github/` folder) stays on your local machine. It's never uploaded anywhere.
- **No separate Alex account exists.** No Alex server, no separate login, no telemetry collected by Alex itself.
- **Everything is auditable.** Open the files. Read them. They're plain text.

## When Alex is wrong (and it will be)

Alex will get things wrong. The framework only works if you push back. Specifics that work:

- *"That's wrong because [reason]."* Alex revises.
- *"You're too confident. What would change your mind?"* Alex names the disconfirmer.
- *"You skipped [X]."* Alex addresses it.
- *"Push back harder. Try to falsify your own claim."* Alex stops agreeing and tries to break the argument.
- *"What's the strongest counter-position you can build?"* Alex steelmans the other side.

The worst failure mode is accepting a wrong answer because Alex sounded sure. Alex is a thinking partner, not an oracle. Treat it that way and the framework earns its keep.

## Working in another language

Alex speaks whatever language the underlying AI model speaks well, which on current Claude and GPT-class models is essentially every major one: Portuguese (European and Brazilian), Spanish, French, German, Italian, Dutch, Japanese, Chinese, Korean, Arabic, and many more.

**How it works:**

- **Just switch.** Write your first message in the language you want and Alex answers in kind. No setting to flip, no language flag to set.
- **The ACT discipline travels with the language.** Markers translate naturally. In Portuguese, expect lines like *"Considerado: A vs B, vou com A porque..."*, *"Reformulação do problema: ..."*, *"Confiança: alta / média / baixa"*, *"Mudaria de ideia se: ..."*. Same machinery, your language.
- **Mix freely.** Technical terms (library names, framework jargon, variable names, file paths) usually stay in English even in a Portuguese or Spanish conversation. That is natural and Alex will not fight you on it.
- **The brain is in English.** The instructions, skills, and prompts that shape Alex's behavior are English files. Alex reads them in English and *applies the discipline in whatever language you write to it in*. You do not need to translate anything yourself.
- **Quality note.** Best raw output quality is in English for highly technical edge cases (deep compiler internals, niche academic statistics in obscure subfields). For everything else (creative writing, professional prose, research, financial reasoning, coaching, personal decisions, ordinary code), major languages like Portuguese are plenty strong.

If the answer ever drifts back to English when you wanted to stay in another language, just say so: *"Responde em português, por favor."* Alex will switch and stay switched.

## When the tools fail

**No response in chat:** check the Copilot icon (bottom-right) for warnings, and the model picker in the chat input area (pick a model if it's blank).

**Chat panel disappeared:** `View → Chat` from the top menu, or `Ctrl+Alt+I` (Mac: `Cmd+Alt+I`).

**Start a fresh conversation:** click **+** at the top of the chat panel.

**Re-open this guide:** Command Palette (`Ctrl+Shift+P`) → *Alex: Open Welcome Guide*.

## Learn the framework

The full ACT framework is public: ten tenets, the manifesto, the failure modes Alex was built to prevent, the claim registry. Read it at the project repository if you want depth.

Or, faster: ask Alex.

> *"Teach me the single most important critical thinking habit I'm probably missing. Don't be generic, ask me a question first to figure out where I'm weak."*

That's the kind of question Alex was built for. Close this walkthrough when you're ready. The chat is on the right side of your screen.

**Read more on the wiki:**
[Home](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Home) · [Privacy, Troubleshooting, Help](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Privacy-Troubleshooting-Help) · [The ACT Framework](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/The-ACT-Framework) · [Working in Other Languages](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Working-in-Other-Languages)
