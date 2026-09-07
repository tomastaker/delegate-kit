---
name: delegate-kit
description: Choose when and how to delegate repository work, isolate writers, and verify changes through fresh-context review. Use for scoped features, refactors across modules, delegation requests, implementation plans, and second opinions. Works with one or two model families; supports native workers and documented CLI adapters.
license: MIT
---

# delegate-kit

The current session is the coordinator. It owns user intent, decomposition, briefs, integration, verification and reporting. Workers receive bounded tasks and do not delegate further.

## 1. Shape

Choose the first applicable shape. Small work stays in the current session.

| Shape | When | Who |
|---|---|---|
| DIRECT | Clear work in roughly 3 files; explanation or diagnosis; destructive or production-adjacent work | coordinator |
| SCOUT | Finding relevant code or primary sources is the independent outcome | one read-only worker, then reassess |
| PLAN | Ambiguous business rules, several modules, or a large change needing decomposition | senior planner, unless the coordinator already has a sufficient plan |
| SINGLE | One well-specified vertical slice too large for DIRECT | one writer in a worktree |
| PARALLEL | Independent outcomes with disjoint write scopes and stable interfaces | one writer per outcome |
| SEQUENTIAL | A result changes the assumptions of the next task | one worker at a time |

State the shape and why, except for obvious DIRECT work. Coupled edits stay with one owner. Default writer cap 3, ceiling 8; total workers = writers + 3. Raising the cap requires the user's permission and a file ownership partition. Delegation depth is 1.

## 2. Establish available executors

Read `references/routing.md` before the first dispatch. Use the current session's actual tools, model picker/catalog and permissions. `agent-run doctor` lists installed adapters without calling models; installation alone does not prove authentication or model access.

No JSON is required. Use the current family; add a second only when authorized and available. `auto` resolves to `solo` for one family and `duo` for two. Each family may contain multiple selectable models.

**Quality-first defaults:** use the main senior model for implementation, planning, review and adjudication. For simpler work, reduce supported reasoning effort before changing model tier. Small and mid-tier workers are exceptions for bounded source extraction or fast lookup with independently checkable output. They do not implement or certify changes by default. A request for a recommendation, architectural judgement or diagnosis is not extraction. User-specified assignments override these defaults.

Choose reasoning for risk and ambiguity, not just diff size: low/normal for straightforward work, high/deep for complex reasoning. Pass only values supported by the selected model and host; names are not portable across providers. If no alternative is established, inherit the current model. If that model's seniority is unknown, say so rather than inventing a ranking. `references/roles.md` describes role-specific decisions.

## 3. Spec and route

Use the user's accepted requirements and repository-defined spec/tickets. For multi-slice work, record scope, dependencies and acceptance criteria in `.scratch/<task>/`; existing tickets are the source of progress. Do not overwrite unfinished plans.

For each role, decide the executor from the task and allowed pool, then resolve the concrete invocation:

```
agent-run route --role planner --parent codex
agent-run route --role reviewer --parent codex --families codex,claude --author-backend self
```

Pass `--backend`, `--model` and `--effort` for deliberate choices; retain the reason. Hard JSON role assignments are binding unless the user overrides them; preferences guide selection. Avoid overriding hard assignments with an autonomous flag. The route reports the source of selection, supported transport, required fresh context and family diversity separately.

Native dispatch: `references/hosts.md`. External dispatch and resume: `references/external.md`. Before using a new CLI/model combination, read the relevant adapter contract and official links in `references/providers.md` and inspect the installed CLI's help. Check its actual model and effort capabilities.

## 4. Brief and isolation

Use `references/brief-template.md`: outcome, scope, spec, acceptance commands and required result. A stranger with only the repository must be able to start.

Every writer gets a worktree: `agent-wt create <task>`. Native writer: take `agent-wt lock <task>` and pass the absolute path. External writer: `--cwd <worktree>` takes the lock. One writer per worktree. Worktrees branch from HEAD: account for relevant uncommitted work before delegating; preserve other changes.

Workers return the object in `references/result-schema.json`. A blocked worker returns precise questions; the coordinator resolves them and resumes the same worker when useful.

## 5. Review

Review any delegated implementation, risk-zone change, or coordinator-written change over roughly 50 lines. Freeze the diff and provide the spec to a **fresh read-only agent**, including in solo mode. Do not preload the author's reasoning as proof. A separate family can add diversity; it is not a guarantee of independent errors.

```
agent-wt diff <task> > review.diff
agent-run route --role reviewer --parent codex --author-backend self --diff review.diff
```

Choose a capable reviewer according to task risk and known model strengths. In duo mode, prefer another family when otherwise comparable; a same-family reviewer remains valid. `single` is the default. For large, ambiguous or risky changes, consider complementary reviewers. Use diff thresholds as a proposal, not proof that more agents help. `panel` and `led` require user approval or an existing `review.allow_multiple` grant. Solo can use multiple fresh reviewers too. `references/review.md` defines lenses and reconciliation.

Verify disputed findings with a command first. Fix mechanical findings directly; substantive fixes return to the implementer, or a fresh writer when the earlier context is long or stale. Give it the diff, findings and prior summary. After a behavior-changing fix, rerun affected checks and ask the same reviewer to inspect the new hunks and finding dispositions. If resume is unavailable, brief a fresh reviewer explicitly.

## 6. Integrate and report

Inspect results and run the acceptance commands before declaring completion. A worker's done status is evidence, not certification. Run checks excluded by a read-only adapter in the coordinator's authorized workspace. Report those limits.

Integrate and publish according to user authorization and repository conventions. Release/remove worktrees only after preserving accepted work. Update ticket status after acceptance checks pass.

Report what changed, checks actually run, unverified behavior, remaining steps, mode, selected models and selection sources. Report actual model only when confirmed by runtime metadata; otherwise label it unknown. Report fresh context and family diversity separately. Finish with closed X of Y and the next unfinished item when tickets exist.

## 7. Handoff

For an ownership transfer, write `.scratch/handoff/<date>-<task>.md` with state, blockers, decisions and pointers to specs, tickets and diffs. No secrets.
