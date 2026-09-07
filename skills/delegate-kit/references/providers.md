# Launch adapters

Official contracts checked 2026-09-07. Local help inspected: Codex CLI 0.153.4, Claude Code 2.1.263, Gemini CLI 0.36.0 and OpenCode. No live model executions were performed for this integration. Recheck installed help before dispatch; configured model access is account-specific.

## GPT through Codex CLI

Fresh: `codex exec --json -m MODEL -c 'model_reasoning_effort="high"' --output-schema SCHEMA -o OUTPUT PROMPT`.
Resume: `codex exec resume ... SESSION_ID PROMPT`. The adapter sets `sandbox_mode` through `-c` on both paths and disables agents with `agents.enabled=false`. It never enables bypass mode. Model and effort flags are omitted when unspecified.

Native roles are standalone TOML files under `~/.codex/agents/`. The installer generates them without model/effort settings. Custom agent model settings can override spawn choices, so existing installed pins must be removed. Actual tool schemas differ by host: use agent_type when the spawn tool requires it; do not copy another harness's argument names.

Sources: [subagents and precedence](https://learn.chatgpt.com/docs/agent-configuration/subagents), [CLI reference](https://developers.openai.com/codex/cli/reference), and installed `codex exec --help` / `codex exec resume --help`.

## Claude through Claude Code

`claude -p --output-format json --model MODEL --effort high --json-schema SCHEMA PROMPT`; resume adds `--resume SESSION_ID`. Native Markdown roles use `model: inherit` and omit effort. If the native tool cannot express the chosen effort, use the supported role configuration or external adapter; do not invent a spawn argument.

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

GLM can also be configured behind Claude Code using its Anthropic-compatible endpoint. In that case define a backend with family glm and adapter claude, and use the already configured CLI environment. Do not label its review cross-family just because the executable says claude. [Z.AI's Claude Code integration](https://docs.z.ai/devpack/tool/claude).

Direct Kimi CLI execution is intentionally not an external adapter in this release. Current documentation says -p uses auto permission mode and cannot combine with --plan; older kimi-cli documentation describes a different --print interface. OpenCode provides a documented per-agent permission contract for the initial Kimi integration. Native Kimi coordination can still follow the policy through its actual tools. [Kimi command and flag conflicts](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html).
