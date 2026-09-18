# CLI dispatch

Use `scripts/dk.mjs prepare` then `run` as described in [routing.md](routing.md). Only the configured harness is eligible; available unrelated CLIs are not fallbacks. The supervisor runs argv arrays without shell interpolation and keeps full logs out of the coordinator's default result.

Before the first executor/version combination, consult [providers.md](providers.md), its installed help, and the configured model picker. Check exact provider/model/reasoning. Keep credentials in that executor; installation alone does not authorize a model call. Cache the discovery evidence for the current version/configuration.

A writer requires a linked worktree created with `scripts/agent-wt create TASK`; prepare acquires its lease. Do not also acquire a manual native lock for this run. Pass an absolute `--cwd`. A read-only worker may use the source repository. Briefs should include relevant facts/files and authorized finishing actions, not the parent transcript. The runtime adds profile instructions and the result contract.

`run` returns promptly with a saved ID and detached supervisor. Use `wait` to collect the terminal result; the runtime polls without model calls. Parent wait timeout is not process death. Inspect the returned health before another bounded wait; attention requires diagnosis. [Lifecycle and recovery](routing.md#lifecycle-and-recovery) describes heartbeat checks and configurable no-progress alerts. The record retains requested settings, actual identity when evidenced, session ID, usage (null when unknown), result and diagnostics. The run result is validated; task acceptance separately checks the integrated result.

`resume OLD_ID --brief FILE` prepares a new attempt using the old snapshot and exact transport session. Run that returned ID. It refuses active sessions and never uses “last session”. Changed model/harness is a fresh explicitly selected profile, after stopping and inspecting any prior writer.

Tools are narrowed per adapter. Pi/OMP writers have read/edit/write tools but no shell, delegation or optional extension tools; the coordinator performs command checks and authorized commits. Restrictions are not a universal filesystem or secret sandbox. Unsupported permission controls stop dispatch instead of enabling bypass.
