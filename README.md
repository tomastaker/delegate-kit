# Delegate Kit

Give routine work to economical AI specialists and keep your strongest model focused on decisions that need it. Delegate Kit helps your current assistant choose the right workers, coordinate their work and verify the result — using a team you define in Markdown.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="assets/workshop.png" alt="A coordinator assigns work to researchers, builders and an independent reviewer." width="880">

## Why use it?

- **Your team, your models.** Define specialists for research, planning, implementation and review in Markdown.
- **Economical delegation.** Assign straightforward work to suitable lower-cost profiles, even within a complex project. Stronger models handle work that needs them.
- **Predictable execution.** Each model has one launch route on your subscription: native for the coordinator's family, the vendor CLI for the other. No fixed pipeline or required number of workers.
- **Checked outcomes.** Workers verify their changes; the coordinator checks integration and arranges independent review of the completed result.

Define your team once, then use it for research, implementation and review across environments with suitable delegation tools.

## Install

Use the [Skills CLI](https://github.com/vercel-labs/skills), or copy `skills/delegate-kit/` into your assistant's supported skill directory:

```bash
npx skills add tomastaker/delegate-kit
```

The skill needs no runtime of its own. Executors and their authorization must already be available in your environment.

## Your team

[team.md](skills/delegate-kit/team.md) holds one mixed team: GPT-6 Luna, Sol and Astra with Claude Opus 5.5, and Fable 5.1 for exceptional planning or escalation. Each role lists a GPT and a Claude option of equal standing. Work goes to the family other than the coordinator's, which spreads usage across both subscriptions and keeps review cross-family. High-risk changes get a parallel review from both families.

Each model has a fixed launch route: the coordinator's own family runs natively, the other family runs from the terminal through `codex exec` or `claude -p` on the user's subscription. Plugins, API keys and third-party providers are not used.

Edit `team.md` to change roles or models. To use a different team for a task, name its path in the request.

## Use

> Use Delegate Kit. Investigate this bug, implement the fix and verify the result.

The skill reads the bundled `team.md`. To use another team, name it: `Use Delegate Kit with my team at /absolute/path/to/team.md`.

The current assistant remains the coordinator. It chooses useful assignments, runs independent work in parallel when appropriate, and collects the results. Research and planning are optional; small tasks can stay in the current chat. Review corrections focus on confirmed defects.

## Portability

The skill uses the [Agent Skills format](https://agentskills.io/specification). Use it in an environment that can read the files and launch the selected specialists. Routes follow the coordinator's model family as described in the team file. Unavailable models are reported rather than silently substituted.

Markdown instructions do not enforce runtime guarantees. Cross-harness model launches have not been validated; see [checks and limitations](docs/verification.md). The local [quality rules](skills/delegate-kit/quality.md) adapt [Quality Policy](https://github.com/tomastaker/quality-policy/blob/e1656ded733d24f1c6d0ef51faf3a560dcb3253d/SKILL.md), with no external skill dependency.

## Contributing

Run `python3 docs/check_package.py` locally to check package layout, metadata and local links.

[MIT](LICENSE). Review practices also draw from [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Artwork was inspired by [ponytail](https://github.com/DietrichGebert/ponytail).
