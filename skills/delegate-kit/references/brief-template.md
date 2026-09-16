# Self-contained briefs

Give a worker the intended outcome, necessary facts/files, constraints, workspace ownership, acceptance checks and authorized finishing actions. Keep unrelated transcripts and logs out. The runtime adds profile instructions and the canonical result contract; `when` is only for the coordinator.

```
Task: <bounded outcome>
Goal: <observable behavior>
Specification: <essential requirements or accessible spec artifact>
Relevant context: <files/sources and why they matter>
Workspace: <absolute local worktree or daemon workspace handle>
Ownership: <editable scope; preserve other contributors' changes>
Constraints: <contracts, dependencies, permissions>
Acceptance: <checks and expected results>
Finishing actions: <commit/integration/publish only as authorized>
```

A writer needs an isolated linked worktree or an owned Paseo workspace. Make referenced artifacts readable within its permissions. Some read-only paths exclude shell; ask the coordinator to run command checks instead of changing access. Worktree isolation does not itself sandbox tools.

For a researcher, request primary sources/code evidence and explicit uncertainty. For a planner, request dependencies and criteria, not implementation. For a reviewer, provide the frozen diff and spec without author reasoning or other reviewers' findings. A lens (spec, correctness, standards) can prioritize attention while still allowing material findings outside it.

Continuation example: “Check reconnect behavior and update the result; preserve the accepted investigation.” `resume` retains the exact agent and snapshot. Re-review example: “Findings 1 and 3 are fixed in this diff; finding 2 is refuted by this test. Check the new hunks and dispositions.”

A fresh replacement gets the current worktree/diff, accepted results, the concrete remaining failure and unfinished checks. Verify the prior writer stopped and ownership was released. Independent review always starts with fresh context, even when it uses the same model.
