# Role decisions

Model selection policy is in `routing.md`. Roles describe outcomes, not vendor rankings.
Native prompts live in `agents/dk-*.md`; the installer generates Codex definitions from those bodies without model or effort pins.

| Role | Outcome | Default model choice | Reasoning guidance |
|---|---|---|---|
| planner | Ordered steps, ownership, assumptions, risks and acceptance checks | Main senior model | Deep for ambiguity and interacting constraints |
| implementer | One complete vertical slice in a worktree | Main senior model | Lower effort for clear work; increase for difficult invariants |
| reviewer | Findings against a frozen diff and spec, with evidence | Main senior model in a fresh context | High for tracing contracts; deeper for substantial risk |
| review-lead | Reviewer briefs before a led review; consolidated findings after | Main senior model | Deep; inspect stat/spec before, findings after |
| verifier | Evidence-backed disposition of a disputed finding | Main senior model, separate from the disputed judgement | Use a reproducible command before spending another model call |
| researcher | Primary-source facts, URLs, dates and uncertainty | Main model unless bounded extraction justifies a faster one | Normal for extraction; escalate when judgement is needed |

## Smaller-model exception

A smaller worker is worthwhile when all of these hold: the output is extraction rather than a recommendation, the scope is narrow, source evidence is available, the coordinator can cheaply verify it, and latency/cost actually matters. Examples: locating a documented flag or extracting signatures from a known file. A repository-wide diagnosis, a security interpretation and a library recommendation are not this exception.

Prefer one senior worker with suitable effort over a cheaper implementation followed by repeated repairs. This is the default product policy, not a benchmark claim that effort always matters more than model tier. Explicit user assignments may override it.

## Context and cost

Delegate for independent outcomes, isolation, useful parallelism or a clean review context. Every worker rereads instructions and relevant files. Avoid workers for work already cheaper to finish in the coordinator. Resume a short, relevant context; start fresh when accumulated history obscures the task. There is no universal token or turn threshold across models and hosts.

Keep UI preferences configurable. Do not infer model suitability from the presence of CLAUDE.md, a vendor name, price, or a version number alone.
