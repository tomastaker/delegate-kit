<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
  <img src="assets/logo.png" alt="delegate-kit, the overseer" width="300">
</picture>

# delegate-kit

**Claude writes it. Codex reads it. Or the other way round.**<br>
One session, the subscriptions you already pay for, no API keys.

[![CI](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-coordinator%20%7C%20worker-e8590c)](https://claude.com/claude-code)
[![Codex CLI](https://img.shields.io/badge/Codex%20CLI-coordinator%20%7C%20worker-8250df)](https://github.com/openai/codex)
[![T3 Code](https://img.shields.io/badge/T3%20Code-coordinator-4a4a4a)](https://github.com/pingdotgg/t3code)

[The overseer](#the-overseer) · [Before / after](#before--after) · [Numbers](#numbers) · [How it works](#how-it-works) · [Install](#install) · [Commands](#commands) · [FAQ](#faq)

</div>

---

## The overseer

You know him. Linen kilt, whip on the hip, squinting at the plateau since before the first course of stone went down. Two gangs answer to him — one hauls for Anthropic, one for OpenAI — and he has run them long enough to hold two rules that never bend.

**No gang inspects its own stones.** The gang that set the block does not check the block. The other gang does, with the plans in hand, and the tally says who looked.

**You don't crack the whip for one brick.** Three files and a clear ask, he lays it himself. Ten modules and a page of prose, he draws the plan before anyone picks up a rope. Two jobs that don't share a wall, two gangs at once, each on its own stretch of the ramp.

delegate-kit puts him in your coding session. Your Claude Code or Codex CLI session becomes the coordinator: it keeps the intent, the plan and the answer. Workers are fresh sessions of either family, started once with a full brief, isolated in git worktrees, and reviewed by the family that did not write the code. The whole thing runs on the two CLIs you already have installed and logged in.

## Before / after

You type the same sentence either way:

> change the tariff logic in the billing module — the rules are in `docs/tariffs.md`

**Without him.** The model reads a bit, edits five files in your working tree, runs whatever tests it remembers, and says *done*. If it spawned helpers, two of them edited the same file. The only review is the author reading its own diff, which finds what it already thought of.

**With him.**

```
shape: PLAN — prose requirements, 2 modules, 11 files
spec  → .scratch/tariffs/spec.md               (you said yes to 6 lines)
plan  → planner, read-only, strongest model    (4 steps, 1 blocking question — asked)
build → implementer on Codex, worktree dk/tariffs, committed
review → Claude, other family, read-only       (2 findings: 1 spec, 1 correctness)
fix   → same implementer, resumed              (both closed, tests re-run)
tally → done · checked: pnpm test, tsc · not checked: prod migration · reviewed by Claude, single
```

Your tree was never touched. You merge the branch when you agree with the tally.

The other direction works the same: when Claude implements, Codex reads the diff. When you wrote the diff yourself in the session, he still sends it across the ramp — a change the coordinator made is `self`, never "independent by default".

## Numbers

**From the author's own ledger.** Every external worker is recorded in `~/.delegate-kit/ledger.jsonl`. This is the author's, 20 August to 1 September 2026: ten repositories including a production monorepo, every run counted, nothing excluded but the synthetic tests.

| | Codex reading Claude | Claude reading Codex | Together |
|---|---|---|---|
| Cross-family reviews of real diffs | 29 | 17 | **46** |
| … that came back with at least one **high**-severity finding | 12 | 5 | **17** |
| … that came back with nothing | 1 | 0 | 1 |
| Median findings per review | 4 | 6 | |
| Median wall-clock per review | 6 min | 9 min | |

Around it: 108 external workers in those twelve days, 39 finished implementer runs at a median of 13 minutes each, 6 planner runs at a median of 7.

The findings are what the reviewer returned, not what survived adjudication: the coordinator closes the mechanical ones, the implementer the substantive ones, disputes go to a command first. So the table says something narrower than "bugs prevented", and still worth the second session: on a real diff, the family that did not write it comes back with something serious about one time in three. `bench/ledger-stats.sh` prints the same table from your own ledger.

**Mechanics that hold under load.** The scripts are tested without any model calls, so the numbers are cheap to reproduce: `bash tests/<name>.sh` in `skills/delegate-kit/`.

| Suite | Checks | What it proves |
|---|---|---|
| `caps.sh` | 47 | writer cap, ceiling, flag and env precedence, native locks counted, refusal under `--detach` |
| `route.sh` | 52 | who runs which role; the reviewer is never the author's family when the other CLI exists |
| `gate.sh` | 27 | dangerous commands stop; a worker cannot start workers |
| `inspect.sh` | 13 | a crashed writer's commits and dirty files reach its replacement |
| `delivery.sh` | 25 | completion hooks fire exactly once; `--race 20` runs 20 rounds × 8 processes: 0 duplicates, 0 lost |

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/how-it-works-dark.svg">
  <img src="assets/how-it-works-light.svg" alt="shape → build in worktrees → the other family reviews → tally" width="100%">
</picture>

**1 · Shape.** Before anything else the coordinator names the shape of the task, from numbers, not mood:

| Shape | When | Who |
|---|---|---|
| **DIRECT** | ≤ ~3 files, clear requirements; explanations; micro-fixes; anything destructive or production-adjacent | the coordinator, in the foreground |
| **SCOUT** | the hard part is *finding*: a large repo, several plausible causes, docs to quote | one read-only worker, then decide again |
| **PLAN** | prose requirements, ambiguity, > 1 module or > ~10 files; any question that ends in a verdict | planner, read-only, strongest model |
| **SINGLE** | one vertical slice too big for DIRECT | one implementer in its own worktree |
| **PARALLEL** | 2+ slices with disjoint write scopes and stable interfaces | one implementer per slice, each in a worktree |
| **SEQUENTIAL** | one result changes the next task's assumptions (schema → API → UI) | one worker at a time, resumed |

Worker count equals the number of independent outcomes. Coupled edits stay in one pair of hands; split, they come back as merge conflicts and two designs.

**2 · Build.** Every writer gets a git worktree with a lock. Native workers (a subagent of your host, same family, steerable) and external workers (a headless `claude -p` / `codex exec` of the other family, launched once, collected once) are named as such and never confused. Three writers run at once by default; the ceiling is eight, and between the two he states the partition and waits for your yes.

**3 · Review.** The author of a non-trivial change does not certify it. Independence has an order of preference, not a hard requirement:

1. **The other family than the author**, whenever its CLI is installed.
2. **A fresh session of the author's family** when it is not — marked `independent: false`, and the tally says so.

Depth is measured from the diff, and anything beyond one reviewer is proposed with the numbers and run on your yes:

| Depth | Reviewers | When |
|---|---|---|
| `single` | one | small diff, one module, no risk zone — the default |
| `panel` | two, parallel and blind to each other | large diff, several modules, or a risk zone |
| `led` | a lead plans, three review, the lead merges | very large or risky |

Findings go back to whoever can close them: mechanical ones the coordinator fixes, substantive ones return to the same implementer, resumed with its context. A dispute is settled by a command first — a test, a typecheck, a grep — and only then by a verifier.

**4 · Tally.** Every worker returns one JSON object: `status`, `changes`, `checks_run`, `not_verified`, `findings`, `questions`. The coordinator's report is built from it: done, checked, not checked, open, which family reviewed at which depth. A check that did not run is reported as not run. A worker's "done" is evidence to inspect, not a verdict.

**Limits he keeps.** Writer cap 3, ceiling 8, total workers = writers + 3, delegation depth 1 — a worker never starts workers, and the safety hook denies it if one tries. When a subscription hits its limit mid-run, the writer is retried once on the other family with a note about the commits the first one left; it continues, it does not start over.

## Install

**Prerequisites.** The policy and native workers need only your host. Workers from the other family need that family's CLI installed and logged in, plus `bash`, `git`, `jq`, `node ≥ 20`.

```bash
npx skills add tomastaker/delegate-kit
```

or by hand:

```bash
git clone https://github.com/tomastaker/delegate-kit ~/dev/delegate-kit
ln -s ~/dev/delegate-kit/skills/delegate-kit ~/.agents/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.claude/skills/delegate-kit     # Claude Code
ln -s ../../.agents/skills/delegate-kit ~/.codex/skills/delegate-kit      # Codex CLI
```

Then the native role definitions and the safety hook. The installer backs up your settings and shows the diff first:

```bash
~/.agents/skills/delegate-kit/hooks/install.sh --dry-run
~/.agents/skills/delegate-kit/hooks/install.sh          # --claude / --codex / --hooks-only / --agents-only
```

Optional, for driving the scripts yourself:

```bash
echo 'export PATH="$HOME/.agents/skills/delegate-kit/scripts:$PATH"' >> ~/.zshrc
```

Restart running `claude` / `codex` sessions. The symlinks keep it live: `git pull` is the update; re-run `install.sh` after a change to the roles.

**Hosts.** Claude Code and Codex CLI act as coordinator and as worker. [T3 Code](https://github.com/pingdotgg/t3code) acts as coordinator over either CLI; its workers are the same two families.

**Always on.** The skill triggers on its own words (see [Talking to him](#talking-to-him)). To have it triage every non-trivial task, add one line to your global instructions:

```text
Before repository work described in prose or spanning several modules, apply delegate-kit; a DIRECT verdict needs no announcement.
```

**Uninstall.** `hooks/uninstall.sh`, remove the three symlinks, and `rm -rf ~/.delegate-kit` if you do not want to keep the ledger and run logs.

## Commands

Work as usual; he triggers on his own words. When you want to drive a step by hand, the two scripts are the whole surface. `--help` on either is the flag reference.

| Command | Does |
|---|---|
| `agent-run route --role <role> [--preset P]` | who runs this role, on which family, natively or externally |
| `agent-run route --role reviewer --diff FILE --author-backend claude\|codex\|self` | depth, lenses, family and cost of a review; `self` when you wrote the diff |
| `agent-run run --role <role> --brief FILE [--backend B] [--cwd WORKTREE] [--detach]` | start a worker; `--detach` for parallel writers |
| `agent-run resume <id> --prompt TEXT` | continue a worker with its context (fix findings, answer questions) |
| `agent-run list \| status <id> \| wait <id> \| kill <id> \| log <id>` | the ledger |
| `agent-run inspect [WORKTREE]` | what a stopped writer left: commits since base, dirty files |
| `agent-run preset [auto\|main-claude\|main-codex]` | which family carries the heavy roles; alone, shows the effective table |
| `agent-wt create \| diff \| lock \| release \| remove <task>` | a writer's worktree, its frozen diff, and the lock the cap counts |

A typical hand-driven pass:

```bash
agent-run run --role planner --brief .scratch/tariffs/brief.md
agent-wt create tariffs
agent-run run --role implementer --backend codex --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/impl.md
agent-wt diff tariffs > .scratch/tariffs/review.diff
agent-run route --role reviewer --diff .scratch/tariffs/review.diff --author-backend codex
agent-run run --role reviewer --backend claude --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/review.md
agent-run resume <implementer-id> --prompt "Fix findings 1 and 3: ..."
```

<details>
<summary><b>The roles</b></summary>

| Role | Does | Default | Access |
|---|---|---|---|
| **planner** | ordered steps, files per step, risks, blocking questions, the checks that prove completion | Claude Fable high · Codex Sol xhigh | read-only |
| **implementer** | one vertical slice in its own worktree; runs the acceptance checks; commits on its branch | Codex Sol high · Claude Opus high for UI | write, sandboxed |
| **reviewer** | reads the frozen diff against the spec; findings with severity, lens, file:line, evidence, fix | the other family than the author | read-only |
| **review-lead** | plans a `led` review before, merges findings after; two short calls | the planner's family, strongest | read-only |
| **verifier** | settles one disputed or high-risk finding that a command cannot | third party to the reviewer | read-only |
| **researcher** | quotes current docs with URL and date; marks what it could not verify | Claude Sonnet medium · Codex Terra medium | read-only, web |

Presets move planner, implementer and researcher; the reviewer follows the author. Reasoning per role: [`references/roles.md`](skills/delegate-kit/references/roles.md).

</details>

<details>
<summary><b>Layout</b></summary>

```
skills/delegate-kit/
  SKILL.md                      the policy: shape, spec, route, brief, worktree, review, report
  references/hosts.md           native dispatch per host; git with parallel writers
  references/external.md        the other family through agent-run: preflight, collecting, presets, limits
  references/roles.md           families, tiers, reasoning per role, prompt hints
  references/review.md          depth, lenses, panel composition, merge rules, smell baseline
  references/brief-template.md  how to write a brief
  references/result-schema.json the JSON contract
  references/codex-agents.toml  the six roles as native Codex subagents
  agents/dk-*.md                the six roles as native Claude Code subagents
  scripts/agent-run             route / preset / run / resume / list / status / wait / kill / log / notify / inspect
  scripts/agent-wt              create / list / status / diff / lock / release / remove / cleanup
  hooks/gate.sh, install.sh, uninstall.sh
  tests/*.sh                    caps, route, gate, inspect, delivery — synthetic, no model calls
bench/ledger-stats.sh           the Numbers table, from your own ledger
bench/seeded-review/            a small planted-defect harness for reviewer experiments (pilot results inside)
```

</details>

## Talking to him

| You say | He does |
|---|---|
| "delegate", "subagent", "scout", "plan this", "review this", "second opinion" | picks a shape and says which |
| a feature or refactor described in prose; "which should we adopt?" | PLAN |
| "let Codex implement", "main model Claude", `main-claude` / `main-codex` | moves the heavy roles to that family for this task; the reviewer still follows the author |
| "plan with Fable", "review with Sol" | one model for one role; the preset is untouched |
| "panel", "two reviewers", "led" | your yes to a deeper review, given in advance |
| "this is mechanical" / "a refactor" / "UI work" | `--kind`: always `single` / lenses `correctness`+`standards` / implementer on Claude under `auto` |

**Decides alone:** the shape; family, model, effort and native-vs-external per role; the reviewer; review depth from the diff; a command before a verifier; one cross-vendor retry on a rate limit.

**Stops and asks:** before a panel (with the numbers); before a fourth writer (with the partition); when a worker returns `blocked` with questions; when your working tree is dirty and the task touches it; before any command the safety gate classes as dangerous.

If you interview yourself first (a grill skill, a spec session), save the outcome as `.scratch/<task>/spec.md`. Workers and the reviewer read that file, not a retelling.

## What he won't do

- **Steer an external worker mid-run.** Headless sessions run to completion; you read the result and resume. That is why native is preferred inside the family, and why an external worker is never called a subagent.
- **Run a swarm.** Writer cap 3, ceiling 8, and the ceiling holds against every flag. Between the two it takes a stated partition and your yes.
- **Make delegation cheap.** A worker is a full session. The shapes exist so you pay for one only for independence, parallelism or a clean context.
- **Sandbox by himself.** The gate is a list of dangerous command shapes; the real isolation is the CLIs' own sandboxes plus the worktree.
- **Route other people's subscriptions.** Workers run through the official CLIs with the logins you already have — ordinary use of Claude Code and Codex. Do not wrap this into a product that does otherwise.

## FAQ

**I only have one of the two subscriptions. Is this for me?**
Less so. You still get the shapes, the worktrees, the caps and the report, and review falls back to a fresh session of your own family, honestly labelled. But the reason to install this over a good single-family workflow such as [Superpowers](https://github.com/obra/superpowers) is the second family. Without it, Superpowers is the more mature choice.

**How is this different from Claude Code agent teams?**
Agent teams are Claude talking to Claude: teammates share a task list and message each other. delegate-kit is about the *other* family reading your diff, about one writer per worktree, and about a report that names what was not checked. They are not exclusive; the overseer does not care how a native worker was spawned, only that it stayed on its own stretch of the ramp.

**Why not an API key and a multi-model MCP server?**
Because you already pay for two CLIs with their own sandboxes, rate limits and logins. `claude -p` and `codex exec` are official, headless, and free with the subscription. The price is that an external worker cannot be steered mid-run, which the shapes are designed around.

**What does a worker cost?**
A full session: system prompt, project instructions, the files it reads. Tens of thousands of tokens before it does anything. That is why ≤ 3 files is DIRECT, why effort is raised before model tier, and why the reviewer gets a frozen diff instead of the whole repository.

**What if the other CLI is missing?**
`agent-run route` says so, picks a fresh session of the author's family, marks it `independent: false`, and the report repeats it. Nothing pretends.

**Can a worker start its own workers?**
No. Delegation depth is one. The safety hook denies `agent-run run` and `agent-wt lock` when the caller is a subagent.

**Does it work in T3 Code?**
As coordinator, yes: T3 Code drives Claude Code or Codex, and the skill runs in that session. Workers are still the two CLIs.

**Is it safe to let it run commands?**
The hook (`hooks/gate.sh`) stops the dangerous shapes — deletes, force pushes, secrets, production hosts — and asks you. Writers are confined to a worktree and to the CLI's own sandbox. The gate is a list, not a sandbox; read it before you trust it.

## License and acknowledgments

MIT. The review lenses `spec` and `standards` and the smell baseline are adapted from [mattpocock/skills — code-review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) (MIT). The host dispatch table and git-coordination facts borrow from [Hyperskills](https://github.com/hyperb1iss/hyperskills); one worker per independent outcome from [Superpowers](https://github.com/obra/superpowers). The README voice owes a debt to [ponytail](https://github.com/DietrichGebert/ponytail).
