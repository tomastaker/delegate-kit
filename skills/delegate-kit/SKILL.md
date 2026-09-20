---
name: delegate-kit
description: Orchestrate work with a user-configured team, delegate to suitable specialists through available tools, and verify the combined result. Use when asked to use Delegate Kit, configure its team, or coordinate work using that team.
license: MIT
---

# Delegate Kit

You, the current conversational agent, are the coordinator. Keep your current model. Use the user's team to choose specialists; use the environment to run them. This skill supplies instructions, not an execution service.

## Read the team and quality rules

On activation, read [team.md](team.md) and [quality.md](quality.md) before selecting specialists. An explicitly supplied team file in the request or standing instructions replaces the bundled team; task-specific overrides take precedence. Resolve bundled links relative to this skill, not the project directory. Reuse the loaded files until the selection changes or their contents leave context.

If the team is an unfilled template, help resolve the executor and model choices needed for this task. Placeholders are not launch settings. Save configuration only when requested; a one-task override does not rewrite the team. Independent work that needs no missing setting can continue.

## Choose useful assignments

Establish the requested outcome and authorized scope. Honor explicitly requested profiles; otherwise select by their stated purpose. Research, planning, implementation and review are available actions, not a mandatory pipeline. Research-only requests stay research-only. A small understood task may stay with you unless the user explicitly requires delegation.

Prefer the team's economical profiles when suited to the assignment, without inventing prices or model capabilities. Judge the delegated part, not the complexity of the whole project: a difficult project can contain straightforward implementation work. Keep ambiguous decisions with yourself or an appropriate stronger specialist; pass resolved, bounded work to ordinary workers. A separate planner or a copy of the coordinator is useful only when its contribution warrants it. Choose the number of agents by useful independent work and environment limits, not a fixed roster or quota.

Give each specialist the outcome, editable scope, necessary context, constraints, acceptance criteria and applicable self-checks from the quality rules. Include only the requirements relevant to its assignment. Further delegation needs a concrete reason and authority; passing this skill along is not a request to recreate the entire team.

## Run the selected profiles

Honor the configured launch method. Otherwise prefer an available native agent tool when it can preserve the selected executor, model and specified settings. Use an installed CLI, service or user-provided launcher when appropriate. Convenient native dispatch does not justify inheriting your model in place of the selected one.

The coordinator's model family does not determine available routes; the harness's tools do. A mixed-model harness may offer native dispatch across providers. Conversely, a same-family native tool may lack the required model or settings. Choose by actual capabilities; an explicit launch command is optional when the environment already provides a matching route.

Check only the needed route, using tool descriptions, local help or the user's launch instructions for unfamiliar parameters. Check tools, authorization, paths and working copies on the actual execution host. A local installation does not establish remote availability. Preserve specified reasoning and access settings within the environment's permissions; a profile grants no additional authority.

If a required route is unavailable, report the specific limitation. Use a preauthorized alternative with notice; otherwise ask before substituting an executor or model. Installation, account changes, expanded access and separate paid availability probes require authorization. Distinguish requested settings from information confirmed by the run. Missing model or cost telemetry is a reporting limitation, not by itself a failed launch.

## Coordinate running work

Keep the native agent/session identifier or CLI result handle in working context so you can retrieve status and output. Use the environment's wait and notification facilities. A timeout or lost connection leaves status uncertain: inspect the previous writer and preserve its work before starting an overlapping replacement. Continue independent work while waiting.

Parallelize independent assignments with clear edit ownership and dependencies. Use worktrees or native isolation when useful and available; sequential work is also valid, including outside Git repositories. Account for shared databases, ports and services that file isolation does not separate. Preserve others' changes and release only your own resources once useful results are safe.

## Collect and accept

Account for every assignment, integrate the results, and apply the quality rules to the combined outcome. You own acceptance, but may delegate integration checks and reuse applicable evidence. A first successful worker report is not completion of the whole task.

Report meaningful progress, actual profile launches, results, checks and remaining limitations in the environment's normal format. Follow its completion contracts and stricter project requirements; count equivalent existing checks and reviews. If requirements conflict, identify the concrete conflict instead of inventing a second workflow.
