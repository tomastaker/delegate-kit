---
name: delegate-kit
description: Coordinate repository work through scoped researchers, planners, implementers and fresh reviewers. Use for features, refactors, implementation plans, delegation and second opinions. Select role ladders for the current coordinator and mix supported native and external workers.
license: MIT
---

# delegate-kit

The current chat is the coordinator. Own user intent, decomposition, briefs, acceptance, integration and reporting. Delegate bounded outcomes to workers; delegation depth is one.

## 1. Decide what benefits from delegation

Compare a worker's useful independent work and potential parallel progress with briefing, repeated context, verification and likely repairs. Use task knowledge and observed results; pricing searches and hypothetical token bills are unnecessary. File count alone does not determine task size.

| Shape | Use when |
|---|---|
| DIRECT | Completing the work in existing context costs less than briefing and checking a worker; or the action must stay with the coordinator under the user's permissions |
| SCOUT | Locating facts, relevant code or primary sources is a bounded independent outcome |
| PLAN | A separate planner can resolve meaningful ambiguity, interacting constraints or decomposition; skip a redundant plan |
| SINGLE | One substantial, specified outcome has one writer |
| PARALLEL | Ready tasks have independent outcomes, disjoint write scopes and stable interfaces |
| SEQUENTIAL | One result changes the next task's assumptions |

State the shape and reason for substantial work. Choose worker count from ready outcomes and integration capacity, within actual host limits and explicit user limits. Reassess after results; neither a fixed number of workers nor maximum fan-out is a target. Coupled edits have one owner.

## 2. Select the coordinator's role profile

Before dispatch, read `references/routing.md`. Personal assignments live in `~/.delegate-kit/config.json`: `profiles.gpt`, `profiles.claude`, `profiles.kimi`, or another declared coordinator family. The profile selects workers; it never replaces the chat's model. An explicit session instruction overrides saved choices.

Each role is an ordered ladder: level 1 is the usual choice; later levels are permitted alternatives for harder work. Use the appropriate level immediately when risk or ambiguity justifies it. Choose models from the user's configured ladder and actual host/provider capabilities, not vendor rankings. With no assignment, inherit the current model and disclose unavailable choices.

Resolve each selected role and level:

```
agent-run route --parent codex --role implementer --level 1
agent-run route --parent codex --role reviewer --level 2 --author-backend self
```

Native means the host can launch that worker. External means a supported CLI executes it. Check the actual tool schema, model identifiers and supported effort. `doctor` only detects installed CLIs. A configured target that is unavailable stays visible; choose another authorized candidate deliberately. Native dispatch: `references/hosts.md`. Before a new external CLI/model combination, read `references/providers.md`, installed help and `references/external.md`.

## 3. Brief and dispatch

For work spanning several outcomes, record scope, dependencies, status and acceptance checks in existing tickets or `.scratch/<task>/`. Ready tasks have accepted dependencies. Preserve unfinished plans. A planner returns decomposition; the coordinator accepts or revises it before assigning work.

Use `references/brief-template.md`: outcome, constraints, ownership and acceptance commands. Give enough detail to remove consequential ambiguity while leaving local implementation choices to the worker. A stranger with only the brief and repository must be able to begin.

Every writer gets an isolated worktree and one owner. `agent-wt create <task>` branches from HEAD; account for relevant uncommitted changes first. Native writers need `agent-wt lock <task>` and the absolute path. External writers take the lock through `--cwd`. Preserve other people's edits.

Set a shared task ID for native and external runs. Track starts and retries with the lightweight budget counter described in `references/routing.md`; include each native dispatch and resume. External `run`/`resume` records its own start. Review total starts, retries and useful progress before another wave. Explicit user limits are hard; otherwise the coordinator decides whether the next call remains worthwhile.

## 4. Accept, clarify or strengthen

Inspect the returned evidence and run the relevant acceptance checks. A worker's done status does not establish completion. Workers return `references/result-schema.json`; report checks excluded by their adapter and run them in an authorized workspace.

- Missing context, an imprecise brief or a bounded oversight: clarify and resume the same worker when its context remains useful.
- Insufficient reasoning or repeated substantive mistakes: choose a stronger configured level and start a fresh worker with the task, prior result, current diff and remaining checks.
- Missing tools, access or environment: address that obstacle; a stronger model does not supply access.

A ladder is not an automatic retry loop. Reassess expected benefit before every retry; stop or report a blocker when another attempt is unlikely to help. Before replacing a writer, inspect partial work and ensure the previous writer has stopped and released ownership. Resume preserves model/effort; a changed choice is a fresh run.

## 5. Review and integrate

Review delegated implementation, risk-zone changes and substantial coordinator-written changes with a fresh read-only agent given the frozen diff and spec. Fresh context is required in every family. Family diversity is a separate choice; configured reviewer assignments govern it.

Choose review reasoning for contract complexity and risk, not only diff length. One reviewer is sufficient when it covers the risk; complementary reviewers may run independently when useful within user limits. `references/review.md` defines lenses, proposals and reconciliation. Reviewers do not receive each other's findings before reporting.

Reproduce disputed findings with commands first. Use a verifier for unresolved judgement. Clarify or strengthen the fix worker as in step 4. After behavior-changing fixes, rerun affected checks and resume the reviewer with new hunks and finding dispositions; use a fresh brief if resume is unavailable.

Integrate and publish within user authorization and repository conventions. Mark tickets accepted only after checks pass. Release/remove worktrees after preserving accepted changes.

## 6. Report and hand off

Report changed behavior, actual checks, remaining limits, selected profile/role levels and native versus external execution. Confirm actual model only from runtime evidence; otherwise distinguish requested model from unknown identity. Report fresh context separately from family diversity. For tickets, close with completed X of Y and the next unfinished item.

For ownership transfer, write `.scratch/handoff/<date>-<task>.md` with state, decisions, blockers and pointers to specs, tickets and diffs. Include task counter ID and remaining user limits. No secrets.
