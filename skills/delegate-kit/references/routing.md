# Preset resolution and execution

The coordinator selects a profile semantically from the active catalog. Code validates exact executor settings and references; it never classifies tasks by keywords or model family.

`<dk>` below means `node <absolute installed skill>/scripts/dk.mjs`.

```
<dk> context open --session codex:CHAT_ID --preset X1
<dk> catalog --session codex:CHAT_ID
<dk> prepare --session codex:CHAT_ID --task feature-a --agent research-general --brief /abs/brief.md --cwd /abs/repository
<dk> run RUN_ID
<dk> overview --session codex:CHAT_ID --task feature-a
<dk> watch --session codex:CHAT_ID --task feature-a --after CURSOR --timeout-ms 60000 [--full]
<dk> wait RUN_ID --timeout-ms 60000
<dk> result RUN_ID
<dk> resume RUN_ID --brief /abs/follow-up.md
<dk> run NEW_ATTEMPT_ID
```

Use a reliable namespaced host chat ID. Without one, omit `--session` on context open once and preserve the generated handle. Cwd and transient shell PIDs do not identify a chat. Prepare and catalog require the retained handle.

Precedence: explicit preset, saved session choice, default for a new session, setup. Switching presets affects new dispatches. `prepare --preset Y2 --task-only` uses Y2 without changing the chat; pass the override to each preparation belonging to that task. `context open --preset Y2` persists it. Unknown explicit IDs do not fall back. Resume always uses the saved snapshot, including limits and executor session, even if the preset has since changed or been removed.

A role default is used only when `--agent` is omitted and `--role` is given. Missing defaults fail; they do not inherit the chat model. CLI profiles require an exact model. Legacy `inherit_model` presets remain readable but require explicit migration before dispatch.

## Limits and required review sets

Optional preset `limits` accepts positive `max_workers`, `max_writers`, `max_runs`, and nonnegative `max_retries`. No implicit worker count applies. `max_runs` counts reservations, including continuations, within a namespaced chat/task budget. `max_retries` counts continuations per profile in that task. Fresh runs and continuations are marked separately in metadata. Failed or cancelled reservations do not refund attempt limits. This conservative rule prevents a crash from granting an uncounted model call.

Prepare/resume reserve concurrency before dispatch, including read-only agents. Release unused reservations with `cancel`. Global counts include runtime reservations and owned worktrees; executor capacity also applies. Explicit CLI/environment limits follow precedence (call > environment > preset); do not raise them without user authorization. Status/wait/result do not consume attempts.

`review.also_run` recursively expands a required set. The source profile and all referenced profiles must be read-only reviewers; references must be unique and acyclic. This is reviewer-set composition, never an implementer-to-reviewer dependency. Prepare validates all routes and reserves the whole set or refuses it before dispatch. Run each returned ID independently. `task accept` requires valid done results from the mandatory reviewer set bound to the current checkpoint, as well as the task checks.

## Lifecycle and recovery

States: prepared, starting, running, permission, cancelling, orphaned, finished, blocked, failed, cancelled, timeout. Finished means a terminal turn with a valid role-specific result; only task acceptance records verified completion. Provider errors or invalid JSON fail even with exit code zero. Full logs stay in the private run folder, separate from the compact result.

A timeout of `wait` returns `wait_timed_out: true` with current state and leaves the worker alive. An optional `prepare --timeout-ms N` is a process deadline; there is no automatic idle kill. Repeated `run` on an already dispatched reservation refuses a duplicate. Unfinished host runs from an earlier installation follow the legacy migration instructions.

Each CLI supervisor writes a local heartbeat every five seconds. Status checks verify process identity; a missing supervisor becomes orphaned, and a heartbeat older than 30 seconds requests diagnosis even if the PID still exists. Five minutes without output/progress also sets `health.attention_required`; adjust that diagnostic interval per run with `prepare --stall-ms N` for known long operations. This threshold requests investigation; it does not kill a process or release its lease.

`watch` aggregates the latest attempt in each continuation lineage for one session/task. Its default result is compact and includes display icons, counts and only the agent fields needed for routine reporting; `--full` returns the diagnostic overview. It returns on a meaningful lifecycle, health, confirmed-model or acceptance change, and otherwise times out with an unchanged snapshot. `wait` returns early for required attention on one run. On an ordinary timeout, inspect returned health and the current host/process state before another bounded wait. On a no-progress alert, inspect bounded logs and the current operation; either document why more time is warranted or interrupt/recover a confirmed stall. Repeating an unchanged wait indefinitely is not a recovery strategy. Status polling, `overview`, `watch` and heartbeat files perform no model calls. The coordinator must remain active to report status and decide recovery; an exited parent chat cannot be awakened by this local library.

