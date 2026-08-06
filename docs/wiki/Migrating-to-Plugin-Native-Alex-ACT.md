# Migrating to Plugin-Native Alex ACT

The Edition template and VS Code Extension are deprecated and no longer
maintained. The supported Alex ACT runtime is the plugin-native 1.0.0
constellation led by [Manager](https://github.com/fabioc-aloha/Alex_ACT_Manager)
and [Core](https://github.com/fabioc-aloha/Alex_ACT_Core).

## What changes

The legacy architecture copied a complete brain into every project's
`.github/` directory. The supported architecture installs shared runtime
capability once through Copilot plugins. Projects keep only their own
customizations and GitHub configuration.

Do not place the full legacy Edition tree beside Core. User-scope and
workspace-scope instructions compose, so duplicate copies can both load, spend
context, and drift independently.

## 1. Preserve project-owned work

Commit or back up the workspace before removing anything. Review the complete
`.github/` tree and preserve every project-owned file. Common examples include:

- `.github/copilot-instructions.local.md`
- `.github/skills/local/`
- `.github/instructions/local/`
- `.github/prompts/local/`
- `.github/agents/local/`
- `.github/workflows/`
- `.github/dependabot.yml`
- `.github/CODEOWNERS`
- pull-request and issue templates
- any project documentation or configuration stored under `.github/`

Do not treat `.github/` as brain-only. GitHub Actions and repository governance
use the same directory.

## 2. Stop legacy delivery

Disable or uninstall **Alex: Artificial Critical Thinking for GitHub Copilot**.
Do not run the retired **Bootstrap This Workspace**, **Upgrade Brain**,
`/initialize`, or `/upgrade` flows.

Separate Edition-managed brain files from the project-owned files listed
above. Remove only the Edition-managed copies. If ownership is unclear, migrate
in a clean workspace first and compare before deleting anything.

## 3. Install Manager and Core

Open a standalone PowerShell terminal and register the public Alex Mall:

```powershell
copilot plugin marketplace add fabioc-aloha/Alex_Skill_Mall
copilot plugin marketplace update alex-mall
```

Install the non-optional brain spine:

```powershell
copilot plugin install alex-act-manager@alex-mall
copilot plugin install alex-act-core@alex-mall
copilot plugin list
```

Both plugins must report `1.0.0` or a later supported release. If they do not,
refresh `alex-mall` and stop before continuing.

## 4. Complete guided setup

Reload VS Code or restart the Copilot CLI host. Start a new chat and run:

```text
/alex-act-manager install-constellation
```

The guided flow keeps these decisions separate:

- optional plugin selection
- portable VS Code user settings
- the 16-file user-scope ACT instruction bootstrap
- current-workspace Markdown CSS and settings
- private Microsoft-internal capability, when eligible

Review the workspace-overlap report before approving the instruction
bootstrap. The bootstrap applies in every workspace on the machine.

## 5. Restore only local customizations

Bring back only the project-specific files preserved in step 1. Do not restore
inherited Edition copies of shared ACT instructions, skills, prompts, agents,
converter runtime, Mall workflows, or upgrade scripts. Their maintained owners
are now Core, Manager, Document Tools, Illustrator, Enterprise, and MSFT.

When a local customization duplicates an installed plugin skill, keep one
owner. A repository-local copy can shadow or diverge from the maintained
plugin.

## 6. Verify activation

Run:

```text
/alex-act-manager plugin-status
```

Confirm all six planes:

| Plane | Expected evidence |
| --- | --- |
| Installed | Manager, Core, and selected plugins report supported versions. |
| Enabled | Exact plugin keys are enabled. |
| Instruction-loaded | The receipt owns 16 files and their hashes match Manager. |
| Skill-invokable | Namespaced commands work, or report a healthy installed-file fallback. |
| User-settings | Consented baseline keys are current; unrelated settings remain. |
| Workspace | Project CSS and settings are preserved or explicitly bootstrapped. |

The complete maintained procedure lives in the
[Alex ACT Core installation guide](https://github.com/fabioc-aloha/Alex_ACT_Core/blob/main/INSTALL.md).

---

Last reviewed: 2026-08-06
