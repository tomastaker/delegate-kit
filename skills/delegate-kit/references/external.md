# CLI dispatch

Use `scripts/dk.mjs prepare` then `run` as described in [routing.md](routing.md). Only the configured harness is eligible; available unrelated CLIs are not fallbacks. The supervisor runs argv arrays without shell interpolation and keeps full logs out of the coordinator's default result.

Before the first executor/version combination, consult [providers.md](providers.md), its installed help, and the configured model picker. Check exact provider/model/reasoning. Keep credentials in that executor; installation alone does not authorize a model call. Cache the discovery evidence for the current version/configuration.

A writer requires a linked worktree created with `scripts/agent-wt create TASK`; prepare acquires its lease. Do not also acquire a manual native lock for this run. Pass an absolute `--cwd`. A read-only worker may use the source repository. Briefs should include relevant facts/files and authorized finishing actions, not the parent transcript. The runtime adds profile instructions and the result contract.

`run` returns promptly with a saved ID and detached supervisor. Use `wait` to collect the terminal result; the runtime polls without model calls. Parent wait timeout is not process death. Inspect the returned health before another bounded wait; attention requires diagnosis. [Lifecycle and recovery](routing.md#lifecycle-and-recovery) describes heartbeat checks and configurable no-progress alerts. The record retains requested settings, actual identity when evidenced, session ID, usage (null when unknown), result and diagnostics. The run result is validated; task acceptance separately checks the integrated result.

`resume OLD_ID --brief FILE` prepares a new attempt using the old snapshot and exact transport session. Run that returned ID. It refuses active sessions and never uses “last session”. Changed model/harness is a fresh explicitly selected profile, after stopping and inspecting any prior writer.

Tools are narrowed per adapter. Pi remains without shell. OMP writers expose Bash only with explicit `executor.permissions.shell: true`; inherited OMP approval rules still apply. A managed Pi/OMP writer with assigned mandatory commands is refused at prepare when shell is unavailable. Use an already configured suitable profile or resolve access before implementation. Read-only profiles remain restricted.

## Explicit execution access

Optional `executor.permissions` is available only on explicit CLI writers. Existing saved presets are preserved:

- Codex accepts `{"network":true,"writable_roots":["/absolute/approved/cache"]}`. These configure the workspace sandbox for both fresh and resumed execution; no bypass mode is enabled. Network access includes local server/DB connections. Prefer a cache inside the worktree or an explicitly approved external cache.
- OMP accepts `{"shell":true}` to expose Bash. It preserves the user's tool approvals and command patterns; enabling the tool alone does not establish headless permission. Follow [OMP setup](omp-setup.md) before assigning command-dependent work. Project Playwright scripts can supply browser checks through Bash.
- Other CLI adapters keep their established access controls. An unsupported permissions object is refused instead of silently ignored.

Declare environment smoke checks with `before_edit: true` in the task contract. Codex CLI runs these through `codex sandbox` before any model prompt, using the same sandbox settings, cwd and inherited environment as execution. The probe must leave source unchanged and clean up its disposable processes. Failure blocks dispatch and retains logs. The sandbox CLI contract was checked locally at 0.154.0; an unsupported installed version fails visibly.

Other executors must run readiness checks as their first tool operations before editing. This is an explicit worker obligation, not a claimed automatic preflight guarantee. In particular, OMP's RPC `bash` bypasses tool approval and cannot attest worker permissions. A missing required capability yields `blocked`, with the exact command/tool and failure. Authorized setup commands may start local services, prepare test data and write caches within the agreed test environment. Verify actual capabilities, not merely the presence of binaries.

These tool controls are not a universal filesystem sandbox. They neither grant access to production data nor authorize stopping unrelated processes. See [task environment ownership](tasks.md#test-environment-ownership).

OMP keeps the installed LSP and PTY preferences; Delegate Kit no longer disables them. Extensions/skills remain excluded from scoped RPC workers to preserve the managed tool and delegation boundary. Compaction/advisor/model fallback remain disabled: installed OMP can invoke separately selected models during maintenance, which this adapter cannot yet attribute reliably. This is a specific executor limitation, not a requirement on the coordinator's own context management.
