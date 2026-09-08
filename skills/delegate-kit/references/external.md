# External workers

An external worker is a CLI process launched once from a complete brief. It may belong to the same family as the coordinator. Native versus external describes transport, not model lineage.

Resolve the active coordinator profile and role level per `routing.md`. Read the relevant adapter in `providers.md` before first use. Confirm the CLI and configured model are available; `doctor` only detects executable presence. Model names, authentication and reasoning capabilities come from the host/provider. Do not read credential values into prompts or reports.

```
agent-run run --role implementer --backend codex --cwd ../repo.worktrees/task --brief brief.md --detach
agent-run status RUN_ID
agent-run wait RUN_ID
agent-run resume RUN_ID --brief fixes.md
```

The route returns external arguments as an array. Pass them as arguments; do not interpolate untrusted model identifiers into shell strings.

A blocking shell call may yield a live process ID before completion. Continue collecting that process; do not repeat run, which starts another worker. With nothing independent to do, use blocking run; with ongoing coordinator work, use --detach and status or an authorized --on-finish command. Delivery hooks are external actions and need the user's applicable authorization.

## Results and lifecycle

The adapter extracts the final object and validates the canonical schema, including nested findings. Missing/malformed output fails even if the CLI exits zero. The report retains requested model, source of selection, actual model when available, session ID and check results. CLI configuration may be mutable; an unconfirmed model is never presented as verified.

Resume uses the saved adapter, family, model and effort. It never changes model automatically or resumes an unrelated latest session. If the CLI did not provide a session ID, start a fresh worker with the prior summary, worktree state and findings. A CLI-default model remains dependent on CLI configuration across resume; pin a known model for reproducibility.

Timeout/orphaned workers may leave commits or uncommitted files. Run `agent-run inspect WORKTREE` before a replacement. Quota failures do not trigger hidden retries on another provider. Choose an authorized replacement explicitly and include the prior state.

## Isolation and limits

Every writer has one worktree and one lock. `agent-run --cwd` locks it automatically and refuses a native writer's lock. Native dispatch requires `agent-wt lock`. Writers commit only their own files; integration and push belong to the coordinator.

Read-only capability depends on the adapter. Some omit shell tools completely; the coordinator performs acceptance commands in its own authorized environment. See providers.md for the exact boundary. A worktree is write coordination, not a security sandbox.

Concurrency is bounded by explicit user limits and actual host capacity. The run counts external processes machine-wide plus native writer locks in its repository. Concurrent starts reserve slots under a mutex. Supply one --task ID and --ticket ID across related attempts; run/resume records each start in the task counter. Mark repairs with --retry. Limits and native accounting are defined in routing.md; a refusal before or during detached startup is reported.

Delegation depth is 1. Native definitions carry no delegation tool; external adapters disable it through host controls where available, and the brief forbids further delegation. Worker shell subprocesses carry DELEGATE_KIT_DEPTH, so nested agent-run calls fail.

Run metadata and ledger live under ~/.delegate-kit, overridable with DELEGATE_KIT_HOME. Native runs are not automatically in this ledger; record their actual dispatch in the coordinator's report. Do not treat an external-only ledger as a complete cost comparison.
