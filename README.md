# Delegate Kit

Delegate Kit lets your coding assistant delegate work to a team you choose. A named preset defines each specialist's model, tools and responsibilities. Your current chat coordinates the work and checks the result.

Use it for research, implementation and independent review. Small, understood tasks can stay in the current chat. Teams can use one model family or combine supported tools.

[![CI](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="assets/workshop.png" alt="A coordinator assigns work to researchers, builders and an independent reviewer." width="880">

## Install and start

```bash
npx skills add tomastaker/delegate-kit
```

Select your coding assistant. You need Node.js 20+, Git and the execution tools chosen for your team; the worktree helper also needs Bash and jq. Sign in to each tool separately. For remote work, install and authorize the tools on the machine running the workers.

Then ask in your chat:

> Use Delegate Kit start. Help me configure my default team, starting from the main example.

The assistant checks available tools, gathers model and reasoning choices, and shows the configuration before saving it. You can adopt the [main example](skills/delegate-kit/examples/main.json), adapt it or build a smaller team. Installation does not activate the example, overwrite saved presets or run paid model tests.

Once configured:

> Use Delegate Kit main to investigate this bug, implement the fix and review the result.

These are chat requests, not global terminal commands. Your current chat keeps its model.

## How work proceeds

A **preset** is a team. A **profile** describes one specialist and when to use it. A **worker** is a running instance of that profile. Profile IDs are yours to choose; several implementers or researchers can share a role with different instructions.

The coordinator selects relevant profiles rather than running every specialist. Research and planning are optional. Independent changes can run in parallel with separate ownership and worktrees; dependencies and shared resources such as databases or ports must be coordinated.

Managed implementation follows one process:

1. **Describe the task:** expected behavior, editable scope, profiles, checks and required review.
2. **Run scoped workers:** each writer uses an isolated worktree. A short correction can continue the same worker session.
3. **Integrate and check:** `task check` collects completed results, freezes review material and runs declared checks in the prepared integration workspace, with a workspace lease and source-version checks.
4. **Review independently:** fresh read-only reviewers examine the frozen specification and code.
5. **Accept the task:** `task accept` checks submissions, test evidence and review findings together.

The runtime fills mechanical contract fields and tracks versions. Workers return only the fields relevant to their role. Standalone read-only research needs a brief rather than an implementation contract. See the [task example and commands](skills/delegate-kit/references/tasks.md).

Substantial final code requires independent review. A worker may report “done” only after its assigned mandatory checks pass. These structured worker claims do not replace independent runtime evidence or task acceptance. Unchanged checkpoints can reuse intact check evidence; code changes require fresh checks and review. A false finding can be refuted with a suitable check or concrete frozen source lines. Explicitly authorized exceptions remain visible as exceptions.

Repeated semantic failures prompt reassessment without a mandatory model switch; only explicit failure limits block further submissions; transport failures and internal test iterations do not count. Models and accounts are never silently substituted. Optional economy tiers restrict eligible work, but do not select an executor or balance subscription limits.

The coordinator reports actual launches, meaningful progress, available usage and blockers without repeating an unchanged roster. Accounting includes all worker/reviewer attempts, separates shell estimates by payment mode, and marks unavailable costs and coordinator usage explicitly. Waiting never launches another worker, and cancellation preserves partial changes. Worktrees coordinate writers; they are not a security sandbox.

## Configure your team

You can configure everything in conversation:

| Request | Result |
|---|---|
| `Use Delegate Kit main` | Select a team for this chat |
| `Use frontend only for this task` | Override the selection for one task |
| `Copy main to backend` | Create an independent preset |
| `Add a database implementer with different instructions` | Add another specialist |
| `Change frontend's UI implementer` | Edit one profile |
| `Make main the default` | Select the team for new chats |
| `Show my Delegate Kit presets` | List saved teams |

An explicit choice wins over the chat selection, then the saved default. Existing workers keep the settings they started with. Describe what distinguishes specialists: “Investigate intermittent failures across services” is more useful than “Use for hard tasks.”

For direct JSON editing, see the [preset schema](skills/delegate-kit/assets/preset.schema.json) and [setup guide](skills/delegate-kit/references/setup.md). `when` guides selection; `instructions` go to the worker; `defaults` names a usual profile for a role. `review.also_run` configures mandatory additional reviewers.

Presets and runtime state live outside the installed skill, under `~/.delegate-kit/` by default. Each team is a separate `presets/NAME.json`; `settings.json` holds the default selection. Set `DELEGATE_KIT_HOME` to use another directory. Skill updates preserve saved presets.

## The main example

The bundled [main preset](skills/delegate-kit/examples/main.json) contains nine CLI profiles:

| Profile | Configured executor | Assignment |
|---|---|---|
| `researcher` | Codex, GPT-5.6 Luna, medium | Bounded code and documentation lookup |
| `researcher-hard` | Codex, GPT-5.6 Sol, medium | Complex or uncertain investigations |
| `planner` | Codex, GPT-6 Astra, low | Approach, dependencies, ownership and checks |
| `implementer-economy` | Codex, GPT-5.6 Luna, medium | Determined, bounded ordinary-risk work with behavioral checks |
| `implementer` | Codex, GPT-5.6 Sol, medium | Features, fixes, tests and documentation |
| `implementer-max` | Codex, GPT-6 Astra, medium | Uncertain implementation or invariants with costly failures |
| `implementer-ui` | OMP/OpenRouter, Qwen 3.8 Max, medium | Interfaces and responsive styling |
| `reviewer` | Codex, GPT-5.6 Sol, medium | Independent review of ordinary changes |
| `reviewer-hard` | Codex, GPT-6 Astra, high | Review of changes with costly failure modes |

Profiles are starting choices, not mandatory sequences or fixed model-to-tier bindings. Replace models or add multiple specialists at any tier. Setup checks model availability and reasoning support before adopting the example. You may use a smaller, Codex-only, Claude-only or mixed team.

The UI profile needs OMP and an authorized OpenRouter connection. The example exposes Bash explicitly. Its OMP command approvals, project browser checks and test environment must be configured before implementation; unavailable checks block submission. Saved presets retain their original permissions. See [OMP setup](skills/delegate-kit/references/omp-setup.md).

## Supported execution and reference

CLI adapters cover Codex, Claude Code, Gemini, OpenCode, Pi and OMP. All coordinators use the same CLI/RPC path when they have shell access to the execution machine. Native/Paseo dispatch is retired; saved settings are never silently converted. The [compatibility table](skills/delegate-kit/references/compatibility.md) distinguishes automated fixtures from live testing; implementation does not imply validation against every live account.

- [Task contracts, checks and acceptance](skills/delegate-kit/references/tasks.md)
- [Selection, limits and recovery](skills/delegate-kit/references/routing.md)
- [CLI execution](skills/delegate-kit/references/external.md) and [legacy host migration](skills/delegate-kit/references/hosts.md)
- [Team status reporting](skills/delegate-kit/references/observability.md)
- [Provider restrictions](skills/delegate-kit/references/providers.md) and [independent review](skills/delegate-kit/references/review.md)

For terminal use, run `node /path/to/delegate-kit/scripts/dk.mjs help`. There is no global `dk` command. Only the current workflow is shipped; the v1 launcher, migration tools and static native-role installer have been removed.

## Development

The installable skill is in `skills/delegate-kit`; tests stay outside it. Run local checks without calling a model:

```bash
bash tests/route.sh
bash tests/gate.sh
```

[Behavioral checks and the opt-in live test](tests/behavioral.md) cover what fixtures cannot establish. Live tests require account authorization and are not part of CI.

## License and credits

[MIT](LICENSE). Review practices draw from [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Git coordination was informed by [Hyperskills](https://github.com/hyperb1iss/hyperskills) and [Superpowers](https://github.com/obra/superpowers). Artwork was inspired by [ponytail](https://github.com/DietrichGebert/ponytail).
