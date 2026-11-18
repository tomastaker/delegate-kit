# Delegate Kit

Do the work in one agent while it fits one context, and coordinate subagents by measured rules when it does not. Delegate Kit is a short orchestration policy for your current assistant: when to do work itself, when to fan out researchers, how to execute a plan or a ticket set in assignments sized by a context budget, which model each assignment needs, how to get a plan and a risky change reviewed by a second model family, how to brief a reviewer, what to do with the findings, and which decisions to bring to you. Five companion skills adapted from [tstack](https://github.com/t3dotgg/tstack) carry a change from proof to a merged or merge-ready pull request.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="assets/workshop.png" alt="A coordinator assigns work to researchers, builders and an independent reviewer." width="880">

## Why use it?

- **Size by context, not by hours.** Every assignment is planned to finish within a budget of about 200K tokens of context: up to about 1,000 written lines in 5–7 files, one layer or one thin vertical slice, about ten brief items. Past about 300K an agent costs several times more per turn and works worse, and it cannot see how full its context is. In local runs, assignments sized by "an hour or a couple of thousand lines" reached 400–600K.
- **Three modes.** Solo for operations, incidents, single-place fixes and changes under about 800 lines; research fan-out with one researcher per independent direction; implementation by workers: one worker when the work fits one budget, a plan in waves of 3–4 when it does not. More agents is not better: each costs about 25K tokens just to orient, so the coordinator uses the fewest that keep each within budget.
- **Runs your plan, not its own.** A ticket set from `/to-tickets`, a plan file or a spec becomes the assignment graph. The coordinator merges small tickets, splits oversized ones into stages and records the map in a ledger file; it does not rewrite the tickets.
- **Briefs that keep workers small.** Quiet command output (logs to a file, read the failing tail), a commit per part that says what is done and what is next, and a stop rule: done, three failed attempts at the same error, or more than a few lines of work outside the brief.
- **A coordinator that stays light.** A ledger file instead of memory, reports instead of transcripts, and a handoff written into the ledger after every wave, so a compaction or a fresh thread starts from it. In local runs coordinators, not workers, grew largest: up to 900K with repeated compactions.
- **Explicit models, fresh agents.** Every launch sets the model and effort; the risk areas (money, security, access rights, the data model and its migrations, a binding stack or architecture choice) get `high`. Every assignment, fix round and re-review goes to a fresh agent: one kept alive through rounds re-reads its whole context on each request and costs about three times more.
- **A second model family where it pays.** Models of one family make correlated mistakes. A plan larger than one budget, or for a sizeable change in a risk area, is reviewed by the other family (GPT Sol by default) before work starts; risk-area changes and each wave's diff get a second-family reviewer next to the Claude one. Reviewers work blind to each other, the coordinator checks every finding against the code, and rounds stop on verdicts and confirmed findings, not on scores.
- **Questions only when they are yours.** The coordinator rules on choices with one plainly right answer or a cheap undo, records each ruling with its cost if wrong, and brings you only behaviour and business rules, decisions in a risk area, irreversible or outward-facing steps and scope.
- **Reviews that find the costly defects.** One independent review per wave on its integrated diff, with the risks named and a concrete check for each; each finding comes with the run that confirms it or is marked unconfirmed. User-facing stages also get a browser walkthrough, launched with the first review. The coordinator assigns severity against the product: a scenario that real use reaches is blocking and fixed before merge, contrived input or timing goes into one follow-up list, fixed in one pass at the end.
- **Fix rounds that end.** A fix round carries blocking findings only and is checked by the second family before it merges. A component gets two fix rounds; a blocking finding after the second means the design is wrong, so the next move is to remove, narrow or simplify it, and you decide when that changes what users meet.
- **Native in T3 Code.** In [T3 Code](https://github.com/pingdotgg/t3code) the coordinator launches through `delegate_task`: Claude and GPT children, a worktree per parallel writer or reviewer, completion wake-ups instead of polling. Elsewhere it uses native subagents in Claude Code or Codex, or the other family's CLI as a fallback.

## Install

Use the [Skills CLI](https://github.com/vercel-labs/skills), or copy `skills/delegate-kit/` into your assistant's supported skill directory:

```bash
npx skills add tomastaker/delegate-kit
```

The package holds `delegate-kit` and the five PR skills below; install the ones you use. `full-send` needs `delegate-kit`, `file-pr` and `babysit-pr`; `full-stop` needs `full-send`; `file-pr` and `babysit-pr` need `leaving-pr-comments`. The PR skills need an authenticated [GitHub CLI](https://cli.github.com), and `babysit-pr` needs `python3` for `pr-wait` outside T3 Code.

The skill needs no runtime of its own. The models and tools it launches, and their authorization, must already be available in your environment.

## Use

The assistant loads the skill on its own when it is about to launch a subagent; work that fits one context it does itself, without the skill. You can also ask directly:

> Use Delegate Kit. Implement the export feature from the spec and verify it.

Change the defaults for one task in the request, for example "use Sonnet for the implementation" or "skip the independent review".

A subagent that receives a coordinator's brief does the assignment itself.

Assistants that do not match skills by description can be pointed to the skill with one line in your global instructions (`AGENTS.md` or `CLAUDE.md`):

> Do the work yourself if one agent can finish it in one context. If you launch subagents, load the `delegate-kit` skill first.

## PR skills

Adapted from [t3dotgg/tstack](https://github.com/t3dotgg/tstack) by Theo Browne (MIT); see [notices](THIRD_PARTY_NOTICES.md) for what changed.

| Skill | Say | What it does |
| --- | --- | --- |
| `full-send` | "full send" | Takes a change to a merged PR while you are away: proves it, reviews it with the second family, files it, babysits it, merges it. |
| `full-stop` | "full stop" | The same, but stops when the PR is ready for you to merge. |
| `file-pr` | "file a PR" | Files a short PR that leads with the problem. |
| `babysit-pr` | "babysit" | Watches a PR through CI and review bots (`watch_pull_request` in T3 Code, `pr-wait` elsewhere) and fixes the real findings. |
| `leaving-pr-comments` | (automatic) | Marks comments an agent posts on your behalf. |

## Where it fits with planning skills

Delegate Kit executes; it does not interview or write specs. It works well after Matt Pocock's [grilling, to-spec and to-tickets](https://github.com/mattpocock/skills), which stay separate skills that you start yourself. When a large task arrives without the plan it needs, the coordinator suggests the missing step in one line.

| Task | Before execution | Execution |
| --- | --- | --- |
| Operations, incident, a fix in one place, a question | nothing | solo |
| Research with several independent directions | nothing | research fan-out |
| Change over about 800 lines, up to three assignments, decisions settled | nothing; the coordinator writes a short stage plan | one worker, or a few in one wave |
| Same, but behaviour, data model or UX still open | `/grilling` | one worker, or a few in one wave |
| Feature larger than three assignments, or work over several sessions | `/grilling`, then `/to-spec`, then `/to-tickets` | plan execution in waves |

`/to-spec` is worth it when the work outlives the conversation; `/to-tickets` when there are more than three assignments with dependencies. Below that, the conversation and the ledger are enough. Local ticket files are updated as assignments are accepted; tracker issues change only with your go for that run.

## Your team

[team.md](skills/delegate-kit/team.md) names the model and effort for each kind of work:

| Work | Model | Effort |
| --- | --- | --- |
| Implementation that needs judgement, first code review, research across code | Opus 5.5 | medium |
| Implementation or review in a risk area | Opus 5.5 | high |
| Second-family review of a plan, a risky change or a wave's diff; the check of a fix round | newest GPT Sol in the catalog | high |
| Research across documents and the web, fix round by an exact list, browser walkthrough | Sonnet 5.5 | medium |
| Fetching and extracting facts, scoped search, running checks, mechanical edits a test confirms | Haiku 5.5 | medium |
| Only when you name the model | Fable 5.2 | as named |

Effort goes up when you ask; after a failed attempt at an assignment the next agent gets one level more effort, after a second a stronger model, after a third the coordinator rules on it, and only a decision that is yours comes to you. GPT runs as the second-family reviewer and otherwise only when you name it; without Sol in your catalog the review runs on the strongest GPT offered and the report names it. Launches use your existing logins; a route that bills an API key or another account needs your approval.

To keep personal settings across updates, keep your own team file outside the installed skill and name its path in your request or standing instructions; it replaces the bundled one.

## Portability

The skill uses the [Agent Skills format](https://agentskills.io/specification); Codex reads its invocation policy from `agents/openai.yaml`. Available routes depend on the harness's tools, not on the coordinator's model. Unavailable models are reported rather than silently substituted.

Markdown instructions do not enforce runtime guarantees. See [checks and limitations](docs/verification.md) for the model comparison and live runs behind the defaults, and for what is not yet verified.

## Contributing

Run `python3 docs/check_package.py` locally to check package layout, metadata and local links.

[MIT](LICENSE). Review and task-splitting practices also draw from [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Artwork was inspired by [ponytail](https://github.com/DietrichGebert/ponytail).
