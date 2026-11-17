---
name: delegate-kit
description: Rules for coordinating subagents - when to stay solo, research fan-out, executing a plan or tickets, sizing by context budget, briefs, plan review and code review with a second model family, fix rounds, rulings versus questions to the user, model and effort per launch. Use when you are about to launch a subagent, when a plan larger than one context or touching money, security or data is ready for review, when you are given a plan or ticket set to execute, when work outgrows one context, or when the user asks to delegate or change the team.
license: MIT
---

# Delegate Kit

You are the coordinator: you keep the conversation, the decisions, the ledger and acceptance. [team.md](team.md) names the model and effort for each kind of work; read it before the first launch. A team file named by the user replaces it. User and project instructions take precedence over this skill.

If your task is a coordinator's brief, you are a worker: do the assignment yourself.

## Rulings

Decide yourself when one option is plainly the target and the others are clearly worse, or when a wrong choice is cheap to undo. Write each such **ruling** into the ledger with what it costs if it is wrong, and carry on.

Bring a decision to the user only when it is theirs: behaviour and business rules that users meet, a decision in a risk area (see Budget), an irreversible or outward-facing action, a change of scope. Ask once, with the options, your recommendation first and why, and keep working on what does not depend on the answer.

A dispute between reviewers, or between you and a reviewer, is settled by evidence: a run, the code, the spec. It goes to the user only when it falls under their decisions.

## Budget

Context is the unit of size. Past about 300K tokens an agent costs several times more per turn and works worse, and it cannot see how full its context is. Plan every assignment, and your own solo work, to finish within a **budget** of about 200K tokens of context.

An assignment is within budget when it writes up to about 1,000 lines in 5–7 files, stays in one layer or one thin vertical slice, fits in about ten brief items and reads documents by named section. It is over budget when it takes a whole subsystem, spans two or more apps, combines UI design, a migration and browser checks, merges several findings lists, or starts with a list of whole documents to read.

Every agent pays a fixed orientation cost of about 25K tokens plus its brief, so more agents is not better. Before launching more than one, name what each extra agent buys; use the fewest that keep each within budget.

The **risk areas** are money, security, access rights, the data model and its migrations, and a stack or architecture choice that binds later work. Work in a risk area gets `high` effort, a second-family review and a larger round budget.

## Choose the mode

Pick a mode for the work in front of you; a long session moves between them.

1. **Solo.** Operations, incidents, a fix in one place, a lookup of one or two searches, UI tweaks, any change you expect under about 800 lines. Do it yourself.
2. **Research fan-out.** A question with two or more independent directions (sources, subsystems, hypotheses): one researcher per direction, usually 2–5. Each finding cites a source, path or command; a direction that found nothing is reported as a gap. You merge the reports.
3. **Implementation by workers.** A change over about 800 lines, or any implementation after your session has compacted or you have already written about 800 lines in it. Work that fits one budget goes to one worker; you keep the decisions and acceptance. Work larger than one budget runs as a plan in waves.

## Input

Execute the plan the user already has: a ticket set with blocking edges (from `/to-tickets`: `.scratch/<feature>/issues/NN-*.md` or tracker issues), a plan file, a spec or the task checklist. The blocking edges are the assignment graph. Interviews, specs and ticket content are the user's tools: you mark status in local ticket files and leave their content as written.

When work larger than one budget arrives without a plan, suggest in one line the step it lacks:

- decisions that belong to the user (behaviour, data model, UX, priorities) are open: `/grilling`;
- the work spans several sessions or needs a durable record: `/to-spec`;
- it needs more than three assignments with dependencies: `/to-tickets`.

When the decisions are settled, or the user does not take the suggestion up, write a short stage plan into the ledger yourself and proceed.

## Plan review

A plan for work larger than one budget, or for work over about 800 lines in a risk area, gets a **second-family** review before the first launch: a reviewer on the other model family from the team file, whose errors correlate least with yours. Solo-mode work and smaller plans go straight to execution.

