<div align="center">

# delegate-kit

**Your coding agent picks the shape of a task before doing it, hands the big ones to fresh workers, and gets the result reviewed by a fresh pair of eyes — from the other model family whenever that family's CLI is installed.**

One skill for Claude Code, T3 Code and Codex CLI. Your logins, your subscriptions, no new harness.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-coordinator%20or%20worker-blueviolet)](https://claude.com/claude-code)
[![Codex CLI](https://img.shields.io/badge/Codex%20CLI-coordinator%20or%20worker-black)](https://github.com/openai/codex)
[![T3 Code](https://img.shields.io/badge/T3%20Code-coordinator-orange)](https://t3.chat)

[Install](#install) · [How it works](#how-it-works) · [Shapes](#the-shapes) · [Review](#review) · [Usage](#usage) · [Docs](skills/delegate-kit/)

</div>

---

## What you get

You talk to one agent — the **coordinator**. It keeps the plan, the briefs, the integration and the answer. For every task it picks a *shape*: do it here, send one scout, plan first, one worker, two or three in parallel, or a sequence. Workers are fresh sessions that read the repository themselves. When the change is non-trivial, a reviewer that did not write it reads the frozen diff — on the other model family when that CLI is there, on a fresh session of the same family when it is not, and the report says which.

| Without delegate-kit | With delegate-kit |
|---|---|
| Delegation on a whim: a one-line fix spawns a 50k-token worker; a ten-module change starts with no plan. | **Shape first.** ≤ ~3 files → done here. Prose requirements or > 1 module → a planner before any code. Numbers, not moods. |
| Three workers on one coupled feature come back as merge conflicts and two designs. | **Worker count = independent outcomes.** Coupled edits stay in one pair of hands; parallel needs disjoint write scopes. |
| Codex reviews Codex. Claude reviews Claude. Same blind spots twice. | **Independent review.** The other family when available; otherwise a fresh session, reported as such. No preset moves it. |
| Workers write into your working tree. Two of them collide. | **Writers live in worktrees**, one per worktree, locked. You merge what you accept. |
| A worker from the other vendor is pretended to be a subagent, then lost when the parent stops looking. | **Native inside the family, external across it** — named as such. External workers are launched once, collected once, and can report back through a hook. |
| One subscription runs out and the work stops. | **Presets.** `main-claude` / `main-codex` move the heavy roles; the reviewer follows the author; on a rate limit the other vendor picks up once, and says so. |
| The worker says "done". Was anything checked? | **One JSON contract.** `status`, `changes`, `checks_run`, `not_verified`, `findings`, `questions`. A check that did not run is reported as not run. |

## How it works

```
you ──► coordinator (Claude Code / T3 / Codex)   "change the tariff logic in the billing module"
              │
              │  shape: DIRECT? done here.  PLAN / SINGLE / PARALLEL / SEQUENTIAL? →
              │  spec → .scratch/tariffs/spec.md
              ▼
        planner ─────────────► native, strongest model, read-only ─────► plan + blocking questions
              │
        agent-wt create tariffs        (git worktree + write-lock)
              │
        implementer ─────────► native subagent or external CLI, sandboxed ─► commits on dk/tariffs
              │
        agent-wt diff tariffs          (the frozen diff)
        agent-run route --role reviewer --diff   → single | panel | led, family, cost
              │
        reviewer(s) ─────────► the OTHER family if its CLI is installed,
              │                otherwise a fresh session of the same family (reported) ─► findings
              │
              │  mechanical → coordinator fixes.  real → same implementer, resumed.
              │  dispute → a command first, then a verifier.
              ▼
        merge / PR · agent-wt remove tariffs · report: done, checked, not checked, open, who reviewed
```

Two kinds of worker, never confused:

- **Native** — a subagent of the host, same family as the coordinator. Steerable, visible, cheap. Claude Code / T3 use the `Agent` tool with the `dk-*` roles; Codex uses `spawn_agent`. [`references/hosts.md`](skills/delegate-kit/references/hosts.md).
- **External** — a headless `claude -p` / `codex exec` session of the other family, started by `agent-run`. Launched with a complete brief, collected once, resumed by id. This is the only way to get the other family, and the skill says so instead of pretending it is a subagent. [`references/external.md`](skills/delegate-kit/references/external.md).

## The shapes

| Shape | When | Who |
|---|---|---|
| **DIRECT** | ≤ ~3 files, clear requirements; explanations; micro-fixes; anything destructive or production-adjacent | the coordinator, in the foreground |
| **SCOUT** | the hard part is finding: a large repo, several plausible causes, docs to quote | one read-only worker, then decide again |
| **PLAN** | prose requirements, ambiguity, > 1 module or > ~10 files; any question that ends in a verdict | planner, read-only, strongest model |
| **SINGLE** | one vertical slice too big for DIRECT | one implementer in its own worktree |
| **PARALLEL** | 2–3 slices with disjoint write scopes and stable interfaces | one implementer per slice, each in a worktree |
| **SEQUENTIAL** | one result changes the next task's assumptions (schema → API → UI) | one worker at a time, resumed |

Limits: 2 writers, 4 workers at once, delegation depth 1. Repository size changes the cost of *finding* context, not the number of writers.

## Review

The author of a non-trivial change does not certify it. The reviewer is a fresh, read-only worker that gets the frozen diff and the spec. Independence, in order of preference:

1. **The other family than the author.** `agent-run route` picks it whenever that CLI is installed. A Claude-written change gets a Codex reviewer, a Codex-written one a Claude reviewer, and a change the coordinator wrote itself goes to the other vendor too.
2. **A fresh session of the author's family.** What `route` returns when the other CLI is missing — marked `independent: false` — so the review still happens and the report names which kind ran.

Depth is measured from the diff, not from a feeling:

| Depth | Reviewers | When |
|---|---|---|
| `single` | one, slot A | the default — small diff, one module, no risk zone |
| `panel` | A + B, parallel and blind to each other | large diff, several modules, or a risk zone |
| `led` | a lead plans, three reviewers, the lead merges | very large or risky diffs |

Lenses: `spec`, `correctness`, `standards`. Slot A carries independence; slot B may sit on the author's family. A panel is **proposed with the numbers and run on your yes**. Rules, lenses and the smell baseline: [`references/review.md`](skills/delegate-kit/references/review.md).

## The roles

| Role | Does | Default model | Access |
|---|---|---|---|
| **planner** | ordered steps, files per step, risks, blocking questions, the checks that prove completion | Claude **Fable** high · Codex **Sol** xhigh | read-only |
| **implementer** | one vertical slice in its own worktree; runs the acceptance checks; commits on its branch | Codex **Sol** high · Claude **Opus** high for UI-heavy work | write, sandboxed, one per worktree |
| **reviewer** | reads the frozen diff against the spec; findings with severity, kind, lens, file:line, evidence, fix | the other family than the author when available | read-only |
| **review-lead** | plans a `led` review before, merges the findings after; two short calls | the planner's family, strongest | read-only |
| **verifier** | settles one disputed or high-risk finding that a command cannot | third party to the reviewer | read-only |
| **researcher** | quotes current documentation with URL and date; marks what it could not verify | Claude **Sonnet** medium · Codex **Terra** medium | read-only, web |

Presets `main-claude` / `main-codex` move planner, implementer and researcher; the reviewer follows the author. Reasoning per role: [`references/roles.md`](skills/delegate-kit/references/roles.md).

## Install

**Prerequisites:** the policy and native workers need nothing beyond the host. Workers from the other family need that CLI installed and logged in with your own account, plus bash, git, jq, node ≥ 20.

```bash
# 1. the skill
npx skills add tomastaker/delegate-kit
# or by hand:
git clone https://github.com/tomastaker/delegate-kit ~/dev/delegate-kit
ln -s ~/dev/delegate-kit/skills/delegate-kit ~/.agents/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.claude/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.codex/skills/delegate-kit

# 2. the native role definitions + the safety hook (backs up your settings, shows the diff first)
~/.agents/skills/delegate-kit/hooks/install.sh --dry-run
~/.agents/skills/delegate-kit/hooks/install.sh          # or --claude / --codex / --hooks-only / --agents-only

# 3. optional: scripts on PATH
echo 'export PATH="$HOME/.agents/skills/delegate-kit/scripts:$PATH"' >> ~/.zshrc
```

Restart running `claude` / `codex` sessions afterwards. The symlinks make the policy live: a `git pull` is the whole update; re-run `install.sh` after a change to the roles. To make the triage effectively always-on, add one line to your global instructions:

```text
Before repository work that spans modules or more than ~3 files, apply delegate-kit; a DIRECT verdict needs no announcement.
```

**Uninstall:** `hooks/uninstall.sh`, remove the three skill symlinks, and `rm -rf ~/.delegate-kit` if you do not want to keep the ledger, the preset and the run logs.

## Usage

Work as usual. The coordinator loads the skill when a task spans modules, needs a review, or you say "delegate", "scout", "plan this", "review this", "second opinion"; invoke it explicitly with `/delegate-kit` in Claude Code or `$delegate-kit` in Codex.

| You say | Effect |
|---|---|
| "delegate", "plan this", "review this", "subagent", "scout" | the skill triggers |
| "let Codex implement", "main model Claude", `main-claude` / `main-codex` | preset for this task — the heavy roles move, the reviewer follows the author |
| "plan with Fable", "review with Sol" | one model for one role; the preset is untouched |
| "panel", "two reviewers", "led" | your yes to a deeper review, given in advance |
| "this is mechanical" / "a refactor" / "UI work" | `--kind` — always `single` / lenses `correctness`+`standards` / implementer on Claude under `auto` |

**What it decides alone:** the shape; family, model, effort and native-vs-external per role; the reviewer's family (the other one when available); review depth from the diff; a command before a verifier; one cross-vendor retry on a rate limit.

**Where it stops and asks:** before a panel (with the numbers); when a worker returns `blocked` with questions; when your working tree is dirty and the task touches that work; before any command `gate.sh` classes as dangerous.

<details>
<summary><b>Driving the scripts by hand</b></summary>

```bash
agent-run route --role implementer --preset main-claude   # who runs this, where, how
agent-run route --role reviewer --diff review.diff         # how deep the review should go, on which family
agent-run preset main-claude                               # persist the preset; alone: show the effective table

agent-run run --role planner --brief .scratch/tariffs/brief.md
agent-wt create tariffs
agent-run run --role implementer --backend codex --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/impl.md
agent-wt diff tariffs > .scratch/tariffs/review.diff
agent-run run --role reviewer --backend claude --lens correctness --panel t1 --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/review.md
agent-run resume <implementer-id> --prompt "Fix findings 1 and 3 from the review: ..."
agent-run list | status <id> | wait <id> | kill <id> | log <id> | notify [<id>]
```

Two implementers in parallel: `--detach` on each, then `agent-run wait <id>` or `--on-finish CMD` so each reports for itself. A native writer: `agent-wt lock tariffs` before dispatch, `agent-wt release tariffs` after. `--help` on either script is the reference for flags.

</details>

## The tools

**`agent-run`** — routes, starts, resumes, waits for, lists and kills external workers, and delivers each completion to an `--on-finish` hook exactly once. Applies role defaults; read-only roles run `codex -s read-only` / `claude --permission-mode plan`, writers `workspace-write` / `acceptEdits`, never the dangerous modes. Falls the reviewer back to a fresh native worker when the other CLI is missing. Every run is archived under `~/.delegate-kit/runs/<id>/`; the ledger records model, effort, preset, lens, tokens, duration and outcome.

**`agent-wt`** — git worktrees next to the repo (`<repo>.worktrees/<name>`, branch `dk/<name>`): create, status, frozen diff, lock, release, remove, cleanup.

**`agents/dk-*.md` · `references/codex-agents.toml`** — the six roles as native subagent definitions, one set per harness.

**`hooks/gate.sh`** — a PreToolUse hook in both CLIs: `sudo`, `rm -rf`, service and firewall changes, certificates, destructive SQL, force-push, history-destroying git require your explicit confirmation.

## What it will not do

- **Steer an external worker mid-run.** Headless sessions run to completion; you read the result and resume with a follow-up. That is why the skill prefers native workers inside the family and never calls an external one a subagent.
- **Sandbox.** The gate is a list of known dangerous command shapes; the real isolation is the CLIs' own sandboxes plus the worktree.
- **Make delegation cheap.** A worker is a full session; the shapes exist so you pay that price only for independence, parallelism or a clean context.
- **Run a swarm.** Two writers, four workers. Larger fleets need an unusually clear partition and your explicit ask.
- **Mix the families.** `agent-run` rejects a model name from the family that does not match `--backend`.

Workers run through the official CLIs with the logins you already have — ordinary use of Claude Code and Codex. Do not wrap this into a product that routes other people's subscriptions.

## Layout

```
skills/delegate-kit/
  SKILL.md                      the policy the coordinator reads: shapes, brief, worktree, review, report
  references/hosts.md           native dispatch per host; git with parallel writers
  references/external.md        the other family through agent-run: preflight, collecting, presets, limits
  references/roles.md           families, tiers, reasoning per role, prompt hints, tuning
  references/review.md          review depth, lenses, panel composition, merge rules, smell baseline
  references/brief-template.md  how to write a brief
  references/result-schema.json the JSON contract
  references/codex-agents.toml  the six roles as native Codex subagents
  agents/dk-*.md                the six roles as native Claude Code subagents
  scripts/agent-run             route / preset / run / resume / list / status / wait / kill / log / notify
  scripts/agent-wt              create / list / status / diff / lock / release / remove / cleanup
  hooks/gate.sh, install.sh, uninstall.sh
  tests/delivery.sh             completion-delivery bench; --race N for the concurrency hammer
```

## License and acknowledgments

MIT. The review lenses `spec` and `standards` and the smell baseline are adapted from [mattpocock/skills — code-review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) (MIT). The host dispatch table and the git-coordination facts borrow from [Hyperskills](https://github.com/hyperb1iss/hyperskills); the one-worker-per-outcome rule from [Superpowers](https://github.com/obra/superpowers). README structure after [Best-README-Template](https://github.com/othneildrew/Best-README-Template).
