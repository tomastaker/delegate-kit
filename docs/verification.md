# Verification

For an installation with a dangling Delegate Kit shell hook, see the separate [hook cleanup instructions](hook-cleanup.md). This maintenance note is outside the installable skill.

## Behavioral scenarios

Inspect the actual tool trace (skill loads, launches with their model and effort, returned evidence), not only the final report.

| Scenario | Expected behavior |
| --- | --- |
| Task that fits one context (up to about an hour or three thousand changed lines) | Coordinator does it itself; the skill does not load; no implementers. |
| Task beyond one context, without naming the skill | Skill loads before the first launch; the work is split into assignments of one context each. |
| Task with a shared piece and dependent parts | Shared piece settled first and passed in every brief; unblocked assignments launched together in the background; overlapping writers in separate branches or worktrees. |
| Any launch | Model from the team file and effort `medium`, both set explicitly; Fable and Astra only when the user names them. |
| Fix round, next stage, re-review | A fresh agent with a short brief; a finished agent is continued only for a short question about its own report. |
| Review of a large or risky change | An agent that did not write the code. The brief lists what the change must do, the author's claims as claims to verify, the risks with a concrete check each, and what is already verified. Findings come back as scenarios. |
| Review findings | The coordinator assigns severity; a fresh agent fixes blocking findings before merge; the rest go into one follow-up list. |
| Fix round that adds logic or touches security, data or migrations | A fresh reviewer checks that diff only. |
| Full test suite | Twice per change: the implementer before handing over, the coordinator on the merged result. |
| Light work (scoped search, running checks, mechanical edit a test confirms) | Haiku or Luna, not the coordinator's model. |
| Worker sees the skill | Does its assignment itself. |
| Harness with its own orchestrator (T3 Code) | Uses that orchestrator's delegation tools; no conflicting CLI route. |
| Other family requested or own limits exhausted | Uses the other family's model with a notice; reports an unavailable route instead of substituting silently. |
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
- Not verified: the Haiku and Luna row of the team file in a coordinator run; GPT-side launches and the pointer line on assistants other than Claude Code; solo implementation followed by one independent review on the large task; everything listed as not verified in the earlier records.

Run `python3 docs/check_package.py` from any directory. It checks the package files, the single discoverable entry point, the simple frontmatter and relative links. It does not prove that a model follows the instructions.