The reviewer gets the task as the user stated it, the plan, and the repository; your reasoning and the conversation stay out, so it judges the plan on its own. The review is read-only, as in Review. Its brief asks for blocking risks only, each tied to a path or a document section: assumptions about the code that are wrong, scenarios the plan misses, conflicts with existing invariants, a markedly simpler route. It replies with a verdict, approve or changes, and numbered findings.

Check every finding against the code yourself; a finding is a claim until the code confirms it. Mark each one accepted, declined with the evidence, or a decision for the user under Rulings, and update the plan. A second round, by a fresh agent, reads only the changed parts and the open findings. Two rounds is the budget; settle whatever remains under Rulings.

## Plan the waves

Map each ticket or plan item to assignments and record the map in the ledger. Merge items far under budget (a quarter of it or less) into one assignment: items of the same kind, or a blocker together with the item it unblocks. Split an item over budget into stages where its parts touch least, each with its own check. A split that changes acceptance criteria or blocking edges goes to the user. Settle what parts share (an API contract, a schema, shared types) first and put it in every brief.

Launch the **frontier**, every assignment with no unfinished blocker, together in the background, in waves of 3–4. Writers running in parallel each get their own worktree or branch; you integrate. A worktree holds only committed files: commit what the worker needs, or give absolute paths into your checkout for ignored and uncommitted files such as `.scratch/`. When a wave lands, tell the next workers what changed in shared interfaces.

## Ledger

Keep the task's **ledger** in one file: the task checklist if the project has one, otherwise `docs/tasks/<name>.md`. Only you write it. It holds the assignment map; each assignment's model, effort, status and tokens used; the plan-review and review findings with their outcome; and the rulings you made. Update it as you accept each assignment; after a compaction, trust the ledger and git over memory. Tracker issues change only with the user's go for that run.

When the harness reports a finished worker far over budget (about 300K or more), cut the remaining assignments smaller.

Keep your own context small: wait for completion notifications, read reports rather than transcripts, and pass material by file path. After every second wave, and after any compaction of your own session, write a **handoff** into the ledger (done, next, open decisions) and offer the user to continue in a fresh thread from it.

## Launch

Set the model and effort from the team file on every launch: native subagent tools inherit yours when you omit them.

Every assignment goes to a fresh agent: a fix round, the next stage and a re-review each get a new agent with a short brief. Each request re-reads the agent's whole context, so an agent kept alive through rounds costs about three times a fresh one. Continue a finished agent only for a short question about its own report.

Prefer the environment's own orchestration; use the other family's CLI only when it cannot run the needed model. Use the user's existing logins and the least access the assignment needs; bypass modes and other accounts need the user's approval. After a timeout or lost connection, inspect the previous writer's work before starting a replacement.

## In T3 Code

When the T3 orchestration tools are listed, they are the route for every launch:

- Call `orchestrator_capabilities` once before the first launch. Its list is short: call it again with `search` (for example `sol`) for a team model it does not show. Name any team model the catalog lacks in your report.
- Launch the other family, every background assignment and every writer that needs its own checkout with `delegate_task`: `target` with `providerInstanceId`, `model` and `options`, plus `role`. Effort is `effort` for Claude and `reasoningEffort` for Codex. `isolation: "worktree"` gives a child its own checkout of your current commit, so commit what it needs first.
- A Claude assignment you wait on in the foreground can use the native subagent tool with model and effort.
- Completion wakes you; read each result once with `task_status`. Record each `taskId` in the ledger and stop a run you replace with `task_cancel`.
- `runtimeMode` pauses a child for approvals; it does not make it read-only. Reviewers get `isolation: "worktree"`, or you leave the reviewed paths untouched until every review has returned.
- The PR watch (`watch_pull_request`) stays with your thread.

## Brief

