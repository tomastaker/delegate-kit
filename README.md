<div align="center">

# delegate-kit

**Your coding agent picks the shape of a task before doing it, hands the big ones to fresh workers, and gets the result reviewed by someone who did not write it — the other model family whenever its CLI is installed.**

One skill for Claude Code, T3 Code and Codex CLI. Your logins, your subscriptions, no new harness.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-coordinator%20%7C%20worker-blueviolet)](https://claude.com/claude-code)
[![Codex CLI](https://img.shields.io/badge/Codex%20CLI-coordinator%20%7C%20worker-black)](https://github.com/openai/codex)
[![T3 Code](https://img.shields.io/badge/T3%20Code-coordinator-orange)](https://t3.chat)

[Why](#why) · [How it works](#how-it-works) · [Shapes](#the-shapes) · [Review](#review) · [Install](#install) · [Usage](#usage) · [Docs](skills/delegate-kit/)

</div>

---

## Why

Capable models already delegate. What they do inconsistently is *when* and *how*: a one-line fix spawns a 50k-token worker, a ten-module feature starts with no plan, three subagents share one working tree, and the author approves its own diff. delegate-kit makes one decision the same every time:

> **Do it here, send one scout, plan first, one worker, a few in parallel, or a sequence — and who reviews the result.**

| Without | With |
|---|---|
| Delegation on a whim | **Shape first**, from numbers: ≤ ~3 files → done here; prose requirements or > 1 module → a plan before code |
| Three workers on one coupled feature → merge conflicts, two designs | **Worker count = independent outcomes**; coupled edits stay in one pair of hands |
| Claude reviews Claude; Codex reviews Codex | **Independent review**: the other family when available, a fresh session otherwise — reported either way |
| Workers write into your tree and collide | **One writer per git worktree**, locked; you merge what you accept |
| A cross-vendor worker treated as a subagent, then lost | **Native inside the family, external across it** — named as such, launched once, collected once |
| One subscription runs dry, work stops | **Presets** move the heavy roles; the reviewer follows the author; a rate limit retries once on the other vendor and says so |
| "Done." Was anything checked? | **One JSON contract**: `status`, `changes`, `checks_run`, `not_verified`, `findings`, `questions` |

## How it works

You talk to one agent — the **coordinator**. It keeps the intent, the plan, every brief, integration and the answer. Workers are fresh sessions that start from a brief and read the repository themselves.

```
you ──► coordinator                    "change the tariff logic in the billing module"
            │
            │  shape?  DIRECT → done here.  otherwise:
            │  spec → .scratch/tariffs/spec.md
            ▼
      planner ──────────► strongest model, read-only ──────► steps, risks, blocking questions
            │
      agent-wt create tariffs            git worktree + write-lock
            │
      implementer ──────► native subagent or external CLI ─► commits on dk/tariffs
            │
      agent-wt diff tariffs              the frozen diff
      agent-run route --role reviewer    single | panel | led · family · cost
            │
      reviewer ─────────► the OTHER family if its CLI is installed,
            │             else a fresh session of the same family ─► findings
            │
            │  mechanical → coordinator fixes · substantive → same implementer, resumed
            │  dispute → a command first, then a verifier
            ▼
      merge / PR · report: done · checked · not checked · open · who reviewed
```

Two kinds of worker, never confused:

| | Native | External |
|---|---|---|
| What | a subagent of the host, same family as the coordinator | a headless `claude -p` / `codex exec` session of the other family, via `agent-run` |
| Steerable | yes — visible, continuable | no — launched once with a full brief, collected once, resumed by id |
| Why | cheap, default inside the family | the only way to get the other family; also an enforced sandbox, a ledger, timeouts, quota fallback |
| Docs | [`references/hosts.md`](skills/delegate-kit/references/hosts.md) | [`references/external.md`](skills/delegate-kit/references/external.md) |

## The shapes

| Shape | When | Who |
|---|---|---|
| **DIRECT** | ≤ ~3 files, clear requirements; explanations; micro-fixes; anything destructive or production-adjacent | the coordinator, in the foreground |
| **SCOUT** | the hard part is *finding*: a large repo, several plausible causes, docs to quote | one read-only worker, then decide again |
| **PLAN** | prose requirements, ambiguity, > 1 module or > ~10 files; any question that ends in a verdict | planner, read-only, strongest model |
| **SINGLE** | one vertical slice too big for DIRECT | one implementer in its own worktree |
| **PARALLEL** | 2+ slices with disjoint write scopes and stable interfaces | one implementer per slice, each in a worktree |
| **SEQUENTIAL** | one result changes the next task's assumptions (schema → API → UI) | one worker at a time, resumed |

Limits: writer cap 3, ceiling 8, workers = writers + 3, delegation depth 1. Raising the cap is a per-task decision: the coordinator names the partition (one ticket per writer, disjoint write scopes), you say yes, and `--max-writers N` carries it. Repository size changes the cost of *finding* context, not the number of writers.

## Review

The author of a non-trivial change does not certify it. The reviewer is a fresh, read-only worker with the frozen diff and the spec — and independence has an order of preference, not a hard requirement:

1. **The other family than the author.** Picked whenever that CLI is installed. Claude wrote it → Codex reads it, and the reverse; a change the coordinator wrote itself goes to the other vendor too.
2. **A fresh session of the author's family.** When the other CLI is missing, `agent-run route` falls back to it, marks `independent: false`, and the report says which kind ran.

Depth is measured from the diff:

| Depth | Reviewers | When |
|---|---|---|
| `single` | one | small diff, one module, no risk zone — the default |
| `panel` | two, parallel and blind to each other | large diff, several modules, or a risk zone |
| `led` | a lead plans, three review, the lead merges | very large or risky |

Lenses: `spec` · `correctness` · `standards`. A panel is **proposed with the numbers and run on your yes**. Rules, lenses, merge and the smell baseline: [`references/review.md`](skills/delegate-kit/references/review.md).

## Install

**Prerequisites.** The policy and native workers need only the host. Workers from the other family need that CLI installed and logged in with your own account, plus `bash`, `git`, `jq`, `node ≥ 20`.

```bash
# 1. the skill
npx skills add tomastaker/delegate-kit
# or by hand:
git clone https://github.com/tomastaker/delegate-kit ~/dev/delegate-kit
ln -s ~/dev/delegate-kit/skills/delegate-kit ~/.agents/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.claude/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.codex/skills/delegate-kit

# 2. native role definitions + safety hook (backs up your settings, shows the diff first)
~/.agents/skills/delegate-kit/hooks/install.sh --dry-run
~/.agents/skills/delegate-kit/hooks/install.sh          # --claude / --codex / --hooks-only / --agents-only

# 3. optional: scripts on PATH
echo 'export PATH="$HOME/.agents/skills/delegate-kit/scripts:$PATH"' >> ~/.zshrc
```

Restart running `claude` / `codex` sessions. The symlinks keep it live: `git pull` is the update; re-run `install.sh` after a change to the roles.

**Always-on.** The skill triggers on its own words (below). To have it triage every non-trivial task, add one line to your global instructions:

```text
Before repository work described in prose or spanning several modules, apply delegate-kit; a DIRECT verdict needs no announcement.
```

**Uninstall.** `hooks/uninstall.sh`, remove the three symlinks, `rm -rf ~/.delegate-kit` if you do not want to keep the ledger and run logs.

## Usage

Work as usual. Invoke explicitly with `/delegate-kit` (Claude Code) or `$delegate-kit` (Codex), or just say it:

| You say | Effect |
|---|---|
| "delegate", "subagent", "scout", "plan this", "review this", "second opinion" | the skill triggers |
| a feature or refactor described in prose; "which should we adopt?" | the skill triggers — PLAN |
| "let Codex implement", "main model Claude", `main-claude` / `main-codex` | preset for this task: heavy roles move, the reviewer follows the author |
| "plan with Fable", "review with Sol" | one model for one role; the preset is untouched |
| "panel", "two reviewers", "led" | your yes to a deeper review, given in advance |
| "this is mechanical" / "a refactor" / "UI work" | `--kind`: always `single` / lenses `correctness`+`standards` / implementer on Claude under `auto` |

**Decides alone:** the shape; family, model, effort and native-vs-external per role; the reviewer; review depth from the diff; a command before a verifier; one cross-vendor retry on a rate limit.

**Stops and asks:** before a panel (with the numbers); when a worker returns `blocked` with questions; when your working tree is dirty and the task touches it; before any command the safety gate classes as dangerous.

If you interview yourself first (a grill skill, a spec session), save the outcome as `.scratch/<task>/spec.md` — workers and the reviewer read that file, not a retelling.

<details>
<summary><b>The roles</b></summary>

| Role | Does | Default | Access |
|---|---|---|---|
| **planner** | ordered steps, files per step, risks, blocking questions, the checks that prove completion | Claude Fable high · Codex Sol xhigh | read-only |
| **implementer** | one vertical slice in its own worktree; runs the acceptance checks; commits on its branch | Codex Sol high · Claude Opus high for UI | write, sandboxed |
| **reviewer** | reads the frozen diff against the spec; findings with severity, lens, file:line, evidence, fix | the other family than the author when available | read-only |
| **review-lead** | plans a `led` review before, merges findings after; two short calls | the planner's family, strongest | read-only |
| **verifier** | settles one disputed or high-risk finding that a command cannot | third party to the reviewer | read-only |
| **researcher** | quotes current docs with URL and date; marks what it could not verify | Claude Sonnet medium · Codex Terra medium | read-only, web |

Presets move planner, implementer and researcher; the reviewer follows the author. Reasoning per role: [`references/roles.md`](skills/delegate-kit/references/roles.md).

</details>

<details>
<summary><b>Driving the scripts by hand</b></summary>

```bash
agent-run route --role implementer --preset main-claude   # who runs this, where, how
agent-run route --role reviewer --diff review.diff --author-backend codex   # depth, family, cost; self when you wrote it
agent-run preset main-claude                               # persist; alone: show the effective table

agent-run run --role planner --brief .scratch/tariffs/brief.md
agent-wt create tariffs
agent-run run --role implementer --backend codex --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/impl.md
agent-wt diff tariffs > .scratch/tariffs/review.diff
agent-run run --role reviewer --backend claude --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/review.md
agent-run resume <implementer-id> --prompt "Fix findings 1 and 3: ..."
agent-run list | status <id> | wait <id> | kill <id> | log <id> | notify [<id>]
```

Several writers in parallel: `--detach` on each, then `agent-run wait <id>` or `--on-finish CMD` so each reports for itself. A native writer: `agent-wt lock <task>` before dispatch, `agent-wt release <task>` after. Both commands refuse a writer past the cap (`--max-writers N` or `DELEGATE_KIT_MAX_WRITERS` raise it, up to the ceiling of 8); a refused `--detach` run is reported to the parent. `--help` on either script is the flag reference.

</details>

<details>
<summary><b>Layout</b></summary>

```
skills/delegate-kit/
  SKILL.md                      the policy: shapes, spec, route, brief, worktree, review, report
  references/hosts.md           native dispatch per host; git with parallel writers
  references/external.md        the other family through agent-run: preflight, collecting, presets, limits
  references/roles.md           families, tiers, reasoning per role, prompt hints
  references/review.md          depth, lenses, panel composition, merge rules, smell baseline
  references/brief-template.md  how to write a brief
  references/result-schema.json the JSON contract
  references/codex-agents.toml  the six roles as native Codex subagents
  agents/dk-*.md                the six roles as native Claude Code subagents
  scripts/agent-run             route / preset / run / resume / list / status / wait / kill / log / notify
  scripts/agent-wt              create / list / status / diff / lock / release / remove / cleanup
  hooks/gate.sh, install.sh, uninstall.sh
  tests/delivery.sh             completion-delivery bench; --race N for the concurrency hammer
```

</details>

## What it will not do

- **Steer an external worker mid-run** — headless sessions run to completion; you read the result and resume. That is why native is preferred inside the family, and why an external worker is never called a subagent.
- **Run a swarm** — writer cap 3, ceiling 8, and the ceiling holds against every flag. Between the two it takes a stated partition and your yes, passed as `--max-writers N`.
- **Make delegation cheap** — a worker is a full session; the shapes exist so you pay for it only for independence, parallelism or a clean context.
- **Sandbox by itself** — the gate is a list of dangerous command shapes; the real isolation is the CLIs' own sandboxes plus the worktree.

Workers run through the official CLIs with the logins you already have — ordinary use of Claude Code and Codex. Do not wrap this into a product that routes other people's subscriptions.

## License and acknowledgments

MIT. The review lenses `spec` and `standards` and the smell baseline are adapted from [mattpocock/skills — code-review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) (MIT). The host dispatch table and git-coordination facts borrow from [Hyperskills](https://github.com/hyperb1iss/hyperskills); one worker per independent outcome from [Superpowers](https://github.com/obra/superpowers). README structure after [Best-README-Template](https://github.com/othneildrew/Best-README-Template).
