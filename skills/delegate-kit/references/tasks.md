# Managed implementation and acceptance

Use `node <absolute installed skill>/scripts/dk.mjs`; `<dk>` abbreviates it below. Every managed writer belongs to a task contract. Standalone read-only investigation needs only a brief. There is one task acceptance gate.

## Describe the task once

Keep the specification and contract outside writer scope. This example is input JSON; replace paths, profile IDs and checks with real task values:

```json
{
  "session": "codex:CHAT_ID",
  "task": "take-first",
  "repo": "/abs/repository",
  "specification": {
    "path": "/abs/specification.md",
    "goal": "Return the requested number of items",
    "requirements": [{"id": "count", "text": "Return the first max(0,count) items"}]
  },
  "work_items": [{
    "id": "fix",
    "profile": "implementation-general",
    "routing": {"defined": true, "risk": "ordinary", "reason": "Bounded behavior with a regression assertion; Node and Git available"},
    "scope": {"include": ["src/take.mjs", "tests/take.test.mjs"]},
    "checks": ["take-tests"]
  }],
  "checks": [{"id": "take-tests", "requirements": ["count"], "argv": ["node", "--test", "tests/take.test.mjs"]}],
  "review": {"profiles": ["review-general"]}
}
```

Runtime computes the specification digest and resolves the base commit. Defaults are version 1, base HEAD, required work/checks/review, check cwd `.`, expected exit 0, all requirements covered by review, coordinator integration owner, and empty exclusions/dependencies/resources/quality/finishing/non-goals. Override these when relevant. It does not invent requirements, risk assessments, profiles, scope or check commands. The [task schema](../assets/task.schema.json) describes the normalized stored contract; runtime validates input after normalization. Checkpoint and evidence records have their own [schemas](../assets/checkpoint.schema.json), [evidence schema](../assets/evidence.schema.json).

`scope` paths are relative to the repository. Shared resources can be exclusive (`{"name":"test-db","mode":"exclusive"}`) or shared with optional capacity. They coordinate declared use, not arbitrary outside processes. Dependencies must be acyclic; integrate predecessor output before preparing dependent work. Multiple implementer profiles are allowed; IDs are arbitrary.

Optional `baseline` records known failures/environment gaps. `trivial: true` explicitly classifies a trivial task; otherwise independent review remains required even if `review.required` is false. Optional `check.report` has positive `min_tests` and optional relative JSON report `path`, protecting against exit-zero with no discovered tests. Checks run in the snapshot, so arrange their dependencies there; ignored untracked dependencies are not copied automatically.

## Normal sequence

```text
<dk> task open --session SESSION --task TASK --contract /abs/contract.json
<dk> prepare --session SESSION --task TASK --work-item fix --cwd /abs/writer-worktree
<dk> run RUN_ID
<dk> wait RUN_ID --timeout-ms 60000
# Inspect and integrate the completed changes, then:
<dk> task check --session SESSION --task TASK --cwd /abs/integrated-repository
<dk> prepare --session SESSION --task TASK --checkpoint current --agent review-general
<dk> run REVIEW_RUN_ID
<dk> wait REVIEW_RUN_ID --timeout-ms 60000
<dk> task accept --session SESSION --task TASK
```

Native/Paseo `run` requires actual host dispatch, attach and correlated completion; see [hosts.md](hosts.md). Run each returned member of a reviewer set. Reviewer cwd is the frozen snapshot regardless of the coordinator's directory. Initial review uses a fresh executor session.

`prepare --work-item` derives the configured profile from the contract; an explicit different profile is rejected unless recorded by escalation. `--brief FILE` adds context when needed. `--checkpoint current` avoids manually copying snapshot IDs. `task show` returns compact status, revision, checkpoint, latest work-item run IDs, gaps and findings; `--details` includes contract and full history. Normal task operations resolve the current revision; pass `--revision` or `--checkpoint` to pin an expected state. Editing the contract still requires `task open --revision HASH --reason TEXT`; repository/base stay fixed.

`task check` gathers stopped, valid `done` work-item results, checks ownership, captures integrated content and runs required checks. A collected `passed` submission means ready for verification, not accepted. Invalid or failed worker results require explicit classification before continuing. Required checks are run independently; a failing check is visible in `gaps` and blocks acceptance. Repeating `task check` on the same checkpoint reuses intact passed receipts. Use `--rerun` if dependencies/services/environment changed or a new execution is needed. Runtime cannot infer such external changes.

New work-item attempts, contract revisions or changed source invalidate the prior checkpoint. Fresh snapshots need fresh checks/reviews; no speculative cross-version cache applies. Snapshot identity includes tracked, staged and relevant untracked content without changing the user's index. Submodules, nested repositories, sparse checkouts, assume-unchanged files and external/Git-metadata symlinks are refused. Coordinator-authored integration edits are included in the final snapshot and review.

For a targeted rerun or diagnosis, `verify CHECKPOINT --check ID` executes one approved check. `checkpoint create --session SESSION --task TASK --revision HASH --cwd PATH` exposes the same snapshot operation separately; it requires submitted work and is not another acceptance workflow.

## Findings and failures

For a demonstrated false finding, use:

```text
<dk> task disposition --session SESSION --task TASK --finding FINDING_ID --resolution refuted --evidence RECEIPT_ID --reason "What the approved check demonstrates"
<dk> task disposition --session SESSION --task TASK --finding FINDING_ID --resolution refuted --source /abs/citation.json --reason "Why these lines disprove the claim"
```

Choose one evidence kind. A receipt must be a passed approved check from the current checkpoint. A source citation is `{"file":"src/take.mjs","start":12,"end":16}`; runtime reads and stores those exact lines and blob identity from the frozen tracked file. Source evidence fits claims settled by inspection; concurrency, timing and environment claims generally need execution. The coordinator is responsible for the reasoning; capturing a citation cannot prove its logical relevance automatically.

`needs-decision` keeps the finding unresolved. A real code fix requires a new checkpoint; `fixed` cannot clear a finding on an old snapshot. `accepted --authorization FILE` records an explicitly user-authorized exception. `task accept --authorization FILE` similarly permits named remaining gaps with status `accepted_with_exceptions`, never `verified`. Existing authorization for a finding is reused; no repeated user confirmation is needed.

Classify a stopped unsuccessful attempt with `task submit --session SESSION --task TASK --work-item ITEM --run RUN_ID --outcome failed --reason TEXT`. Use `infrastructure`, `capability` or `uncertain` when appropriate. Internal test iterations do not count. The default allowance is two semantic failed submissions per item/profile; optional `max_failed_submissions` changes it. `task escalate ... --work-item ITEM --agent CONFIGURED_PROFILE --reason TEXT` selects a fresh replacement without erasing item history. The separate preset continuation budget still applies.

`task report --session SESSION --task TASK --format json|csv` reports observed runs, costs, corrections and elapsed time. CSV is returned as `{format,content}`. Missing cost stays unknown; coordinator/human effort is not measured. No automatic model substitution or subscription-limit balancing is performed.
