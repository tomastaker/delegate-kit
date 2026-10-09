---
name: delegate-kit
description: Coordinate work through subagents on economical models. Use when a task splits into independent parts, needs reading many files or sources, is too large for one session, or needs an independent review of a large change; or when the user asks to delegate or change the team.
license: MIT
---

# Delegate Kit

You are the coordinator: you keep the conversation, the decisions and acceptance. [team.md](team.md) lists the model tiers and the family preference; read it on activation. A team file named by the user or their standing instructions replaces it. User and project instructions take precedence over this skill and the team file.

If your task is a coordinator's brief, you are a worker: do the assignment yourself, and delegate only within the limit the brief grants.

## Balance

Spend where it buys speed or quality; save where saving costs nothing. One extreme is a single agent grinding through a large task for hours until its context compacts and loses detail. The other is a swarm of dozens of agents that duplicate work, multiply cost and leave a merge mess. Aim between them: a few well-sized assignments, each on the cheapest tier that does it well.

## Do it or delegate

Do it yourself when the round trip costs more than the work: small understood edits, changes in one or two files, sequential steps that each depend on the last, and decisions that need judgement or the user. A brief, a launch and an acceptance check cost real coordinator tokens, so a part is worth delegating only when it takes more work than that.

Delegate when the task has three or more independent parts of real size, gathering context means reading about ten or more files or long logs, docs or web sources, checks run for a long time, edits are bulk and mechanical, or the result needs an independent review. When these criteria hold, delegate without asking: this skill is the user's standing consent for that work.

## Size each assignment

An assignment should finish in one focused session, well within the worker's context window: roughly under an hour and about half the window. Split anything larger, or anything spanning independent areas, before launch: API, UI and migrations are three assignments, not one. Writers whose files overlap get separate branches or worktrees; you integrate the results. A worktree starts from a commit, not from your working tree: commit or pass along the uncommitted changes the worker needs.

Run up to six agents at a time; go beyond that only for a stated reason. A large feature in one branch can get a sub-coordinator: grant it in the brief, with a limit ("you may launch up to three workers").

## Choose the model

Pick the tier for the assignment, not for the whole project: a hard project still contains light work. Set the model and effort explicitly on every launch, because native subagent tools inherit your model when you omit them. Use the effort levels listed in the team file; `max`, `ultra` and the manual-only models run only when the user names them.

Light models are safe where a deterministic check (tests, typecheck, build, lint) catches their mistakes. Where a mistake is a silent omission (an open-ended search, fact-checking), give a tight scope or the strong tier. Code review always runs on the strong tier.

## Launch

Prefer the environment's own orchestration: native subagents, or an app orchestrator such as T3 Code's `delegate_task`. Set the model, effort and access it supports, and provide what it lacks yourself, for example by creating the worktree first and pointing the worker at it. Use the other family's vendor CLI (`codex exec`, `claude -p`) only when that orchestration cannot run the needed model. On launch mechanics, the environment's instructions win over this skill. Check the route on the host that will run it.

Use the user's existing logins; a route that bills another account or an API key needs approval. If a route or model is unavailable, say which and why, then use an alternative the team file allows, with a notice, or ask. Grant the least access the assignment needs; full-access and bypass modes need the user's approval. Wait through the environment's completion notifications and continue independent work meanwhile. After a timeout or lost connection the status is unknown: inspect the previous writer's work before starting an overlapping replacement.

## Brief

The brief carries everything the worker needs: that it is a delegated assignment, the outcome, the files it may change, the context it needs, constraints, the finish line with the evidence to return, and whether it may delegate. For example:

> Delegated assignment. Add retry with exponential backoff to `src/http/client.ts`; change only that file and its test. Retry 429 and 5xx up to 3 times; never retry POST. Done when `pnpm test http` passes: return a short summary and the test output. Do not delegate.

## Accept

Workers check their own work by the user's and project's rules; the brief only says which evidence to return. Accept on that evidence, not on a confident "done", and check how the pieces fit together.

Large features, branches, pull requests and risky changes also get an independent review: a strong-tier model that did not write the code reviews the stable result read-only and reports findings with severity and a failure scenario. The review adds to the authors' self-checks; it does not replace them. Fix confirmed blockers, recheck the affected behavior and let the reviewer confirm. When the same failure repeats without new evidence, rethink the approach before moving to a stronger model.

In the report, name the model and effort that actually ran for each assignment.
