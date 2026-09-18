---
name: delegate-kit
description: Coordinate repository work with a user-selected team preset, scoped specialists and independent review. Use when asked to use Delegate Kit, configure or copy a team, delegate substantial work, or obtain a second opinion. Small understood tasks can stay in the current chat.
license: MIT
---

# Delegate Kit

The current chat coordinates; a preset configures helpers without changing the chat model. Managed workers do not delegate further.

## Select the team and scope

For first setup or creating/editing/copying a preset, read [setup.md](references/setup.md). Reuse a valid saved selection. Invoke `scripts/dk.mjs` with Node using this installed skill's absolute path; there is no global `dk` command.

Open a context with the reliable host chat ID, or retain the generated session handle. Explicit preset selection wins over the saved chat selection and default. Read the active catalog, honor an explicit profile, otherwise select by its `when` description or an applicable role default. Profile names and model families do not imply competence. If no configured profile fits, work directly or report the missing configuration.

Choose useful independent outcomes, not a fixed number of workers. Writers need disjoint ownership and compatible shared resources; serialize conflicts and dependencies. A separate planner is optional. Assess unresolved decisions, behavioral risk, meaningful verification and available capabilities. Economy writers require a determined, ordinary-risk task with objective checks and independent review. For selection, limits or recovery details, read [routing.md](references/routing.md).

## Run the work

For managed implementation, read [tasks.md](references/tasks.md). Open one task contract containing the specification, ownership, selected profiles and checks. Runtime fills mechanical defaults and binds the specification automatically. Prepare each ready work item in its linked Git worktree; runtime acquires and releases writer ownership. Integrate useful results before checking the final task. For standalone read-only research, a short brief suffices without an implementation contract.

For CLI dispatch read [external.md](references/external.md); for native/Paseo read [hosts.md](references/hosts.md). Consult [providers.md](references/providers.md) for a new executor/version or capability error. Preserve the configured harness, provider, model, reasoning and access; surface unsupported combinations. Do not launch paid tests to discover authorization.

`prepare` returns run IDs; `run` launches CLI or returns a bridge invocation. Call the actual host tool once and attach its returned ID. Dispatch every member of a required reviewer set independently. An uncertain host dispatch must be reconciled before retrying. Keep saved session/run IDs across compaction.

The runtime supplies the task context and a compact role-specific result schema. Add a [brief](references/brief-template.md) only for context the contract lacks; do not repeat its fields or send the entire parent conversation. Do independent work while workers run.

For team status, use compact `overview` / `watch` and follow [observability.md](references/observability.md). Report actual launches and meaningful changes without repeating an unchanged roster.

## Check, review and finish

Observe completion with host notifications or bounded runtime `wait`. A wait timeout leaves the worker alive. Follow returned health diagnostics; inspect a stalled process/turn before interrupting or replacing it. Stop the prior writer before transferring ownership; cancellation preserves partial changes.

After integration, `task check` collects valid completed submissions, creates a frozen snapshot and runs required checks. It reuses evidence only for the same checkpoint; use `--rerun` after an environment change. Worker `checks_run` text is not runner evidence. Classify failed work with `task submit`; two semantic failures per item/profile require explicit escalation by default. Infrastructure failures do not count as semantic failures. A bounded correction can resume the exact saved executor; changing profile or seeking independent judgment needs a fresh session.

Prepare configured read-only reviewers against `--checkpoint current`. Substantial final code requires independent review; [review.md](references/review.md) covers reconciliation. Refute a false finding with an appropriate check or concrete frozen source evidence. A real fix needs a new snapshot and fresh review. `task accept` is the sole acceptance gate; missing evidence stays unverified unless the user explicitly authorizes a visible exception.

Report changed behavior, actual checks and gaps, selected profiles and transports. Distinguish configured from confirmed model identity and fixtures from live runs. Perform finishing actions within user authorization; keep worktrees and logs until useful work is preserved.
