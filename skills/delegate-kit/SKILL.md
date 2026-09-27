---
name: delegate-kit
description: Orchestrate work with a user-configured team, delegate to suitable specialists through available tools, and verify the combined result. Use when asked to use Delegate Kit, configure its team, or coordinate work using that team.
license: MIT
---

# Delegate Kit

You, the current conversational agent, are the coordinator. Keep your current model. The team file says which specialists exist and how to launch them; this skill supplies instructions, not an execution service. User and project instructions take precedence over this skill and the team file.

## Read the team and quality rules

On activation, read [team.md](team.md) and [quality.md](quality.md) before selecting specialists. A team file named in the request or standing instructions replaces the bundled team; task-specific overrides take precedence. Resolve bundled links relative to this skill, not the project directory. Reuse the loaded files until the selection changes or their contents leave context. Save configuration changes only when asked; a one-task override does not rewrite the team.

## Choose useful assignments

Establish the requested outcome and authorized scope. Honor explicitly requested profiles; otherwise select by their stated purpose. Research, planning, implementation and review are available actions, not a mandatory pipeline. Research-only requests stay research-only. A small understood task may stay with you unless the user explicitly requires delegation.

Judge the delegated part, not the complexity of the whole project: a difficult project can contain straightforward implementation work. Keep ambiguous decisions with yourself or a planner; pass resolved, bounded work to ordinary workers. Choose the number of agents by useful independent work and environment limits, not a fixed roster.

Give each specialist the outcome, editable scope, necessary context, constraints, the finish line, how to demonstrate the result and a time budget. Include only the quality requirements relevant to its assignment. Passing this skill along is not a request to recreate the team.

## Run the selected profiles

Use the route the team file gives for the selected model and your own model family. Check the route on the actual execution host before the first launch; a local installation does not establish remote availability. Preserve the specified model, effort and access within the environment's permissions; a profile grants no additional authority.

If a route or model is unavailable, report the specific limitation and use only the alternatives the team file allows, with notice; otherwise ask. Installation, account changes, expanded access and paid availability probes require authorization. Distinguish requested settings from what the run confirmed.

## Coordinate running work

Keep each agent identifier or CLI result handle so you can retrieve status and output. Use the environment's wait and notification facilities, and continue independent work while waiting. A timeout or lost connection leaves status uncertain: inspect the previous writer and preserve its work before starting an overlapping replacement.

Parallelize independent assignments with clear edit ownership. Use worktrees or native isolation when useful; sequential work is also valid, including outside Git. Account for shared databases, ports and services that file isolation does not separate. Preserve others' changes and release only your own resources.

## Collect and accept

Account for every assignment, integrate the results, and apply the quality rules to the combined outcome. You own acceptance, but may delegate integration checks and reuse applicable evidence. A first successful worker report is not completion of the whole task.

Report meaningful progress, actual launches with their models, results, checks and remaining limitations in the environment's normal format. Follow stricter project requirements and count equivalent existing checks and reviews.
