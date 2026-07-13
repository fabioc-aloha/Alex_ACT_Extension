# Privacy, Troubleshooting, Help

Honest answers about data, failure modes, and where to learn more.

## Where your data goes

Plain English:

- **Chat messages** flow through GitHub Copilot to an AI provider (OpenAI, Anthropic, or Google, depending on the model you pick). GitHub's privacy policy applies. By default, your conversations are not used for model training. See [GitHub Copilot Trust Center](https://copilot.github.trust.page/) for current terms.
- **Alex's memory** of your project (the `.github/` folder) stays on your local machine. It is never uploaded anywhere by Alex.
- **Document conversion** runs locally. File content does not leave your machine and is not sent to any AI provider.
- **No separate Alex account exists.** No Alex server, no separate login, no telemetry collected by Alex itself.
- **Everything is auditable.** Open the files. Read them. They are plain text.

### Caveats worth naming

- If you push your project to a git remote (GitHub, GitLab, etc.), anything inside `.github/` goes with it. Project memory is **local by default**, not **private by nature**.
- Chat traffic is governed by Copilot's privacy policy *and* by your subscription tier. Business and Enterprise tiers have different defaults than personal tiers. Check the [GitHub Copilot plans page](https://github.com/features/copilot/plans) for current details.
- Do not paste secrets into the chat (API keys, passwords, real customer data). The same caution that applies to any chat with a cloud-hosted AI applies here.

### Shared Memory, profiles, and local secrets

- `Alex_ACT_Memory` is a sibling Git repository. If it has a remote, repository
  access defines who can read tracked channels.
- Profiles are AES-256-GCM encrypted and decrypted only on explicit demand.
  Greeting does not decrypt them.
- Real `.env` files must be ignored and untracked. `.env.example` contains
  placeholders and instructions only.
- Edition v4.1.0 resolves one exact secret from the process, an explicit file,
  the project `.env`, then the sibling Memory `.env`. Project values win; the
  resolver does not enumerate or import the whole file.
- A local `.env` does not protect against a compromised machine or another
  process with the same filesystem access.

## When Alex is wrong (and it will be)

Alex will get things wrong. The framework only works if you push back. Specifics that work:

| What to say | What it does |
| --- | --- |
| *"That is wrong because [reason]."* | Alex revises with the new information. |
| *"You are too confident. What would change your mind?"* | Alex names the disconfirmer (Tenet II in action). |
| *"You skipped [X]."* | Alex addresses it. |
| *"Push back harder. Try to falsify your own claim."* | Alex stops agreeing and tries to break the argument. |
| *"What is the strongest counter-position you can build?"* | Alex steelmans the other side (Tenet VIII). |
| *"Restate the problem before solving."* | Alex runs a frame audit (Tenet VII). |
| *"Give me the second hypothesis."* | Alex generates the alternative (Tenet III). |

The worst failure mode is accepting a wrong answer because Alex sounded sure. Alex is a thinking partner, not an oracle. Treat it that way and the framework earns its keep.

For multilingual push-back examples, see [Working in Other Languages](Working-in-Other-Languages).

## When the tools fail

### No response in chat

- Check the **Copilot icon** (bottom-right of VS Code) for warnings.
- Check the **model picker** in the chat input area (pick a model if it is blank).
- Try a different model from the picker. Sometimes a specific model is temporarily unavailable.

### Chat panel disappeared

- **View → Chat** from the top menu.
- Or `Ctrl+Alt+I` (Mac: `Cmd+Alt+I`).

### Start a fresh conversation

Click **+** at the top of the chat panel. The previous conversation is preserved (you can scroll back to it).

### Re-open the welcome walkthrough

Command Palette (`Ctrl+Shift+P`) → *Alex: Open Welcome Guide*.

### Bootstrap got into a bad state

If `.github/` got corrupted or you want a clean slate:

1. Delete the `.github/` folder (or rename it to `.github-backup/` to keep a copy).
2. Run **ACT: Bootstrap This Workspace** again.

See [Project Memory](Project-Memory) for details.

### Bootstrap or Upgrade fails with a network error

Starting in Extension v9.4.0 the brain is fetched from GitHub on demand rather than bundled in the VSIX (see [ADR-009](https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/docs/adrs/ADR-009-extension-github-fetch-brain.md)). Bootstrap and Upgrade need to reach `api.github.com` and `codeload.github.com`. If you are behind a corporate proxy, ask your admin to allowlist those two hosts.

If a fetch fails for any reason, run **ACT: Diagnose Fetch** from the Command Palette. It writes a short diagnostic report (extension version, cache state, GitHub auth mode, heir marker fields) to a dedicated output channel. Paste that into your bug report so the maintainers can triage without guessing. Air-gapped installs are not supported (explicit accepted cost per ADR-009).

### Plugin Mall search returns nothing

- Make sure the extension is fully loaded (give it a few seconds after startup).
- Try variations: skill name, category name, or a description fragment.
- Ask in chat instead: *"Search the Mall for skills relevant to [topic]."*

### Encrypted profile is unavailable

1. Confirm `../Alex_ACT_Memory` exists.
2. On Edition v4.1.0, provide `ALEX_ACT_MEMORY_PASSWORD` through the process,
  an explicit file, the heir project's ignored `.env`, or Memory's ignored
  `.env`.
3. Verify the file is ignored with
  `git check-ignore --quiet --no-index .env` in the repository that owns it.
4. Do not print the value. Run the profile status command instead:
  `node .github/scripts/_registry.cjs --profile .`.
5. Wrong passwords and tampering fail closed. A sanitized authentication error
  means the envelope was not decrypted.

### Document conversion produced weird output

See [Document Conversion](Document-Conversion). Common causes: heavy custom Word styles, embedded objects, or complex tables. The converter prioritizes content structure over visual fidelity.

### Model says it cannot do something Alex should be able to do

A reminder: Alex is the **framework discipline applied on top of** a model (Claude, GPT, Gemini). If the underlying model refuses or fails on something, no amount of framework can route around it. Try a different model from the picker.

## Learn the framework

The full ACT framework is public: ten tenets, the manifesto, the failure modes Alex was built to prevent, the claim registry. Read it at:

- **[The ACT Framework](The-ACT-Framework)**: user-facing summary on this wiki.
- **[ACT Framework overview](The-ACT-Framework)**: the manifesto, ten tenets, 7-step operational pass, and falsifiers in one page.

Or, faster, ask Alex directly:

- *"Teach me the single most important critical thinking habit I am probably missing. Do not be generic. Ask me a question first to figure out where I am weak."*
- *"Walk me through the ten tenets of ACT, one at a time. Ask me to apply each one to a real decision I am facing."*

That is the kind of question Alex was built for.

## Reporting an issue

If Alex behaves in a way that violates the framework (sycophancy, missing markers on high-stakes questions, refusing to push back when you ask for push-back), that is worth reporting. Open an issue on the [extension repo](https://github.com/fabioc-aloha/Alex_ACT_Extension/issues) with:

- The model you were using.
- The prompt that triggered it.
- What you expected (which ACT marker should have appeared).
- What you got instead.

The framework gets revised when it fails. That is Tenet X in practice.

---

Last reviewed: 2026-07-13
