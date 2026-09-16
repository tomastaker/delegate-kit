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
<dk> accept NEW_ATTEMPT_ID
```

Use a reliable namespaced host chat ID. Without one, omit `--session` on context open once and preserve the generated handle. Cwd and transient shell PIDs do not identify a chat. Prepare and catalog require the retained handle.

Precedence: explicit preset, saved session choice, default for a new session, setup. Switching presets affects new dispatches. `prepare --preset Y2 --task-only` uses Y2 without changing the chat; pass the override to each preparation belonging to that task. `context open --preset Y2` persists it. Unknown explicit IDs do not fall back. Resume always uses the saved snapshot, including limits and executor session, even if the preset has since changed or been removed.

A role default is used only when `--agent` is omitted and `--role` is given. Missing defaults fail; they do not inherit the chat model. `inherit_model: true` is supported only with explicit native transport and verified current-model evidence, and excludes model/provider fields. CLI defaults never mean chat inheritance.

## Limits and required review sets

Optional preset `limits` accepts positive `max_workers`, `max_writers`, `max_runs`, and nonnegative `max_retries`. No implicit worker count applies. `max_runs` counts reservations, including continuations, within a namespaced chat/task budget. `max_retries` counts continuations per profile in that task. Fresh runs and continuations are marked separately in metadata. Failed or cancelled reservations do not refund attempt limits. This conservative rule prevents a crash from granting an uncounted model call.

Prepare/resume reserve concurrency before dispatch, including native read-only agents. Release unused reservations with `cancel`. Global known worker counts include v1 external runs and native worktree locks; the host's own capacity also applies. Explicit CLI/environment limits follow the legacy precedence (call > environment > preset); do not raise them without user authorization. Status/wait/result do not consume attempts.

`review.also_run` recursively expands a required set. References must be unique, acyclic and read-only reviewers. Prepare validates all routes and reserves the whole set or refuses it before dispatch. Run each returned ID independently. `accept` requires a valid done result for every required profile in the group. It does not mean the runtime ran acceptance tests: the coordinator verifies evidence before calling it.

## Lifecycle and recovery

States: prepared, starting, running, permission, cancelling, orphaned, finished, blocked, failed, cancelled, timeout. Finished means a terminal turn with valid result; `accepted` records the separate coordinator decision. Provider errors or invalid JSON fail even with exit code zero. Full logs stay in the private run folder, separate from the compact result.

A timeout of `wait` returns `wait_timed_out: true` with current state and leaves the worker alive. An optional `prepare --timeout-ms N` is a process deadline; there is no automatic idle kill. Repeated `run` on an already dispatched reservation refuses a duplicate. Native dispatch with an unknown outcome must be reconciled at the host before attach or recovery.

Each CLI supervisor writes a local heartbeat every five seconds. Status checks verify process identity; a missing supervisor becomes orphaned, and a heartbeat older than 30 seconds requests diagnosis even if the PID still exists. Five minutes without output/progress also sets `health.attention_required`; adjust that diagnostic interval per run with `prepare --stall-ms N` for known long operations. This threshold requests investigation; it does not kill a process or release its lease. Host routes require a real status observation at least once per minute while waiting, and repeated unchanged observations do not reset the progress timer.

`watch` aggregates the latest attempt in each continuation lineage for one session/task. Its default result is compact and includes display icons, counts and only the agent fields needed for routine reporting; `--full` returns the diagnostic overview. It returns on a meaningful lifecycle, health, confirmed-model or acceptance change, and otherwise times out with an unchanged snapshot. `wait` returns early for required attention on one run. On an ordinary timeout, inspect returned health and the current host/process state before another bounded wait. On a no-progress alert, inspect bounded logs and the current operation; either document why more time is warranted or interrupt/recover a confirmed stall. Repeating an unchanged wait indefinitely is not a recovery strategy. Status polling, `overview`, `watch` and heartbeat files perform no model calls. The coordinator must remain active to perform host probes, report status and decide recovery; an exited parent chat cannot be awakened by this local library.

Native dispatch failures and late IDs are handled through [host reconciliation](hosts.md#dispatch-and-events); uncertain outcomes retain ownership. A confirmed not-started dispatch can release capacity without inventing an agent ID.

`cancel` preserves work and retains ownership until the process group stops. If a supervisor disappears, status becomes orphaned; inspect logs and run `cancel` or `recover` when process identity/termination is established. PID birth checks prevent signalling an unrelated reused PID. If the supervisor died while child registration was pending, ordinary recovery refuses to release ownership because the child PID is unknown. After explicit process inspection proves no worker started, use `recover ID --confirmed-not-started --evidence FILE`; the evidence is retained with the run. Uncertain live descendants retain the lease for manual diagnosis. A stale operation mutex is a visible diagnostic; confirm the owning operation stopped before removing it.

Local writers require a linked worktree and use the existing `delegate-kit.lock`. The v2 runtime owns its lease; `agent-wt release/remove` cannot clear an active v2 lease. A Paseo workspace has a daemon-scoped lease and remains owned by Paseo; local cleanup never removes it.

Legacy commands are documented in [migration.md](migration.md). Do not use `agent-run route` to resolve a v2 preset.
