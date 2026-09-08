# Roles and useful outcomes

Users assign model ladders in `config.json`; see `routing.md`. The current chat remains the coordinator in every profile. Role names describe work rather than price or vendor.

| Key | User-facing name | Required outcome |
|---|---|---|
| researcher | Researcher | Bounded facts, source evidence and uncertainty |
| planner | Planner | Ordered tasks, dependencies, ownership, assumptions and acceptance checks |
| implementer | Implementer | One completed outcome, isolated changes and executed checks |
| reviewer | Reviewer | Findings against the frozen diff and spec, in a fresh context |
| verifier | Finding verifier | Evidence that confirms or refutes a disputed claim |
| review-lead | Review lead | Reviewer briefs and a consolidated report for a substantial review |

Verifier uses the reviewer ladder and review lead uses the planner ladder unless separately configured. These are occasional roles, not mandatory stages.

## Choosing a level

The first candidate is the usual assignment; later candidates are available strengthening steps, not backup providers to try automatically. The coordinator may start at a stronger level for high risk or interacting constraints. It preserves explicit user assignments and reports its choice.

A cheaper researcher can locate a documented flag or extract relevant code without making an architectural verdict. A capable implementer at lower effort can execute a clear brief. Whether either pays off depends on context transfer, evidence quality and repair work, not its model name. A researcher may identify uncertainty and pass the judgement to the coordinator/planner.

## Returning unsatisfactory work

Clarify an incomplete brief or a small oversight. Strengthen the level for insufficient reasoning or repeated substantive failures. Resolve tool/access failures as environment problems. Keep the current worker for a useful clarification; use a fresh worker when changing model/effort or when old context obscures the task.

The coordinator inspects partial results, preserves useful changes and transfers writer ownership before replacement. Count clarification resumes and fresh replacements as starts; count repair attempts against the same ticket. Avoid repeating the same ineffective attempt.

## Briefs

The planner should identify dependencies and independently testable outcomes, not expand every implementation detail. The implementer owns local syntax and implementation choices within the accepted contracts. The reviewer needs the specification and frozen diff, not the author's reasoning. Use `brief-template.md` for dispatch and continuation examples.
