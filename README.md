# Delegate Kit

Keep your strongest model as the coordinator and give the rest of the work to subagents on the cheapest model that does it well. Delegate Kit is a short orchestration policy for your current assistant: when to do work itself, when to split it across parallel subagents, which model tier each assignment needs, and how to accept the combined result.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="assets/workshop.png" alt="A coordinator assigns work to researchers, builders and an independent reviewer." width="880">

## Why use it?

- **Balanced cost.** The skill aims between two extremes: one overloaded agent that works for hours until its context compacts, and a swarm of dozens of agents that multiplies cost. Light models take scoped search, log reading, test runs and spec-exact edits; strong models take implementation, debugging and review. The most expensive models run only when you name them.
- **Right-sized, parallel work.** Small work and short dependent chains stay with the coordinator. Larger tasks are split before launch into assignments that finish without context compaction, each noting what must finish before it can start. Everything unblocked runs in parallel (up to six at a time by default), and when an assignment finishes, the work it unblocks starts at once. Shared pieces such as an API contract are settled first; overlapping writers get separate branches or worktrees. The split aims at the best return, not at the most agents.
- **Explicit models.** Every launch sets the model and effort, because native subagent tools otherwise inherit the coordinator's model.
- **Any harness, any family.** The skill states what a launch must control, not a fixed command. It uses what your environment offers: native subagents in Claude Code or Codex, an app orchestrator such as T3 Code, or the other family's CLI as a fallback. The coordinator can be Claude or GPT.
- **Checked outcomes.** Workers check their own work by your and your project's rules and return evidence; the coordinator accepts on that evidence. Large features, branches and pull requests also get an independent review by a strong model that did not write the code.

## Install

Use the [Skills CLI](https://github.com/vercel-labs/skills), or copy `skills/delegate-kit/` into your assistant's supported skill directory:

```bash
npx skills add tomastaker/delegate-kit
```

The skill needs no runtime of its own. The models and tools it launches, and their authorization, must already be available in your environment.

## Use

The assistant loads the skill on its own when a task splits into independent parts, needs reading many files or sources, is too large for one session, or needs an independent review of a large change. When those criteria hold, it delegates without asking; installing the skill is your standing consent for that. You can also ask directly:

> Use Delegate Kit. Implement the export feature from the spec and verify it.

Change the defaults for one task in the request, for example "use GPT for the small work" or "skip the independent review".

Subagents never orchestrate on their own: a worker delegates only when its brief grants it, with a limit.

## Your team

[team.md](skills/delegate-kit/team.md) holds the model tiers:

| Tier | Claude | GPT |
| --- | --- | --- |
| light | Haiku 5.5 | GPT-6 Luna |
| strong | Opus 5.5 | GPT-6.1 Sol |
| manual only | Fable 5.1 | GPT-6 Astra |

Effort stays at `medium`, `high` or `xhigh`; `max` and `ultra` run only on request. By default, subagents come from the coordinator's own family through the native route; the other family is used when you ask, when your own limits run out, or for a second review of a high-risk change. Launches use your existing logins; a route that bills an API key or another account needs your approval.

To keep personal settings across updates, keep your own team file outside the installed skill and name its path in your request or standing instructions; it replaces the bundled one.

## Portability

The skill uses the [Agent Skills format](https://agentskills.io/specification); Codex reads its invocation policy from `agents/openai.yaml`. Available routes depend on the harness's tools, not on the coordinator's model. Unavailable models are reported rather than silently substituted.

Markdown instructions do not enforce runtime guarantees. See [checks and limitations](docs/verification.md) for the model comparison and live runs behind the defaults, and for what is not yet verified.

## Contributing

Run `python3 docs/check_package.py` locally to check package layout, metadata and local links.

[MIT](LICENSE). Review and task-splitting practices also draw from [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Artwork was inspired by [ponytail](https://github.com/DietrichGebert/ponytail).
