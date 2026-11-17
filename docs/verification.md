# Verification

For an installation with a dangling Delegate Kit shell hook, see the separate [hook cleanup instructions](hook-cleanup.md). This maintenance note is outside the installable skill.

## Behavioral scenarios

Inspect the actual tool trace (skill loads, launches with their model and effort, returned evidence), not only the final report.

| Scenario | Expected behavior |
| --- | --- |
| Operations, incident, fix in one place, change under about 800 lines | Coordinator does it itself; the skill need not load; no agents. |
| Question with two or more independent directions | One researcher per direction, usually 2–5; findings cite a source, path or command; empty directions reported as gaps. |
| Change over about 800 lines that fits one budget, or any implementation after the coordinator compacted or wrote about 800 lines itself | One worker within budget; the coordinator keeps decisions and acceptance. |
| Work larger than one budget, with or without a ticket set | Assignments sized to about 200K context (up to about 1,000 lines, one layer or thin vertical slice); items far under budget merged; frontier launched in waves of 3–4; each parallel writer in its own worktree or branch; the map recorded in the ledger. |
| Large task without a plan | One-line suggestion of `/grilling`, `/to-spec` or `/to-tickets` as needed; without the user taking it up, a short stage plan in the ledger. |
| Any launch | Model and effort from the team file, both set explicitly; `high` for money, security, access rights and migrations; Fable only when the user names it. |
| Brief | Delegated assignment, outcome, acceptance criteria, files, pointers (absolute for ignored or uncommitted files), checks, who checks the browser; logs to a file, commit own paths per part, stop rules, short report. |
| Fix round, next stage, re-review | A fresh agent with a short brief; effort, then model, then the user after repeated failure. |
| Review | One per wave on the integrated diff, split by area above about two assignments; claims to verify without the author's reasoning; risks with checks; findings as scenarios confirmed by a run or marked unconfirmed. |
| Review findings | The coordinator assigns severity; crashes on operator-controlled data are follow-up items; a few-line blocking fix by the coordinator, larger by a fresh agent; one re-review per findings list. |
| User-facing stage | A separate browser walkthrough as a user. |
| Full test suite | Workers run the tests of their files; the coordinator runs the full suite on each wave's integrated result. |
| Coordinator context | Ledger updated per accepted assignment; no polling or transcript reading; handoff and an offer of a fresh thread after every second wave or a compaction. |
| Worker sees the skill | Does its assignment itself and launches no agents. |
| Harness with its own orchestrator (T3 Code) | Uses that orchestrator's delegation tools; no conflicting CLI route. |
| Model of another family named by the user | Runs that model; reports an unavailable route instead of substituting silently. |
| Timeout or lost connection | Status stays unknown until the previous writer's work is inspected. |

## Validation record — 2026-10-09

Starting point: commit `2c486a9`, which synced the repository with the installed local version of the skill.

- Package check: `python3 docs/check_package.py` and `git diff --check` passed.
- Model A/B check on Claude Code 2.1.294, one `claude -p` run per configuration, each capped at $1. An implementation task (simplified cron `next_run`, 4 visible and 22 hidden tests) and a review task (a diff with two planted defects: a role-blind cache that leaks admin-only invoices, and a refund limit that ignores earlier refunds).
  - Implementation: Haiku 5.5 medium $0.010, Sonnet 5.5 medium $0.147, Sonnet 5.5 high $0.153, Opus 5.5 low $0.241, Opus 5.5 medium $0.261. All passed 22 of 22 hidden tests; wall time 25–35 s. Opus produced 20–35% fewer output tokens than Sonnet but cost 1.6–1.9 times more, because the roughly 120K tokens of session context dominate the price.
  - Review: all four configurations found both defects. Sonnet 5.5 medium ($0.106) rated the refund-limit violation should-fix instead of blocker; Sonnet 5.5 high ($0.107), Opus 5.5 medium ($0.201) and Opus 5.5 high ($0.202) rated both as blockers.
  - Limitation: both tasks were too easy to separate quality; one run per cell. The results support Haiku for spec-exact work and keep code review on Opus, together with published comparisons that show Sonnet 5.5 catching fewer hard review defects.
