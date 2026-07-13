# Honest answers: data, failure, languages, help

## Where your data goes

Chat messages flow through GitHub Copilot to an AI provider (OpenAI, Anthropic, Google), under GitHub's privacy policy. By default, conversations aren't used for training. Alex's memory of your project (the `.github/` folder) stays local. No separate Alex account, server, or telemetry.

Shared `Alex_ACT_Memory` is a sibling Git repository, not a hidden backend.
Remote access defines who can read tracked channels. Profiles are encrypted and
loaded only on explicit demand. Never paste secrets into chat or tracked Memory
files.

Edition v4.1.0 resolves one exact local secret from the process, an explicit
file, the project `.env`, then Memory's ignored `.env`. Project values win. The
resolver never enumerates or imports the whole file and does not run at greeting.

## When Alex is wrong (and it will be)

The framework only works if you push back. Phrases that work:

- *"That's wrong because [reason]."*
- *"You're too confident. What would change your mind?"*
- *"Push back harder. Try to falsify your own claim."*
- *"What's the strongest counter-position you can build?"*

The worst failure mode is accepting a wrong answer because Alex sounded sure. Alex is a thinking partner, not an oracle.

## Working in another language

Write your first message in Portuguese, Spanish, French, German, Italian, Japanese, Chinese, or any major language and Alex answers in kind. The ACT markers translate naturally (*"Considerado: A vs B..."*, *"Confiança: alta / média / baixa"*, *"Mudaria de ideia se..."*). Mix English technical terms freely. If the answer drifts back to English, say *"Responde em português, por favor."*

## When tools fail

- **No response in chat:** check the Copilot icon (bottom-right) and the model picker.
- **Chat panel gone:** `View → Chat` or `Ctrl+Alt+I`.
- **Fresh conversation:** click **+** at the top of the chat.
- **Re-open this guide:** Command Palette → *Alex: Open Welcome Guide*.
- **Bootstrap or Upgrade fails with a network error:** the Extension fetches the latest Edition brain from GitHub on first use. It needs to reach `api.github.com` and `codeload.github.com`. If you're behind a corporate proxy, ask your admin to allowlist those two hosts.
- **Reporting an install issue:** run *ACT: Diagnose Fetch* from the Command Palette. It writes a short diagnostic report (extension version, fetch cache state, heir marker) to a dedicated output channel. Paste that into your bug report so the maintainers can diagnose without guessing.

## Learn the framework

The full ACT framework is public: ten tenets, manifesto, claim registry, failure modes. Read it on the wiki, or just ask Alex:

> *"Teach me the single most important critical thinking habit I'm probably missing. Ask me a question first to figure out where I'm weak."*

Close this walkthrough when you're ready. The chat is on the right side of your screen.

**Wiki:** [Home](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Home) · [Privacy, Troubleshooting, Help](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Privacy-Troubleshooting-Help) · [Working in Other Languages](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/Working-in-Other-Languages) · [The ACT Framework](https://github.com/fabioc-aloha/Alex_ACT_Extension/wiki/The-ACT-Framework)
