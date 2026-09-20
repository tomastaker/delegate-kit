# Delegate Kit

Give routine work to economical AI specialists and keep your strongest model focused on decisions that need it. Delegate Kit helps your current assistant choose the right workers, coordinate their work and verify the result — using a team you define in Markdown.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="assets/workshop.png" alt="A coordinator assigns work to researchers, builders and an independent reviewer." width="880">

## Why use it?

- **Your team, your models.** Define specialists for research, planning, implementation and review in Markdown.
- **Economical delegation.** Assign straightforward work to suitable lower-cost profiles, even within a complex project. Stronger models handle work that needs them.
- **Flexible execution.** Prefer native subagents when they match the profile; otherwise use an available CLI or service. No fixed pipeline or required number of workers.
- **Checked outcomes.** Workers verify their changes; the coordinator checks integration and arranges independent review of the completed result.

Define your team once, then use it for research, implementation and review across environments with suitable delegation tools.

## Install

Use the [Skills CLI](https://github.com/vercel-labs/skills), or copy `skills/delegate-kit/` into your assistant's supported skill directory:

```bash
npx skills add tomastaker/delegate-kit
```

The skill needs no runtime of its own. Executors and their authorization must already be available in your environment.

## Choose your team

| File | Purpose |
| --- | --- |
| [team.md](skills/delegate-kit/team.md) | Empty default team for your profiles. |
| [team.example.md](skills/delegate-kit/team.example.md) | Generic template to copy and adapt. |
| [gpt-team.md](skills/delegate-kit/gpt-team.md) | Eight Codex profiles using GPT-5.6 Luna, GPT-5.6 Sol and GPT-6 Astra, with reasoning and access preferences. |

Each profile describes when to use it, its executor and its model. Add reasoning, access preferences or launch instructions when needed; a fixed launch command is optional. Only the selected team is loaded.

Keep a personal team file outside the installed skill to preserve settings across updates. Name its path in your request or standing instructions. You can also ask the assistant to help configure it. Model availability and access modes depend on the execution environment.

## Use

> Use Delegate Kit with its bundled gpt-team.md. Investigate this bug, implement the fix and verify the result.

For your own team, replace `its bundled gpt-team.md` with `my team at /absolute/path/to/team.md`. Without a selection, the skill reads the default `team.md`.

The current assistant remains the coordinator. It chooses useful assignments, runs independent work in parallel when appropriate, and collects the results. Research and planning are optional; small tasks can stay in the current chat. Review corrections focus on confirmed defects.

## Portability

The skill uses the [Agent Skills format](https://agentskills.io/specification). Use it in an environment that can read the files and launch the selected specialists. The harness's tools determine available routes, regardless of the coordinator's model family. Unavailable models are reported rather than silently substituted.

Markdown instructions do not enforce runtime guarantees. Cross-harness model launches have not been validated; see [checks and limitations](docs/verification.md). The local [quality rules](skills/delegate-kit/quality.md) adapt [Quality Policy](https://github.com/tomastaker/quality-policy/blob/e1656ded733d24f1c6d0ef51faf3a560dcb3253d/SKILL.md), with no external skill dependency.

## Contributing

Run `python3 docs/check_package.py` locally to check package layout, metadata and local links.

[MIT](LICENSE). Review practices also draw from [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Artwork was inspired by [ponytail](https://github.com/DietrichGebert/ponytail).
