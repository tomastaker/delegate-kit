# Routing and optional configuration

## No-configuration workflow

The coordinator uses the capabilities exposed by its current host. It identifies the current family, main senior model, supported alternatives and effort values from runtime tools or the model picker. If that information is unavailable, it preserves the current model and states the limitation.

`agent-run route --role planner --parent codex` yields native inheritance: null model/effort means **omit these fields**, not a model named null. The installed role does not override them. For an external run, omitted fields use that CLI's own configuration; this is not inheritance from the coordinator. Before external implementation, establish that the CLI's configured model matches the intended senior model, or pass the verified model explicitly.

The script resolves constraints and concrete arguments. The coordinator makes the qualitative decision. `recommended_reasoning` is guidance, not a provider parameter. It should explicitly choose a supported effort when task needs differ from the current setting.

`agent-run doctor` reports installed CLIs only. It neither reads credentials nor authenticates, lists paid model availability, or invokes a model. Confirm access through the host/provider's status and model picker. No provider is contacted simply because its executable is installed.

## Families, backends and adapters

- **Family:** model lineage used to describe diversity: gpt, claude, gemini, kimi, glm, or a user-defined value.
- **Backend:** named execution profile, with family, adapter and optional model. Several profiles may belong to one family.
- **Adapter:** launch/event protocol: codex, claude, gemini or opencode.
- **Model:** exact identifier accepted by that profile's configured provider. OpenCode uses provider/model.

Built-in backend IDs: codex → gpt/Codex CLI; claude → Claude/Claude Code; gemini → Gemini/Gemini CLI; kimi and glm → their respective families/OpenCode. Custom endpoints may change the real family behind a CLI: explicitly declare that profile rather than inferring diversity from the executable.

`--parent` identifies the current backend. Its adapter determines the suggested host invocation. A different backend defaults to external; a host that can select it natively may be used directly after checking actual tools. `--external` requests a concrete CLI route even for the parent.

## Modes

`auto` resolves to solo for one allowed family and duo for two. The default pool is the current backend. The coordinator can pass a known, authorized pair with `--families codex,claude`; the user does not need JSON. CLI installation is not permission to spend on a second provider.

`solo` requires one family, potentially several backend/model profiles. `duo` requires two families. All roles and reviewer slots stay inside the pool. An unavailable pinned executor is reported, never replaced. Without a hard pin, the coordinator can use an available executor inside the allowed pool. Review does not require two families.

A one-off `--backend` without an explicit mode/pool selects that backend for the call. It cannot override an explicit solo/duo boundary. Legacy `main-codex` and `main-claude` presets remain primary-backend preferences; new configurations should use mode/families.

## Optional JSON

Personal configuration: `~/.delegate-kit/config.json` (or `$DELEGATE_KIT_HOME/config.json`). Credentials remain in the provider CLI, never here. This configuration uses host defaults and requires no model IDs:

```json
{
  "mode": "duo",
  "families": ["codex", "claude"],
  "roles": {
    "implementer": { "backend": "codex" }
  },
  "preferences": {
    "reviewer": ["claude", "codex"],
    "ui": ["claude", "codex"]
  },
  "review": { "allow_multiple": false }
}
```

- `roles.<role>` is a **hard assignment**, with optional backend, model and effort. The coordinator must not autonomously override it. Explicit user instructions/per-call overrides take precedence.
- `preferences.<role>` and `preferences.ui` are ordered lists of backend IDs; unavailable/out-of-pool preferences are skipped. They do not guarantee a model's quality.
- `backends.<id>` declares family, adapter, optional model and supported `efforts` for that exact configured model. Omit effort to retain provider defaults. Gemini CLI does not expose a portable effort flag.
- To configure Kimi/GLM, set `backends.kimi.model` or `backends.glm.model` to a provider/model returned by the configured OpenCode catalog. Do not copy an obsolete model ID from a static example.
- A fast model can be a second profile of the same family. Put it in the allowed pool; choose it for the bounded researcher exception or assign the researcher explicitly.
- `review.allow_multiple: true` records standing permission for multiple reviewers; mode duo does not imply it.
- The old `roles.<role>.<backend>: [model, effort]` format is accepted during migration. Invalid configuration fails visibly; it does not silently restore shipped defaults.

Precedence for mode: per-call flag → DELEGATE_KIT_MODE → JSON → auto. Models: explicit call → role assignment → backend model → supplied parent model → native inheritance/CLI default. JSON never overrides a user's explicit session request; the coordinator carries that request in the call.

## Review and failure

`fresh_context_required` describes reviewer/verifier isolation. `cross_family` compares declared families, not CLI names. Neither is a statistical guarantee. The author backend is required when computing diversity; `self` resolves to the current parent.

Panel slots use complementary lenses. A hard reviewer backend assignment applies to all slots. Otherwise the route may alternate allowed families. Thresholds propose depth; an explicit depth reflects the user's grant, not permission the coordinator can grant itself.

Quota failures and missing credentials stop the external run. Inspect partial writes before a new attempt. The coordinator can choose another permitted executor and supply the previous result/worktree state; there is no automatic cross-provider retry. Resume keeps the saved adapter, family, model and effort even if routing configuration has changed.

Routes and run reports distinguish requested model, selection source and actual model. Unknown runtime identity stays null. A CLI success exit without a valid result object is a failed contract, not completed work.
