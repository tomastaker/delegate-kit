---
name: delegate-kit
description: Pick the shape of a task before doing it — DIRECT, SCOUT, PLAN, SINGLE, PARALLEL or SEQUENTIAL — and get a non-trivial change reviewed by a fresh worker, on the other model family when its CLI is installed. Use for a feature or refactor described in prose, work across several modules, a question that ends in a verdict ("which do we adopt"), or when the user says "delegate", "subagent", "worker", "scout", "plan this", "review this", "second opinion", or names a preset ("main-claude", "main-codex").
license: MIT
compatibility: Policy runs anywhere. Native workers need a host with subagents (Claude Code, T3 Code, Codex). Workers from the other family need that family's CLI logged in, plus bash, git, node >= 20, jq.
---

# delegate-kit

The current session is the **coordinator**: it owns intent, plan, every brief, integration, verification and the final answer. Workers are fresh sessions that start from a brief and read the repository themselves. Two kinds:

- **native** — a subagent of the host, same model family as the coordinator: steerable, visible, cheap.
- **external** — a headless CLI session of the other family (`claude -p` / `codex exec`) through `scripts/agent-run`: launched once, collected once, never steered. `references/external.md`.

## 1. Shape

Triage before acting. Pick the first shape that fits; state it in one line.

| Shape | When | Who |
|---|---|---|
| **DIRECT** | ≤ ~3 files with clear requirements; an explanation or diagnosis; a micro-fix after review; anything destructive or production-adjacent (`sudo`, deletes, secrets, prod DB, SSH) | coordinator, in the foreground |
| **SCOUT** | the hard part is *finding*: code spread across a large repo, several plausible causes, current docs to quote | one read-only worker (researcher for docs, else the host's explorer), then triage again |
| **PLAN** | prose requirements with business rules, ambiguity code cannot settle, > 1 module or > ~10 files; any reading that ends in a *verdict* ("which do we adopt", "is this upgrade safe") | planner, read-only, strongest model |
| **SINGLE** | one well-specified vertical slice too large for DIRECT | one implementer in its own worktree |
| **PARALLEL** | 2+ slices with disjoint write scopes, stable interfaces, each verifiable alone; beyond the cap only as the limits below allow | one implementer per slice, each in its own worktree |
| **SEQUENTIAL** | a result changes the assumptions of the next task: schema → API → UI, diagnosis → fix | one worker at a time; resumed, it keeps its context |

Worker count equals the number of independent outcomes. Coupled edits stay in one pair of hands: split, they return as merge conflicts and two designs. Limits: writer cap 3, ceiling 8; workers = writers + 3; delegation depth 1. Raising the cap: state the partition, get the user's yes, pass `--max-writers N` (`references/external.md`).

**Routing trap:** "research" that ends in a recommendation is PLAN, not SCOUT.

## 2. Spec, tickets and preset

- A grill/interview output or requirements longer than a paragraph → `.scratch/<task>/spec.md`; workers are pointed at it. An interview ends only when the coordinator restates it in 5–8 lines — outcome, who it is for, what success looks like, the binding constraint, **out of scope** — and the user says yes explicitly; "sounds good" is not yes.
- Multi-slice work gets **tickets**: `/to-tickets` (mattpocock/skills) writes one file per slice to `.scratch/<task>/issues/NN-slug.md` with `Blocked by`, `Status` and acceptance checkboxes. One ticket = one brief = one worker, never two tickets in one (`references/roles.md`). The **frontier** — tickets whose blockers are all done — is the next work; a fresh session continues from the directory alone.
- **Never overwrite a plan with unchecked items.** Replanning edits the files in place; different work while a plan is open is a question for the user, not a silent replacement.
- The user's words set the **preset**: naming who carries the bulk ("main model Claude", "let Codex implement") is `main-claude` / `main-codex`; naming a model for one role ("plan with Fable") is a per-call override. Presets move planner, implementer, researcher; the reviewer follows the author. `references/external.md`.

## 3. Route

Once per role: `agent-run route --role <role> [--preset P]`. Keep its answer for the whole task. `native` → dispatch through the host (`references/hosts.md`); `external` → `references/external.md`.

## 4. Brief

Write every brief from `references/brief-template.md`. Done when a stranger with only the repository could start.

## 5. Worktree

Every writer gets one: `agent-wt create <task>`. External writer → `--cwd <worktree>` locks it; native writer → `agent-wt lock <task>` and the path in the brief. One writer per worktree. The worktree branches from **HEAD**, so uncommitted work is invisible to the worker: if the tree is dirty and the task touches it, tell the user and commit or stash first.

## 6. Review

The author of a non-trivial change does not certify it. A review is **independent** when a fresh read-only worker gets the frozen diff and the spec: **the other family** than the author when its CLI is installed, else a fresh worker of the author's family (`route` marks it `independent: false`; report which ran).

Review when: any delegated implementation; a risk zone (auth, payments, migrations, prod config); a coordinator-written diff > ~50 lines; the user asks. Freeze and size it:

```
agent-wt diff <task> > review.diff
agent-run route --role reviewer --diff review.diff --author-backend <implementer's family | self>
```

`single` runs straight away. `panel` / `led` are **proposed with the printed numbers and run on the user's yes**. Panels merge by `references/review.md`.

**Findings.** Mechanical ones the coordinator fixes. Substantive ones go to a **fix worker**: the implementer resumed while under ~100 turns or when a finding rejects its design; else a fresh implementer with the ticket, frozen diff, findings and the previous worker's `summary` and `next_steps` (`references/brief-template.md`). A dispute is settled by a command first — a test, a typecheck, a grep; a **verifier** only for intent, severity or design.

**Re-review.** After a behavior-changing fix, re-run the affected checks and resume the **same reviewer** with the diff of the fixes and each finding's disposition — fixed, or refuted with the reason; it confirms or rejects and reads the new hunks. Unresumable → a fresh reviewer, briefed per the template.

## 7. Integrate and report

Merge or open a PR per repo conventions; `agent-wt release <task>`, `agent-wt remove <task>`. Report: done, checked, not checked, open questions, which preset ran, which family reviewed at which depth. A check that did not run is reported as not run; a worker's "done" is evidence to inspect.

Once the coordinator itself has run a ticket's acceptance commands, tick its checkboxes and set `Status: done`. The report ends with the frontier — `closed X of Y, next: <ticket>` — so tickets and answer never disagree.

## 8. Handoff

Switching machine, harness or model family mid-task: write `.scratch/handoff/<YYYY-MM-DD>-<task>.md` — where the work stands, what is blocked and on whom, which skills to call next, and pointers (spec, tickets, commits, diffs) instead of copies. No secrets. The next session starts from that file and the tickets. A handoff transfers ownership; nothing comes back to integrate.

## Worker contract

Every worker returns one JSON object per `references/result-schema.json`; `status` is `done` | `blocked` | `failed`. `blocked` + `questions` → the coordinator asks the user and resumes the same worker.

Roles, models and prompt hints: `references/roles.md`. Native definitions: `agents/dk-*.md` (Claude Code), `references/codex-agents.toml` (Codex), installed by `hooks/install.sh`. `--help` on both scripts is the flag reference.
