# Task: review the __NAME__ change

## Goal
Find every defect in this change before it merges: behaviour that contradicts the spec, incorrect logic, and anything that would break a caller.

## Spec
__WT__/spec/__NAME__.md

## Diff
__DIFF__ — the complete change (source, spec, tests). The worktree at __WT__ has it checked out; `npm test` runs its tests.

## Constraints
- Read-only: do not modify files.
- Scope is the diff. Do not restate it.

## Return
The delegate-kit result JSON. Return `findings` with severity (`high` | `medium` | `low`), `file`, `line`, `claim`, `evidence`, `suggested_fix`, and `kind` (`spec` | `correctness` | `standards` | `nit`).
