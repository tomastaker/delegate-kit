<div align="center">

# Delegate Kit

**A small, universal policy that teaches capable coding agents when to work directly, when to delegate, and how to supervise the result.**

Policy, not another agent runtime.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Install](#install) · [Decision model](#decision-model) · [Examples](#examples) · [Design](#design)

</div>

---

## What it is

Delegate Kit is a single host-neutral skill for Claude Code, Codex, T3 Code, Orca, Pi, OpenCode, and other capable coding agents.

It does not launch a proprietary fleet, replace native subagents, or hard-code a preferred vendor. The model in the current session remains the coordinator and uses the best native tools available in its host.

The skill makes one decision consistent:

```text
Should I do this myself, ask one scout, delegate one coherent task,
parallelize a few independent tasks, or request an independent review?
```

That prevents common orchestration failures:

- spawning workers for tiny tasks;
- choosing a different worker count on identical work without a reason;
- parallelizing tasks that share files or unstable interfaces;
- filling the coordinator context with repository exploration;
- letting the author approve its own non-trivial change;
- creating a recursive tree of workers with unclear ownership.

## What changed

Delegate Kit was originally a larger Claude/Codex-specific package with routing presets, external CLI sessions, model-family rules, hooks, a run ledger, and a custom worktree runtime.

The current design intentionally removes that machinery from the active package. Modern harnesses already provide their own agent lifecycle, visibility, steering, worktrees, permissions, and model selection. Reimplementing those mechanisms made the skill less universal and harder for the coordinator to follow.

The previous implementation remains available in Git history. The current version focuses on the missing layer: **a compact decision policy for the frontier model that is already in control.**

## Decision model

Delegate Kit uses the smallest execution shape that creates a real advantage.

| Shape | Use it when |
|---|---|
| **DIRECT** | The task is localized, coherent, and the current session already has enough context. This is the default. |
| **SCOUT** | The main problem is finding or verifying information across a repository, documentation, or several plausible causes. Start with one read-only scout. |
| **SINGLE** | One well-specified deliverable is large enough to benefit from a fresh context or supervised ownership. |
| **PARALLEL** | There are 2-3 genuinely independent outcomes with non-overlapping mutable state and independent verification. |
| **SEQUENTIAL** | Tasks depend on earlier results, shared contracts, or shared files and therefore must not run in parallel. |
| **REVIEW** | A fresh, read-only context checks a non-trivial or risky change. One reviewer is the default. |

The central rule is:

> **Worker count equals the number of independent outcomes, not the apparent size of the task.**

Normal limits are three active workers, two concurrent writers, one scout, and one reviewer. Larger fleets require an unusually clear partition or an explicit user request.

## Why this scales

Repository size changes the cost of finding context, not automatically the number of writers.

A small change in a monorepo may need one scout and no delegated implementation. A large feature with shared contracts may still need one owner. Two modest changes in independent packages may be ideal for two parallel workers.

The coordinator evaluates:

- context already known versus context that must be discovered;
- independent deliverables versus coupled phases;
- overlapping files, interfaces, and external state;
- cost of a wrong result;
- checks that prove completion.

It then uses native agents or workers only where they provide isolated context, parallel progress, specialization, or independent review.

## What the coordinator owns

The current session remains responsible for:

- the user's intent;
- planning and decomposition;
- deciding task boundaries;
- writing worker briefs;
- supervising and steering;
- resolving questions and conflicts;
- reviewing and integrating results;
- final verification and the answer to the user.

Planning is not outsourced by default. A separate planning agent is a second opinion, not a replacement for the coordinator that holds the conversation.

## Worker briefs

Every worker receives a self-contained brief:

```text
Goal:
Scope and owned paths:
Relevant context and evidence:
Constraints and forbidden changes:
Acceptance criteria:
Checks to run:
Expected return:
```

Workers return status, result, evidence or files, checks run, unverified points, risks, and the recommended next step.

Concurrent writers should use isolated worktrees or branches when the host supports them. Workers do not spawn more workers unless the coordinator explicitly permits it.

## Independent review

The author of a non-trivial change does not certify its own work.

Independence primarily means a fresh read-only context with the exact requirements and diff. A different model or provider is useful as an explicit second opinion, but it is not mandatory and is not hard-coded into the skill.

Use one reviewer by default. Add a second only for high-risk work, distinct review lenses, competing evidence, or a direct user request.

## Optional model selection

When the host exposes model choice:

- use a fast capable model for bounded lookup or extraction;
- use a balanced model for clear implementation;
- use a strong model for multi-module integration or ambiguous debugging;
- use the strongest suitable model for architecture, security, concurrency, migrations, or high-risk review.

The cheapest model is not always the cheapest run: repeated turns and corrections can cost more than one reliable pass. Explicit user routing always wins.

## Examples

### Small fix

```text
“Correct this null check.”
→ DIRECT
```

### Unknown code location in a large monorepo

```text
“Find why the billing status is stale and fix it.”
→ one read-only SCOUT maps the data flow
→ coordinator chooses DIRECT or SINGLE after evidence returns
```

### Coupled full-stack change

```text
“Change the auth contract, API, and UI.”
→ coordinator plans dependencies
→ one owner or sequential phases while the contract is unstable
→ not three parallel writers by default
```

### Independent packages

```text
“Add the same adapter to package A and package B; their interfaces are stable.”
→ two PARALLEL workers with explicit ownership
→ coordinator integrates and runs broader checks
```

### Review

```text
“Implement this migration and verify it carefully.”
→ implementation
→ one fresh read-only reviewer
→ rerun affected checks after any fix
```

## Install

```bash
npx skills add tomastaker/delegate-kit
```

Or copy/symlink `skills/delegate-kit` into the skill directory used by your coding agent.

No custom daemon, hook, shell runtime, Node.js dependency, or second provider account is required.

To make the policy effectively always-on, add a short line to the global instructions of the host:

```text
Before non-trivial repository work, apply Delegate Kit.
If it selects DIRECT, continue without announcing the classification.
```

The full skill remains small enough to load routinely, and tiny tasks exit through DIRECT without orchestration ceremony.

## Design

Delegate Kit deliberately separates **policy** from **runtime**:

```text
Delegate Kit
  decides the work shape and ownership
        ↓
the current host
  launches, observes, steers, isolates, and stops workers
```

This keeps the skill portable as native agent systems evolve.

The design draws on useful practices from:

- [Superpowers](https://github.com/obra/superpowers): one agent per independent problem domain, fresh context, explicit briefs, and independent review;
- [Orca](https://github.com/stablyai/orca): clear coordinator/worker ownership, supervised lifecycle, task dependencies, and worktree-aware execution;
- [Hyperskills](https://github.com/hyperb1iss/hyperskills): matching orchestration strategy to work shape and separating parallel from sequential pipelines.

Delegate Kit intentionally does **not** adopt large default swarms. For normal software development, a small number of well-bounded workers is more predictable, easier to supervise, and less likely to duplicate work.

## License

MIT.
