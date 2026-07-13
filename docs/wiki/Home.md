# Alex: Artificial Critical Thinking

Alex is **Artificial Critical Thinking** for VS Code. The "Critical" is the point.

Most AI chatbots agree with you. They tell you what you want to hear, in a confident voice, fast. That is the failure mode. Confident voice covers for shallow thinking, missing context, and answers that fall apart the moment you press them.

Alex was built differently. The job is not to be agreeable. The job is to think with you, push back when you are wrong, name what is uncertain, and stay honest when it does not know.

## Pick a door

### I am new here

Start with **[Getting Started](Getting-Started)**. Five minutes to install the extension, set up GitHub Copilot, pick a reasoning model, and run your first real conversation.

### I want to understand how Alex thinks

Read these in order:

1. **[The CSAR Loop](The-CSAR-Loop)**: the conversational discipline that turns vibe coding into real work.
2. **[What Makes Alex Different](What-Makes-Alex-Different)**: seven behaviors you can verify in the chat.
3. **[The ACT Framework](The-ACT-Framework)**: the ten tenets and the manifesto behind the behavior.

### I want depth on a specific project

- **[How It Fits Together](How-It-Fits-Together)**: the six pieces (Edition, Extension, Mall, project memory, shared memory, Copilot memory) and why they're split.
- **[The Plugin Mall](The-Plugin-Mall)**: curated skills you can pull in on demand.
- **[The Edition Template](The-Edition-Template)**: how brain versioning works, using Edition directly without the Extension.
- **[Project Memory](Project-Memory)**: how Alex remembers your project across sessions.
- **[AI-Memory](AI-Memory)**: the cross-project channel that links all your ACT workspaces.
- **[Document Conversion](Document-Conversion)**: right-click between Markdown, Word, HTML, plain text, and email messages.
- **[Working in Other Languages](Working-in-Other-Languages)**: Portuguese, Spanish, French, German, Italian, Japanese, Chinese, and others.

### What's new in v9.4.0

The Extension now fetches the latest Edition brain from GitHub on demand instead of bundling it in the VSIX. Edition releases reach your workspace immediately on tag-push — no waiting for a Marketplace review cycle. Bootstrap and Upgrade need network access to `api.github.com` and `codeload.github.com`. A new **`ACT: Diagnose Fetch`** command surfaces cache state, auth mode, and marker fields for bug reports. See [How It Fits Together](How-It-Fits-Together) for the architecture, [The Edition Template](The-Edition-Template) for the upgrade lifecycle, and [Privacy, Troubleshooting, Help](Privacy-Troubleshooting-Help) for failure-mode guidance.

### Current Edition: v4.1.0

Edition v4.1.0 keeps encrypted profiles on demand, makes the exact ten-tenet
canon release-blocking, and adds exact-name local-secret fallback to the sibling
Memory `.env`. The Memory repository is local-first; its remote is optional and
repository access defines its audience. See [AI-Memory](AI-Memory) for the
resolution order and privacy boundary.

### Something is off

**[Privacy, Troubleshooting, Help](Privacy-Troubleshooting-Help)**: where your data goes, what to do when chat is silent, how to push back when Alex is wrong, where to read the full framework.

## What people use Alex on

Alex works across the whole lifecycle of a project: figuring out what to do, planning it, documenting it, executing it, evaluating what happened. You do not need to bring a finished plan. Most people do not have one. Alex plans *with* you.

Real projects people run with Alex:

- Software and technical builds (apps, scripts, extensions, MCP servers, automation).
- Academic research and dissertations (methodology, IRB, literature review, defense prep).
- Writing that has to hold up (essays, proposals, contracts, important emails).
- Long-form creative work (novels, screenplays, cookbooks, comedy, podcasts).
- Business and strategy (product plans, go-to-market, strategy memos).
- Career and work decisions (taking a job, leaving one, hard conversations).
- Financial and investment decisions (major purchases, debt, deals, retirement).
- Coaching and personal development.
- Difficult personal decisions (medical, family, life pivots).
- Documentation and publishing (manuals, papers, reports, knowledge bases).
- Postmortems and pattern hunting on projects that went sideways.

## This is not a personality skin

Under the hood is a real framework: ten tenets of critical thinking, a published manifesto, an enforcement loop that runs on every non-trivial response. Two-hypothesis floor. Falsifiability. Calibrated confidence. Anti-sycophancy. Frame audits. Severity-weighted reviews.

Alex is your second opinion that does not flinch.

---

Last reviewed: 2026-07-11
