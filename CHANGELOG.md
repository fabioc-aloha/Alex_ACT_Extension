<!-- markdownlint-configure-file {"MD024": {"siblings_only": true}} -->

# Changelog

All notable changes to Alex ACT Edition.

## [Unreleased]

---

## [2.0.2] - 2026-05-19

**Patch — welcome baseline gains three VS Code 1.120/1.121 settings.** Three keys added to `.github/config/welcome-baseline.json` so all heirs get them on next `/welcome` (or fresh setup). Companion to v2.0.1 (which updated the brain rules describing these capabilities); v2.0.2 wires the matching settings into the heir bootstrap.

### Changed

- **`.github/config/welcome-baseline.json`** — added three keys to the `settings` object:
  - `chat.tools.compressOutput.enabled: true` (1.120 Preview) — enables terminal output compression for `git diff` / `ls -l` / `npm install` and the 1.121 expansion (test runners, build tools, linters, Docker, package managers). The brain's file-redirect fallback remains valid for cases where compression strips data the agent needs.
  - `chat.utilityModel: "gpt-4o-mini"` (1.121) — routes title generation, rename suggestions, and settings search to a smaller cheap model. Heirs can override locally if `gpt-4o-mini` isn't in their model surface (VS Code falls back to default).
  - `chat.utilitySmallModel: "gpt-4o-mini"` (1.121) — same rationale for the small-model slot.
- **Baseline `$comment`** updated to acknowledge that preview/experimental toggles can be included when explicitly requested by user policy and noted in CHANGELOG (was: "Stable settings only — keep preview/experimental toggles off unless explicitly requested"). `chat.tools.compressOutput.enabled` is the first such inclusion.

### Heir impact

