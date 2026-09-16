# Delegate Kit

Delegate Kit is an agent skill that lets your coding assistant delegate work to a team you choose. Save each specialist's model, tools and responsibilities in a named preset. Your current chat coordinates the work, collects results and checks them before accepting changes.

Use it when you want a researcher to investigate a bug, a separate worker to implement a fix, or a fresh reviewer to check it. Teams can use one model family or combine Codex, Claude Code and other supported tools. Small, understood tasks can stay in the current chat.

[![CI](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="assets/workshop.png" alt="A coordinator assigns work to researchers, builders and an independent reviewer." width="880">

## Install

```bash
npx skills add tomastaker/delegate-kit
```

Select the coding assistant where you want to use the skill. You need Node.js 20+ and the tools chosen for your team. Writers use Git worktrees, which also require Bash and jq. Sign in to each chosen tool separately. Delegate Kit does not include accounts or credentials.

For SSH work, install the skill and execution tools on the machine that runs the workers. Your local login does not authorize a remote machine.

## Start in your chat

Ask your assistant:

> Use Delegate Kit start. Help me configure my default team, starting from the main example.

Setup happens in conversation. The assistant checks installed tools, asks which models and reasoning levels to use, and helps describe when each specialist should be called. You can supply the whole team at once or answer a few questions at a time, in your own language.

The assistant shows the proposed configuration before saving it. The included [`main` preset](skills/delegate-kit/examples/main.json) is the default starting example. You can adopt it, change it or build a smaller team. Installation does not activate it automatically, overwrite existing presets or run paid model tests.

Once configured:

> Use Delegate Kit main to investigate this bug, implement the fix and review the result.

These are requests to the skill in your chat, not global terminal commands. The exact skill picker or slash-command syntax depends on your assistant.

## Requests you can make

| Request | What it does |
|---|---|
| `Delegate Kit start` | Walk through team setup |
| `Use Delegate Kit main` | Select `main` for this chat |
| `Use frontend only for this task` | Use another preset without changing the chat selection |
| `Create a preset called backend` | Build a separate team |
| `Copy main to frontend` | Create an independent copy |
| `Change frontend's UI implementer` | Edit one profile in that team |
| `Make main the default` | Choose the team for new chats |
| `Show my Delegate Kit presets` | List saved teams |

An explicit preset takes precedence over the chat selection, which takes precedence over the saved default. Switching teams never changes your chat's model. Existing workers keep the configuration they started with.

## How work gets assigned

A **preset** is a complete team. A **profile** describes one specialist, including its role, model and when to use it. A **worker** is a running instance of a profile. The same profile can handle several independent tasks, and one role can have several profiles.

The coordinator reads the profiles' descriptions and chooses the ones relevant to the task. You can also name a profile yourself. There is no fixed pipeline that runs every specialist:

- A clear fix can go straight to an implementer, followed by review.
- A bug with an unknown cause can start with research.
- A change with unresolved design choices can need a planner before implementation.
- Independent changes can run in parallel with separate ownership and worktrees.

Results return to the coordinator, which decides what happens next. Researchers and implementers do not start their own teams. Reviewers receive a fresh context with the specification and a fixed version of the changes.

There is no default one-worker limit. The coordinator chooses parallelism from the available independent work, subject to your configured limits and the host's capacity. Waiting does not launch another worker. Local health checks use no model calls, though processing status results still consumes coordinator tokens.

## The main preset

[`examples/main.json`](skills/delegate-kit/examples/main.json) is the English version of the maintainer's working team. All seven profiles use CLI execution.

| Profile | Model and reasoning | Assignment |
|---|---|---|
| `researcher` | Codex, GPT-5.6 Luna, medium | Bounded code and documentation lookup |
| `researcher-hard` | Codex, GPT-5.6 Sol, medium | Uncertain causes, interacting failures and complex investigations |
| `planner` | Codex, GPT-6 Astra, low | Approach, dependencies, ownership, risks and acceptance checks |
| `implementer` | Codex, GPT-5.6 Sol, medium | Features, fixes, tests and documentation |
| `implementer-ui` | OMP/OpenRouter, Qwen 3.8 Max, medium | Interfaces, components, interactions and responsive styling |
| `reviewer` | Codex, GPT-5.6 Sol, medium | Independent review of ordinary changes |
| `reviewer-hard` | Codex, GPT-6 Astra, high | Review of changes with a high cost of failure |

The two researchers are alternatives. So are the two reviewers. A difficult investigation does not have to pass through the basic researcher first. For example, the coordinator might select `researcher-hard` immediately for duplicate payment requests and `reviewer-hard` for the resulting fix.

Model availability and reasoning options depend on your account and execution tool. Setup checks those choices before adopting the example. You can use a Codex-only team, a Claude-only team, or a mixed team with independently chosen tools and models. There is no requirement to match the coordinator's model family.

The UI profile needs OMP and an authorized OpenRouter connection. Its current adapter restricts worker tools and does not supply browser automation or shell execution. The coordinator must perform the running-UI checks when the worker cannot. See [OMP setup](skills/delegate-kit/references/omp-setup.md) and the [compatibility table](skills/delegate-kit/references/compatibility.md).

## Make it yours

You do not need to edit JSON. For example:

> Copy main to backend. Remove the UI specialist. Use my configured Claude Code model for implementation. Keep the Codex reviewers. Ask me for any missing model or reasoning choices before saving.

Or describe a new specialist:

> Add a second researcher for database problems. Use it for query plans, transaction boundaries and migration investigations. Keep the ordinary researcher for other lookups.

Be specific about the work that distinguishes profiles. "Investigate intermittent failures across services" gives the coordinator more to work with than "use for hard tasks."

If you prefer editing files, each preset is one JSON document. A small team can look like this:

```json
{
  "schema_version": 2,
  "id": "research",
  "defaults": { "researcher": "researcher" },
  "agents": {
    "researcher": {
      "role": "researcher",
      "when": "Find relevant code, tests and documentation for a bounded question.",
      "instructions": "Return evidence and unresolved questions. Keep files unchanged.",
      "executor": {
        "harness": "codex",
        "model": "gpt-5.6-luna",
        "reasoning": "medium",
        "transport": "cli"
      }
    }
  }
}
```

`when` guides the coordinator's selection. `instructions` go to the worker with its task. `defaults` identifies the usual profile for a role. Optional `coordination` text describes team-wide choices. A required additional reviewer can be configured through `review.also_run`. See the [schema](skills/delegate-kit/assets/preset.schema.json) and [setup reference](skills/delegate-kit/references/setup.md).

Saved configuration lives outside the installed skill:

```text
~/.delegate-kit/
  settings.json
  presets/main.json
  presets/backend.json
```

Run state and session selections live under the same root. Set `DELEGATE_KIT_HOME` to use another directory. Skill updates leave your presets intact. Preset IDs are case-sensitive; names that differ only by case cannot coexist. Copies are independent, and edits check the previous revision to prevent overwriting another change.

## Supported tools and limits

CLI adapters are implemented for Codex, Claude Code, Gemini, OpenCode, Pi and OMP. Native Codex/Claude and Paseo use host bridges that require compatible tools in the current environment. The [compatibility table](skills/delegate-kit/references/compatibility.md) separates implemented routes from fixture tests, local protocol checks and real model runs. Support does not mean every route has been tested against a live account.

The runtime preserves the selected tool, provider, model and reasoning settings. Unsupported combinations fail explicitly. It can resume the same worker session for a specific correction; independent review starts a new session. A timeout alone does not trigger a replacement or change models.

Writers use isolated worktrees, but worktrees are not a security sandbox. Tool restrictions depend on the execution environment. The coordinator checks results before accepting them, and cancelled work keeps its partial changes available for inspection.

## Reference

- [Setup and preset management](skills/delegate-kit/references/setup.md)
- [Runtime commands, limits and recovery](skills/delegate-kit/references/routing.md)
- [CLI execution](skills/delegate-kit/references/external.md)
- [Native agents and Paseo](skills/delegate-kit/references/hosts.md)
- [Providers and tool restrictions](skills/delegate-kit/references/providers.md)
- [Independent review](skills/delegate-kit/references/review.md)

For terminal use, invoke `node /path/to/delegate-kit/scripts/dk.mjs help` using the installed skill path. There is no globally installed `dk` command.

## Upgrading from v1

Ask your assistant to run the migration dry run first. It reports choices that need your input before converting the old configuration to complete presets. Applying the migration creates backups and preserves edited v2 presets. [Migration instructions](skills/delegate-kit/references/migration.md).

The old execution helpers and optional hooks remain for compatibility. New v2 CLI use does not require installing global hooks or static native roles.

## Development

The installable skill is in `skills/delegate-kit`. Tests live outside it in [`tests`](tests), so they do not travel with the installed skill. Run the local checks without calling a model:

```bash
bash tests/route.sh
bash tests/caps.sh
bash tests/gate.sh
bash tests/inspect.sh
bash tests/delivery.sh
```

[Behavioral checks and the opt-in live test](tests/behavioral.md) cover what deterministic tests cannot establish. Live tests require account authorization and are not part of CI.

## License and credits

[MIT](LICENSE). Review practices draw from [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Git coordination was informed by [Hyperskills](https://github.com/hyperb1iss/hyperskills) and [Superpowers](https://github.com/obra/superpowers). Artwork was inspired by [ponytail](https://github.com/DietrichGebert/ponytail).
