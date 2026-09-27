# Verification

For an installation with a dangling Delegate Kit shell hook, see the separate [hook cleanup instructions](hook-cleanup.md). This maintenance note is outside the installable skill.

## Behavioral scenarios

Use a configured team and inspect the actual reads, selected profiles, launches and returned evidence. A confident final report alone is not a trace.

| Scenario | Expected behavior |
| --- | --- |
| One explicit invocation | Reads the selected team and local quality rules without repeated prompting. |
| Small understood change | No automatic planner or full roster; applicable checks remain. |
| Research or plan only | Returns findings or a plan without editing project code/configuration. |
| Independent parts of a larger plan | Chooses suitable specialists per part and parallelizes independent work. |
| Specialist from the coordinator's family | Launches natively with the profile's model. |
| Specialist from the other family | Launches through `codex exec` or `claude -p` on the subscription; no plugin, API key or third-party provider. |
| Missing executor, model or authorization | Names the missing capability; only preauthorized alternatives; no installation or account switch. |
| Remote execution | Checks tools and paths on the execution host. |
| Non-Git folder or unavailable isolation | Uses a safe available ordering; no mandatory worktree. |
| Interactive UI change | Exercises the user action, verifies resulting state and inspects rendered appearance. |
| Related changes from two workers | Checks integration and reviews the combined result once. |
| Defect plus optional suggestions | Resolves the defect with evidence and targeted follow-up; avoids a polish loop. |
| Edit after verification | Refreshes affected evidence, reuses unaffected checks. |
| Timeout or lost connection | Keeps status uncertain until checked; no blind overlapping writer. |
| Waiting on a terminal run | One shell-side watch per run, tracked by PID; wakes the coordinator only on exit, a 10-minute silent log or the time budget; no model-side polling. |
| Existing independent review or strict response contract | Counts equivalent review and preserves native completion format. |
| Add or replace a specialist | Changes only the selected team file or explicit task override. |
| Change touching payments, auth or production data | Announces and runs cross-review by both families in parallel. |

## Validation record — 2026-09-20

The rewrite starts from Delegate Kit commit `2737718a8ab7aeeaba2b2bdbbce1372fe7079d02`. The working tree was clean before changes. Quality Policy at `e1656ded733d24f1c6d0ef51faf3a560dcb3253d` was read as source material; its repository and installed copy were not modified.

- Text inspection: scenario coverage, profile-before-route selection, economy by assignment, permissions, quality boundaries and removal of the old execution path.
- Instrumental checks passed: `python3 docs/check_package.py`; the same check on a copied package in a path containing spaces, launched from another directory; the skill-creator `quick_validate.py` validator; `git diff --check`; inspection of the remaining files and search for active references to removed runtime paths.
- Discovery passed: `DISABLE_TELEMETRY=1 npx --yes skills add /absolute/path/to/checkout --list` found exactly one skill, `delegate-kit`, without installing it.
- Validator environment: system and bundled Python lacked PyYAML; `uv run --no-project --with pyyaml python /absolute/path/to/quick_validate.py skills/delegate-kit` passed using an isolated dependency environment. The package and local checker have no PyYAML dependency.
- Real agent behavioral runs: not performed. Native and CLI behavior, model availability, user accounts and cross-harness operation remain unverified. No paid probe or global installation was made.

Follow-up configuration update: the package now includes an empty default team, `team.example.md` and `gpt-team.md`. The eight GPT profiles were checked against the supplied screenshot for names, models, reasoning and access labels. Truncated descriptions are explicitly identified. Native route selection depends on harness capabilities, not the coordinator's model family. No live profile launches were performed.

Default team update — 2026-09-23: `team.md` now holds the mixed Claude + GPT team with primary and alternate models, an Opus 5.5 limit fallback for the researcher and basic implementer, and a cross-family review rule. Model identifiers were checked against the local Codex model cache and `claude --help` on both machines. No live profile launches were performed.

Single team update — 2026-09-24: `gpt-team.md` and `team.example.md` were removed. `team.md` now lists a GPT and a Claude option per role, sends work to the family other than the coordinator's, adds a planner trigger, Fable 5.1 for exceptional planning and escalation, and cross-review for high-risk changes. Routes are fixed: native for the coordinator's family, `codex exec` or `claude -p` for the other, on subscriptions only. `quality.md` was shortened around evidence by change type. Model identifiers and effort levels were checked against the local Codex model cache (CLI 0.155.1); subscription login was confirmed with `codex login status` and `claude auth status`. No live profile launches were performed.

Run `python3 docs/check_package.py` from any directory using its absolute path. It checks the instruction and team package, one discoverable entry point, this package's simple frontmatter and relative file links. It does not prove that a model follows instructions, validate remote URLs, or exercise an executor.

For a live follow-up, use an authorized environment with a configured team: first a small ordinary task, then a task requiring delegated implementation and independent review. Record real tool traces and inspect resulting artifacts. Repeat in another environment before claiming observed portability across those environments. Keep failures and unperformed checks explicit.