- Live coordinator runs (Opus 5.5 medium, `claude -p`, the skill installed in a scratch project under another name, no mention of the skill in the prompt; task: three one-file modules with tests plus a summary of 12 log files):
  - First draft: the skill loaded on its own and launched four Haiku 5.5 workers with explicit model and effort; the coordinator accepted on evidence, reran the tests and fixed a transliteration gap a worker left. The parts were too small to pay for delegation: $0.61 in total, of which $0.02 was Haiku. The workers lacked shell access in that headless setup.
  - Revised text (narrower description, "parts of real size"): the coordinator did the task itself, $0.41 and 77 s, all tests passing.
- Not verified: GPT-side launches (no Codex usage available at the time), T3 Code `delegate_task`, Codex native subagents, nested-delegation grants, the worker guard, and auto-loading with the revised description on a task large enough to delegate.

## Validation record — 2026-10-10

Change: the planning section now asks the coordinator to note what blocks each assignment, launch everything unblocked together, settle shared pieces first and launch newly unblocked work as soon as its blockers are accepted.

- Package check: `python3 docs/check_package.py` and `git diff --check` passed.
- Live coordinator runs (Opus 5.5 medium, `claude -p` on Claude Code 2.1.296, the draft installed in a scratch project under another name, user-level settings excluded). Task: build a five-module Python package from specs, with one shared model module, 22 undocumented vendor files to survey before writing the parser, and unit tests. The result was compared with a hidden expected ledger (330 movements, 52 rejections).
  - Prompt that does not mention the skill: the skill did not load; the coordinator did the whole task itself in 219 s for $1.08, and the output matched the expected ledger.
  - Prompt that asks to use the skill and delegate: the coordinator wrote the shared model itself (done at 17 s), then launched three background workers within 15 s: the survey and parser on Opus 5.5 medium, the ledger and the report with the command line on Haiku 5.5 medium. It accepted each worker as it finished (about 60 s for each Haiku worker, 290 s for the Opus worker) and then ran an independent review on Opus 5.5 high (311 s). The output matched the expected ledger; 704 s and $3.23 in total, of which Haiku was $0.03.
  - Reading: the launch order follows the planning rules, and five modules became three assignments, not five. For a task that one strong session finishes in under four minutes, delegation was about three times slower and three times dearer, so not loading the skill by default was the right outcome.
  - Limitations: one run per prompt; the workers again lacked shell access in the headless setup, so the coordinator reran their tests.
- Not verified: launching a second wave after a blocker finishes (the coordinator kept each dependent chain inside one assignment), a task whose parts take tens of minutes each, worktrees for overlapping writers, and everything listed as not verified on 2026-10-09.

## Validation record — 2026-10-12

