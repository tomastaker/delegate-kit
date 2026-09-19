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

Optional `baseline` records known failures/environment gaps. `trivial: true` explicitly classifies a trivial task; otherwise independent review remains required even if `review.required` is false. Optional `check.report` has positive `min_tests` and optional relative JSON report `path`, protecting against exit-zero with no discovered tests. Checks run in the prepared integration workspace, reusing its ignored dependencies and build environment. Reviewers read a separate frozen snapshot. Each check holds the existing workspace lease and verifies source identity before and after execution; a change makes the evidence inconclusive.

An environment smoke check may set `before_edit: true`. Assign it to the work item alongside its behavioral checks. It uses exit status and cannot also declare `report`: keep test-count/target reports on a separate behavioral check. Probe the actual required capabilities (e.g. browser startup, connection to the dedicated test DB, cache writes), not just versions. Codex CLI executes these before its model prompt; other routes must execute them with their own tools before editing. See [execution access](external.md#explicit-execution-access). Record a known baseline failure without claiming it was introduced by the worker. A bug fix needs reproduction or concrete causal evidence; otherwise submit `uncertain` and identify the observations needed.

The worker's generated result schema names its required checks. `check_results` must cover each once with outcome and evidence; missing/blocked checks prevent `done`. This leaves `not_verified` available for optional limitations. Worker results remain claims: final acceptance still requires runtime receipts and independent review.

## Normal sequence

```text
<dk> task open --session SESSION --task TASK --contract /abs/contract.json
<dk> prepare --session SESSION --task TASK --work-item fix --cwd /abs/writer-worktree
<dk> run RUN_ID
<dk> wait RUN_ID --timeout-ms 60000
# Triage assignment coverage, checks and interfaces; return concrete omissions.
# Integrate completed changes, then:
<dk> task check --session SESSION --task TASK --cwd /abs/integrated-repository
<dk> prepare --session SESSION --task TASK --checkpoint current --agent review-general
<dk> run REVIEW_RUN_ID
<dk> wait REVIEW_RUN_ID --timeout-ms 60000
<dk> task accept --session SESSION --task TASK
```

Run each returned member of a reviewer set. Reviewer cwd is the frozen snapshot regardless of the coordinator's directory. Initial review uses a fresh executor session.

`prepare --work-item` derives the configured profile from the contract; an explicit different profile is rejected unless recorded by escalation. `--brief FILE` adds context when needed. `--checkpoint current` avoids manually copying snapshot IDs. `task show` returns compact status, revision, checkpoint, latest work-item run IDs, gaps and findings; `--details` includes contract and full history. Normal task operations resolve the current revision; pass `--revision` or `--checkpoint` to pin an expected state. Editing the contract still requires `task open --revision HASH --reason TEXT`; repository/base stay fixed.

`task check` gathers stopped, valid `done` work-item results, checks ownership, captures integrated content and runs required checks. A collected `passed` submission means ready for verification, not accepted. Invalid or failed worker results require explicit classification before continuing. Required checks are run independently; a failing check is visible in `gaps` and blocks acceptance. Repeating `task check` on the same checkpoint reuses intact passed receipts. Use `--rerun` if dependencies/services/environment changed or a new execution is needed. Runtime cannot infer such external changes. Check commands may produce ignored artifacts but must leave source content unchanged. Before project code starts, the check group leader records its PID and birth identity in the workspace lease. An interrupted verification retains that lease: inspect the verifier PID, recorded child group and birth identity, confirm they stopped, then explicitly remove only that abandoned lease.

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

Classify a stopped unsuccessful attempt with `task submit --session SESSION --task TASK --work-item ITEM --run RUN_ID --outcome failed --reason TEXT`. Use `infrastructure`, `capability` or `uncertain` when appropriate. Internal test iterations do not count. Two semantic failures set the advisory `reconsider` flag; there is no implicit failure cap. An explicit `max_failed_submissions` remains a hard per-item/profile limit. `task escalate ... --work-item ITEM --agent CONFIGURED_PROFILE --reason TEXT` records the next decision without erasing item history. It may retain the same profile after revising the approach or resolving an environment blocker; an exhausted explicit limit still requires another eligible profile. Explicit preset run/continuation limits still apply. Use a targeted brief for the next attempt; a stronger model alone does not resolve a missing reproduction or broken environment.

`task report --session SESSION --task TASK --format json|csv` reports all observed attempts, costs, corrections and elapsed time. CSV is returned as `{format,content}`. Use `accounting.by_billing` to distinguish API/subscription/unknown and reported amounts from shell estimates. The retained `observed_run_cost_usd` is a legacy mixed sum, not an invoice. Missing cost stays unknown; coordinator/human effort cannot be attributed to this task. No automatic model substitution or subscription-limit balancing is performed.

## Test environment ownership

Use project commands to prepare and run the local environment. Starting a task-owned server, browser or test DB is permitted within the assigned permissions and authorization. Allocate distinct ports and test namespaces or serialize declared shared resources. Record the owning run, workspace/source version, endpoint, process identity (PID plus birth identity or an equivalent handle), DB namespace and browser session in the check's artifacts. Stop only resources this task created and still owns. A busy port is a reason to choose another port or report a conflict; it does not authorize a project script to kill its current listener.

The existing `resources` claims coordinate active workers; they do not discover outside processes or own services left running after a worker stops. A check runs in its own process group. On exit or timeout, Delegate Kit stops remaining members of that group and marks the check inconclusive; it releases the workspace only after the group has stopped. If termination cannot be confirmed, the lease remains for manual recovery. Project launch/check scripts must still clean up resources outside that group, including deliberately detached services, DB namespaces and browser sessions. Delegate Kit is not a general service supervisor.

For checks against a running application, declare `report: {"min_tests":1,"targets":["app"]}`. The report must contain ordinary test counts plus `targets: [{"name":"app","identity":"observed endpoint and instance identity","source_tree":"observed Git tree"}]`. Runtime rejects missing/duplicate targets and a tree different from the checkpoint, and preserves the observed identities in its receipt. It supplies `DELEGATE_KIT_CHECKPOINT`, `DELEGATE_KIT_SOURCE_TREE` and `DELEGATE_KIT_WORKSPACE` for the project script to compare with the actual target.

The script must establish that identity by inspecting the service or starting its own instance from the checkpoint-matching integration workspace. Merely echoing the expected environment variable into the report is not verification. Record test DB/browser ownership separately in artifacts and include their actual identities in the check result. If source provenance cannot be established, keep the check unverified. A correct command cwd alone does not establish the source of an external server.

Task state and run records are authoritative. `task show --details` exports task history and `task report` exports accounting. Existing `ledger.jsonl` files remain historical; new operations do not duplicate state into a second event log.
