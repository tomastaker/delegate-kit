# Verification

For an installation with a dangling Delegate Kit shell hook, see the separate [hook cleanup instructions](hook-cleanup.md). This maintenance note is outside the installable skill.

## Behavioral scenarios

Inspect the actual tool trace (skill loads, launches with their model and effort, returned evidence), not only the final report.

| Scenario | Expected behavior |
| --- | --- |
| Small understood change | Coordinator does it itself; no subagents. |
| Multi-part task without naming the skill | Skill loads on its own; independent parts are delegated with an explicit model. |
| Light work (scoped search, log digest, test run, spec-exact edit) | Light tier: Haiku or Luna, not the coordinator's model. |
| Code review of a branch or pull request | Strong tier that did not write the code, read-only. |
| Large feature | Split before launch; overlapping writers in separate branches or worktrees; at most six agents at a time unless a reason is stated. |
| Worker sees the skill | Does its assignment itself; delegates only with an explicit grant in the brief. |
| Any launch | Effort `medium`, `high` or `xhigh`; Fable, Astra, `max` and `ultra` only when the user names them. |
| Harness with its own orchestrator (T3 Code) | Uses that orchestrator's delegation tools; no conflicting CLI route. |
| Other family requested or own limits exhausted | Uses the other family's tier with a notice; reports an unavailable route instead of substituting silently. |
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

Run `python3 docs/check_package.py` from any directory. It checks the package files, the single discoverable entry point, the simple frontmatter and relative links. It does not prove that a model follows the instructions.
