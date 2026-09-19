# Compatibility and tested scope

All new execution uses CLI/RPC. The coordinator may run in any chat with shell access to the execution machine, Node 20+, Git and the selected authorized CLI. No native-child UI, host capability negotiation or Paseo daemon is required. A cloud chat without access to the execution machine cannot gain it by loading this skill.

| Executor | Automated evidence | Observed installation | Live model evidence |
|---|---|---|---|
| Codex CLI | lifecycle, resume, cancellation, sandbox readiness and acceptance fixtures | 0.153.4; no-model sandbox probes at 0.154.0 | 2026-09-16: Sol fix/resume, Luna review and cancellation in an isolated fixture |
| Claude CLI | adapter and supervisor fixtures | help/version 2.1.268 | not run |
| Gemini CLI | adapter and supervisor fixtures | help/version 0.36.0 | not run |
| OpenCode | permission and adapter fixtures | help/version 1.18.23 | not run |
| Pi | SDK bootstrap, RPC and fake-process fixtures | not installed | not run |
| OMP | RPC v2, chunks, terminal result, resume and failure fixtures | 18.1.17 no-prompt handshake/state, including inherited LSP/PTY startup | not run |

The dated Codex live smoke predates the CLI-only simplification and in-place final checks. It establishes that tested lifecycle, not validation of every current route or semantic routing quality. It used three completed prompts and one cancelled dispatch; completed-turn usage was 165,014 input tokens (112,128 cached) and 1,097 output tokens. Money and quota percentage were unavailable. No new paid test is implied.

Native/Paseo launch and continuation are retired. Saved presets remain readable and unchanged; new dispatch refuses those routes explicitly. Compatibility handlers only reconcile unfinished old runs. See [migration](hosts.md).

Worktrees and leases coordinate managed writers/checks; they are not an OS security sandbox. Read-only controls differ by executor. Pi writers lack shell; OMP Bash is explicit and must also satisfy command approvals. Keep state outside worker-owned scope. Runtime cannot control arbitrary processes running under the same user account.

Final checks run in the prepared integration workspace under its lease, comparing source content to the checkpoint before and after execution. Independent reviewers use the frozen code/specification. Project scripts own their servers, databases, browser sessions and cleanup. External target identity and environment changes require actual project-level evidence; a correct cwd alone does not prove them. Only task acceptance can report verified completion.

Fixtures validate mechanics, not model quality, account access or every real browser/database environment. Usage and costs remain partial when unavailable; no universal savings or quality percentage is promised. [Executor contracts and primary sources](providers.md).