Trigger: an unguided overnight orchestration on a private TypeScript monorepo (11 hours, 25 agents, every launch on the coordinator's model and effort). Counted from the transcripts in input-token equivalents, it spent 155.6M: fix rounds 33.5%, implementation 26%, first reviews 16.5%, repeated reviews 14%. The causes were finished agents continued through fix rounds, a full review repeated after every round, the full test suite run by every agent, and no model or effort set on launches.

Change: the skill now starts with "Solo first"; every assignment goes to a fresh agent; the review brief has a fixed structure with risks and checks; the coordinator assigns severity; fix rounds by an exact list run on Sonnet 5.5; effort is `medium` for every launch; the description triggers at the moment of launching a subagent.

- Package check: `python3 docs/check_package.py` and `git diff --check` passed.
- Coordinator runs (Opus 5.5, `claude -p`, user-level settings excluded, the skill installed in the project, no mention of the skill in the prompt), one run per cell. Variant A adds two general rules about tests and review findings to the global instructions; variant B adds the same plus the pointer line from the README.

  | Task | Variant | Behavior | Time | Cost | Target tests |
  | --- | --- | --- | --- | --- | --- |
  | Medium: 5 tasks | A | solo, skill not loaded | 14.3 min | $5.91 | 8 of 8 |
  | Medium: 5 tasks | B | solo, skill not loaded | 14.8 min | $5.81 | 8 of 8 |
  | Large: 9 tasks, about 3000 changed lines | A | skill loaded, 12 agents | 35.5 min | $29.07 | 15 of 15 |
  | Large: 9 tasks, about 3000 changed lines | B | skill loaded, 6 agents | 22.7 min | $19.60 | 15 of 15 |

  Earlier solo runs of the same tasks: medium $5.20–6.12, large $11.53–16.58 in 34–39 min. An earlier draft without "Solo first" and with a blunter pointer line delegated two of the five medium tasks and cost 40% more.
- Blind comparison of the three large-task patches by an Opus 5.5 judge with read-only access: solo had 0 blocking, 6 should-fix and 7 minor findings; variant B 0, 0 and 4; variant A 0, 1 and 6.
- Replay of two stages of the overnight work with the skill and variant B (Opus 5.5 coordinator, `claude -p`): 103 min and 13.4M units against 2 h 25 min and about 32M for the same stages overnight. The skill loaded as the first action. All 12 launches carried an explicit model and `medium` effort: Opus 5.5 for implementation and review, Sonnet 5.5 for fix rounds. There was one review per stage with 11 named risks; it found a search query that blocked the server for 8–25 s and a migration that crashed on irregular stored data. The coordinator assigned severity, and every fix round and re-review went to a fresh agent. The merged result passed lint, typecheck and unit tests; the end-to-end suite passed apart from four tests that also fail on the untouched base and one test that is unstable under parallel load on both.
- Limitations: one run per cell, so the cost gap between variants A and B on the large task may be run-to-run spread. The replay ended one step early: in headless mode the process exits when the last subagent ends its turn waiting for its own background command, so the final merge of one test fix and the coordinator's report are missing. The replay's result was not compared blind with the overnight result.
- GPT models were removed from the team file for now: the names it listed were not offered by the Codex catalog on that day, and GPT launches are not in use.
- Not verified: the Haiku row of the team file in a coordinator run; GPT-side launches and the pointer line on assistants other than Claude Code; solo implementation followed by one independent review on the large task; everything listed as not verified in the earlier records.

## Validation record — 2026-11-17

Change: the skill now sizes work by a context budget of about 200K tokens, chooses between solo work, research fan-out and implementation by workers, executes an existing plan or ticket set as waves, keeps a ledger, and every brief asks for quiet output, stop rules and a short report. The team file adds `high` effort for money, security, access rights and migrations.

- Coordinator runs: Opus 5.5 medium, `claude -p` on Claude Code 2.1.326, user-level settings excluded (`--setting-sources project,local`; user CLAUDE.md and user skills confirmed absent), `--permission-mode acceptEdits` with an explicit tool list, the skill installed in the project under another name, one run per cell.
- Sizing replay on a real oversized task: part В2 (partner cabinet UI) of a private monorepo's reseller program. The original run gave all of В2 to one worker on Opus 5.5 medium; it ran 105 min, peaked at 619K context and wrote about 5,400 lines. Replay: a fresh repository from `git archive` of the commit that worker started from, the plan file from the repository, the issue body and the research note as scratch files, and the scope paraphrased from the original brief. Prompt: delegate В2, write the plan with briefs into a file, launch nothing. A first attempt in a `git worktree` of the original repository was discarded: the project's auto-memory carried the original run's lesson (600K, 92 min) and the shared refs exposed the finished branch.

  | | Old skill | New skill |
  | --- | --- | --- |
  | Writers for В2 | 3: the first at about 1,100 lines with shell, orders tab, order sheet and the local stand | 6–7: prototype, stand, shell (about 700 lines), three tab workers (about 600–700 each), copy clean-up |
  | Effort | `medium` everywhere | `high` for the two parts that debit and refund balance and for the money review |
  | Browser checks | one Opus agent for the full state matrix and the functional scenarios | two Sonnet agents (state matrix; functional scenarios with saved state) |
  | Quiet output, three-attempt stop, commit own paths, short report | absent | in a common block pasted into every brief |
  | Worktree per parallel writer | yes, with absolute paths to the gitignored scratch notes | yes, but briefs point to `.scratch/...` relative paths that a worktree does not contain |
  | Cost, time | $0.85, 172 s | $0.97, 203 s |

  The skill loaded first in both runs. Neither wrote a ledger (the prompt asked for a plan file only). An earlier pair of runs with the contaminated setup gave the same pattern: new skill high effort on money parts and quiet-output rules, old skill all `medium`.
- End-to-end run on a synthetic ticket set: a Python billing tool, four tickets in `.scratch/billing/issues/` (01 money, model and store blocks 02 invoicing and 03 CSV import; 04 command line is blocked by 02 and 03), 13 hidden acceptance tests kept outside the project. Prompt: "Implement the tickets in .scratch/billing/issues using subagents."
  - The skill loaded first; the ledger `docs/tasks/billing.md` held the assignment map, model and effort, tokens per agent, rulings, a follow-up list and a handoff; each ticket file got one status line.
  - Launches: four implementers, one per ticket (01 alone; 02 and 03 together in separate worktrees; 04 in a worktree alongside the review), Opus 5.5 `high` for 01 and 02, `medium` for 03 and 04; review of 01–03 on Opus 5.5 `high`; one fix round on Sonnet 5.5 `medium`; two re-reviews on Opus 5.5 `high`. Every launch set model and effort explicitly. Implementer briefs carried log-to-file, the three-attempt stop, commit-own-paths, no push or stash, and a short report; review briefs carried claims to verify and risks with checks.
  - Children peaked at 47–78K context, implementers wrote 370–990 lines each; the coordinator peaked at 106K. Nested agents had shell access in this setup.
  - Result: 13 of 13 hidden tests, 131 own tests, about 2,690 added lines. 21 min wall time, $6.80 (Opus $6.54, Sonnet $0.26, Haiku none).
  - Review loop: the review brief asked for hostile input on every parser, including NaN, `1e400` and huge exponents in the operator's own JSON files. The coordinator rated seven such crashes blocking, the fix round introduced a regression, and two re-reviews followed, the second on the coordinator's own few-line fix. Reviews and fixes took about half of the children's tokens and added input limits that no ticket asked for (store module 386 lines).
- Small task: a total row per currency in the summary CSV of the same tool, skill not named. The coordinator did it itself in 17 s for $0.26 with a 9-line diff and a test; the skill did not load.
- Limitations: one run per cell; the sizing replay stopped at planning, so the plan's actual peaks and quality were not measured; the end-to-end task was small enough that a solo run might have been cheaper, and no solo baseline was run.
- Not verified: launching the planned В2 waves; the handoff after every second wave in a long session; cutting assignments after a worker over 300K; research fan-out; everything listed as not verified in the earlier records.
- Fixes after these runs: absolute paths for ignored and uncommitted files in worktree briefs; items far under budget merged along a blocker chain; hostile-input checks limited to input from users and outside systems, with crashes on operator data as follow-up items; one re-review per findings list. Not re-run after these fixes.
- Background research and the local transcript analysis behind the budget are summarized in the task file of this change.


Run `python3 docs/check_package.py` from any directory. It checks the package files, the single discoverable entry point, the simple frontmatter and relative links. It does not prove that a model follows the instructions.
