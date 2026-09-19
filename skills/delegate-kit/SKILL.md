---
name: delegate-kit
description: Coordinate repository work with a user-selected team preset, scoped specialists and independent review. Use when asked to use Delegate Kit, configure or copy a team, delegate substantial work, or obtain a second opinion. Small understood tasks can stay in the current chat.
license: MIT
---

# Delegate Kit

The current chat chooses assignments and judges results. Delegate Kit owns CLI/RPC execution, saved state and verification. The team preset configures helpers without changing the chat model. Managed workers do not delegate further.

## Select the team

For first setup or preset changes, read [setup.md](references/setup.md). Otherwise reuse the saved selection. Invoke `scripts/dk.mjs` with Node by its absolute installed path. Open a context with a reliable host chat ID, or retain the generated session handle. Explicit preset selection wins over the chat selection and saved default.

Read the catalog. Honor an explicitly requested profile; otherwise choose by `when` or a suitable role default. Profile names and model families do not determine competence. If no profile fits, work directly or identify the missing capability. Research and a separate planner are optional.

Choose useful independent outcomes. Writers need disjoint ownership, coordinated shared resources and integrated dependencies. Economy implementation needs a determined, ordinary-risk task, meaningful behavioral checks and independent review; name the wrong behavior those checks detect in the routing reason. For selection, explicit limits and recovery, read [routing.md](references/routing.md).

## Execute

For managed implementation, read [tasks.md](references/tasks.md). Open one contract with the specification, work ownership, profiles and checks; runtime fills mechanical fields. Assign writers linked worktrees. Before editing, establish required shell/browser/DB/cache access. A bug fix needs a reproduction or concrete causal evidence. Missing capabilities or unresolved causes remain explicit blockers. Standalone read-only research needs only a [brief](references/brief-template.md).

Read [execution](references/external.md) for CLI dispatch and [executor contracts](references/providers.md) for a new executor/version or capability error. Preserve the selected model, provider, reasoning and permissions. Use [legacy migration](references/hosts.md) only for old native/Paseo presets or unfinished runs. Paid model tests need separate authorization.

`prepare` returns run IDs; `run` launches them. Run every member of a required reviewer set independently. Runtime supplies the task context and role-specific result schema; add only missing context in a brief. Keep run/session IDs across compaction and do independent work while agents run. Use compact `overview`/`watch` and [status reporting](references/observability.md) for meaningful updates.

Bounded `wait` observes completion without restarting work. A timeout leaves the worker alive. Inspect health and progress before interrupting or replacing a stalled executor. Stop the old writer before transferring ownership; cancellation preserves partial work. A targeted correction can `resume` the exact session; a different profile or independent judgment needs a fresh session.

## Verify and finish

Triage each result against its assignment, mandatory checks and adjacent interfaces. Return concrete omissions before full review. After repeated failures, reassess the cause and record the next decision with `task escalate --agent PROFILE --reason TEXT`; the same profile may continue. Explicit limits remain binding.

Integrate useful results, then run `task check`. It collects valid submissions, freezes review material and verifies the integrated code in its prepared environment. Worker claims are not runtime evidence. Unchanged checkpoints may reuse intact evidence; use `--rerun` after an environment change.

Prepare fresh read-only reviewers with `--checkpoint current`. Substantial final code, including coordinator edits, requires independent review. Follow [review reconciliation](references/review.md): investigate disputed findings with concrete evidence; actual fixes need a new checkpoint and fresh verification/review.

`task accept` is the sole acceptance gate. Missing evidence stays unverified unless the user explicitly authorizes a visible exception. Report changed behavior, actual checks, gaps and selected executors; distinguish configured model identity from runtime confirmation and fixtures from live runs. Perform finishing actions within authorization and preserve worktrees/logs until useful work is safe.
