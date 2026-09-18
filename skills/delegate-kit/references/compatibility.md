# Compatibility and tested scope

| Path | Implemented | Automated evidence | Local evidence | Live model call |
|---|---|---|---|---|
| Codex CLI | fresh, result, exact resume, cancellation | fake CLI tests | 0.153.4 | 2026-09-16: Sol fix + exact resume, Luna independent review + cancellation; isolated fixture, low reasoning |
| Claude CLI | fresh, result, exact resume | adapter + supervisor fixtures | help/version 2.1.268 | not run |
| Gemini CLI | fresh, result, exact resume | adapter + supervisor fixtures | help/version 0.36.0 | not run |
| OpenCode | permissions, provider/model, exact resume | permission/adapter fixtures | help/version 1.18.23 | not run |
| Pi | official RPC via installed SDK, isolated settings, exact resume | SDK/protocol + fake process tests | not installed | not run |
| OMP | RPC v2 negotiation/chunks, terminal result, resume | protocol + fake CLI tests | 18.1.17 ready/state handshake, no prompt | not run |
| Native Codex/Claude | prepare, exact invocation, unique definitions, attach/events | bridge fixtures | tool/schema-dependent; no agent dispatched | not run |
| Paseo | materialized create/follow-up settings, daemon/workspace lease | bridge fixtures | no daemon/tools available | not run |

Native writers require verified host enforcement of the reserved worktree binding. Hosts that cannot establish it must use an explicitly selected CLI route.

Native Pi/OMP and a dedicated T3 bridge are not implemented; Pi and OMP use the explicit CLI/RPC transport. A direct CLI does not become a Paseo UI agent. Desktop/cloud chats need actual shell and host tools. [Adapter contracts, official sources and limitations](providers.md).

Worktrees coordinate writers, not all filesystem permissions. Read-only tool controls differ by executor. Pi/OMP writers deliberately exclude shell and internal delegation; the coordinator performs command checks and authorized commits. Runtime usage is null when unavailable, not zero. The runtime counts its own reservations/continuations and owned worktrees; it cannot account for arbitrary agents launched outside it. No savings or model-quality percentage is promised.


The Codex smoke used three completed prompts and one cancelled dispatch. Both completed sessions recorded the requested model in Codex turn metadata. This proves the tested CLI lifecycle, not general coordinator routing quality or other providers. CLI-reported completed-turn usage: 165,014 input tokens (112,128 cached), 1,097 output tokens. Currency cost and quota percentage were not provided.


Task acceptance is the only acceptance workflow. Managed writers require a task contract; standalone read-only work can run from a brief. Presets without `routing` remain valid. Optional tiers preserve exact executor settings. `review.also_run` belongs only to read-only reviewers; implementation review requirements belong in the task contract.

Checkpoint verification relies on the trusted coordinator/runtime and declared environment. Worker tool restrictions are not OS isolation against arbitrary processes using the same user account. Keep task state outside worker-owned source scope, use the supported managed surfaces, and treat edits to evidence/state outside those surfaces as outside the trust boundary. New deterministic fixtures do not establish live provider behavior or the coordinator's semantic risk judgment; no new paid route is implied by this release.
