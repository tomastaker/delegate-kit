---
name: delegate-kit
description: Rules for coordinating subagents on work too large for one agent - sizing, launch, briefs, review, fix rounds, model and effort per launch. Use when you are about to launch a subagent, or when the user asks to delegate or change the team.
license: MIT
---

# Delegate Kit

You are the coordinator: you keep the conversation, the decisions and acceptance. [team.md](team.md) names the model and effort for each kind of work; read it before the first launch. A team file named by the user replaces it. User and project instructions take precedence over this skill.

If your task is a coordinator's brief, you are a worker: do the assignment yourself.

## Solo first

Size the whole task before anything else. If you alone would finish it in one context, up to about an hour of work or about three thousand changed lines, do it yourself and launch no implementers: at that size delegation was measured to cost about 40% more tokens for little or no time saved. Delegate implementation only for work beyond that. An independent review of a large or risky change is worth its cost at any size.

## Size

One assignment is a piece a single agent finishes in one context: up to about an hour of work or a couple of thousand changed lines. Keep smaller parts together in one assignment; cut larger work where the parts touch least, so each can be checked on its own. Settle what several parts share (an API contract, a schema, shared types) first and put it in every brief.

Launch every assignment with no unfinished blockers at once, in the background. Writers whose files overlap get separate branches or worktrees; you integrate. A worktree starts from a commit: commit or pass along what the worker needs.

## Launch

Set the model and effort from the team file on every launch: native subagent tools inherit yours when you omit them.

Every assignment goes to a fresh agent: a fix round, the next stage and a re-review each get a new agent with a short brief. Each request re-reads the agent's whole context, so an agent kept alive through rounds costs about three times a fresh one. Continue a finished agent only for a short question about its own report.

Prefer the environment's own orchestration; use the other family's CLI only when it cannot run the needed model. Use the user's existing logins and the least access the assignment needs; bypass modes and other accounts need the user's approval. After a timeout or lost connection, inspect the previous writer's work before starting a replacement.

## Brief

The brief carries everything the worker needs: that it is a delegated assignment, the outcome, the branch and files it may change, the context, constraints, the checks to run and the evidence to return. Ask for a short report: result, checks, open questions. For example:

> Delegated assignment. Add retry with exponential backoff to `src/http/client.ts`; change only that file and its test. Retry 429 and 5xx up to 3 times; never retry POST. Run `pnpm test http`. Report in a few lines: what changed, the test output, open questions.

The full test suite runs twice per change: once by the implementer before handing over and once by you on the merged result. Everyone else runs the tests of the files they touch.

## Review

A large or risky change gets an independent review by an agent that did not write it. Findings follow the risk list in the brief, so write it with care. The review brief names:

- what the change must do, with the author's claims marked as claims to verify;
- the risks, each with a concrete check: the scenarios that lose data, break the main flow or leak secrets, hostile input for every parser and regular expression, migrations on data shaped like production;
- what the author already verified, so the reviewer spends nothing on it.

The reviewer reads the diff, confirms findings with targeted runs and short scripts, and reports each finding as a scenario: state, wrong result, how it was confirmed. Lint, typecheck and test suites stay with the author.

You assign severity; reviewers under-rate it. Blocking means data loss, a security defect, a broken main scenario, a regression, a crash or a hang; in doubt, blocking. A fresh agent fixes blocking findings before merge. The rest go into one follow-up list, fixed in one pass.

A fix round writes new code. When it adds logic or touches security, data or migrations, a fresh reviewer checks its diff, scoped to that diff. Small fixes you accept by reading the diff.

## Report

Name the model and effort that ran for each assignment.
