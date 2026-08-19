---
name: delegate-kit
description: Decide whether to do a task yourself or delegate it to a fresh worker (planner, implementer, reviewer, verifier, researcher) running in Claude Code or Codex, pick the model per role, write the brief, run the worker via the bundled agent-run wrapper in an isolated git worktree, and handle its structured result. Use for multi-module changes, anything that needs an independent review, parallel independent work, or when the user says "delegate", "subagent", "worker", "plan this", "review this".
license: MIT
compatibility: Requires bash, git, node >= 20, jq; claude (Claude Code CLI) and/or codex (Codex CLI) logged in with your own subscription.
---

# delegate-kit

One delegation policy that works from any parent: Claude Code, the T3 Code desktop app (it runs Claude Code), or Codex CLI. The parent you are talking in stays the orchestrator; workers are fresh, headless sessions of `claude -p` or `codex exec` started through `scripts/agent-run`.

Workers never inherit the parent's context. They get the brief and read the repository themselves. Everything below follows from that fact.

## 1. Default: do it yourself

Delegation costs a full fresh session per worker (system prompt, project instructions, re-reading files). Do the task in the current session when any of these hold:

- up to ~3 files, clear requirements, low risk;
- an explanation, a question, a diagnosis without code changes;
- a micro-fix after review (typo, rename, missing null check);
- anything destructive or production-adjacent: `sudo`, deletes, launchd/systemd, firewall, certificates, production DB, secrets, SSH to servers. These are never delegated — the parent does them in the foreground with the user watching.

Do not delegate to "keep busy", to use a specific model for its own sake, or to split tightly coupled edits. Splitting coupled work across workers produces merge conflicts and contradictory designs.

## 2. When to delegate — signals

| Signal | Delegate to |
|---|---|
| Requirements in prose with business rules, or ambiguity that reading code cannot resolve, or > 1 module/package, or estimated > ~10 files | **planner** (read-only) before any implementation |
| A well-specified vertical task of moderate size; or 2 independent parts that can run in parallel | **implementer**, one per task, each in its own worktree |
| Any delegated implementation; any change in a risk zone (auth, payments, migrations, prod config); or a diff > ~50 lines the parent wrote itself; or the user asks | **reviewer** (read-only, other vendor than the author) |
| A review finding the implementer disputes, or a high-severity finding in a risk zone | **verifier** (strongest model, read-only, rare) |
| "Check the current docs / compare options / confirm a hypothesis" | **researcher** (cheap model, read-only, web) |

If the user ran a grill/interview first, its output is the spec. Save it as `.scratch/<task>/spec.md` (or the repo's own spec location) and point workers at it instead of restating it.

## 3. Roles and default models

Pick the backend by two rules: **do not review your own vendor's work** (Codex-written code is reviewed by Claude and vice versa), and **the planner is the strongest model available** — planning is one read-only call and a bad plan is the most expensive mistake.

| Role | Backend / model / effort | Permissions |
|---|---|---|
| planner | `claude` fable high (fallback: opus high; if Max quota is tight: `codex` gpt-5.6-sol high) | read-only (plan mode) |
| implementer | `codex` gpt-5.6-sol high for backend/refactor/types; `claude` opus high for UI/design-heavy work | write, inside a worktree |
| reviewer | opposite vendor of the author: `claude` opus high after Codex; `codex` gpt-5.6-sol high after Claude; UX review → `claude` opus | read-only |
| verifier | third party: `codex` gpt-5.6-sol xhigh after an Opus review; `claude` fable high after a Sol review | read-only |
| researcher | `claude` sonnet medium or `codex` gpt-5.6-terra medium | read-only, web allowed |

Override on request: the user can name a model ("plan with Fable", "review with Sol") or pass `--model/--effort` to `agent-run`. Small models on micro-tasks are not worth a worker: the fixed start-up cost dominates. See `references/roles.md` for reasoning and per-role prompt hints.

## 4. Process for one task

1. **Triage** with §1–2. Say in one line what you will do yourself and what you delegate.
2. **Spec**: grill output or the user's text → `.scratch/<task>/spec.md` if it is more than a paragraph.
3. **Plan** (if a planner is needed): `agent-run run --role planner --brief brief.md`. Read the plan; do not paste it back verbatim to the user — summarise and ask only the questions the planner marked as blocking.
4. **Brief** each worker with `references/brief-template.md`: goal, acceptance criteria, where to look, constraints, what to return. Keep it short; the worker reads the code itself.
5. **Worktree** for every writer: `agent-wt create <task>` → pass `--cwd <worktree>` to `agent-run`. One writer per worktree; `agent-run` refuses a second writer. Max 2 concurrent writers, max 4 workers total.
6. **Implement**: `agent-run run --role implementer --backend codex --cwd <wt> --brief brief.md`. Use `--detach` when running two in parallel, then `agent-run wait <id>`.
7. **Freeze and review**: `agent-wt diff <task> > review.diff`; `agent-run run --role reviewer --backend <other vendor> --cwd <wt> --brief review-brief.md` (the brief points at the diff and the spec).
8. **Findings**: mechanical ones the parent fixes; substantive ones go back to the same implementer with `agent-run resume <id> --prompt "..."`; disputed or high-risk → verifier.
9. **Integrate**: merge or open a PR with `gh` per repo conventions; `agent-wt release <task>` and `agent-wt remove <task>`.
10. **Report** to the user: what was done, what was checked, what was not, open questions. Never claim a check that did not run.

## 5. Worker result contract

Every worker returns one JSON object (schema: `references/result-schema.json`): `status` (`done` | `blocked` | `failed`), `summary`, `changes`, `checks_run`, `not_verified`, `findings` (reviewer), `plan` (planner), `questions`, `next_steps`. `agent-run` prints it and stores it under `~/.delegate-kit/runs/<id>/result.json`.

A worker cannot talk to the user. If it needs an answer it returns `status: blocked` with `questions`. The parent asks the user and continues the same worker with `agent-run resume <id>`.

## 6. Limits and safety

- Delegation depth is 1: workers do not spawn workers (`agent-run` sets `DELEGATE_KIT_DEPTH`; refuse to run if it is already set).
- Writers run in a worktree with the backend's own sandbox (`codex -s workspace-write`, `claude --permission-mode acceptEdits`). Never `bypassPermissions` or `danger-full-access`.
- Reviewers, planners, verifiers, researchers are read-only (`codex -s read-only`, `claude --permission-mode plan`).
- `hooks/gate.sh` makes dangerous shell commands require the user's confirmation in the parent (Claude: approval prompt; Codex: denied with instructions to confirm and re-run with the `DELEGATE_KIT_CONFIRMED=1` prefix).
- The ledger `~/.delegate-kit/ledger.jsonl` records model, effort, tokens, duration and outcome per run. Look at it before changing the default matrix.

## Commands

```
agent-run run --role <planner|implementer|reviewer|verifier|researcher> [--backend claude|codex] [--model M] [--effort E] [--cwd DIR] (--brief FILE | --prompt TEXT) [--detach] [--timeout MIN]
agent-run resume <id> (--brief FILE | --prompt TEXT)
agent-run list | status <id> | wait <id> | log <id> | kill <id>
agent-wt create <name> [--base REF] | list | status <name> | diff <name> | release <name> | remove <name> | cleanup
```

Both scripts live in this skill's `scripts/` directory; call them by absolute path or put that directory on `PATH`.
