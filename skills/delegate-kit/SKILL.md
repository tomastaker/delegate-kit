---
name: delegate-kit
description: Decide whether to do a task yourself or delegate it to a fresh worker (planner, implementer, reviewer, verifier, researcher), pick the model family and effort per role, dispatch it natively when it is the parent's own family or externally through the bundled agent-run wrapper when it is the other one, run writers in isolated git worktrees, and handle the structured result. Use for multi-module changes, anything that needs an independent review, parallel independent work, when the user names a preset ("main-claude", "main-codex", "main-gpt") to steer which subscription pays, or says "delegate", "subagent", "worker", "plan this", "review this".
license: MIT
compatibility: Requires bash, git, node >= 20, jq; claude (Claude Code CLI) and/or codex (Codex CLI) logged in with your own subscription.
---

# delegate-kit

One delegation policy that works from any parent: Claude Code, the T3 Code desktop app (it runs Claude Code), or Codex CLI. The parent you are talking in stays the orchestrator. A worker from the parent's own model family is spawned natively by the harness; a worker from the other family is a fresh headless session of `claude -p` or `codex exec` started through `scripts/agent-run`.

Either way a worker never inherits the parent's context. It gets the brief and reads the repository itself. Everything below follows from that fact.

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
| A review finding the implementer disputes, or a high-severity finding in a risk zone — **and one that a command cannot settle** | **verifier** (strongest model, read-only, rare) |
| "Fetch the current docs and quote them" — extraction, no recommendation at the end | **researcher** (cheap model, read-only, web) |
| Reading ends in a **recommendation or a choice** ("which of these do we adopt", "is this upgrade safe", "should we keep this dependency") | **planner**, not researcher — see the routing trap below |

**Routing trap: research that ends in a decision is planning.** The word
"research" covers both "go read the docs and quote them" and "go read the docs and
tell me what to do". Only the first is the researcher role. The moment the
deliverable is a recommendation, a risk verdict, or a pick between options, the
task needs the planner's model tier, because a wrong call propagates into
everything downstream. Ask what the worker returns: a quote is research, a verdict
is planning.

**Verify mechanically before spending a verifier.** A verifier is for claims that
need judgement. If a finding can be settled by running one command — `npm ls`, a
test, a typecheck, a grep — the parent runs it and closes the finding itself. That
is faster, cheaper, and more conclusive than another opinion. Reserve the verifier
for disputes about intent, severity, or design.