Heirs running `/welcome` (first-session bootstrap or new-machine setup) get all three settings. Heirs running `/welcome-verify` will see the three keys flagged as `missing` until they re-run `/welcome`. Existing user-level overrides for these keys are preserved by the merge step in `/welcome` (it merges, doesn't overwrite values that already differ — well, actually it does overwrite to match baseline; heirs who want a different utility model should set it AFTER `/welcome`). No `--allow-major` needed; standard `/upgrade` covers the baseline file.

### Override guidance

Heirs who want a different utility model (e.g. running on BYOK with a different small-model name) should set their override in personal `settings.json` AFTER running `/welcome`. The `/welcome` merge is overwrite-to-baseline, so the override needs to be re-applied if `/welcome` runs again.

### Validation

Dogfooded the `/welcome` reference command (verbatim from `welcome.prompt.md`) against the curator's personal `settings.json` before shipping — all three keys landed correctly as JSON booleans/strings (lowercase `true`, quoted model names). No existing keys disturbed.

### Audit trail

- Companion to v2.0.1 (brain rules) — commits `b6dafc3` (Supervisor) + `f9aaffd` (Edition)
- Proposal: original `vscode-1.120-1.121-adoption-2026-05-19.md` recommended these as personal-settings-only; user directed (2026-05-19) to bake into the heir baseline instead
- Brain-qa: exit 0 across 79 Supervisor + 58 Edition files (no brain file changes in v2.0.2)
- `test-edition-applyto-coverage`: 18/18 PASS, 0 capability gaps (no `applyTo` changes)

---

## [2.0.1] - 2026-05-19

**Patch — VS Code 1.120/1.121 feature adoption.** Three brain files updated to reflect VS Code capabilities that shipped between 2026-05-13 and 2026-05-19. Mirrored byte-for-byte from Supervisor per the shared-core direction-of-edit rule. Zero behavior change for heirs — additive informational text + one factual correction + one extension-recommendation update.

### Changed

- **`terminal-command-safety.instructions.md`** — documents two new VS Code mechanisms that work alongside the existing rules:
  - NEW section *VS Code 1.120 + 1.121 Terminal Output Compression (Preview)* names `chat.tools.compressOutput.enabled` and the 1.121 expansion to `pytest` / `jest` / `cargo test` / `tsc` / `cargo build` / `make` / linters / Docker / package managers, plus auto-dispose of background terminals.
  - *Terminal Hanging* rule #1 now notes that VS Code 1.121+ auto-promotes sync→background after a configurable idle-silence period; the agent-intent rule remains correct and is still required on older builds.
  - *Falsifier — Backtick Hazard* watermark bumped from "through 1.118" to "through 1.121" with note that 1.120/1.121 ship no fix for `microsoft/vscode#295620`. The temp-file pattern remains mandatory.
- **`session-health-monitoring.instructions.md`** — *Proxy Heuristics* opener corrected: VS Code 1.120 made BYOK token counts visible in the Chat-view context-window control. Opener now distinguishes BYOK (ground truth available) from non-BYOK / older builds (proxy heuristics still apply). Table below unchanged.
- **`markdown-mermaid/SKILL.md`** — *VS Code Extension Setup* updated: VS Code 1.121 ships built-in Mermaid rendering in Markdown previews per `microsoft/vscode#293028`. Recommendation list keeps mermaidchart (chart authoring), vstirbu (standalone preview tab), and non-Mermaid tools (PlantUML, Graphviz, D2). `bierner.markdown-mermaid` removed — the built-in renderer covers its use case.

### Out of scope (deliberate)

Three 1.120/1.121 features documented in the proposal but **not adopted** pending field data: `chat.tools.riskAssessment.enabled` (overlaps act-pass severity), Claude auto-permission mode (overlaps act-pass), and workspace-level forcing of `chat.tools.compressOutput.enabled` (still preview).

### Heir impact

None for the contract. Heirs on v2.0.0 reading the updated rules gain awareness of upstream-handled mechanisms; the rules themselves continue to fire correctly. No `--allow-major` needed; standard `/upgrade` covers it.

### Proposal + audit trail

- Proposal: `Alex_ACT_Supervisor/docs/proposals/vscode-1.120-1.121-adoption-2026-05-19.md`
- Supervisor commit: `b6dafc3` (origin/main)
- Brain-qa: exit 0 across 79 Supervisor + 58 Edition files
- `test-applyto-coverage`: 15/15 PASS, 0 capability gaps
- `test-edition-applyto-coverage`: 18/18 PASS, 0 capability gaps

---

## [2.0.0] - 2026-05-19

**Major — reasoning-quality release.** Same brain shape (36 instructions, 18 skills, 23 prompts, 16 muscles, 4 agents), same heir API surface, same `/upgrade` mechanism. Behavior changes are improvements to always-on reasoning disciplines that close measured coverage gaps in benchmark scenarios while reducing total credits-per-solved-problem. Major version bump signals that heirs upgrade via `--allow-major` and acknowledges that v2 reasoning IS measurably different from v1.5.0 (sharper verify-before-report, frame audits on explain frames, output-discipline gates).

Validated by:

- Compose verification benchmark (5 scenarios): **13/15 → 15/15 composite**, **-22.5% credits** (228.5 → 177.0)
- S360 real-world adoption: heir adopted on `main` 2026-05-19 and self-promoted `.act-heir.json` from `2.0.0-candidate` → `2.0.0` after multi-commit follow-through validation
- Tenet X demonstration in S360: v2 brain refused a stale templated instruction from Supervisor (exactly the failure mode the new rules were designed to catch)
- Terminal-safety fix empirical validation: 3 post-fix commits in S360 with `$env:TEMP` pattern, zero `.commit-msg.tmp` leaks (verified via `git show --stat`)

### Breaking

- **None for the heir contract.** File inventory unchanged. Heir-side `.act-heir.json`, scripts, `local/` skills, `HANDOFF.md`, `episodic/`, `workflows/` all preserved on upgrade.
- **Behavior changes are intentional** and visible: heirs will notice more verify-before-report patterns firing on search/summary work, more explicit frame-audit markers on "explain X" / "tell me how Y works" prompts, more by-name citations during disagreement-mode refusals. Net effect per benchmark + S360: better outcomes at lower cost, but takes a session to feel natural.
- **`--allow-major` required** on `node .github/scripts/upgrade-self.cjs` for heirs upgrading from any v1.x to v2.0.0.

### Added

- **`epistemic-calibration.instructions.md` Output-discipline subsection** (Phase 3.3) — Anti-Hallucination Signals table split into Input-discipline (existing 5 rows: claims about generation) and Output-discipline (3 new rows: claims about reporting):
  - `"No matches found"` / `"Verified clean"` / `"Nothing returned"` → verify search scope before reporting absence; cite paths/globs/file-count
  - `"The doc says X"` / `"Per README"` / `"According to spec"` → cross-check doc against filesystem; cite both
  - `"I checked and..."` / `"Verified that..."` → name what was actually checked; unattributed verification is theatre
  - Plus 4th Core Principle: *"A search that didn't run looks identical to a search that found nothing — verify the scope before reporting absence."*
- **`problem-framing-audit.instructions.md` Explain/Summarize Frame subsection** (Phase 5 Option C) — complementary discipline for summarization patterns the Output-discipline literal triggers don't catch:
  - Literal trigger phrases: `"Explain X"`, `"Tell me how Y works"`, `"Describe Z"`, `"Summarize <doc>"`, `"Read <file> and..."`, `"Walk me through..."`, `"What does <doc> say about..."`
  - Required action: name source file(s) read + cross-check ≥1 structural claim against filesystem; if doc and filesystem disagree, surface the gap and report both
  - Visible marker: `**Verified against**: <doc path> + <filesystem check>`
- **`terminal-command-safety.instructions.md` temp-file location guidance** — closes a heir-reported defect (the `git commit -F tmpfile` + `git add -A` interaction silently committed temp message files into commits):
  - Warning paragraph: place temp files outside the working tree (`$env:TEMP\<slug>.txt` on Windows, `/tmp/<slug>.txt` on Unix) OR add the pattern to `.gitignore` before staging
  - Preferred PowerShell template using `Join-Path $env:TEMP` + `Set-Content -NoNewline` + `git commit -F` + `Remove-Item`

### Changed

- **3 instruction files** updated (see Added above for the substantive changes):
  - `.github/instructions/epistemic-calibration.instructions.md`
  - `.github/instructions/problem-framing-audit.instructions.md`
  - `.github/instructions/terminal-command-safety.instructions.md`
- **`.github/VERSION`** bumped 1.5.0 → 2.0.0.
- **File inventory unchanged** at 36 instructions / 18 skills / 23 prompts / 16 muscles / 4 agents.
- **Always-on token growth: ~+908 tokens/session** (~+3632 bytes across the 3 instruction files). Trade is net-positive per benchmark: -22.5% credits across the 5-scenario Compose set; breakeven at ~1 avoided corrective turn per 10 sessions; observed rate in benchmark + S360 is 2-3+ per 10.

### Scope correction

A pre-flight diff during release prep reported 46 files differing between Edition v1.5.0 and the v2 candidate workspace. On verification (parent-commit checkout + spot-check) the 43 "accumulated v2-candidate dev" files were already byte-identical to Edition v1.5.0; the apparent difference was line-ending normalization (CRLF in Edition vs LF in the v2 candidate scratch workspace) that git smooths over at commit time. The **actual v2.0.0 release scope is 3 instruction files** (Phase 3.3 + Phase 5 + terminal-safety) plus VERSION + CHANGELOG. This entry was corrected before push.

### Upgrade

```pwsh
node .github/scripts/upgrade-self.cjs --allow-major
```

Heirs preserve all of: `skills/local/`, `.act-heir.json`, `HANDOFF.md`, `episodic/`, `workflows/`, `scripts/` (heir-specific), `docs/`, all non-`.github/` content. Heir-doctor may surface cosmetic warnings on first run if the heir's `edition-manifest.json` is stale; they clear after upgrade completes.

### Why

The v1 line optimized brain size; v2 optimizes brain *outcomes*. The Phase 1 baseline benchmark surfaced one real coverage gap (output-verification — verify before reporting search/doc claims, scored 2/3 not 3/3 in S4 and S7). Phase 2 dual audit of all 17 always-on rules produced 1 Grow / 8 Compose / 8 Unchanged / 0 Shrink / 0 Restructure — confirming the brain isn't bloated, it's a tightly composed system where every rule earns its cost. Phase 3 applied the Grow (epistemic-calibration Output-discipline). Phase 5 added the complementary Explain/Summarize frame for surface patterns the Phase 3 literal triggers miss. Terminal-safety added the temp-file location guidance to close a heir-reported defect that hit S360 twice.

The release reaches Edition because S360 adopted v2 candidate in real-world product work on 2026-05-19 and demonstrated all the predicted improvements PLUS a real Tenet X self-correction moment (v2 brain refused a stale Supervisor instruction). Real-world signal outweighs synthetic benchmark for ship/no-ship decisions.

### Falsifiability

This release is wrong if any of the following occur within 14 days:

- ≥2 heirs report behavior regressions traceable to Phase 3.3 or Phase 5 changes (triggers partial rollback or v2.0.1 fix-forward)
- The terminal-safety fix doesn't prevent a `.commit-msg.tmp`-class leak in a heir that upgrades to v2.0.0
- S360 reverts its `.act-heir.json` marker from `2.0.0` back to `2.0.0-candidate` or below (the bellwether heir)
- A fleet-cost regression appears that wasn't visible in the 5-scenario benchmark (triggers the Phase 6.2 light re-baseline that was deferred)

If any fire: cut v2.0.1 with fix; document in Supervisor's `brain-qa-changelog.md` tagged `[V2-REGRESSION]`.

### References

- Launch proposal: [`Alex_ACT_Supervisor/docs/proposals/edition-v2-launch-2026-05-19.md`](https://github.com/fabioc-aloha/Alex_ACT_Supervisor/blob/main/docs/proposals/edition-v2-launch-2026-05-19.md)
- Benchmark data: `Alex_ACT_Supervisor/benchmark/v2-candidate-baseline.md`
- Plan: `Alex_ACT_Edition_v2/PLAN-v2-REASONING.md`

---

## [1.5.0] - 2026-05-18

Minor — converter-qa harness restoration + complete-coverage tests for all converters (PNG + SVG image handling verified end-to-end).

### Added

- **converter-qa suites for previously uncovered converters**:
  - `md-to-html.cjs: end-to-end + image handling` — structural HTML (DOCTYPE, CSS, headings, lists, tables, links, blockquotes, code), PNG embedding (data URI or referenced), SVG handling (inline / data URI / `<img>` ref)
  - `md-to-txt.cjs: strip formatting + preserve image alt text` — formatting markers removed (`**`, `*`, backticks, `#`, `|`), content + image alt text preserved
  - `html-to-md.cjs: structure + image preservation` — headings (ATX or setext), bold/italic, bullet + numbered lists, tables (pipe / simple / grid form), links, blockquotes, code, PNG + SVG image refs preserved with alt text
  - `docx-to-md.cjs: round-trip + image extraction` — md → docx → md via md-to-word leg + docx-to-md leg; headings, lists, tables, and image extraction (or inline ref preservation) verified
- **`md-to-word.cjs: [toc] marker warn-and-ignore` suite** — confirms v1.4.0 behavior (warning logged when `[toc]` marker found without `--toc`, marker stripped from body, output docx has no TOC field)
- **Font + margin value assertions** added to `md-to-word.cjs: table styling regression` suite — header `w:sz="18"` (9pt), data `w:sz="17"` (8.5pt), cell margins `w:w="20"` (1pt T/B) + `w:w="60"` (3pt L/R). Catches the v1.4.0 numeric changes that previously flowed through silently
- **`createImageFixtures` helper** in converter-qa — generates a minimal 1x1 PNG (67 bytes, embedded as binary literal) + a labeled SVG fixture for use across the new converter suites
- **SVG image section** added to `docs/testing/md-to-word-coverage.md` regression corpus

### Removed

- **4 dead test suites** referencing modules that no longer exist:
  - `Shared: replicate-core.cjs` (3 suites: base, batch retry & validation, negative-prompt & prompt-file)
  - `Shared: svg-pipeline.cjs`
  - These were pre-Edition artifacts from a Replicate AI image-gen + SVG pipeline that has been out of the brain for some time. The harness FATALed on the first missing module, blocking the entire test run
- **2 obsolete callout assertions** in `Shared: markdown-preprocessor.cjs` suite — `::: tip` and `> [!WARNING]` callout transformation tests. The preprocessor never implemented these (always returned input unchanged), and the syntaxes aren't part of any active Edition workflow. If callout rendering is needed in the future, separate feature request
- **2 file-inventory checks** for `shared/replicate-core.cjs` and `visual-memory.json` (also no longer exist)

### Changed

- `converter-qa.cjs` internal version 1.2.0 → 1.3.0; JSDoc updated to reflect new suite list and assertion count (284 → 256 after dead-suite removal + new-suite additions; net: cleaner)

### Why

User request: "make sure all other converters do a complete job" with explicit "mds can contain svg and png images, make sure they are supported by the converters." Before this release, only `md-to-word` and `md-to-eml` had dedicated suites; the other 4 converters had zero coverage, and the harness FATALed at startup so even existing suites couldn't run end-to-end. Result: **256 PASS, 0 FAIL, 4 SKIP** (skips are pandoc-availability checks when pandoc is missing in CI, plus adm-zip on systems without it).

### Falsifiability

If a converter regresses on PNG or SVG handling in a future change, the new suites will catch it. If callout syntax becomes a real requirement, add the feature to `markdown-preprocessor.cjs` and re-add the assertions (or new ones) — the prior version is in git history.

---

## [1.4.0] - 2026-05-18

Minor — `md-to-word` table tightening + `[toc]` marker honors documented default.

### Changed

- **`muscles/md-to-word.cjs` table styling** (internal muscle version 5.4.0 → 5.5.0):
  - Header font: 10pt → **9pt** (`w:sz` 20 → 18) — still bold white on Microsoft blue
  - Data cell font: 9pt → **8.5pt** (`w:sz` 18 → 17)
  - Cell margins: T/B 40 twips (2pt) → **20 twips (1pt)**, L/R 80 twips (4pt) → **60 twips (3pt)**
  - Visible effect: denser, more reference-document-style tables; same colors, borders, and zebra striping
- **`muscles/md-to-word.cjs` `[toc]` marker semantic**: previously, a `[toc]` line in the source silently set `args.toc = true`. Now the marker line is still stripped from the source, but TOC is **not** auto-enabled. A warning is logged so the heir can either pass `--toc` explicitly or remove the marker. Aligns the skill with its documented default (`--toc | off`).
  - Version-management note: classified as **minor** rather than major because the `[toc]` auto-detect was never in the skill's documented Options table — it was a side-effect of the preprocessor. Removing an undocumented side-effect to honor the documented default is a quality fix, not a breaking change to the documented contract. Heirs whose source files use `[toc]` AND who don't pass `--toc` will see the warning in their next conversion run and can adjust trivially. If a heir reports regression within 14 days, fallback is v1.4.1 reverting just the `[toc]` semantic.
- `skills/md-to-word/SKILL.md` — Options table notes new `[toc]` marker behavior; Table Formatting section reflects 9pt/8.5pt fonts and 1pt/3pt padding; Version History gains v5.5.0 row; currency + lastReviewed stamped 2026-05-18.

### Added

- `docs/testing/md-to-word-coverage.md` — regression corpus exercising every markdown feature the skill claims to support (H1-H6, inline formatting, all list types, tables with alignment and pagination, code blocks in multiple languages, blockquotes including nested, horizontal rules, footnotes, PNG image refs, Mermaid flowchart / sequence / state / class diagrams). Includes a 21-item verification checklist for post-conversion spot-check, and a TOC-marker behavior test procedure.

---

## [1.3.4] - 2026-05-18

Patch — heir discoverability of the AI-Memory formal contract.

### Changed

- `skills/ai-memory-setup/SKILL.md` — added "Formal contract" subsection pointing heirs at `AI-Memory/SCHEMA.md` (the Supervisor-maintained contract document covering subfolder ownership, frontmatter, and lifecycle rules). Folder Structure tree updated to show `SCHEMA.md` at root.
- `skills/ai-memory-setup/SKILL.md` § Write Feedback — aligned filename format and frontmatter description to the canonical shape in SCHEMA.md (filename now `YYYY-MM-DD-<heir-id>-<short-slug>.md`; frontmatter keys `date`, `heir_id`, `severity`, `category` — lowercase, matches what Supervisor expects when triaging).

No behavior change. Purely heir-facing documentation alignment so the deployed spec and the Supervisor-side contract agree.

---

## [1.3.3] - 2026-05-18

Final cleanup of the handoff-tier convention introduced in v1.2.2. Reading side now agrees with the writing side: prior-session context comes from repo-root `HANDOFF.md` first, session memory only as legacy fallback.

### Fixed

- **`instructions/proactive-awareness.instructions.md`** Cross-Session Context Recovery (PA1): Step 1 now checks repo-root `HANDOFF.md` first (the canonical cross-session handoff per `memory-triggers.instructions.md`). Session memory becomes Step 2, labeled as "legacy/secondary signal" with an explicit note that any handoff content there predates the v1.2.2 tier convention. Surface-context table updated to recognize `HANDOFF.md present with recent content` as the primary trigger.

### Why

v1.2.2 + v1.3.1 + v1.3.2 fixed the *write* side (where handoff content goes). The *read* side (`proactive-awareness` Step 1) was still pointing at `/memories/session/` as the primary source for prior-session context. Symmetry now holds: write to `HANDOFF.md`, read from `HANDOFF.md`.

### Verification

- brain-qa exit 0 (58 Edition files)
- test-edition-applyto-coverage 18/18 PASS, 0 gaps

---

## [1.3.2] - 2026-05-18

Internal consistency fix for the handoff-tier convention shipped in v1.2.2 + v1.3.1. Two files still routed handoff content to ephemeral session memory — the exact pattern s360 originally flagged.

### Fixed

- **`skills/meditation/SKILL.md`** Extract routing table: replaced `Session continuity for next chat → /memories/session/<name>.md` with `Cross-session handoff (next session needs to know) → repo file (HANDOFF.md at repo root) — NOT session memory`. The skill's Extract step now agrees with its Handoff step (Step 5) and with `memory-triggers.instructions.md` / `save-session-note.prompt.md`.
- **`skills/meditation/SKILL.md`** Step 5 (Handoff): renamed `SESSION-HANDOFF.md` → `HANDOFF.md`. v1.3.1's rename had missed this SKILL.md file (caught in heir-aware spot-check).
- **`instructions/session-health-monitoring.instructions.md`** Graceful Handoff section: was telling the agent to write state + completed work + next steps + pending decisions to `/memories/session/[name].md` (which clears at conversation end). Now routes to repo-root `HANDOFF.md` with an explicit "session memory is for in-conversation scratch only" clarifier.

### Verification

- brain-qa exit 0 (58 Edition files)
- test-edition-applyto-coverage 18/18 PASS, 0 gaps
- Zero `write /memories/session/...` handoff misroutings remaining in the live brain tree (verified via grep)

---

## [1.3.1] - 2026-05-18

Naming clarity + zero-behavior-change refactor. Per proposal `docs/proposals/prompt-overlap-audit-2026-05-18.md` (Supervisor side).

### Changed

- **Session-handoff artifact unified on `HANDOFF.md`** (was `SESSION-HANDOFF.md`). Per user instruction: "saved in root... always use root, like we did here". Updated 4 files in lockstep:
  - `instructions/meditation.instructions.md`
  - `prompts/meditate.prompt.md`
  - `prompts/note.prompt.md`
  - `prompts/save-session-note.prompt.md`

  This unifies with the convention `memory-triggers.instructions.md` ships in v1.2.2 (cross-session continuity → repo file `HANDOFF.md`, not session memory). The two filenames were a naming inconsistency introduced earlier today; v1.3.1 fixes it.

  `save-session-note.prompt.md` includes a legacy-migration note: if a heir still has `SESSION-HANDOFF.md` at root from before this rename, the prompt mentions it during confirm — the heir manually reviews and either merges into `HANDOFF.md` or deletes the legacy file. Never silently discards content.

- **`welcome` baseline extracted to config** — the user-scope VS Code settings payload that `/welcome` applies and `/welcome-verify` audits previously lived duplicated in both prompt files. Future drift trap removed by extracting to `.github/config/welcome-baseline.json` as the single source of truth. Both prompts now load from there. Updated `sync-policy.json` to mark the new config file as `edition_owned` (overwritten on upgrade).

### Added

- **`.github/config/welcome-baseline.json`** — the VS Code user settings baseline applied by `/welcome` and audited by `/welcome-verify`. Edit once, both prompts pick it up.

---

## [1.3.0] - 2026-05-18

Tier 3 token rationalization: port of verified Supervisor trims plus load-bearing Tenet X discipline added to the always-on ACT pass. Always-on body tokens: 12,467 → 11,863 (-604, -4.8%). Zero capability regression — verified by `scripts/test-edition-applyto-coverage.cjs` (18/18 scenarios pass). Per proposal `docs/proposals/edition-optimization-2026-05-18.md` (Supervisor side, Batch 2).

### Added

- **`act-pass.instructions.md` § Self-Application (Tenet X always-on hook)**: 6-row pattern/signal/correction table (reasoning theatre, hedge laundering, authority deference, symmetric balance, adversarial-probe skip, self-flattering meta-cognition) so the always-on pass enforces the Tenet X discipline. Previously this discipline lived only in `act-foundations` (which is now scoped on the Supervisor side; will be evaluated for Edition in a later batch).
- **`tool-awareness-categories.instructions.md`** (NEW, scoped): Common deferred tool categories table moved out of `tool-awareness.instructions.md` to a scoped sibling that loads only on tool/MCP/GitHub/browser/notebook work. Always-on file shrinks; reference table still available where needed.

### Changed

- **`communication-craft.instructions.md`** trimmed (989 → 660 tokens): dropped Explaining Concepts §2, Tone Anti-Patterns, Integration table; kept SBI + stakes + voice + audience lead + needs/solutions tables. LLM-inherited communication behaviors no longer need always-on reinforcement.
- **`session-health-monitoring.instructions.md`** trimmed (774 → 398 tokens): dropped High-Token-Cost Operations table (duplicates `tool-awareness`), Session Memory Template (operational on-demand), Integration section; kept proxy heuristics + warning signs + checkpoints + handoff.
- **`emotional-intelligence.instructions.md`** trimmed (658 → 468 tokens): collapsed Adaptation Rules verbose sections to single 4-row table; kept signal detection table + mimicry prevention as one paragraph.
- **`knowledge-coverage.instructions.md`** trimmed (425 → 244 tokens): compressed KS2 pre-response assessment + KS3 visible-badge logic to taxonomy table + brief rule.
- **`tool-awareness.instructions.md`** trimmed (499 → 263 tokens): moved Common Deferred Tool Categories table to new scoped `tool-awareness-categories.instructions.md`; kept core Rules + External Ingest.

### Falsifiability watch (2 weeks)

If reasoning quality degrades within 2 weeks (sycophancy returns, alternatives missed, instructions ignored), the most likely culprit is the `act-pass` Tenet X addition or the `tool-awareness` split. Revert in that order. Falsifier closes 2026-06-01.

---

## [1.2.2] - 2026-05-18

### Fixed

- **`memory-triggers.instructions.md`**: Clarified that session-handoff documents live in repo `HANDOFF.md`, not in `/memories/session/` (which is cleared at conversation end). Per heir feedback (s360, 2026-05-09 `handoff-tier-confusion`): the natural phrase "session handoff" reads like exactly what session memory is for, but session memory is by-design ephemeral. The Memory Tier Selection table now distinguishes "Cross-session handoff (next session needs to know)" from "In-conversation scratch (current session only)". New § "Cross-Session Continuity" makes the rule explicit. Trigger Conditions table now points the "Session > 30 min OR end-of-session" trigger at the repo file rather than a generic "Handoff" prompt.

---

## [1.2.1] - 2026-05-13

### Added

- **Brain audit trifecta**: Added `brain-audit.instructions.md`, `skills/brain-audit/SKILL.md`, and `/audit-brain` workflow support.
- **Dedicated audit worker**: Added `agents/brain-auditor.agent.md` for deterministic local Edition audits.
- **Mall refresh workflow**: Added drift-aware `/mall refresh` support and docs wiring for curated-subset states.

### Fixed

- **Audit robustness**: Hardened Edition audit flows for template context and npm probe handling.

### Changed

- Propagated Supervisor-side audit remediations into Edition artifacts.

---

## [1.2.0] - 2026-05-05

### Added

- **Mall contribute prompt**: New `/mall contribute` command for submitting plugins to the Plugin Mall.
- **Tool awareness instruction**: New `tool-awareness.instructions.md` documenting deferred tools and external ingest.

### Fixed

- **Instruction count**: 33 → 34 across documentation (README, copilot-instructions).
- **converter-qa stale currency tag**: Updated to current date.

### Removed

- **`/fleet` prompt**: Moved to Supervisor scope (not heir-relevant).

---

## [1.1.0] - 2026-05-05

### Added

- **Tool awareness instruction**: New `tool-awareness.instructions.md` documents deferred tools (require `tool_search` before use) and external ingest for remote/virtual workspaces (VS Code 1.118/1.119).
- **VS Code 1.118 agentic execution sub-tool note** in `terminal-command-safety.instructions.md`: documents output pre-filtering behavior and when redirect-to-file fallback is still needed.
- **AI-Memory knowledge index**: Heirs now pointed to `AI-Memory/knowledge/index.json` for on-demand reference material.
- **Extension scaffold relocated**: VS Code extension moved to independent repo `Alex_ACT_Extension`.

### Fixed

- **23 epistemic-integrity findings resolved** across 19 brain files (ABS01x4, OVR01x1, REV01x18): added revision conditions, qualified absolute claims, and sourced authority claims. Epistemic integrity score: 91 to 100/100.
- **Stale references**: `/find-skill` to `/mall search`, `/install-from-mall` to `/mall install`, corrected skill/instruction counts.
- **Cross-platform improvements**: Path resolution and file handling.

### Changed

- Removed `.github-v0` pre-refactor brain backup (no longer needed post-v1.0.0).
- Project docs (PLAN, decisions/) relocated to `Alex_ACT_Supervisor`.

---

## [1.0.0] - 2026-05-02

The v1 brain refactor: a complete restructure of the cognitive architecture for clarity, token efficiency, and maintainability. Every instruction, skill, prompt, and muscle was re-evaluated, clustered, trimmed, or consolidated.

### Breaking

- **Architecture table replaced**: `copilot-instructions.md` now describes 8 functional clusters (was 7 generic domains). Heir `copilot-instructions.local.md` that reference old domain names ("Reasoning", "Learning", "Growth") should update.
- **6 converter instructions consolidated into 1**: `docx-to-md`, `html-to-md`, `md-to-html`, `md-to-txt`, `md-to-word`, `md-to-eml` instructions replaced by single `converter.instructions.md`. Format-specific logic stays in skills. Heirs with custom converter references should update to `/convert`.
- **`plugin-store-routing` removed**: Absorbed into `mall-installation.instructions.md`. Heirs referencing it by name should update.
- **5 instructions demoted from always-on to conditional**: `alternatives-and-tradeoffs`, `agent-delegation`, `partnership-charter`, `worldview`, `creative-loop`. They still fire on relevant file patterns and conversational context, but no longer consume always-on token budget.
- **`upgrade-self.cjs` major-version path now backs up and recreates**: Major bumps trigger backup + fresh install + recovery of heir-owned content (was in-place overwrite). Requires `--allow-major`.
- **`.github/episodic/**` is now heir-owned**: Was edition-owned (silently wiped on upgrade). Meditations, post-mortems, and calibration logs are preserved.

### Added

- **AI-Memory setup**: new standard skill (`ai-memory-setup`) with 8-provider cloud drive discovery (OneDrive, iCloud, Dropbox, Google Drive, Box, MEGA, pCloud, Nextcloud), auto-create, CLI (`_registry.cjs --discover/--init/--resolve`), and `cognitive-config.json` persistence (`ai_memory_root`, `ai_memory_exclude`).
- **`bootstrap-heir.cjs --ai-memory` flag**: Explicit cloud drive selection during bootstrap. Auto-creates AI-Memory and persists the choice.
- **`ACT.md` onboarding note**: Generated on bootstrap with project-aware plugin recommendations based on detected tech stack.
- **Heir-added artifact relocation**: `upgrade-self.cjs` detects artifacts heirs placed in edition-owned paths and relocates them to `local/` automatically (incremental and major paths).
- **Deprecated file cleanup**: `upgrade-self.cjs` removes files that Edition no longer ships.
- **Pass 3.5 (Episodic Memory)** in `finalize-migration.prompt.md`: Guides heirs to restore episodic files during migration.
- **Plugin Mall v2 integration**: `/mall search` and `/mall install` prompts, `plugin.json` manifests, shape/engines/token_cost metadata, CATALOG.json v2.1.
- **Worker subagents**: `markdown-author`, `illustrator`, `document-assembler` for delegated mechanical work.
- **`edition-manifest.json`**: Machine-readable inventory of shipped skills, prompts, agents. Used by `heir-doctor.cjs` (replaces stale hardcoded allowlists).
- 17 skills (was 11), 20 prompts (was 19), 3 agents (new), 20 muscles.

### Fixed

- Mall repo name: all `gh api` and `git clone` URLs updated from `Alex_ACT_Plugin_Mall` to `Alex_Skill_Mall` (the actual GitHub repo name).
- Episodic wipe on upgrade: moved `.github/episodic/**` from `edition_owned` to `heir_owned` in `sync-policy.json`.
- Episodic drop on migration: removed `episodic/` from `EXTENSION_ONLY` patterns in `migrate-to-edition.cjs`.
- `heir-doctor.cjs` false positives: now reads `edition-manifest.json` instead of hardcoded allowlists.
- AI-Memory path resolution: standardized across all artifacts (was 6 different hardcoded candidate lists). Now all flow through `cognitive-config.json` override + auto-discovery.
- Windows reparse points: cloud drive folders with `ReparsePoint` attribute (common for OneDrive) now detected by `_registry.cjs`.

### Changed

- Always-on token budget: 25,835 (v0.9.1) to 13,886 (v1.0.0). 46% reduction.
- Context-loaded artifacts: 79 (v0.9.1) to 73 (v1.0.0). 10 converters consolidated, 1 absorbed.
- Instructions: 37 (v0.9.1) to 33 (v1.0.0). DRY pass removed redundancy.
- `copilot-instructions.md` Architecture table: 7 generic domains replaced with 8 functional clusters matching actual artifact organization.
- `README.md`: Updated all artifact counts, removed stale references.

## [0.9.9] - 2026-05-02

Phase 0-9b of the v1 brain refactor. All 59 capabilities migrated and verified.

## [0.9.1] - 2026-04-30

Fleet pull-based architecture, heir self-update, Mall v2 design.

## [0.9.0] - 2026-04-30

Edition brain reset from AlexMaster. Clean baseline for v1 refactor.

## [0.7.0] - 2026-04-28

Initial Mall integration, converter improvements, mermaid fidelity.

## [0.6.2] - 2026-04-29

Mermaid viewport fix, ZWSP checkbox fix, banner cross-reference.