Old host dispatches can only be completed or cancelled through [legacy reconciliation](hosts.md#unfinished-runs-from-an-earlier-installation).

`cancel` preserves work and retains ownership until the process group stops. If a supervisor disappears, status becomes orphaned; inspect logs and run `cancel` or `recover` when process identity/termination is established. PID birth checks prevent signalling an unrelated reused PID. If the supervisor died while child registration was pending, ordinary recovery refuses to release ownership because the child PID is unknown. After explicit process inspection proves no worker started, use `recover ID --confirmed-not-started --evidence FILE`; the evidence is retained with the run. Uncertain live descendants retain the lease for manual diagnosis. A stale operation mutex is a visible diagnostic; confirm the owning operation stopped before removing it.

Local writers require a linked worktree and use the existing `delegate-kit.lock`. The runtime owns its lease; `agent-wt remove` refuses an owned worktree even with `--force`. Verification uses the same workspace lease while testing integrated code; unrelated worktrees remain available.

## Assignment and task acceptance

Evaluate four independent axes before selecting implementation: **determination** (remaining decisions), **risk** (changed invariants and failure consequences), **verifiability** (what detects an incorrect requested result), and **capabilities** (files, tools, network and environment). In the existing routing reason, name the wrong behavior the assigned check would detect. If none does, clarify verification or scope before assigning implementation; a more expensive model does not supply missing evidence. A path containing `auth` does not make a copy edit critical; a short transaction patch can change a critical invariant. Lint/typecheck alone cannot establish business behavior.

Optional profile `routing: {"tier":"economy"}` declares assignment constraints. `standard` and `hard` are also supported; omission imposes no economy-specific constraints. IDs and model names carry no special policy meaning. Use economy writers only when decisions are settled, scope is bounded, behavioral risk is low, meaningful checks exist and required capabilities are available. An explicit economy request still needs these conditions; explain a conflict instead of concealing it. After planning, reassess all four axes. Economy researchers can collect bounded facts without satisfying writer-specific checks. Critical work can go directly to a suitable configured profile. Without a suitable hard profile, use another configured capable profile or report a blocker; never change provider/model/account automatically.

For managed code work, open a contract, prepare linked work items, then use `task check` on the integrated result. Read [tasks.md](tasks.md) for the complete contract example, revision requirements, CLI sequence and evidence lifecycle.

Checkpoint review accepts only read-only reviewer profiles. Immutable snapshot identity covers the actual result, including relevant uncommitted/untracked content. Evidence belongs to that version: further edits, integration or cherry-picks require a new checkpoint and affected verification/review. Batch several small changes in one checkpoint when coverage remains clear. Final task acceptance uses the current merged result; individually finished runs are insufficient. Acceptance refusal must expose missing/stale evidence rather than turn an unchecked run into success.

`verify` executes a declared check through trusted runtime code and records its command, result and checkpoint. Model `checks_run` strings do not substitute for actual execution. `task check` reuses intact evidence for an unchanged checkpoint; pass `--rerun` when external dependencies or environment changed. For UI behavior, include a real browser scenario and visual inspection; the selected writer must have the tools and permissions to execute its checks before submitting done. OMP can expose Bash explicitly; Pi remains unsuitable for implementation requiring command checks. A green unrelated command does not establish the changed contract.

Use `task submit --revision REVISION --outcome failed --reason ...` for a semantic rejection, or classify transport/environment failures separately. After repeated semantic failures, inspect the cause and record the next decision with `task escalate --session SESSION --task TASK --work-item ITEM --agent PROFILE --reason TEXT`. The same profile may continue with a corrected approach; no default model-switch ladder applies. `reconsider` is advisory after two failures. Only an explicit `max_failed_submissions` or preset run/continuation limit blocks another otherwise eligible attempt. Uncertain/capability submissions remain blocked until the contract is revised or a decision is recorded, including a same-profile decision after fixing the environment.

Claims identify shared ports, mutable databases, caches or other exclusive resources. Worktrees isolate files, not these resources. Resolve collisions by distinct resources or serialize only the conflicting operation; preserve other independent parallel work. This is coordination under the documented tool/OS trust boundary, not a sandbox against arbitrary same-user processes.
