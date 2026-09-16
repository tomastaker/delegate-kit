# Roles and useful outcomes

A role describes the result. A named profile contains a user-selected executor and `when` description. Several profiles can share a role; adding a specialist requires only editing its complete team JSON.

| Role | Useful outcome |
|---|---|
| researcher | Bounded facts, code/source evidence and uncertainty |
| planner | Dependencies, ownership, assumptions and acceptance checks |
| implementer | Scoped changes and executed checks |
| reviewer | Findings against a frozen spec/diff in fresh context |
| verifier | Evidence confirming or refuting a disputed finding |
| review-lead | Independent reviewer briefs and consolidated findings |

The planner, verifier and review lead are optional. No model ladder or implicit role inheritance applies. `defaults.<role>` references an explicit profile in this preset. Unknown role names are allowed and default to read-only; writing needs explicit access. Only implementer defaults to workspace-write.

Choose by the described task, not role name alone. A UI implementer and a general implementer have different `when` descriptions. A small text correction on an authentication page is not automatically a complex backend task. A consequential distributed invariant may merit the complex specialist without a sensitive keyword.

Clarify a bounded omission in the same executor session. Select a fresh authorized profile for changed responsibilities, model/harness, unsuitable context or independent judgment. Tool/access failures are environment problems. Stop and inspect a partial writer before transferring ownership. Use [brief-template.md](brief-template.md) for briefs and continuation.