If the user ran a grill/interview first, its output is the spec. Save it as `.scratch/<task>/spec.md` (or the repo's own spec location) and point workers at it instead of restating it.

## 3. Where a worker runs: native or external

Every delegated worker has two independent properties: which **family** the model comes from (Claude or GPT), and how it is **dispatched** (natively by the parent harness, or externally as a headless CLI session through `agent-run`).

A parent can only spawn its own family natively. So the rule is mechanical:

| Worker family | parent = Claude Code / T3 | parent = Codex |
|---|---|---|
| Claude (`fable`, `opus`, `sonnet`, `haiku`) | **native** — `Agent` tool, `subagent_type: dk-<role>` | **external** — `agent-run run --backend claude` |
| GPT (`gpt-5.6-sol`, `-terra`, `-luna`) | **external** — `agent-run run --backend codex` | **native** — `spawn_agent` with agent `dk-<role>` |

Native is the default inside the family: no CLI cold start, no log plumbing, the result comes back in the parent's own turn, and the parent can steer or continue the subagent. The role definitions carry the model and the effort — `agents/dk-*.md` for Claude Code, `[agents.dk-*]` in `~/.codex/config.toml` for Codex, both installed by `hooks/install.sh`. Install them once, then dispatch by name; do not restate the role in the prompt.

**Ask `agent-run route` instead of deriving it by hand.** It knows the preset, detects the parent and prints the family, the model, the effort and the exact invocation:

```
agent-run route --role implementer            # → backend, model, effort, dispatch, how to invoke
agent-run route --role reviewer --author-backend claude
```

**Go external even inside the family when you need something native dispatch does not give you:**

- the strict JSON result contract (`--json-schema` / `--output-schema`), a ledger entry, or a run id you can `resume` later;
- a hard timeout, a detached parallel writer, or the automatic cross-vendor fallback when a subscription hits its limit;
- an **enforced** read-only sandbox. A native read-only role is read-only by instruction and by its tool list, not by a sandbox; the external one runs under `claude --permission-mode plan` / `codex -s read-only`.

**A native writer still needs a worktree and a lock.** The parent creates it, marks it taken, names the path in the dispatch, and releases it when the subagent returns:

```
agent-wt create <task> && agent-wt lock <task> --label dk-implementer
# … dispatch the native subagent, telling it to work only in that path …
agent-wt diff <task> > review.diff ; agent-wt release <task>
```

`agent-run` refuses to start an external writer in a worktree that is locked this way, and vice versa — one writer per worktree, whichever way it was dispatched.

## 4. Roles, families and models

Two rules decide the family before anything else: **do not review your own vendor's work** (a Codex-written change is reviewed by Claude and the reverse), and **the planner gets the strongest model available** — planning is one read-only call and a bad plan is the most expensive mistake.

### The two model families

`--backend` decides which family the *worker* comes from, and `--model` must name a model from that family. Never pass a Claude name to `--backend codex` or the reverse.

| Tier | `--backend claude` | `--backend codex` |
|---|---|---|
| strongest, for planning and hard verification | `fable` | `gpt-5.6-sol` at `xhigh` |
| high, the workhorse for implement and review | `opus` | `gpt-5.6-sol` |
| mid, for extraction and mechanical work | `sonnet` | `gpt-5.6-terra` |
| small, rarely worth a worker at all | `haiku` | `gpt-5.6-luna` |

The Codex CLI has no `pro` worker — `codex exec -m` is offered `sol`, `terra` and `luna` only (check `~/.codex/models_cache.json`). So the strongest Codex role is **sol at `xhigh`**, which is consistent with the rule that within a family effort moves quality more than tier.

Within the small tier prefer **`gpt-5.6-luna` over `haiku`**: it reasons better and follows a brief more literally, which is the whole risk with a cheap worker. Reach for the small tier only for bulk mechanical transforms with an unambiguous rule.

Effort values: `low | medium | high | xhigh | max` for both families (Codex also accepts `ultra`).

### Defaults per role

| Role | Model / effort | Family | Permissions |
|---|---|---|---|
| planner | `fable` high / `gpt-5.6-sol` xhigh | from the preset | read-only |
| implementer | `opus` high / `gpt-5.6-sol` high | from the preset (`--kind ui` → Claude under `auto`) | write, inside a worktree |
| reviewer | `opus` high / `gpt-5.6-sol` high | **the other family than the author** | read-only |
| verifier | `fable` high / `gpt-5.6-sol` xhigh | third party to the reviewer | read-only |
| researcher | `sonnet` medium / `gpt-5.6-terra` medium | from the preset | read-only, web allowed |

**Escalate the researcher when the answer carries risk.** The defaults assume extraction. If the question touches security, auth, payments, data loss, or cross-version compatibility, run it at `--model opus --effort high` (or `--model gpt-5.6-sol --effort high`) even though the role is nominally cheap — or route it to the planner per the routing trap in §2. A cheap researcher reliably returns correct quotes and unreliably predicts behaviour.

### 4.1 Presets: which subscription pays

A preset says which family absorbs the token-heavy work. It moves **planner, implementer and researcher** only.

| Preset | planner | implementer | researcher | reviewer / verifier |
|---|---|---|---|---|
| `auto` (default) | claude | codex | claude | derived from the author |
| `main-claude` | claude | claude | claude | derived from the author |
| `main-codex` | codex | codex | codex | derived from the author |

Reviewer and verifier are never moved by a preset: they are derived from whoever wrote the code, because independence is the reason they exist. The consequence is worth saying out loud — `main-claude` implies a **Codex** reviewer, and `main-codex` a Claude one. That is fine: a review is one read-only pass over a frozen diff, a fraction of what the implementer spends, so the preset still moves the bulk of the cost.

Set it, in order of precedence:

- **in the invocation** — `/delegate-kit main-claude`, `$delegate-kit main-codex`, or just "делегируй, main-claude". Aliases: `main-gpt`, `main-openai` → `main-codex`; `main-anthropic` → `main-claude`. Pass it on as `--preset` to every `agent-run` call in that task and say in your first line which preset you are running under;
- per call — `agent-run run --preset main-claude …`;
- for the session — `DELEGATE_KIT_PRESET=main-claude`;
- persistently — `agent-run preset main-claude` (stored in `~/.delegate-kit/config.json`; `agent-run preset` alone prints the current one).

Explicit `--backend`/`--model`/`--effort` always win over the preset. The user can also just name a model ("plan with Fable", "review with Sol").

Small models on micro-tasks are not worth a worker at all: the fixed start-up cost dominates — measured at ~50k input tokens for a worker that only reads one line out of one file. See `references/roles.md` for reasoning and per-role prompt hints.

## 5. Process for one task

1. **Triage** with §1–2. Say in one line what you will do yourself, what you delegate, and under which preset.
2. **Spec**: grill output or the user's text → `.scratch/<task>/spec.md` if it is more than a paragraph.
3. **Route** each delegated role once: `agent-run route --role <role> [--preset P]`. That fixes family, model, effort and native-vs-external for the rest of the task.
4. **Plan** (if a planner is needed): natively via `dk-planner`, or `agent-run run --role planner --brief brief.md`. Read the plan; do not paste it back verbatim to the user — summarise and ask only the questions the planner marked as blocking.
5. **Brief** each worker with `references/brief-template.md`: goal, acceptance criteria, where to look, constraints, what to return. Keep it short; the worker reads the code itself — native and external workers alike start with no memory of this conversation.
6. **Worktree** for every writer: `agent-wt create <task>`. External writer → pass `--cwd <worktree>` to `agent-run`, which takes the lock itself. Native writer → `agent-wt lock <task> --label dk-implementer` and name the path in the dispatch. One writer per worktree either way. Max 2 concurrent writers, max 4 workers total.
   The worktree branches from the **current HEAD commit**. Uncommitted changes in the user's working tree are invisible to the worker. Before creating a worktree, check `git status`; if it is dirty and the worker's task touches that work, tell the user and commit (or stash) first — do not let an implementer build on a stale base. Only writers need this; read-only roles see the working tree as it is.
7. **Implement**: native `dk-implementer` in the locked worktree, or `agent-run run --role implementer --cwd <wt> --brief brief.md`. Two in parallel: `--detach` + `agent-run wait <id>` externally, background dispatch natively.
8. **Freeze and review**: `agent-wt diff <task> > review.diff`, then the reviewer on the other family than the author (the brief points at the diff and the spec). With a Claude parent and a Claude-written change the reviewer is a Codex session; with a GPT-written change it is a native `dk-reviewer`.
9. **Findings**: mechanical ones the parent fixes; substantive ones go back to the same implementer (`agent-run resume <id> --prompt "..."`, or continue the native subagent); disputed or high-risk → verifier.
10. **Integrate**: merge or open a PR with `gh` per repo conventions; `agent-wt release <task>` and `agent-wt remove <task>`.
11. **Report** to the user: what was done, what was checked, what was not, open questions. Say which preset ran and which family reviewed. Never claim a check that did not run.

## 6. Worker result contract

Every worker returns one JSON object (schema: `references/result-schema.json`): `status` (`done` | `blocked` | `failed`), `summary`, `changes`, `checks_run`, `not_verified`, `findings` (reviewer), `plan` (planner), `questions`, `next_steps`. `agent-run` prints it and stores it under `~/.delegate-kit/runs/<id>/result.json`.

A worker cannot talk to the user. If it needs an answer it returns `status: blocked` with `questions`. The parent asks the user and continues the same worker with `agent-run resume <id>`.

## 7. Limits and safety

- Delegation depth is 1: workers do not spawn workers. `agent-run` sets `DELEGATE_KIT_DEPTH` (refuse to run if it is already set), starts Claude workers with `--disallowedTools Agent,Task` and Codex workers with `agents.enabled=false --disable multi_agent --disable multi_agent_v2`. The shipped native role definitions have no `Agent` tool for the same reason.
- Writers run in a worktree with the backend's own sandbox (`codex -s workspace-write`, `claude --permission-mode acceptEdits`). Never `bypassPermissions` or `danger-full-access`.
- Reviewers, planners, verifiers, researchers are read-only. Externally that is enforced (`codex -s read-only`, `claude --permission-mode plan`); natively it is an instruction plus a tool list with no writer in it. When the difference matters — an untrusted diff, a risk zone — dispatch that role externally.
- `hooks/gate.sh` makes dangerous shell commands require the user's confirmation in the parent (Claude: approval prompt; Codex: denied with instructions to confirm and re-run with the `DELEGATE_KIT_CONFIRMED=1` prefix).
- **Quota fallback.** If a backend answers with a usage/rate limit, `agent-run` retries the same brief once on the other vendor with that vendor's default model for the role, and marks the result with `fallback_from`. For reviewer/verifier this can put the review on the author's vendor — the result carries a note; say so in your report or re-run later. Disable with `--fallback none`. Resumes never fall back (the session lives on one vendor).
- The ledger `~/.delegate-kit/ledger.jsonl` records model, effort, tokens, duration, outcome and fallbacks per run. Look at it before changing the default matrix.

## Commands

```
agent-run route --role <role> [--preset P] [--parent claude|codex] [--author-backend B] [--kind ui]
agent-run preset [auto|main-claude|main-codex]
agent-run run --role <planner|implementer|reviewer|verifier|researcher> [--preset P] [--backend claude|codex] [--model M] [--effort E] [--cwd DIR] (--brief FILE | --prompt TEXT) [--detach] [--timeout MIN] [--fallback auto|none]
agent-run resume <id> (--brief FILE | --prompt TEXT)
agent-run list | status <id> | wait <id> | log <id> | kill <id>
agent-wt create <name> [--base REF] | list | status <name> | diff <name> | lock <name> [--label TXT] | release <name> | remove <name> | cleanup
```

Native role definitions: `agents/dk-*.md` (Claude Code) and `references/codex-agents.toml` (Codex). `hooks/install.sh` installs both plus the gate hook; `hooks/uninstall.sh` removes them.

Both scripts live in this skill's `scripts/` directory; call them by absolute path or put that directory on `PATH`.
