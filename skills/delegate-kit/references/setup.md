# Conversational setup and help

Read this for start/help/create/copy/edit, not every delegation. The current chat stays coordinator. A team may contain one specialist; neither all roles nor multiple providers are required.

1. Run `node <skill>/scripts/dk.mjs doctor`. It checks versions without model calls. Describe installed, authorized, supported and live-tested separately. Discover exact models and reasoning through the configured executor model discovery. Do not read secrets into the conversation.
2. Ask for the missing preset ID and authorized execution routes. Offer a small team and discuss specialists' general purposes. Ask a small group of questions at a time. Avoid ranking models or treating an installed CLI as consent to use an account.
3. For each profile capture role, `when`, exact executor and optional persistent instructions. Explain access/tool limitations and configure the required execution permissions explicitly (see [CLI access](external.md#explicit-execution-access)). Optional `executor.billing` records a known `api` or `subscription` payment mode; leave it absent/`unknown` when unconfirmed. It does not turn token-price estimates into bills. Additional specialists use different IDs inside the same JSON. An optional planner is for independent analysis, not the host's plan mode. For a required second reviewer, add `review.also_run` only to a read-only reviewer profile; every member receives the same already-frozen material. Implementer-to-reviewer sequencing is coordinated after implementation, not encoded as `also_run`.
4. Show the resulting team or a meaningful edit diff. Once confirmed or already explicitly requested, write a temporary complete JSON, validate, then save with the runtime. Ask about default only if its change was not part of the request. Do not require the human to edit JSON.
5. Return the saved ID and a natural next request, e.g. “Use Delegate Kit with Y2 for this task.” Run a live model smoke test only if authorized.

The user can say “Create X1”, “Copy X1 to Y2”, “Use Y2”, “Make X1 default”, or “Replace Y2's researcher”. These are semantic requests for the skill. Host invocation syntax differs; a global shell alias is optional and is not installed.

[main.json](../examples/main.json) is the default starting example, based on the maintainer's working team. It includes two researchers, a planner, four implementers and two reviewers, using Codex and OMP/OpenRouter. Offer `main` as the new preset ID unless the user chooses another name. Discuss the example before adopting it: preserve supplied choices, verify exact model/reasoning support and authorization, and adapt unavailable routes with the user's input. Setup must not silently substitute models or overwrite an existing preset. When the user asks to adopt this default, save the agreed preset and select it as the default for new chats. Installation alone does not activate accounts or copy the example into user state.

Profiles sharing a role are alternatives selected by their `when` descriptions, unless a required review set is explicitly configured. The coordinator decides the sequence; a researcher does not launch another worker. Users can describe profiles and conditions in their own language. For an explicitly requested OMP installation/setup, read [omp-setup.md](omp-setup.md).

## Operations for the coordinator

Use an absolute installed skill path; examples below use `<dk>` for `node <skill>/scripts/dk.mjs`.

```
<dk> presets list
<dk> presets show X1
<dk> presets validate --file /tmp/team.json
<dk> presets save --file /tmp/team.json
<dk> presets copy X1 Y2
<dk> presets set-default X1
```

For editing, `show` returns `preset` and `revision`. Edit a complete copy and use `save --file ... --revision <old-revision>`. If another edit won, reload and reconcile; never silently overwrite. Copy refuses an existing destination. Uppercase IDs are supported; IDs are case-sensitive and X1/x1 collisions are refused on every filesystem. Display names can be Unicode. Secrets, arbitrary executables and callbacks are not configuration fields.

[examples/config.json](../examples/config.json) is a template with intentionally rejected model placeholders. Replace them with verified user choices. [preset.schema.json](../assets/preset.schema.json) describes the file shape; runtime validation also checks references, cycles, collisions and placeholders. Unknown roles default to read-only; explicit `access: "workspace-write"` requires an isolated workspace.

## Files and installation

`DELEGATE_KIT_HOME` overrides `~/.delegate-kit`. `settings.json` holds `schema_version: 2` and optional `default_preset`. Each `presets/ID.json` contains its whole team. Hashed `sessions/` folders and `runs/` snapshots are runtime state, not more user configuration. Updates to the installed skill do not overwrite them.

Install the `skills/delegate-kit` directory as one Agent Skill. Node 20+ runs v2 without package dependencies. Git is needed for worktrees; the retained `agent-wt` helper also requires Bash and jq. Install/authorize only the chosen executors on the machine that will run them. The skill does not install CLIs, sync credentials, create remote infrastructure, or provide shell access to cloud-only chats.

The repository supports `npx skills add tomastaker/delegate-kit`; installations from the default branch use the latest merged version. To test unpublished changes, copy this entire skill directory to an isolated host skill location. Preserve the existing installation before replacing it. Optional gate hooks use `hooks/install.sh --dry-run` and the corresponding uninstall script; CLI execution needs no global hooks or static roles. New dispatch uses CLI/RPC only. For saved native/Paseo presets or unfinished runs, follow [legacy migration](hosts.md). Optional hooks remain a separate opt-in policy; they are not required by the runtime.

## Optional routing tiers

Offer economy, standard and optional hard as assignment choices, not model rankings. A bounded low-risk implementation with a meaningful verifier can use an economy profile; standard remains the ordinary implementation choice. Hard can handle critical invariants directly and is never required for preset validity. Also offer an economy researcher for bounded source collection when useful. Names such as `implementer-economy` are examples; persist the optional `routing.tier` declaration on the chosen profile regardless of its ID.

The bundled starting choices are Luna for `implementer-economy`, Sol for `implementer` and Astra for `implementer-max`. Offer them for adoption with the rest of the example; validate supported executor settings before saving. Users may replace any model or add several specialists at one tier. Preserve existing saved presets; adopting or updating the example never silently edits them. One model may serve multiple tiers. Teams without tiers, extra researchers, hard profiles or diverse model families remain valid. Measure cost per accepted task with verification and rework before proposing tuning; incomplete usage remains unknown and small samples never rewrite presets automatically.
