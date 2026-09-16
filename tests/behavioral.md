# Behavioral acceptance protocol

These cases are prepared for manual or explicitly authorized model evaluation. They are not claimed as executed model tests. Use the same frozen repository, task, model settings and authorization for baseline-without-skill, v1 and v2. Configure actual permitted models in place of the symbolic executor IDs; no commercial model name is a test condition.

Use one complete preset with descriptions for general research, alternative research, ordinary implementation, UI implementation, complex contract work, independent review and an optional planner. Copy it to Y2 and change a chosen executor explicitly. Fix the repository revision and retain session/run handles, briefs, accepted results, checks and usage artifacts.

| Case | Request | Observable outcome |
|---|---|---|
| Direct | Correct one understood typo already visible in context | Direct edit is valid; no mandatory planner/worker |
| Research | Find the exact reconnect contract in source/docs | Configured researcher gets a bounded brief; no automatic parent model inheritance |
| UI | Fix responsive menu layout | Chosen specialist's description fits UI; real browser verification follows project rules |
| Auth text | Change the registration-page label only | Complexity is judged from the change, not the word auth |
| Complex | Resolve conflicting persistence/retry invariants | Planner/complex specialist may be useful, with a stated reason |
| Parallel | Two independent owned modules with stable interfaces | Independent briefs/workspaces; no duplicate coordinator implementation |
| Waiting | Worker runs longer than parent wait | No duplicate launch or repeated LLM polling; compact eventual result |
| Repair | Initial result omitted one boundary check | Same executor session receives a concrete continuation |
| Independence | Ask for a second review | Fresh session; neither reviewer sees the other's initial conclusions |
| Session | X1 in chat A, Y2 in chat B, same cwd | Independent bindings; neither chat model changes |
| Policy | Repeat cases with two different coordinators | Same policy and preset contract; no coordinator-intelligence branches |

Record accepted behavior, actual checks, rework, starts versus continuations, elapsed time, user interventions, coordinator context/messages and available usage. Missing usage stays unknown. More delegation is not success; no universal savings or quality percentage follows from this evaluation.

## Opt-in live Codex smoke

Run `node tests/live-codex.mjs --execute --writer-model gpt-5.6-sol --reviewer-model gpt-5.6-luna` only with authorization for those model calls. Without `--execute` it prints help. It uses the existing Codex connection, low reasoning, at most four dispatches, and an isolated temporary repository/worktree/state. It verifies a real fix against tests, exact-session continuation with a remembered random marker, independent review, bounded wait without duplicate launch, and cancellation. Artifacts and report.json remain in the printed temporary directory. On failure it attempts to stop its own runs. CI never invokes this live script.

The first authorized run on 2026-09-16 passed all four lifecycle cases with Sol/Luna. It did not evaluate the full semantic selection table above. Technical fixtures in v2.test.mjs cover failed native dispatch reconciliation, stale continuation events, watchdog alerts, migration and RPC usage without model calls.
