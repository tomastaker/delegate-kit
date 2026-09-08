# Role profiles and execution

## One configuration file

Edit `~/.delegate-kit/config.json`, or `$DELEGATE_KIT_HOME/config.json` when the state directory is overridden. `examples/config.json` contains complete GPT, Claude and Kimi teams. Keep credentials in the provider's configuration.

`profiles.<name>.roles` assigns workers for a coordinator. The family declared by `--parent` selects the profile automatically: built-in parent `codex` has family `gpt`, while `claude`, `kimi`, `glm` and `gemini` have their respective families. `--profile NAME` selects a named profile explicitly. `--parent-model` describes the current model; it does not switch the chat or select a profile by model-name guesswork. Distinct teams for two models in the same family can use named profiles and `--profile`.

Top-level `roles` supplies shared defaults. The selected profile replaces each role it defines completely; roles absent from that profile use shared assignments. An absent verifier uses the reviewer ladder; an absent review-lead uses the planner ladder. With no assignment, the current model is inherited on a native route.

### Role ladders

A role is a nonempty ordered array:

```json
{
  "profiles": {
    "gpt": {
      "roles": {
        "researcher": [
          { "model": "gpt-5.6-luna", "effort": "high" },
          { "model": "gpt-6-astra", "effort": "low" }
        ],
        "reviewer": [
          { "family": "claude", "runner": "claude", "model": "opus", "effort": "high" }
        ]
      }
    }
  }
}
```

`--level 1` selects the usual candidate. `--level 2` selects the next permitted step; an out-of-range level fails. The coordinator chooses a level for risk, ambiguity and observed mistakes. No automatic escalation or cross-provider retry occurs. A difficult task can start above level 1.

| Candidate field | Meaning |
|---|---|
| `model` | Exact host/CLI identifier; omit to inherit native or CLI configuration |
| `effort` | Supported reasoning setting; omit when unsupported or to retain defaults |
| `family` | Model lineage, such as gpt, claude, kimi or glm; defaults to the parent family |
| `runner` | `auto` (default), `native`, or external `codex`, `claude`, `gemini`, `opencode` |
| `backend` | Optional advanced named executor from `backends`; useful for custom endpoints |
| `efforts` | Optional declared supported effort values for this exact configured candidate |

A candidate that names an unavailable executor remains selected and reports that limitation. The coordinator must deliberately select another authorized candidate or address the missing capability. It must not silently downgrade or spend on an unconfigured family merely because its CLI exists.

## Native and external are capabilities

A native worker is launched and supervised by the current host's tools. Its family need not match the host if the host really supports other families. The native invocation uses the parent's tool contract, not the external adapter of the target model.

`runner: auto` prefers native execution for the supported families. The default route assumes the parent family can run natively; verify this against the actual tools before dispatch. Use `--no-native` for a host without fan-out, or supply the known supported families with `--native-families gpt,claude`. These flags describe observed capabilities, not a way to grant them. Check the specific model and effort too. A separate backend profile in the same family can still be native.

`runner: native` requires that capability and refuses an external `run`. An explicit CLI runner always chooses external execution, including a same-family worker. `--external` requests an external route unless it conflicts with an explicit native requirement. `agent-run run` executes only CLI workers; use the host's tool for a native route.

For external OpenCode, use a `provider/model` returned by `opencode models` for your configured provider. This establishes the identifier, not account access. For a native Kimi worker, use the identifier exposed by that host or omit it to inherit; an OpenCode identifier is not automatically a native identifier.

Omitted external model/effort uses that CLI's own configuration, not the coordinator's model. Confirm those settings before relying on them. A model/effort override must be supported by the exact host and model; `recommended_reasoning` is guidance, not a provider parameter. Adapters: `providers.md`. Native details: `hosts.md`.

## Selection and compatibility

The active profile's candidates and shared role assignments form the allowed family pool, together with the parent. Inactive profiles do not authorize their models in this task. `auto` supports any number of configured families. The route reports `solo`, `duo` or `mixed` to describe the pool; these labels do not determine worker count or review quality.

