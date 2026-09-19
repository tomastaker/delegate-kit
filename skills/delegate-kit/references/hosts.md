# Migrating retired host routes

New work uses CLI/RPC execution from any coordinator with shell access to the execution machine. Native/Paseo dispatch and automatic host selection are retired. Existing presets, logs and run records are left intact. Workers need not appear as native children in the coordinator app; use Delegate Kit overview/watch.

## Saved presets

`native`, `paseo` and `inherit_model` remain readable for migration. Preparation refuses them before dispatch, rather than silently selecting a different connection. Edit the selected profile through the ordinary preset revision workflow: set `transport: "cli"`, provide an exact model and verify the intended provider/account. Omitted transport and legacy `auto` use CLI when no host capability input is present. Host capability input is rejected; it is never interpreted as permission to use a local account. OpenCode CLI variant discovery still uses CLI capabilities.

Do not rewrite all saved teams, install another executor or change accounts automatically. A remote Paseo workspace is not a local cwd; run Delegate Kit on the execution machine with the repository and configured CLIs available. Chats without shell access require a connection to such a machine.

## Unfinished runs from an earlier installation

Inspect the saved host agent before starting replacement work. Legacy `status`, `cancel`, `attach`, `event` and `dispatch-failed` remain only to reconcile old records; `run` and `resume` refuse a host dispatch. Cancel a merely prepared reservation. For a dispatched run:

- Attach the actual saved host ID with `attach ID --host-agent HOST_ID`; Paseo also needs its saved `--workspace-id`.
- Confirm the host turn has stopped. Register its original envelope with `event ID --host-agent HOST_ID --dispatch-token TOKEN --event complete --file RESULT --stopped`. The file must contain `{"dispatch_token":"TOKEN","result":...}` from that attempt; never relabel an older result.
- For cancellation, interrupt the real host agent, then record `event ... --event cancelled --stopped`. A cancel request alone retains ownership.
- Only if the host confirms no agent/turn started, use `dispatch-failed ID --dispatch-token TOKEN --confirmed-not-started --evidence FILE`. A timeout is insufficient.

Preserve partial work before choosing a new CLI assignment. Do not delete an uncertain run or its lease to force progress. Per-run Claude role files from old dispatches may be removed only after completion and after confirming they are unchanged; shared user roles are unaffected.
