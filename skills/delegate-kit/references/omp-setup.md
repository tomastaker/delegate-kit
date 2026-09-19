# OMP setup for Delegate Kit

Use this only when the user asks to prepare OMP. OMP settings describe the host tool; Delegate Kit presets assign specialists. Avoid maintaining a second team in OMP modelRoles. Keep credentials and session databases local to each host.

## Align the hosts

Compare `omp --version`, `bun --version` and the effective `omp config path`. The tested pair is OMP 18.1.17 and Bun 1.4.0; OMP declares Bun >=1.3.14. Matching existing versions need no reinstall. For a new host, use the official OMP installation instructions and pin the chosen version. Recheck RPC compatibility before upgrading it.

Use one non-secret baseline on both machines, backing up each existing config first. A simple interactive setup can keep one explicitly selected default model, fixed reasoning, the same theme/composer, advisor/prewalk disabled, model/usage fallback disabled, and `tools.approvalMode: write` (workspace edits allowed; execution asks). Local credentials, MCP definitions, caches and sessions are not configuration-sync targets. A shared default model still needs authorization on each machine; copying a model ID does not copy sign-in.

The Delegate Kit OMP adapter supplies per-run overrides, exact provider/model/reasoning, restricted tools, disabled internal delegation/extensions, and disabled retries/compaction/fallback. It does not depend on OMP specialist roles. These worker settings differ intentionally from an interactive coordinator's normal configuration.

For SSH automation, use a login shell, for example `ssh HOST 'bash -lc "omp --version"'`. Ensure the user's Bun bin directory is exposed before an early non-interactive return in shell initialization. A bare SSH command may receive only the sshd PATH. Do not change system sshd settings or copy credentials to solve a PATH problem.

## Connect OpenRouter after setup

On each host, run `omp auth-broker login openrouter` interactively, or open OMP and use `/login openrouter`. The installed provider registry must list OpenRouter. Complete the credential prompt locally; credentials do not belong in the team JSON or repository. An existing `OPENROUTER_API_KEY` is another supported connection source, but a GUI/SSH process must actually inherit it.

After sign-in, use `omp models openrouter --json` or the model picker to choose exact IDs and supported reasoning. A catalog listing alone does not establish successful authentication. Add an agent with `executor.harness: omp`, `provider: openrouter`, the chosen model ID and `transport: cli` to the active team; validate and save using the current preset revision. Model calls for a connection test need user authorization.

## Validate without a model call

Check effective config on both hosts and compare only non-secret managed settings. Launch RPC in an isolated temporary cwd with the same worker overrides; negotiate protocol v2, get_state, select the exact already configured model, disable retry/compaction and get_state again, then close stdin. Do not send prompt. This checks startup and the protocol, not provider authentication or generated results.

Local CLI status checks, `overview`, `watch` and supervisor heartbeats call no model. Follow the default low-noise observability protocol: use compact `watch` with a bounded 60000 ms timeout. If it times out unchanged while work remains active, send at most one aggregate one-line heartbeat and only when no other meaningful commentary was sent during that interval; do not repeat the roster or models. Use `--full` only for diagnosis. A different user-visible cadence requires the user's explicit preference. Internal health checks still return early for completion or required attention. Host tool execution limits may shorten a wait; old native/Paseo records require explicit migration/reconciliation. This setup does not claim zero total coordination overhead.

Sources: [official installation](https://github.com/can1357/oh-my-pi#install), installed 18.1.17 `--help`, `auth-broker list --json`, `config` help, and [RPC contract](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md).

## Writers that run their own checks

Set the chosen Delegate Kit CLI writer's `executor.permissions.shell` to `true`; this includes Bash in its tools. It does not modify OMP approval settings. Inspect the effective project/user policy before changing it, preserving existing denials. In OMP 18.1.17, `tools.approvalMode: write` still asks for execution; `tools.approval.bash: prompt` allows specific `bash.patterns` entries with `approval: allow` to authorize agreed commands. An inherited `bash: deny` blocks them. Patterns match the normalized whole command, support `*` and use the first match; a `--config` array replaces inherited patterns. Keep `bash.allowCompoundCommands: false` and retain existing deny/prompt rules before adding exact project commands. These controls are not an OS sandbox: an approved project script can itself execute commands.

The setup owner should verify these capabilities in the actual writer environment:

1. Read the assigned worktree and full task, edit owned files, and write the required dependency/cache directories.
2. Execute the agreed setup/readiness, application-start, behavior-test and Playwright commands without an interactive permission prompt.
3. Bind/connect the assigned local ports and connect to a dedicated test DB; create only authorized test data.
4. Start its own application/browser, exercise the affected UI flow and inspect screenshots. Establish the tested application's source version and resource ownership.
5. Observe a failing check, edit the implementation and rerun it; stop only its own processes/sessions on completion or failure.

Use project Playwright commands via Bash for the initial integration. Native browser automation is a separate OMP setup: at 18.1.17 it is an `eval` prelude, requiring active `eval`, `browser.enabled` and appropriate approvals for both eval and browser. `--tools browser` alone does not enable it. Delegate Kit does not enable eval implicitly.

A handshake or policy inspection does not prove the tools work end to end. Raw RPC `bash` bypasses BashTool approvals and is not a valid worker capability test. OMP lacks a corresponding RPC tool-execution probe, so the worker must test readiness with its actual Bash tool before editing and return `blocked` on failure. Any separate model smoke test needs authorization.
