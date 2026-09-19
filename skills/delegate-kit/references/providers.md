# CLI executor contracts

Use the configured executor's installed help and model picker for version/account-specific behavior. [Compatibility](compatibility.md) is the sole record of automated and live validation; installation and version discovery do not prove account authorization. New dispatch uses CLI/RPC. [Legacy migration](hosts.md) covers retired native/Paseo records.

Each adapter preserves the selected harness, provider, model, reasoning and access. It never installs a model, copies credentials, switches accounts or guesses equivalent reasoning levels. Parent model inheritance is unavailable on CLI. `--capabilities` is used only when OpenCode requires verified per-model CLI variant evidence.

## Codex

`codex exec --json -m MODEL --output-schema SCHEMA -o OUTPUT PROMPT`; exact continuation uses `exec resume ... SESSION_ID PROMPT`. Both routes use `sandbox_mode` configuration and `agents.enabled=false`. Explicit writer permissions configure network and writable cache roots through the same sandbox configuration; no bypass mode is enabled. See [execution access and readiness](external.md#explicit-execution-access).

Source: [CLI reference](https://developers.openai.com/codex/cli/reference), installed `codex exec --help`, `codex exec resume --help` and `codex sandbox --help`.

## Claude Code

`claude -p --output-format json --model MODEL --effort LEVEL --json-schema SCHEMA PROMPT`; continuation adds `--resume SESSION_ID`. Agent/Task tools are disabled. Writers use `acceptEdits` and retain command approvals. Read-only profiles use a read/search/web allowlist and empty strict MCP configuration. A writer must have headless permission for its own required commands; coordinator checks do not substitute for the worker's fix/test loop.

Provider configuration remains in Claude Code. For a configured compatible endpoint, use its exact model ID without a provider override. CLI flags do not establish independent model identity.

Sources: [CLI flags](https://code.claude.com/docs/en/cli-reference), [Z.AI integration](https://docs.z.ai/devpack/tool/claude).

## Gemini

`gemini --output-format stream-json --approval-mode MODE --policy POLICY --model MODEL --prompt PROMPT`; continuation adds `--resume SESSION_ID`. Writers use `auto_edit` and the configured sandbox; readers use `plan` and a read-only policy. A missing sandbox is a capability failure. Policy disables delegation. Gemini has no common reasoning flag: keep model-specific settings in its configured connection.

Sources: [headless output](https://geminicli.com/docs/cli/headless/), [CLI reference](https://geminicli.com/docs/cli/cli-reference/), [policy engine](https://geminicli.com/docs/reference/policy-engine/).

## OpenCode

`opencode run --pure --format json --agent RUN_AGENT --model PROVIDER/MODEL -- PROMPT`; continuation uses `--session SESSION_ID`. For an explicit `--variant`, provide verified CLI capabilities containing the installed version, exact provider/model and supported reasoning value. Unknown variants are refused.

The adapter reads effective permissions with `opencode debug agent RUN_AGENT --pure` without printing its output. Inline configuration preserves inherited rules and defines one scoped primary agent. Read-only workers have no edit, shell, external-directory or delegation tools. Writers retain inherited edit restrictions and shell approval requirements. They must be able to run their assigned checks headlessly before implementation. `--pure` excludes third-party plugins; automatic sharing is disabled.

Kimi/GLM may use an already configured OpenCode provider. There is no dedicated Kimi CLI adapter. Provider catalogs do not establish which connection or subscription to use.

Sources: [CLI](https://opencode.ai/docs/cli/), [permissions](https://opencode.ai/docs/permissions/), [agents](https://opencode.ai/docs/agents/), [providers](https://opencode.ai/docs/providers/).

## Pi and OMP RPC

Both select exact provider/model and optional reasoning, verify state, correlate command acknowledgements and wait for terminal completion. Resume uses the exact saved session file. Usage comes from observed assistant metadata; absent values stay unknown. Model/provider changes, hidden delegation, unexpected retries and interactive tool requests fail visibly.

Pi uses the SDK shipped with its installed package to provide an in-memory settings store. This prevents RPC configuration from changing user preferences. Its resource loader excludes extensions/skills, and tools are read/grep/find/ls plus edit/write for writers. Pi writers still lack shell and cannot take managed assignments requiring command checks. The SDK bootstrap remains a compatibility dependency; missing exports fail before a prompt.

OMP uses its own ready/v2 negotiation and validated chunk framing. Its tools are read/grep/glob plus edit/write for writers, and Bash only with explicit `executor.permissions.shell: true`. Existing command approvals remain authoritative; see [OMP setup](omp-setup.md). LSP/PTY preferences are inherited. Extensions/skills remain excluded to keep the managed tool and delegation boundary.

Automatic retries, model fallback, advisor and compaction remain disabled. OMP maintenance can use separately configured models and internal fallback; restoring it requires reliable model/cost attribution rather than silently permitting hidden calls. The coordinator's own compaction is unaffected. Display notifications are ignored; blocking UI requests remain capability errors.

Sources: [Pi RPC](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md), [Pi SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md), [OMP RPC](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md), installed OMP 18.1.17 `src/session/agent-session-events.ts`, `src/session/session-maintenance.ts` and `src/config/settings-schema.ts`.
