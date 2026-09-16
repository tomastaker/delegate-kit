# Native and Paseo host bridges

A Node script cannot invoke hidden parent-chat tools. A bridge prepares/reserves one dispatch, the coordinator calls the actual tool, and the runtime attaches and validates correlated results. Prepared or accepted-by-transport is not completed.

## Capability evidence

Read the actual tool schema and model/provider discovery, then write a temporary JSON array passed to `prepare --capabilities FILE`. It is per-run evidence, not another user team configuration. Each entry contains:

```
{
  "verified": true,
  "host": "codex",
  "version": "observed host/tool schema version",
  "harness": "codex",
  "transport": "native",
  "models": [{ "id": "verified-model", "reasoning": ["verified-option"] }],
  "resume": true, "result": true, "cancel": true,
  "access": ["read-only"]
}
```

Include only capabilities actually established in this host. A prompt saying read-only is not enforcement. Codex native inherits the host's access boundary; if that boundary cannot enforce the profile's access, use CLI. Explicit inheritance also needs `current_model`. Auto tries compatible Paseo, compatible native, then the same harness CLI. Explicit transports fail if evidence is insufficient. Native Pi/OMP/T3 bridges are not implemented; use their CLI if locally available. T3 is a host, never a model provider.

For a native writer, also provide `workspace_binding: { "cwd": "/absolute/linked/worktree", "enforced": true }`. Set this only after verifying that the host places the child in that directory and enforces its write boundary there. The coordinator's cwd, a prompt instruction or a list of accessible directories is not sufficient evidence. The runtime compares canonical paths with the leased worktree before admission and again before dispatch or continuation. This applies to both Codex and Claude native writers. Without that host guarantee, select CLI explicitly; its process starts in the assigned worktree. Read-only native tasks keep their existing access checks. Paseo uses its explicit workspace ID binding.

## Dispatch and events

1. `prepare` snapshots the team and reserves its required profile set. Local writers use linked worktrees.
2. `run ID` returns `invoke` and a unique `dispatch_token`, and marks starting. Call that real host tool once with the exact settings. Do not re-dispatch on an uncertain response: inspect host state and attach the existing agent. If the host positively confirms that no agent was created, use `dispatch-failed ID --dispatch-token TOKEN --confirmed-not-started --evidence FILE`, with a text record of that evidence. A timeout or missing notification does not establish this fact.
3. `attach ID --host-agent HOST_ID` records the real session. Reattaching the same ID is idempotent; another ID is rejected. A late ID can be attached during cancellation without reopening the run.
4. Await completion notifications or the host's bounded wait. All events require `--dispatch-token TOKEN` from this dispatch. For a permission event use `event ID --host-agent HOST_ID --dispatch-token TOKEN --event permission`. The dispatched prompt requests `{ "dispatch_token": "TOKEN", "result": <worker result> }`; preserve this envelope exactly, without replacing an old token. A terminal host response is saved as JSON and registered with `event ... --event complete --file RESULT --stopped`. This explicit assertion means the host confirmed the turn stopped; never assert it while a writer can still modify files. Invalid output fails validation. Error/cancellation use `--event failed|cancelled --stopped`.
5. After every bounded host wait without completion, query its read-only status/progress tool. Record a verified observation with `event ID --host-agent HOST_ID --dispatch-token TOKEN --event running [--progress OBSERVED_CURSOR]`. The cursor must come from host events/artifacts, not a fabricated timestamp. Polling does not send a new prompt. See [watchdog behavior](routing.md#lifecycle-and-recovery).
6. `resume ID --brief FILE`, then `run NEW_ID`, returns a follow-up invocation for the saved host session. Attach that same ID to the new attempt, then ingest its correlated result. Fresh review starts a new prepared run.

Codex uses `spawn_agent` with fresh context/model/reasoning, then `followup_task`. Tool availability varies: an unsupported schema is not fixed by copying these names. Claude uses an isolated `dk-RUN_ID` definition. `materialize ID --directory VERIFIED_AGENT_DIR` writes only that unique file and refuses conflicts. Mark capability `dynamic_roles: true` only if the running host discovers it without restart. Remove that unchanged managed file after completion; otherwise prefer CLI. Neither route repins a shared role when X1/Y2 switches.

`cancel` for a bridge requests host interruption and retains capacity/ownership until a correlated stopped event. An uncertain, unattached native dispatch cannot be automatically recovered; identify its real agent through the host first. Never associate a result with a new attempt solely because the host session ID matches: continuations reuse that ID but get a new dispatch token. Legacy in-flight records without an echoed token must be reconciled against their original host turn rather than relabelled. Agents launched outside the bridge are outside runtime accounting. Host interfaces may still expose progress messages to the parent; the skill cannot erase them.

## Paseo

Use actual `list_providers`, `list_models`, `inspect_provider` results, not Paseo profiles. The active Delegate Kit JSON is the assignment source. A compatible evidence entry sets `host: "paseo"`, `transport: "paseo"`, the unchanged `harness`, a stable `daemon`, and verified `mode_ids` mapping `read-only`/`workspace-write` to exact Paseo modes. Include provider when the profile pins one and only if discovery proves that same connection is used.

Create/select the workspace through Paseo first. Pass `--workspace FILE` containing `owner: "paseo"`, its `id`, `daemon`, and optional `remote: true`; `--cwd` is a daemon path and is not checked locally. The runtime materializes `create_agent` with `provider: harness/model`, workspaceId, settings.modeId and optional thinkingOptionId, and notifyOnFinish. It never requires a Paseo profile. Invoke in the parent agent context on the saved daemon so Paseo owns the parent-child relationship.

Attach with both `--host-agent` and `--workspace-id`. Follow-up uses `send_agent_prompt` with the saved agentId and daemon. Notifications trigger result ingestion. Workspace creation/archive stay with Paseo; preserve changes and references before archiving. A direct Pi/OMP CLI is not automatically visible in Paseo UI. No live Paseo daemon or tool schema was available for this implementation; the bridge was reviewed against the official documented tool surface and requires current-host verification before use.

Sources checked 2026-09-16: [Paseo skill and tool contract](https://github.com/getpaseo/paseo/blob/main/skills/paseo/SKILL.md), [Paseo orchestration](https://paseo.sh/docs/orchestration). The bridge was reviewed against that documented surface but is not contract-tested by a complete repository fixture suite. Local Desktop/cloud chats without shell and corresponding host tools cannot execute this bridge.
