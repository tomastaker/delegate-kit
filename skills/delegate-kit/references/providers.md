# Launch adapters

Official contracts checked 2026-09-07. Local help inspected: Codex CLI 0.153.4, Claude Code 2.1.263, Gemini CLI 0.36.0 and OpenCode. See the packaged [compatibility matrix](compatibility.md) for current live-test evidence. Recheck installed help before dispatch; configured model access is account-specific.

## GPT through Codex CLI

Fresh: `codex exec --json -m MODEL -c 'model_reasoning_effort="high"' --output-schema SCHEMA -o OUTPUT PROMPT`.
Resume: `codex exec resume ... SESSION_ID PROMPT`. The adapter sets `sandbox_mode` through `-c` on both paths and disables agents with `agents.enabled=false`. It never enables bypass mode. Model and effort flags are omitted when unspecified.

V2 native dispatch uses the verified host bridge described in [hosts.md](hosts.md), with explicit per-run model/reasoning. Static TOML roles installed under `~/.codex/agents/` are legacy components; never rewrite user roles or rely on their pins for v2. Verify the actual host schema and effective access before dispatch.

Sources: [subagents and precedence](https://learn.chatgpt.com/docs/agent-configuration/subagents), [CLI reference](https://developers.openai.com/codex/cli/reference), and installed `codex exec --help` / `codex exec resume --help`.

## Claude through Claude Code

`claude -p --output-format json --model MODEL --effort high --json-schema SCHEMA PROMPT`; resume adds `--resume SESSION_ID`. V2 native Markdown definitions are unique per run and carry the resolved model and optional effort. Static legacy roles using `model: inherit` do not select v2 profiles. If the native tool cannot express the chosen effort, use the supported role configuration or external adapter; do not invent a spawn argument.

The adapter disables Agent/Task. Writers use acceptEdits and retain command approval requirements. Read-only calls use plan mode plus a read/search/web tool allowlist and an empty strict MCP configuration. Shell checks are run by the coordinator; plan mode alone is not an OS sandbox.

Sources: [CLI flags](https://code.claude.com/docs/en/cli-reference), [native subagents](https://code.claude.com/docs/en/sub-agents).

## Gemini through Gemini CLI

`gemini --output-format stream-json --approval-mode plan --policy POLICY --model MODEL --prompt PROMPT`; resume adds `--resume SESSION_ID`. Writer mode uses auto_edit plus `--sandbox`. A working Gemini sandbox runtime must already be configured; failure to start it is not grounds to remove the flag.

Gemini exposes no common --effort flag. Keep model-specific reasoning settings in Gemini configuration. The adapter's policy restricts read-only runs to inspection tools, and disables delegation for writers. Policy files are passed per invocation, without modifying global settings. Administrative rules can override local policy; these tool restrictions are not a universal security boundary.

The JSONL stream provides init/session metadata, assistant messages and a terminal result. The init model is configuration, so actual execution identity remains unknown. Result content is separately validated against the worker schema.

Sources: [headless output](https://geminicli.com/docs/cli/headless/), [CLI reference](https://geminicli.com/docs/cli/cli-reference/), [policy engine](https://geminicli.com/docs/reference/policy-engine/).

## Kimi and GLM through OpenCode

Select the provider already configured by the user. `opencode models` / the model picker establishes exact provider/model identifiers; the provider catalog alone does not prove that the account can call them. Both standard API and coding-plan providers exist, so the skill never guesses which subscription to charge.

`opencode run --pure --format json --agent RUN_AGENT --model PROVIDER/MODEL -- PROMPT`; resume adds `--session SESSION_ID`. `--variant` is passed only for an explicitly declared supported model variant. Do not translate xhigh to another provider's value by analogy.

A diagnostic `opencode debug agent RUN_AGENT --pure` reads effective permissions without generating a response. Its output is withheld from logs. Unsupported diagnostics stop dispatch. Inline OPENCODE_CONFIG_CONTENT preserves existing settings and defines a unique per-run primary agent. Its allowlisted tools retain inherited path restrictions; all other tools are denied. The --pure flag excludes third-party plugins. Read-only roles deny editing, shell execution, external directories and delegation. Writers retain inherited edit restrictions, cap shell execution at approval, and deny delegation. Unapproved commands may be unavailable headlessly: report them and have the coordinator run the authorized checks/commit. Permission rules are tool controls, not an OS sandbox. Credentials and provider configuration remain in OpenCode; the adapter does not install models or copy secrets.

Sources: [OpenCode CLI](https://opencode.ai/docs/cli/), [permissions](https://opencode.ai/docs/permissions/), [agents](https://opencode.ai/docs/agents/), [Moonshot and Z.AI providers](https://opencode.ai/docs/providers/).

GLM can also be configured behind Claude Code using its Anthropic-compatible endpoint. In v2 define an agent with `executor.harness: "claude"` and the exact configured GLM model ID, using the already configured Claude CLI connection. A different executable does not establish independent model identity. Legacy `family`/`adapter` backend fields belong only to v1 migration. [Z.AI's Claude Code integration](https://docs.z.ai/devpack/tool/claude).

Direct Kimi CLI execution is intentionally not an external adapter in this release. Current documentation says -p uses auto permission mode and cannot combine with --plan; older kimi-cli documentation describes a different --print interface. OpenCode provides a documented per-agent permission contract for the initial Kimi integration. Native Kimi coordination can still follow the policy through its actual tools. [Kimi command and flag conflicts](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html).

## V2 adapter additions and capability evidence (2026-09-16)

V2 always specifies a model; only an explicit native `inherit_model` may use verified parent identity. `provider` is supported for Codex via its configured `model_provider`, OpenCode via an exact provider/model selector, and Pi/OMP via RPC `set_model`. A provider override on Claude/Gemini is rejected because their existing connection is not selected by such a flag. OpenCode reasoning uses its model-specific variant; unknown variants must be checked in discovery. The runtime never translates effort names. Codex/Claude known effort tokens are checked before launch, while account/model compatibility must also be established in setup; provider rejection remains a failed run without fallback.

Local help/version inspected: Codex 0.153.4, Claude Code 2.1.268, Gemini 0.36.0, OpenCode 1.18.23, OMP 18.1.17. Pi and Paseo CLI are absent here. These are compatibility observations, not minimum supported-version promises. An authorized Codex CLI smoke with Sol/Luna passed on 2026-09-16; other live routes remain unverified. Version discovery does not read credentials or claim authentication.

### Pi

Pi runs its official RPC mode in a Node subprocess through the SDK shipped with the already installed `@earendil-works/pi-coding-agent` package. `pi-worker.mjs` locates that package from the Pi executable; it downloads no package. This small SDK bootstrap is necessary because Pi RPC setters for retry/compaction persist global settings by default. The wrapper supplies `SettingsManager.inMemory`, so those setters cannot alter the user's CLI preferences. It preserves global connection/transport preferences, disables packages/extensions/skills/prompts/themes for this worker, and leaves auth.json/models.json at their original Pi paths without copying credentials. Project settings are not promoted into global configuration.

The adapter requires the documented `createAgentSessionServices`, `createAgentSessionFromServices`, `createAgentSessionRuntime` and `runRpcMode` exports (source contract inspected at package version 0.85.1); missing exports fail explicitly before prompt. Resume uses `SessionManager.open` on the exact saved session file, never a partial UUID or “last session”. Read-only tools are read/grep/find/ls; writers add edit/write. Shell checks stay with the coordinator. Extension discovery and internal delegation tools are excluded.

The RPC client correlates responses by ID and command. Before prompt it calls exact `set_model`, disables auto-retry and auto-compaction, sets optional reasoning, and verifies state without accepting clamped reasoning. Prompt acceptance is separate from terminal `agent_end`. Assistant message metadata can establish actual provider/model; otherwise identity is unknown. Session ID/file are saved before and after the turn. After the completed turn the idle Pi process is terminated; later continuation reopens its exact transcript. LF alone separates JSONL, preserving U+2028/U+2029 and split UTF-8 sequences.

Sources: [Pi RPC](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md), [CLI options and tools](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md), [SDK settings/runtime](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md). Covered by deterministic protocol, SDK-bootstrap fixtures and fake-process tests, including unchanged global settings; Pi is not installed for a local handshake/live run.

### OMP

OMP uses its own RPC adapter, not Pi framing assumptions. Require a ready frame advertising v2, negotiate v2, then validate chunk IDs, order, counts, strict base64, byte lengths and UTF-8. Interrupted/interleaved/incomplete sequences fail visibly. Physical and reassembled limits are bounded by the advertised ceilings. `agent_end` with `isTerminal: false` is not completion. A late error after prompt acknowledgement fails the turn.

CLI: `omp --mode rpc --provider PROVIDER --model MODEL --no-extensions --no-skills --no-title --no-prewalk --no-lsp --no-pty --config RUN_CONFIG --approval-mode write --tools ... --session-dir DIR`. Read-only tools are read/grep/glob; writers add edit/write. Resume uses `--resume EXACT_SESSION_FILE`. The generated run-only configuration disables advisor, retry/model fallback, compaction, memory/autolearn, recap, planning and task isolation. RPC also disables retry/compaction and verifies exact model/reasoning before prompt. Tool restrictions are not an OS sandbox. Existing provider authentication remains in OMP; the adapter never enables yolo/auto-approve or copies secrets.

Display-only extension UI notifications are ignored. A blocking dialog or host-owned tool request cannot be silently approved; it stops the run for explicit resolution. Unexpected subagent/fallback/retry events fail rather than hiding extra work. These controls cover the documented execution surface, not arbitrary host/provider internals or external account activity.

Sources: [OMP RPC framing and lifecycle](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md), [OMP settings schema](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/config/settings-schema.ts), installed 18.1.17 help. Local startup, v2 negotiation, get_state, exact set_model, disabling retry/compaction and EOF passed with no prompt/model call. Completion, continuation and failures use deterministic fixtures; live provider calls remain unverified.

### Host bridges

See [hosts.md](hosts.md) for actual host-call boundaries and [compatibility matrix](compatibility.md). Native access must be established by the host, not the profile text. Paseo maps a Delegate Kit profile into create_agent settings without a second team configuration; it preserves daemon and workspace ownership. Both bridge paths are fixture-tested, not live-certified. No cloud shell or native OMP/Pi/T3 integration is implied.

OpenCode variants require a verified `transport: "cli"` capability entry with its harness, observed version, exact combined model ID and supported `reasoning` list. Pass this ephemeral discovery evidence with `prepare --capabilities`; an unknown variant is refused before launch. For auto routing with an incompatible host entry, CLI fallback additionally needs explicit `cli_equivalent: true` evidence for the same account/provider, or an explicit user-authorized `transport: "cli"` selection. Capability evidence cannot authorize another provider.
