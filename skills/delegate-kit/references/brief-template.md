# Briefs and role results

For managed work, runtime supplies the full specification text, work-item ownership, relevant checks, constraints and finishing actions from the contract. A separate brief is optional: add only missing context, expected local results, dependency interfaces, useful file pointers or a targeted correction. Check-to-requirement links do not prove that other shared requirements can be dropped. Avoid copying the contract or full conversation into it.

For standalone read-only work, a brief can be a few sentences: the question, relevant repository/sources, scope, evidence expected and any access constraint. Planning should resolve decisions; research should distinguish verified facts from uncertainty. Reviewers receive the frozen specification and snapshot without the author's reasoning or other reviewers' initial findings.

Every role returns `status`, `summary`, `not_verified` and `questions`, plus its own payload:

| Profile | Payload |
|---|---|
| Writer (including custom roles with write access) | `changes`, `checks_run` |
| Researcher | `sources` |
| Planner | `plan` |
| Reviewer / verifier | `findings` |
| Review lead | `plan`, `findings` |
| Other read-only roles | Common fields; put the requested outcome in `summary` |

The exact schema is supplied at dispatch and saved in the run directory. For bound writers the schema also includes `check_results` for assigned mandatory check IDs; report each once as passed, failed, blocked or not_run, with actual evidence or a blocker. `done` requires every mandatory check to have passed. Optional caveats remain in `not_verified`. Do not add unrelated empty arrays. `checks_run` records worker claims; task verification uses trusted runner receipts separately.

For a continuation, give the concrete remaining issue and requested evidence. `resume` retains the exact executor session. A different profile/model/harness or independent judgment requires fresh context. Stop and inspect the prior writer before transfer; preserve useful partial changes and the work-item history.
