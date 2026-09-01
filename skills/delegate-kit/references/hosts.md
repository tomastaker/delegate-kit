# Hosts: how a native worker is dispatched

A native worker is a subagent of the host, in the coordinator's own family. The policy is the same everywhere; the fan-out verb differs. A worker from the other family is never native — `external.md`.

| Host | Native fan-out | Role definition | Isolation for a writer | Completion |
|---|---|---|---|---|
| Claude Code, T3 Code | `Agent` tool, `subagent_type: dk-<role>`; several in one message run in parallel; `run_in_background` for long ones | `~/.claude/agents/dk-*.md` (symlinked by `hooks/install.sh`) | `agent-wt create` + `agent-wt lock`, path in the brief; or the tool's own `isolation: worktree` when the branch does not need `agent-wt diff` | task notification; `SendMessage` continues the same subagent |
| Codex CLI | `spawn_agent`, agent `dk-<role>` | `[agents.dk-*]` in `~/.codex/config.toml` (spliced by `hooks/install.sh`) | `agent-wt create` + `agent-wt lock` | the tool result; Codex asks the user before spawning unless a standing grant exists |
| Pi, OpenCode, other | the host's dispatch tool if one exists | the brief carries the role preamble from `roles.md` | `agent-wt create` + `agent-wt lock` | the tool result |
| No fan-out at all | **serial**: the coordinator runs one worker after another, or does the slice itself | — | `agent-wt` still applies | — |

Serial is a dispatch mode, not a failure: one long-lived worker resumed with each next slice beats a queue of orphaned parallel ones. External review still works on any host that can run a shell.

## Native gives up three things

Choose external even inside the family when one matters:

- **An enforced sandbox.** External read-only roles run under `claude --permission-mode plan` / `codex -s read-only`. A native role is read-only by instruction and tool list — fine for a reviewer you dispatched yourself, thin as the boundary around an untrusted diff.
- **The strict result schema, ledger, run id, timeout, quota fallback.** All live in `agent-run`.
- **The write-lock for free.** `agent-run --cwd` takes it; a native writer needs `agent-wt lock` before and `agent-wt release` after — the lock is also what the writer cap counts (`external.md`).

## Git with parallel writers

- Each writer commits only its own paths; `git add <path>`, never `git add -A`.
- On `index.lock`, find the owner (`lsof`, `ps`) before touching it: live owner → wait; none → stale, remove.
- `git log --oneline -20` in each worktree shows a stalled or off-pattern worker sooner than its report does.
- Push is the coordinator's call after integration, never the worker's.
