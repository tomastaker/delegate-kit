---
name: delegate-kit
description: Delegate work to fresh workers from Claude Code or Codex, with the review always on the other model family. Use for multi-module changes, anything that needs an independent review, parallel independent work, a preset ("main-claude", "main-codex") to choose which subscription pays, or when the user says "delegate", "subagent", "worker", "plan this", "review this".
license: MIT
compatibility: Requires bash, git, node >= 20, jq; claude (Claude Code CLI) and/or codex (Codex CLI) logged in with your own subscription.
---

# delegate-kit

One delegation policy from any parent — Claude Code, T3 Code (it runs Claude Code), or Codex CLI. The parent stays the orchestrator. A worker from the parent's own family is spawned natively; a worker from the other family is a headless `claude -p` / `codex exec` session started by `scripts/agent-run`. Either way a worker starts empty: it gets a brief and reads the repository itself. Everything below follows from that.

## 1. Default: do it yourself

A worker is a fresh session — system prompt, project instructions, re-reading files — before it does anything useful. Do the task in the current session when any of these hold:

- up to ~3 files, clear requirements, low risk;
- an explanation, a question, a diagnosis without code changes;
- a micro-fix after review (typo, rename, missing null check);
- anything destructive or production-adjacent: `sudo`, deletes, services, firewall, certificates, production DB, secrets, SSH. These stay with the parent, in the foreground, with the user watching.

Delegate for independence, parallelism, or a clean context — those are the only three reasons. Tightly coupled edits stay in one pair of hands: split across workers they come back as merge conflicts and contradictory designs.

## 2. When to delegate — signals

| Signal | Delegate to |
|---|---|
| Requirements in prose with business rules, ambiguity that reading code cannot resolve, > 1 module, or > ~10 files | **planner** (read-only) before any implementation |
| A well-specified vertical task of moderate size; or 2 independent parts that can run in parallel | **implementer**, one per task, each in its own worktree |
| Any delegated implementation; any change in a risk zone (auth, payments, migrations, prod config); a diff > ~50 lines the parent wrote itself; or the user asks | **reviewer** — the other family than the author, always |
| A finding the implementer disputes, or a high-severity finding in a risk zone — **and one that a command cannot settle** | **verifier** (strongest model, read-only, rare) |
| "Fetch the current docs and quote them" — extraction, no recommendation at the end | **researcher** (cheap model, read-only, web) |
| Reading that ends in a **recommendation or a choice** ("which do we adopt", "is this upgrade safe") | **planner**, not researcher — the routing trap |

**Routing trap: research that ends in a decision is planning.** "Research" covers both "read the docs and quote them" and "read the docs and tell me what to do"; only the first is the researcher. Ask what the worker returns: a quote is research, a verdict is planning, and a wrong verdict propagates into everything downstream.

**Verify mechanically before spending a verifier.** If one command settles a finding — `npm ls`, a test, a typecheck, a grep — the parent runs it and closes the finding. Reserve the verifier for disputes about intent, severity, or design.

If the user ran a grill/interview first, its output is the spec: save it as `.scratch/<task>/spec.md` (or the repo's own spec location) and point workers at it.

## 3. Process for one task

1. **Triage** with §1–2. State in one line what you do yourself, what you delegate, and under which preset.
2. **Spec**: grill output or the user's text → `.scratch/<task>/spec.md` when it is more than a paragraph.
3. **Route** each delegated role once — `agent-run route --role <role> [--preset P]` — and keep its answer (family, model, effort, native or external, exact invocation) for the rest of the task. The reasoning behind the answer: `references/dispatch.md`, `references/roles.md`.
4. **Plan**, when the signals say so: `dk-planner` natively or `agent-run run --role planner --brief brief.md`. Summarise the plan to the user and ask only the questions it marked blocking.
5. **Brief** each worker with `references/brief-template.md`: goal, acceptance criteria, where to look, constraints, what to return. Done when a stranger with the repository and nothing else could start.
6. **Worktree** for every writer: `agent-wt create <task>`. External writer → `--cwd <worktree>` on `agent-run`, which locks it. Native writer → `agent-wt lock <task>` and the path in the brief. One writer per worktree; at most 2 writers and 4 workers at once.
   The worktree branches from the **current HEAD commit**, so uncommitted work is invisible to the worker. If `git status` is dirty and the task touches that work, tell the user and commit or stash first. Read-only roles see the working tree as it is.
7. **Implement**: `dk-implementer` in the locked worktree, or `agent-run run --role implementer --cwd <wt> --brief brief.md`. Two in parallel: `--detach` + `agent-run wait <id>` externally, background dispatch natively.
8. **Freeze and size the review**: `agent-wt diff <task> > review.diff`, then `agent-run route --role reviewer --diff review.diff`. It returns the depth (`single` | `panel` | `led`), the reviewers with lens and family, and the cost. `single` runs straight away; a panel is **proposed with those numbers and run on the user's yes**. Rules and lenses: `references/review.md`.
9. **Review**: each reviewer gets the diff, the spec and — on a panel — its lens, in parallel and blind to the others. Merge by the rules in `references/review.md`; at `led` depth the `dk-review-lead` plans before and merges after.
10. **Findings**: mechanical ones the parent fixes; substantive ones go back to the same implementer (`agent-run resume <id>`, or continue the native subagent); disputes → a command first, then the verifier.
11. **Integrate**: merge or open a PR with `gh` per repo conventions; `agent-wt release <task>`, `agent-wt remove <task>`.
12. **Report**: what was done, what was checked, what was not, open questions, which preset ran, which family reviewed at which depth. A check that did not run is reported as not run.

## 4. Worker result contract

Every worker returns one JSON object (`references/result-schema.json`): `status` (`done` | `blocked` | `failed`), `summary`, `changes`, `checks_run`, `not_verified`, `findings` (reviewer, verifier, lead), `plan` (planner, lead), `questions`, `sources`, `next_steps`. `agent-run` prints it and stores it under `~/.delegate-kit/runs/<id>/result.json`.

A worker cannot talk to the user. If it needs an answer it returns `status: blocked` with `questions`; the parent asks the user and continues the same worker with `agent-run resume <id>`.

## 5. Limits and safety

- **Delegation depth is 1.** Workers get no subagents of their own — `agent-run` disables them on both CLIs, and the shipped `dk-*` definitions carry no `Agent` tool.
- **Writers** run in a worktree under the backend's own sandbox (`workspace-write` / `acceptEdits`). The dangerous modes (`danger-full-access`, `bypassPermissions`) are outside this skill.
- **Read-only roles** are enforced externally (`read-only` / `plan`) and by instruction plus tool list natively. When the boundary matters — an untrusted diff, a risk zone — dispatch that role externally.
- `hooks/gate.sh` makes dangerous shell commands require the user's confirmation in the parent (Claude: the approval prompt; Codex: denied with instructions to confirm and re-run prefixed `DELEGATE_KIT_CONFIRMED=1`).
- **Quota fallback.** On a usage or rate limit `agent-run` retries the brief once on the other vendor and marks the result `fallback_from`. For a reviewer that can land the review on the author's family — the result says so; report it, or re-run later. `--fallback none` disables it. Resumes never fall back.
- The ledger `~/.delegate-kit/ledger.jsonl` records model, effort, preset, lens, tokens, duration and outcome per external run. Read it before changing a default.

Scripts: `scripts/agent-run` and `scripts/agent-wt`, by absolute path or on `PATH`; `--help` on each is the reference for flags. Native role definitions: `agents/dk-*.md` (Claude Code) and `references/codex-agents.toml` (Codex), installed by `hooks/install.sh`.
