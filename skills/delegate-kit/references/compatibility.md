# Compatibility and tested scope

| Path | Implemented | Automated evidence | Local evidence | Live model call |
|---|---|---|---|---|
| Codex CLI | fresh, result, exact resume, cancellation | legacy fake CLI supervisor; v2 preset/lease/observability fixtures | 0.153.4 | 2026-09-16: Sol fix + exact resume, Luna independent review + cancellation; isolated fixture, low reasoning |
| Claude CLI | fresh, result, exact resume | adapter + supervisor fixtures | help/version 2.1.268 | not run |
| Gemini CLI | fresh, result, exact resume | adapter + supervisor fixtures | help/version 0.36.0 | not run |
| OpenCode | permissions, provider/model, exact resume | legacy permission/adapter fixtures | help/version 1.18.23 | not run |
| Pi | official RPC via installed SDK, isolated settings, exact resume | adapter/runtime code review only in this repository | not installed | not run |
| OMP | RPC v2 negotiation/chunks, terminal result, resume | adapter/runtime code review only in this repository | 18.1.17 ready/state handshake, no prompt | not run |
| Native Codex/Claude | prepare, exact invocation, unique definitions, attach/events | observability metadata fixture only | tool/schema-dependent; no agent dispatched | not run |
| Paseo | materialized create/follow-up settings, daemon/workspace lease | preset validation and code review only | no daemon/tools available | not run |

Native writers require verified host enforcement of the reserved worktree binding. Hosts that cannot establish it must use an explicitly selected CLI route.

Native Pi/OMP and a dedicated T3 bridge are not implemented; Pi and OMP use the explicit CLI/RPC transport. A direct CLI does not become a Paseo UI agent. Desktop/cloud chats need actual shell and host tools. [Adapter contracts, official sources and limitations](providers.md).

Worktrees coordinate writers, not all filesystem permissions. Read-only tool controls differ by executor. Pi/OMP writers deliberately exclude shell and internal delegation; the coordinator performs command checks and authorized commits. Runtime usage is null when unavailable, not zero. The runtime counts its own reservations/continuations and known legacy work; it cannot account for arbitrary agents launched outside it. No savings or model-quality percentage is promised.


The Codex smoke used three completed prompts and one cancelled dispatch. Both completed sessions recorded the requested model in Codex turn metadata. This proves the tested CLI lifecycle, not general coordinator routing quality or other providers. CLI-reported completed-turn usage: 165,014 input tokens (112,128 cached), 1,097 output tokens. Currency cost and quota percentage were not provided.
