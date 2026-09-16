---
name: delegate-kit
description: Coordinate repository work with a user-selected team preset, scoped specialists and independent review. Use when asked to use Delegate Kit, configure or copy a team, delegate substantial work, or obtain a second opinion. Small understood tasks can stay in the current chat.
license: MIT
---

# Delegate Kit

The current chat remains the coordinator. A preset assigns helpers and describes when to use them; it never selects or changes the chat model. Apply the same coordination policy with every model and host. Managed delegation depth is one.

## Establish the team

For `start`, first setup, creating/copying/editing a preset or targeted help, read [setup.md](references/setup.md). Conversation is the user interface: offer the bundled `main` example for first setup, gather the missing choices, show the proposed team/change, then save within the user's authorization. A valid saved preset does not require another interview.

Find `scripts/dk.mjs` relative to this installed skill; invoke it with Node. `delegate-kit Y2` is a skill request, not a promised global shell command. For runtime commands and precedence, read [routing.md](references/routing.md).

Open a context using a reliable namespaced host chat ID, or retain the generated session handle. Explicit preset wins, then the saved chat selection, then the default for a new chat. An explicit selection persists in this chat; “only this task” uses `--task-only` on its prepare calls. Unknown IDs fail visibly. Preserve session/run handles across compaction and handoff. Never infer a team from the coordinator's family, cwd or another chat. Without configuration, offer setup before delegating; a trivial direct task can proceed.

Read only the active catalog. Honor an explicit profile; otherwise choose by the meaning of its `when`, then an applicable role default. Consider direct work or missing configuration when no profile fits. Additional researchers, UI specialists and reviewers are ordinary named profiles in the same preset. Descriptions guide judgment; keywords, diff size, model rankings and price algorithms do not select profiles.

## Choose useful work

Clarify the requested result, constraints and acceptance checks. Consider substantial independent outcomes and useful specialists explicitly. Choose direct work, one worker, parallel independent outcomes or dependent steps. A separate planner is useful for consequential uncertainty; it is optional. State the shape briefly for substantial work.

Parallel writers need disjoint ownership and stable interfaces. Coupled changes have one owner or proceed sequentially. Choose worker count from ready outcomes and integration capacity; there is no default cap of one. Honor explicit user and host limits. Do independent work while workers run; avoid duplicating their investigation.

## Prepare and dispatch

Use [brief-template.md](references/brief-template.md): outcome, necessary facts, scope, workspace, constraints, checks and authorized finishing actions. Workers should begin from the brief and repository without the parent's full conversation. `when` and coordination instructions belong to you; profile `instructions` and the brief go to the worker.

For CLI execution read [external.md](references/external.md); for native or Paseo bridges read [hosts.md](references/hosts.md). Check [providers.md](references/providers.md) when choosing a new executor/version or after a capability error. Installed binaries do not establish authorization. Preserve harness, provider, model, reasoning and access exactly, or surface a specific refusal. A CLI running a similar model is not permission to replace the harness.

Prepare with the saved session, stable task ID, selected profile and brief. The runtime snapshots configuration, reserves limits and returns run IDs. An `also_run` review set is reserved together: dispatch every returned run with fresh independent context. Each local writer needs a linked Git worktree; `agent-wt create` supplies it and prepare acquires ownership. Paseo workspaces remain owned by Paseo. Preserve relevant uncommitted work before branching.

`run` starts a CLI supervisor or returns the verified native/Paseo invocation. A bridge invocation is preparation, not an agent: call the actual host tool once and attach its returned ID. If dispatch outcome is uncertain, reconcile with the host before another call. Record correlated completion/permission events. Unique Claude native definitions must be discovered by that host; otherwise use CLI. Never rewrite a shared role when switching presets.

## Await and verify results

Use host completion notifications or runtime `wait`. Read the compact result by default; full private logs are diagnostic artifacts. No log-summarizer model or periodic LLM heartbeat is needed. After each bounded wait, check runtime health or query the saved host agent without sending a prompt. A wait timeout does not stop the worker or authorize a duplicate. An attention alert requires diagnosis of process/turn progress; continue waiting only with a concrete reason, or stop/recover a confirmed stall. See [lifecycle and recovery](references/routing.md#lifecycle-and-recovery). Intervene for a blocker, permission request, user correction, explicit failure, breached limit or data risk.

Transport acknowledgement, terminal turn, valid result and coordinator acceptance are separate. Compare evidence against acceptance checks, run relevant checks the adapter could not perform, and accept only completed work. Explain unverified claims. Runtime `accept` refuses incomplete required review sets; it records your judgment, not proof that tests passed.

For a bounded omission, resume the saved run and launch that new attempt: the same exact executor session and snapshot remain. Changing profile/model/harness or seeking independent judgment requires a fresh session. Before replacing a writer, stop the previous one, inspect partial changes and transfer ownership. A failed attempt never triggers hidden model/provider fallback. Limits count reservations and continuations, not status/wait calls.

## Review, integrate and report

Use a fresh read-only configured reviewer for substantial delegated implementation and risky changes. Trivial direct actions do not require a review ceremony. Select coverage by actual contracts and failure modes; [review.md](references/review.md) explains lenses and reconciliation. Two reviewers receive the same frozen spec/diff and no initial findings from each other. Family diversity is optional and does not prove correctness.

Reproduce disputed findings with commands. Resume for a specific correction; use another configured specialist only for a substantive reason. Integrate and perform finishing actions within user authorization. Keep worktrees and logs until useful changes are preserved; cancellation never deletes partial work.

Report changed behavior, actual checks, remaining gaps, selected preset/profiles and transports. Distinguish requested model from runtime-confirmed identity, and fixture tests from live execution. On handoff retain session/run IDs, workspaces, task/remaining limits, spec and result pointers. For old configuration/runs read [migration.md](references/migration.md); new dispatch never uses family-selected v1 routing.
