---
name: delegate-kit
description: Pick the shape of a task before doing it — DIRECT, SCOUT, PLAN, SINGLE, PARALLEL or SEQUENTIAL — and get a non-trivial change reviewed by a fresh worker, on the other model family when its CLI is installed. Use for a feature or refactor described in prose, work across several modules, a question that ends in a verdict ("which do we adopt"), or when the user says "delegate", "subagent", "worker", "scout", "plan this", "review this", "second opinion", or names a preset ("main-claude", "main-codex").
license: MIT
compatibility: Policy runs anywhere. Native workers need a host with subagents (Claude Code, T3 Code, Codex). Workers from the other family need that family's CLI logged in, plus bash, git, node >= 20, jq.
---

# delegate-kit

The current session is the **coordinator**: it owns the user's intent, the plan, every brief, integration, verification and the final answer. Workers are fresh sessions that start from a brief and read the repository themselves. Two kinds exist, and the policy names which one it means:

- **native** — a subagent of the host, same model family as the coordinator: steerable, visible, cheap.
- **external** — a headless CLI session of the other family (`claude -p` / `codex exec`) through `scripts/agent-run`: launched once, collected once, never steered. `references/external.md`.

## 1. Shape

Triage before acting. Pick the first shape that fits; state it in one line.

| Shape | When | Who |
|---|---|---|
| **DIRECT** | ≤ ~3 files with clear requirements; an explanation or diagnosis; a micro-fix after review; anything destructive or production-adjacent (`sudo`, deletes, services, secrets, prod DB, SSH) | coordinator, in the foreground |
| **SCOUT** | the hard part is *finding*: code spread across a large repo, several plausible causes, current docs to quote | one read-only worker (researcher for docs, otherwise the host's explorer) — then triage again |
| **PLAN** | prose requirements with business rules, ambiguity that reading code cannot settle, > 1 module or > ~10 files; any reading that ends in a *verdict* ("which do we adopt", "is this upgrade safe") | planner, read-only, strongest model |
| **SINGLE** | one well-specified vertical slice too large for DIRECT | one implementer in its own worktree |
| **PARALLEL** | 2–3 slices with disjoint write scopes, stable interfaces between them, each verifiable alone | one implementer per slice, each in its own worktree |
| **SEQUENTIAL** | a result changes the assumptions of the next task: schema → API → UI, diagnosis → fix | one worker at a time; the same worker resumed keeps its context |

Worker count equals the number of independent outcomes. Coupled edits stay in one pair of hands: split, they return as merge conflicts and two designs. Limits: 2 writers, 4 workers at once, delegation depth 1.

**Routing trap:** "research" that ends in a recommendation is PLAN, not SCOUT. A quote is research; a verdict is planning, and a wrong verdict propagates downstream.

## 2. Spec and preset

- A grill/interview output or requirements longer than a paragraph → `.scratch/<task>/spec.md`; workers are pointed at it.
- The user's words set the **preset**: any phrasing naming who carries the bulk of the work ("main model Claude", "let Codex implement") is `main-claude` / `main-codex`; naming a model for one role ("plan with Fable") is a per-call override. Presets move planner, implementer, researcher; the reviewer follows the author. `references/external.md`.

## 3. Route

Once per role: `agent-run route --role <role> [--preset P]`. Keep its answer — family, model, effort, native or external, exact invocation — for the whole task. `native` → dispatch through the host (`references/hosts.md`); `external` → `references/external.md`.

## 4. Brief

Write every brief from `references/brief-template.md`: goal, spec, acceptance criteria as commands, where to look, constraints, worktree path, what to return. Done when a stranger with the repository and nothing else could start. An external worker cannot ask mid-run, so its brief also says: on ambiguity return `status: blocked` with precise `questions`.

## 5. Worktree

Every writer gets one: `agent-wt create <task>`. External writer → `--cwd <worktree>` locks it; native writer → `agent-wt lock <task>` and the path in the brief. One writer per worktree. The worktree branches from **HEAD**: uncommitted work is invisible to the worker — if `git status` is dirty and the task touches it, tell the user and commit or stash first.

## 6. Review

The author of a non-trivial change does not certify it. A review is **independent** when a fresh read-only worker gets the frozen diff and the spec. Independence, in order of preference:

1. **the other family** than the author — `route` picks it when that family's CLI is installed;
2. **a fresh worker of the author's family** — what `route` returns when the other CLI is missing (`independent: false`, with a note). Report which one ran.

Review when: any delegated implementation; any change in a risk zone (auth, payments, migrations, prod config); a coordinator-written diff > ~50 lines; the user asks. Freeze and size it:

```
agent-wt diff <task> > review.diff
agent-run route --role reviewer --diff review.diff [--author-backend self]
```

`single` runs straight away. `panel` / `led` are **proposed with the printed numbers and run on the user's yes**. Reviewers run in parallel and blind to each other; merge by `references/review.md`.

**Findings.** Mechanical ones the coordinator fixes. Substantive ones go back to the same implementer (`agent-run resume <id>`, or continue the native subagent). A dispute is settled by a command first — a test, a typecheck, `npm ls`, a grep; spend a **verifier** only on intent, severity or design. A behavior-changing fix re-runs the affected checks and review.

## 7. Integrate and report

Merge or open a PR per repo conventions; `agent-wt release <task>`, `agent-wt remove <task>`. Report: what was done, what was checked, what was not, open questions, which preset ran, which family reviewed at which depth. A check that did not run is reported as not run; a worker's "done" is evidence to inspect.

## Worker contract

Every worker returns one JSON object (`references/result-schema.json`): `status` (`done` | `blocked` | `failed`), `summary`, `changes`, `checks_run`, `not_verified`, `findings`, `plan`, `questions`, `sources`, `next_steps`. `blocked` + `questions` → the coordinator asks the user and resumes the same worker.

Roles, models and prompt hints: `references/roles.md`. Native definitions: `agents/dk-*.md` (Claude Code) and `references/codex-agents.toml` (Codex), installed by `hooks/install.sh`. `--help` on `scripts/agent-run` and `scripts/agent-wt` is the flag reference.
