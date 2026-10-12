# Delegate Kit

Do the work in one agent while it fits one context, and coordinate subagents by measured rules when it does not. Delegate Kit is a short orchestration policy for your current assistant: when to do work itself, when to split it across parallel subagents, which model each assignment needs, how to brief a reviewer, and what to do with the findings.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="assets/workshop.png" alt="A coordinator assigns work to researchers, builders and an independent reviewer." width="880">

## Why use it?

- **Solo first.** Work that one agent finishes in one context, up to about an hour or about three thousand changed lines, stays with the coordinator. At that size delegation was measured to cost about 40% more for little or no time saved.
- **Right-sized, parallel work.** Larger tasks are split where the parts touch least, into assignments that one agent finishes in one context. Shared pieces such as an API contract are settled first, everything unblocked launches at once in the background, and overlapping writers get separate branches or worktrees.
- **Explicit models, fresh agents.** Every launch sets the model and effort, because native subagent tools otherwise inherit the coordinator's. Every assignment, fix round and re-review goes to a fresh agent with a short brief: an agent kept alive through rounds re-reads its whole context on each request and costs about three times more.
- **Reviews that find the costly defects.** A large or risky change gets an independent review by an agent that did not write it. The review brief names the risks with a concrete check for each. The coordinator assigns severity: blocking findings are fixed before merge, the rest go into one follow-up list.
- **Any harness.** The skill states what a launch must control, not a fixed command. It uses what your environment offers: native subagents in Claude Code or Codex, an app orchestrator such as T3 Code, or the other family's CLI as a fallback.

## Install

Use the [Skills CLI](https://github.com/vercel-labs/skills), or copy `skills/delegate-kit/` into your assistant's supported skill directory:

```bash
npx skills add tomastaker/delegate-kit
```

The skill needs no runtime of its own. The models and tools it launches, and their authorization, must already be available in your environment.

## Use

The assistant loads the skill on its own when it is about to launch a subagent; work that fits one context it does itself, without the skill. You can also ask directly:

> Use Delegate Kit. Implement the export feature from the spec and verify it.

Change the defaults for one task in the request, for example "use Sonnet for the implementation" or "skip the independent review".

A subagent that receives a coordinator's brief does the assignment itself.

Assistants that do not match skills by description can be pointed to the skill with one line in your global instructions (`AGENTS.md` or `CLAUDE.md`):

> Do the work yourself if one agent can finish it in one context. If you launch subagents, load the `delegate-kit` skill first.

## Your team

[team.md](skills/delegate-kit/team.md) names the model for each kind of work:

| Work | Model |
| --- | --- |
| Implementation that needs judgement, debugging, design, code review | Opus 5.5 |
| Fix round by an exact list of findings | Sonnet 5.5 |
| Scoped search, running checks, mechanical edits a test confirms | Haiku 5.5 |
| Only when you name the model | Fable 5.1 |

Effort is `medium` for every launch and goes up one level after a failed attempt or when you ask. The table lists Claude models only for now; a model of another family, such as GPT, runs when you name it. Launches use your existing logins; a route that bills an API key or another account needs your approval.

To keep personal settings across updates, keep your own team file outside the installed skill and name its path in your request or standing instructions; it replaces the bundled one.

## Portability

The skill uses the [Agent Skills format](https://agentskills.io/specification); Codex reads its invocation policy from `agents/openai.yaml`. Available routes depend on the harness's tools, not on the coordinator's model. Unavailable models are reported rather than silently substituted.

Markdown instructions do not enforce runtime guarantees. See [checks and limitations](docs/verification.md) for the model comparison and live runs behind the defaults, and for what is not yet verified.

## Contributing

Run `python3 docs/check_package.py` locally to check package layout, metadata and local links.

[MIT](LICENSE). Review and task-splitting practices also draw from [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Artwork was inspired by [ponytail](https://github.com/DietrichGebert/ponytail).
