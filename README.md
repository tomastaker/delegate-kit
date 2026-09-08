<div align="center">

# Delegate Kit

**Your agent coordinates. Your chosen models do the work.**

[![CI](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="assets/workshop.png" alt="A foreman coordinates a scout, a planner, two independent builders and an inspector in a miniature workshop." width="880">

</div>

Delegate Kit is a skill for coding agents that turns a substantial task into scoped work, assigns it to the models you choose, and checks the result. Your current chat stays in charge: it decides what to delegate, accepts the work and integrates the changes.

- **Use your own team.** Assign a model and reasoning level to each role, with stronger options when needed.
- **Mix native and external workers.** GPT can implement natively while Claude plans and reviews through its CLI. Use OpenCode for configured Kimi or GLM models.
- **Make useful work parallel.** Independent tasks run together; coupled changes stay with one owner. The coordinator chooses the number of workers within your limits and the host's capacity.
- **Check the result independently.** Writers use separate git worktrees. Reviewers start with a fresh context and the specification.
- **Keep overhead proportionate.** Small work stays in the chat. Clarify a weak brief or strengthen the model when the evidence calls for it.

## Get started

```bash
npx skills add tomastaker/delegate-kit
```

Then ask your coding agent:

> Use Delegate Kit to implement this feature. Delegate useful independent work and verify the result.

No configuration is required: workers inherit the current model where the host supports native agents. To use other models or CLIs, choose them explicitly in your request or save the profiles below. Installing a CLI alone does not authorize its use.

Native delegation requires the host's subagent tools. External execution requires Node 20+, bash, git, jq and an authenticated supported CLI. [Execution paths and restrictions](skills/delegate-kit/references/providers.md).

<details>
<summary>Native role installation and upgrading</summary>

After installing the skill, run its `hooks/install.sh --dry-run`, then `hooks/install.sh` to install native role definitions and the optional shell gate. From a repository checkout:

```bash
skills/delegate-kit/hooks/install.sh --dry-run
skills/delegate-kit/hooks/install.sh
```

Use `--agents-only`, `--hooks-only`, `--claude` or `--codex` to select what is installed. Upgrading an older installation removes managed model pins so role profiles can choose the model. Unrelated configuration is preserved and backups are made. Restart affected sessions.

To uninstall the managed hooks and roles, run `hooks/uninstall.sh` from the installed skill, then remove your skill links. Run records remain available.

</details>

## Four roles, one coordinator

| Role | What it returns | When it helps |
|---|---|---|
| **Researcher** (`researcher`) | Facts, relevant code and source evidence | A bounded search can be done independently |
| **Planner** (`planner`) | Tasks, dependencies, ownership and acceptance checks | The task needs meaningful decomposition or clarification |
| **Implementer** (`implementer`) | Scoped changes and executed checks | A complete outcome deserves its own worker |
| **Reviewer** (`reviewer`) | Findings against the diff and specification | The result needs an independent check |

The coordinator selects ready tasks, writes briefs, handles blockers and accepts results. It can work directly when delegation would cost more than it helps. A separate planner is optional. Reviewers see the specification and frozen diff without the author's conversation or each other's findings.

An occasional **finding verifier** resolves disputed findings; a **review lead** helps organize a substantial review. They reuse the reviewer and planner model ladders unless you configure them separately.

## Choose your models in one file

Edit **`~/.delegate-kit/config.json`**. Each profile describes the team to use when that family is coordinating. A GPT chat selects `profiles.gpt`; a Claude chat selects `profiles.claude`; a Kimi chat selects `profiles.kimi`. The chat model itself stays unchanged.

Each role is an ordered list. **The first entry is the usual choice; later entries are available strengthening steps.** These are alternatives, not agents all launched together.

Here is a GPT-led team with native GPT implementers and external Claude planning and review:

```json
{
  "profiles": {
    "gpt": {
      "roles": {
        "researcher": [
          { "model": "gpt-5.6-luna", "effort": "high" },
          { "model": "gpt-6-astra", "effort": "low" }
        ],
        "planner": [
          { "family": "claude", "runner": "claude", "model": "fable", "effort": "high" }
        ],
        "implementer": [
          { "model": "gpt-6-astra", "effort": "low" },
          { "model": "gpt-6-astra", "effort": "high" }
        ],
        "reviewer": [
          { "family": "claude", "runner": "claude", "model": "opus", "effort": "high" }
        ]
      }
    }
  }
}
```

These model names illustrate a personal setup, not required dependencies or a quality ranking. Replace them with identifiers available in your host or configured CLI. Only use effort values that the chosen model and execution path support; omit `effort` when it cannot be set.

[Open the complete editable example](skills/delegate-kit/examples/config.json), which includes all three profiles:

| Coordinator | Research | Planning | Implementation | Review |
|---|---|---|---|---|
| GPT | Luna → Astra, native | Fable through Claude CLI | Astra low → high, native | Opus → Fable through Claude CLI |
| Claude | Sonnet → Opus, native | Fable, native | Opus medium → high, native | Astra through Codex CLI |
| Kimi | Current Kimi model, native | Astra through Codex CLI | Current Kimi model, native | GLM through OpenCode |

The Kimi example inherits your current native model instead of guessing its identifier. It requires a host with native worker support. Replace `YOUR_PROVIDER/YOUR_GLM_MODEL` with the exact identifier shown by `opencode models`. Copy the profiles you want and keep only models you permit the coordinator to use. Configuration never installs a model or changes provider credentials.

### Native or external?

| Entry | Meaning |
|---|---|
| `{ "model": "gpt-6-astra", "effort": "low" }` in the GPT profile | Prefer a native worker in the current family |
| `{ "runner": "native" }` | Require a native worker and inherit its model; report unavailable native support |
| `{ "family": "claude", "runner": "claude", "model": "opus" }` | Start an external Claude Code process |
| `{ "family": "gpt", "runner": "codex", "model": "gpt-6-astra" }` | Start an external Codex CLI process, even from a GPT chat |
| `{ "family": "glm", "runner": "opencode", "model": "YOUR_PROVIDER/YOUR_GLM_MODEL" }` | Start the configured GLM model through OpenCode |

`family` describes the model; `runner` describes how it executes. Omitted `family` means the coordinator's family. Omitted `runner` means `auto`: use native support when the host has it, otherwise the family's supported CLI. The coordinator checks actual capabilities; same family alone does not prove that a host can spawn workers or set their reasoning effort.

One profile can use any number of families. A request such as “GPT only for this task” restricts the saved team for that task; unavailable or excluded assignments are surfaced for deliberate selection, never silently replaced. [Configuration precedence, capabilities and migration](skills/delegate-kit/references/routing.md).

## When a worker needs help

The coordinator inspects the result before deciding what to do next:

- **The brief was incomplete or the omission is small:** clarify and continue with the same worker.
- **The reasoning was insufficient:** choose a stronger configured level and hand a fresh worker the current state, useful changes and remaining checks.
- **Tools or access are missing:** resolve the environment problem.

A difficult task may start at a stronger level immediately. Changing the model or effort starts a fresh worker; a resume preserves its original executor. The previous writer must stop and release ownership before a replacement continues. Every repair attempt needs a reason; the ladder is never an automatic retry loop.

## Parallelism and limits

The coordinator weighs independent work, context transfer, expected quality and checking effort. It uses task evidence and observed progress, without looking up API prices or estimating a token invoice. More workers are useful only while they improve the expected result.

There is no fixed kit-wide worker count. To set your own hard limits, add this optional section beside `profiles`:

```json
{
  "limits": {
    "max_workers": 6,
    "max_writers": 3,
    "max_runs": 20,
    "max_retries": 2
  }
}
```

These numbers are examples, not defaults. `max_workers` and `max_writers` cap known concurrent workers; `max_runs` counts starts and resumes per task; `max_retries` counts repair attempts per ticket. The host's own limits still apply. The coordinator records native starts and resumes in the same lightweight counter that external runs use automatically. Native read-only concurrency remains supervised by the host/coordinator, since it has no worktree lock.

Without configured limits the coordinator still tracks progress and reassesses repeated attempts. The counter records calls, not a monetary budget. Full native token usage may be unavailable. [Counter commands and exact limits](skills/delegate-kit/references/routing.md#task-counters-and-limits).

## Inspect a route without calling a model

From a checkout:

```bash
skills/delegate-kit/scripts/agent-run doctor
skills/delegate-kit/scripts/agent-run route --parent codex --role implementer
skills/delegate-kit/scripts/agent-run route --parent claude --role implementer
skills/delegate-kit/scripts/agent-run route --parent kimi --role reviewer --author-backend self
skills/delegate-kit/scripts/agent-run route --parent codex --role implementer --level 2
```

The output identifies the profile, role level, requested model, reasoning and native or external route. `doctor` detects installed CLIs; it does not test authentication or model access. Use `agent-run --help` for run, resume, budget and status commands, and `agent-wt --help` for worktrees and ownership.

## Guarantees and limits

Worktrees prevent competing writers from owning the same checkout; they are not security sandboxes. Adapter permissions differ. Some read-only workers cannot execute shell checks, so the coordinator runs those checks and reports what remains unverified.

A fresh reviewer and a different model family can provide useful checks; neither guarantees correctness. The coordinator verifies findings and acceptance criteria. Live Gemini, Kimi and GLM execution has not been validated for this release; adapter tests use fixtures. The historical [seeded review experiment](bench/seeded-review/README.md) is evidence from one setup, not a universal model ranking.

<details>
<summary>Local checks — no model calls</summary>

```bash
bash skills/delegate-kit/tests/route.sh
bash skills/delegate-kit/tests/caps.sh
bash skills/delegate-kit/tests/gate.sh
bash skills/delegate-kit/tests/inspect.sh
bash skills/delegate-kit/tests/delivery.sh
```

</details>

## License and acknowledgments

MIT. Review lenses and the standards baseline draw from [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Host dispatch and git coordination were informed by [Hyperskills](https://github.com/hyperb1iss/hyperskills); scoped ownership by [Superpowers](https://github.com/obra/superpowers). The original artwork was inspired by [ponytail](https://github.com/DietrichGebert/ponytail).
