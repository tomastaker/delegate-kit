<div align="center">

# delegate-kit

**Your coding agent hands work to fresh workers — and the review always comes from the other model family.**

One skill for Claude Code, Codex CLI and T3 Code. Your logins, your subscriptions, no new harness.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-parent%20or%20worker-blueviolet)](https://claude.com/claude-code)
[![Codex CLI](https://img.shields.io/badge/Codex%20CLI-parent%20or%20worker-black)](https://github.com/openai/codex)
[![T3 Code](https://img.shields.io/badge/T3%20Code-parent-orange)](https://t3.chat)

[Install](#install) · [How it works](#how-it-works) · [Usage](#usage) · [The rules](#the-rules-that-do-the-work) · [Docs](skills/delegate-kit/)

</div>

---

## What you get

You talk to one agent. When a task is big enough, it plans with the strongest model, implements in an isolated git worktree, and gets the change **reviewed by a model from the other vendor** — then reports back with what was checked and what was not. Small tasks it just does. You decide which subscription pays with one word.

| Without delegate-kit | With delegate-kit |
|---|---|
| The agent delegates on a whim: a one-line fix spawns a 50k-token worker; a ten-module change starts with no plan. | **Triage first.** Up to ~3 files it does itself. Prose requirements or >1 module → a planner before any code. Signals, not moods. |
| Codex reviews Codex. Claude reviews Claude. Same blind spots twice. | **Independent review, always.** The reviewer is from the other model family than the author. No preset, no quota pressure moves that. |
| Workers write into your working tree. Two of them collide. | **Writers live in worktrees**, one per worktree, locked. Your tree stays yours; you merge what you accept. |
| Every worker is a full headless CLI session, even one the agent could have spawned itself. | **Native inside the family, external across it.** A Claude parent spawns Claude workers natively; only the Codex reviewer is a separate session — the cheapest shape there is. |
| One subscription runs out and the work stops. | **Presets.** `main-claude` or `main-codex` moves the heavy roles to the family with quota left; the reviewer stays independent; on a rate limit the other vendor picks up once, and says so. |
| "Review this" means one opinion, however big the diff. | **Review depth from the diff.** Small → one reviewer. Large or risky → a panel of lenses (spec / correctness / standards), proposed with numbers, run on your yes. |
| The worker says "done". Was anything checked? | **One JSON contract.** `status`, `changes`, `checks_run`, `not_verified`, `findings`, `questions`. A check that did not run is reported as not run. |

<details>
<summary><b>Table of contents</b></summary>

- [What you get](#what-you-get)
- [How it works](#how-it-works)
- [The rules that do the work](#the-rules-that-do-the-work)
  - [Independence is the first slot](#1-independence-is-the-first-slot)
  - [Native inside the family, external across it](#2-native-inside-the-family-external-across-it)
  - [Presets: which subscription pays](#3-presets-which-subscription-pays)
  - [Review depth: one reviewer or a panel of lenses](#4-review-depth-one-reviewer-or-a-panel-of-lenses)
- [The roles](#the-roles)
- [Install](#install)
- [Usage](#usage)
- [The tools](#the-tools)
- [What it will not do](#what-it-will-not-do)
- [Layout](#layout)
- [License and acknowledgments](#license-and-acknowledgments)

</details>

## How it works

```
you ──► parent (Claude Code / T3 / Codex)   "change the tariff logic in the billing module"
              │
              │  triage: small? → done here.  big / ambiguous / risky? → delegate
              │  spec → .scratch/tariffs/spec.md
              ▼
        planner ────────────────► strongest model, read-only ──────────► plan + blocking questions
              │
        agent-wt create tariffs   (git worktree + write-lock)
              │
        implementer ────────────► workhorse model, writes, sandboxed ──► commits on dk/tariffs
              │
        agent-wt diff tariffs     (the frozen diff)
        agent-run route --role reviewer --diff   → single | panel | led, with the numbers
              │
        reviewer(s) ────────────► THE OTHER FAMILY than the author ───► findings
              │
              │  mechanical finding → parent fixes.  real one → same implementer, resumed.
              │  dispute → a command first, then a verifier (third party).
              ▼
        merge / PR · agent-wt remove tariffs · report: done, checked, not checked, open
```

Every worker starts empty. It never sees your conversation; it gets a brief and reads the repository itself, then returns one JSON object. That is the whole interface — and it is why briefs matter more than models.

## The rules that do the work

### 1. Independence is the first slot

A review by the same family that wrote the code shares its blind spots. So the reviewer is **always** the other family than the author — a Codex-written change is reviewed by Claude, a Claude-written one by Codex, and a change the parent wrote itself goes to the other vendor too. A verifier, when one is needed, is a third party again. Nothing in the skill can flip this; it is the one property delegation is for.

### 2. Native inside the family, external across it

A parent can only spawn its own family natively:

| Worker family | parent = Claude Code / T3 | parent = Codex |
|---|---|---|
| Claude (`fable`, `opus`, `sonnet`, `haiku`) | **native** — `Agent` tool, `dk-<role>` | external — `agent-run run --backend claude` |
| GPT (`gpt-5.6-sol`, `-terra`, `-luna`) | external — `agent-run run --backend codex` | **native** — `spawn_agent`, `dk-<role>` |

Native is cheaper and steerable, so it is the default inside the family. External is what `agent-run` adds: an enforced read-only sandbox, the strict JSON schema, a ledger, a resumable run id, a timeout, detached parallel writers and the cross-vendor quota fallback — worth going external for even inside the family when one of those matters. `agent-run route --role <role>` answers all of it in one call. Reasoning: [`references/dispatch.md`](skills/delegate-kit/references/dispatch.md).

### 3. Presets: which subscription pays

| Preset | planner | implementer | researcher | reviewer / verifier |
|---|---|---|---|---|
| `auto` (default) | Claude | Codex | Claude | the other family than the author |
| `main-claude` | Claude | Claude | Claude | the other family than the author |
| `main-codex` | Codex | Codex | Codex | the other family than the author |

A preset moves the token-heavy roles. It never moves the reviewer — so `main-claude` implies a Codex reviewer and `main-codex` a Claude one. That is cheap: a review is one read-only pass over a frozen diff, a fraction of what the implementer spends.

Say it in words ("let Codex implement this", "main model Claude"), type it (`/delegate-kit main-claude`, `$delegate-kit main-codex`), or persist it (`agent-run preset main-claude`). Your own per-role defaults go in `~/.delegate-kit/config.json` — `"roles": { "planner": { "claude": ["fable", "xhigh"] } }` — so "always plan on xhigh" is one edit, and the repository's table stays the default for everyone else.

### 4. Review depth: one reviewer, or a panel of lenses

A second reviewer with the same brief finds the same things twice. What a second slot should buy is a second **lens**:

| Depth | Reviewers | When |
|---|---|---|
| `single` | one, the other family | the default — small diff, one module, no risk zone |
| `panel` | two lenses, parallel and blind to each other | ~400+ changed lines, 10+ files, 2+ modules, or a risk zone |
| `led` | a review lead plans → three lenses → the lead merges | ~1200+ lines, 25+ files, 3+ modules |

Lenses: `spec` (does it do what was asked), `correctness` (is it right), `standards` (the repo's conventions plus a fixed smell baseline). Slot A is the other family; slot B may be the author's family, because independence is already paid for. `agent-run route --role reviewer --diff review.diff` measures the frozen diff and prints the depth, the composition and the cost. A panel is **proposed with those numbers and run on your yes** — it is the one place the skill spends more than one session on one step. Rules, lenses and the baseline: [`references/review.md`](skills/delegate-kit/references/review.md).

## The roles

| Role | Does | Default | Access |
|---|---|---|---|
| **planner** | Ordered steps, files per step, risks, blocking vs non-blocking questions, the checks that prove completion | Claude **Fable** high · Codex **Sol** xhigh | read-only |
| **implementer** | One vertical slice in its own worktree; runs the acceptance checks; commits on its branch | Codex **Sol** high · Claude **Opus** high for UI-heavy work | write, sandboxed, one per worktree |
| **reviewer** | Reads the frozen diff against the spec; findings with severity, kind, lens, file:line, evidence, fix | **the other family than the author**, high effort | read-only |
| **review-lead** | On a large diff: plans the reviewers before, merges their findings after. Two short calls | the planner's family at its strongest | read-only |
| **verifier** | Settles one disputed or high-risk finding: confirmed / refuted / needs-human, with evidence | a third party to the reviewer, strongest tier | read-only |
| **researcher** | Quotes current documentation with URL and date; marks what it could not verify | Claude **Sonnet** medium · Codex **Terra** medium | read-only, web |

And the non-role that matters most: **the parent itself** — up to ~3 files, a clear spec, low risk, micro-fixes after review, explanations, diagnoses, and everything destructive or production-adjacent, in the foreground, with you watching.

Why these defaults: planning is one read-only call whose mistakes propagate everywhere, so it gets the strongest model. Within a family, raising *effort* moves review and planning quality more than raising the tier — which is also why the strongest Codex role is Sol at `xhigh` (the CLI offers Sol, Terra and Luna; there is no `pro` worker). A small model on a micro-task never pays back the ~50k-token start-up cost of a worker. Reasoning per role: [`references/roles.md`](skills/delegate-kit/references/roles.md).

## Install

**Prerequisites:** bash, git, jq, node ≥ 20; `claude` and/or `codex` installed and logged in with your own account.

```bash
# 1. the skill
npx skills add tomastaker/delegate-kit
# or by hand:
git clone https://github.com/tomastaker/delegate-kit ~/dev/delegate-kit
ln -s ~/dev/delegate-kit/skills/delegate-kit ~/.agents/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.claude/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.codex/skills/delegate-kit

# 2. the safety hook + the native role definitions (backs up your settings, shows the diff first)
~/.agents/skills/delegate-kit/hooks/install.sh --dry-run
~/.agents/skills/delegate-kit/hooks/install.sh          # or --claude / --codex / --hooks-only / --agents-only

# 3. optional: scripts on PATH
echo 'export PATH="$HOME/.agents/skills/delegate-kit/scripts:$PATH"' >> ~/.zshrc
```

Restart running `claude` / `codex` sessions afterwards.

The symlinks make the policy live: `SKILL.md`, the scripts and the references are read straight out of your clone, so a `git pull` is the whole update. The native role definitions are the exception — a harness discovers subagents only in `~/.claude/agents/` and `~/.codex/config.toml` — which is why `install.sh` exists: it symlinks the Claude ones and splices the Codex block between markers, replacing it on every re-run. After pulling a change to the roles, run it again.

**Uninstall:** `hooks/uninstall.sh` (removes the hook, the `dk-*` symlinks and the `[agents.dk-*]` block), remove the three skill symlinks, and `rm -rf ~/.delegate-kit` if you do not want to keep the ledger, the preset and the run logs.

## Usage

Work as usual. The parent loads the skill when a task spans modules, needs a review, or you say "delegate", "plan this", "review this"; invoke it explicitly with `/delegate-kit` in Claude Code or `$delegate-kit` in Codex.

**What you say and what it does:**

| You say | Effect |
|---|---|
| "delegate", "plan this", "review this", "subagent" | the skill triggers |
| "let Codex implement", "main model Claude", `main-claude` / `main-codex` | preset for this task — the heavy roles move, the reviewer stays independent |
| "plan with Fable", "review with Sol" | one model for one role; the preset is untouched |
| "panel", "two reviewers", "led" | your yes to a deeper review, given in advance |
| "this is mechanical" / "a refactor" / "UI work" | `--kind` — always `single` / lenses `correctness`+`standards` / implementer on Claude under `auto` |

**What it decides alone:** whether to delegate at all; the family, model, effort and native-vs-external per role; the reviewer's family (always the other one); review depth from the diff; a command before a verifier; one cross-vendor retry on a rate limit.

**Where it stops and asks:** before a panel (with the numbers); when a worker returns `blocked` with questions; when your working tree is dirty and the task touches that work; before any command `gate.sh` classes as dangerous.

If you interview yourself first (a grill skill, a spec session), save the outcome as `.scratch/<task>/spec.md` and the workers are pointed at it instead of a retold version.

<details>
<summary><b>Driving the scripts by hand</b></summary>

```bash
agent-run route --role implementer --preset main-claude   # who runs this, where, how
agent-run route --role reviewer --diff review.diff         # how deep the review should go
agent-run preset main-claude                               # persist the preset; alone: show the effective table

agent-run run --role planner --brief .scratch/tariffs/brief.md
agent-wt create tariffs
agent-run run --role implementer --backend codex --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/impl.md
agent-wt diff tariffs > .scratch/tariffs/review.diff
agent-run run --role reviewer --backend claude --lens correctness --panel t1 --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/review.md
agent-run resume <implementer-id> --prompt "Fix findings 1 and 3 from the review: ..."
agent-run list | status <id> | wait <id> | kill <id> | log <id> | notify [<id>]
```

Two implementers in parallel: `--detach` on each, then either block on `agent-run wait <id>` or have each one report for itself with `--on-finish CMD` — the only channel an external worker has, since no harness announces it. A native writer: `agent-wt lock tariffs` before dispatch, `agent-wt release tariffs` after. `--help` on either script is the reference for flags.

</details>

## The tools

**`agent-run`** — routes, starts, resumes, waits for, lists and kills workers, and delivers each completion to an `--on-finish` hook exactly once, retried and surviving a dead supervisor. Applies role defaults; read-only roles run `codex -s read-only` / `claude --permission-mode plan`, writers `workspace-write` / `acceptEdits`, never the dangerous modes. Writers must be in a git worktree, one per worktree, at most 2 writers and 4 workers at once. Delegation depth is 1: a worker cannot start workers. Every run returns the JSON contract and is archived under `~/.delegate-kit/runs/<id>/`; the ledger `~/.delegate-kit/ledger.jsonl` records model, effort, preset, lens, tokens, duration and outcome per run.

**`agent-wt`** — git worktrees next to the repo (`<repo>.worktrees/<name>`, branch `dk/<name>`): create, status, frozen diff against the recorded base, lock (for a native writer), release, remove, cleanup of merged worktrees.

**`agents/dk-*.md` · `references/codex-agents.toml`** — the six roles as native subagent definitions, one set per harness, carrying model, effort and tool list.

**`hooks/gate.sh`** — a PreToolUse hook in both CLIs. `sudo`, `rm -rf`, service and firewall changes, certificates, destructive SQL, force-push, history-destroying git, destructive commands over SSH, disk operations — require your explicit confirmation. On Claude Code that is the normal approval prompt; Codex hooks cannot prompt, so the command is denied with an instruction to confirm with you and re-run prefixed `DELEGATE_KIT_CONFIRMED=1`.

## What it will not do

- **Steer an external worker mid-run.** Headless sessions run to completion; you read the result and resume with a follow-up. Native subagents can be steered — one more reason the skill prefers them inside the family.
- **Sandbox.** The gate is a list of known dangerous command shapes; the real isolation is the CLIs' own sandboxes plus the worktree. A native read-only role is read-only by instruction and tool list, not by sandbox — dispatch externally when that boundary matters.
- **Make delegation cheap.** A worker is a full session. The skill exists so you pay that price only when independence, parallelism or a clean context is worth it.
- **Record native dispatches in the ledger.** Only external runs are there; a model comparison has to be run externally on both sides.
- **Mix the families.** Claude is `fable | opus | sonnet | haiku`, Codex is `gpt-5.6-sol | gpt-5.6-terra | gpt-5.6-luna`; `agent-run` rejects a name from the family that does not match `--backend`. When vendors rename models, update the table at the top of `scripts/agent-run` and the two role-definition sets.

Workers run through the official CLIs with the logins you already have — ordinary use of Claude Code and Codex. Do not wrap this into a product that routes other people's subscriptions; that is what the vendors prohibit.

## Layout

```
skills/delegate-kit/
  SKILL.md                      the policy the parent reads
  agents/dk-*.md                the six roles as native Claude Code subagents
  references/codex-agents.toml  the six roles as native Codex subagents
  references/dispatch.md        native vs external, presets — the reasoning behind agent-run route
  references/roles.md           families, tiers, reasoning per role, prompt hints, tuning
  references/review.md          review depth, lenses, panel composition, merge rules, smell baseline
  references/brief-template.md  how to write a brief
  references/result-schema.json the JSON contract
  scripts/agent-run             route / preset / run / resume / list / status / wait / kill / log / notify
  scripts/agent-wt              create / list / status / diff / lock / release / remove / cleanup
  hooks/gate.sh                 PreToolUse safety gate (Claude Code + Codex)
  hooks/install.sh, uninstall.sh
  tests/delivery.sh             completion-delivery bench; --race N for the concurrency hammer
```

## License and acknowledgments

MIT. The review lenses `spec` and `standards` and the smell baseline are adapted from [mattpocock/skills — code-review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) (MIT), which keeps its two axes separate for the same reason this skill keeps reviewers blind to each other: one angle must not mask another. README structure after [Best-README-Template](https://github.com/othneildrew/Best-README-Template).