Existing `mode: solo|duo`, `families` (legacy backend IDs), `backends`, object role assignments and preferences remain accepted. Explicit solo restricts the task to the parent family; an excluded role assignment fails visibly. Explicit duo requires two families. Use the role profiles for new setups. Invalid configuration, including an inactive profile, fails visibly rather than restoring defaults.

Precedence: explicit session choice carried in CLI arguments → selected profile role → shared role → backend defaults → current native model or CLI defaults. `--backend`, `--family`, `--runner`, `--model`, `--effort` and `--level` express deliberate per-call choices. An explicit model without a family/backend belongs to the current family; family is never inferred from its spelling. To select a foreign model explicitly, include `--family` or its configured `--backend`.

Legacy mode selection is per-call → `DELEGATE_KIT_MODE` → JSON → auto. Legacy main-codex/main-claude presets remain backend preferences. `roles.<role>.<backend>: [model, effort]` is retained for migration. Custom `backends.<id>` contains a declared family, supported adapter, optional model and supported efforts. A GLM endpoint behind Claude Code must declare family glm; the executable name does not establish diversity.

Review output keeps `fresh_context_required` and `cross_family` separate. `--author-backend self` means the current parent. A configured reviewer ladder applies to each generated reviewer slot; choose a different authorized candidate explicitly for another slot when useful. Review depth chooses coverage, while role level chooses the model/effort. They are independent. An explicit `review.allow_multiple: false` restricts multiple reviewers unless the user grants an exception.

## Task counters and limits

For delegated work, choose one stable task ID and ticket IDs. The counter tracks starts and resumes, not tokens or money. Keep the same task/ticket when continuing or repairing work. Configuration can set `limits.max_workers`, `max_writers`, `max_runs` and `max_retries`; omitted fields impose no kit limit. Other than retries (which may be zero), limits are positive integers.

- `max_workers` / `max_writers`: concurrent known runs. External runners count active external processes machine-wide and native writer locks in the current repository. Native read-only workers remain supervised by the host/coordinator. Actual host capacity is always binding.
- `max_runs`: total starts and resumes for a task, including failed attempts after launch admission.
- `max_retries`: repair attempts per ticket, recorded with `--retry` for both clarification resumes and fresh replacements.

CLI `--max-*` overrides the corresponding `DELEGATE_KIT_MAX_*` environment value, then JSON. Treat saved user limits as hard unless the user's session instruction changes them; flags are not autonomous permission to increase a limit. CLI/environment limits apply to that invocation/session; persistent user limits belong in JSON. Task files store usage, not a copy of configuration limits.

Inspect usage without modifying it:

```
agent-run budget --task feature-name
```

Before a native start or resume, reserve its count once:

```
agent-run budget --task feature-name --record --ticket find-docs
agent-run budget --task feature-name --record --ticket find-docs --retry
```

Then dispatch through the host. A recorded reservation is an attempt even if the host subsequently refuses it; state that outcome rather than launching another worker without accounting. Use host notifications for completion. This is bookkeeping for the coordinator, not an automatic interceptor of arbitrary native tools.

External starts and resumes record themselves once, including detached launches:

```
agent-run run --parent codex --role planner --task feature-name --ticket plan --brief brief.md
agent-run resume RUN_ID --brief clarification.md --retry
```

Resume inherits the saved task and ticket. Pass `--retry` when repairing an unsatisfactory result; a normal continuation still counts as a run. A run/retry limit without a task ID is rejected. Exhausted budgets reject admission before launching another external process. Counters update atomically in `tasks/<task>.json` under the state directory.

Before each wave or repair, inspect progress and count. Continue when the likely useful outcome justifies context transfer and checking; stop repetitive ineffective attempts. User limits bound this judgement; there are no default three-writer/eight-writer thresholds and no pricing lookup requirement.

## Failure and continuation

Missing context or a bounded oversight calls for clarification. Insufficient reasoning calls for a stronger permitted level and a fresh worker. Tool/access failures call for an environment fix. Before replacement, inspect partial work, stop the old writer and transfer ownership.

Resume keeps the saved adapter, family, model and effort, even when profile configuration changes. A CLI-default model remains dependent on that CLI's configuration; pin a known model for reproducibility. A route exposes requested choices; actual runtime identity remains unknown unless confirmed by metadata. Invalid result JSON is a failed worker contract even when the CLI exits successfully.