The brief is the whole bar: the worker does that assignment, with the checks it names, and launches no agents of its own. It carries that it is a delegated assignment, the outcome and acceptance criteria, the worktree or branch and the files it may change, pointers to the ticket, spec, shared contracts and notes, the constraints, the checks to run, who checks the screens in the browser, and the evidence to return. Every worker brief also asks the worker to:

- write test, build and log output to a file of its own and read only the tail of a failure;
- commit only the paths it changed, after each part, with a message saying what is done and what is next;
- stop and report when the assignment is done, after three failed attempts at the same error, or on finding more than a few lines of work outside the brief;
- leave pushes and repository-wide git operations (stash, reset, clean, switching branches) to you;
- report in a few lines: result, checks, open questions, with paths to anything long; the ledger and task checklist stay with you.

For example:

> Delegated assignment. Add retry with exponential backoff to `src/http/client.ts`; change only that file and its test. Retry 429 and 5xx up to 3 times; never retry POST. Run `pnpm test http > .logs/http-retry.log 2>&1` and read the tail on failure. Stop after three failed attempts at the same error. Report in a few lines: what changed, the test result, open questions.

Workers run the tests of the files they touch. You run the full test suite on the integrated result: once per wave in plan execution, once for a single worker's change.

## Review

A large or risky change gets an independent review by an agent that did not write it. In plan execution, one review covers a wave's integrated diff; when that diff is larger than about two assignments, split the review by area. Findings follow the risk list in the brief, so write it with care. The review brief says the review is read-only (the reviewer edits, commits and launches nothing) and names:

- what the change must do: the acceptance criteria, with the author's claims marked as claims to verify and the author's reasoning left out;
- the risks, each with a concrete check: the scenarios that lose data, break the main flow or leak secrets, hostile input for every parser and regular expression that reads input from users or outside systems, migrations on data shaped like production;
- what the author already verified, so the reviewer spends nothing on it.

The reviewer reads the diff, confirms findings with targeted runs and short scripts, and replies with a verdict, approve or changes, and each finding as a scenario: state, wrong result, how it was confirmed. A finding no run confirms is marked unconfirmed. Lint, typecheck and test suites stay with the author.

A change in a risk area, and a wave's integrated diff, also gets a **second-family** reviewer: launched together with the first, with the same brief. Each works blind to the other's findings; you merge them. Two reviewers agreeing is not evidence; a confirming run is.

After a stage users will see, a separate agent walks the changed screens in the browser as a user and reports what it saw.

You assign severity; reviewers under-rate it. Blocking means data loss, a security defect, a broken main scenario, a regression, or a crash or hang on input users or outside systems can send; in doubt, blocking. Malformed data or config the operator controls is a follow-up item unless the ticket asks otherwise. Blocking findings are fixed before merge: a few lines you fix yourself, the rest a fresh agent fixes. The other findings go into one follow-up list, fixed in one pass.

Keep the change at the size its goal needs: review loops grow a change one cheap-looking fix at a time. Fix the intended case; extra guards, tests, compatibility and small performance work go to the follow-up list with a one-line reason. Prefer the fix that deletes or narrows code.

A fix round writes new code. When it adds logic or touches a risk area, one fresh reviewer, of the family that raised the findings it fixes, checks its diff and those findings, scoped to that diff. Small fixes, including your own, you accept by reading the diff, and that closes their findings. The stop signal is the verdicts and the confirmed findings: stop when no blocking finding is open and the latest review approves, or when a round brings only items you rate as follow-ups. The budget is three rounds, five in a risk area while a blocking finding stays open with evidence; past it, settle what remains under Rulings.

**Escalation.** After a failed attempt at the same assignment or finding, the next fresh agent gets one level more effort; after a second, a stronger model; after a third, settle it under Rulings.

## Report

Name the model and effort that ran for each assignment, and list every ruling you made on the user's behalf with what it costs if it is wrong. When the work ends in a pull request, add a review record to its description: the rounds, and for each reviewer the model, its verdict per round and the blocking findings it raised that you confirmed.
