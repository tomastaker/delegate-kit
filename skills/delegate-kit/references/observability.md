# Team status reporting

This protocol is active for every delegated task; the user does not enable it with a command or preset field. Runtime state is the source of truth. Use `overview --session HOST:ID --task TASK` to confirm launch state, then retain its cursor and use compact `watch --session HOST:ID --task TASK --after CURSOR --timeout-ms 60000` while agents remain active. Use `watch --full` only for diagnosis.

## Low-noise policy

1. Before preparation, state the planned count by role/profile and requested executor.
2. When dispatch immediately follows preparation, omit a separate prepared message and send one launch update after actual dispatch. Surface prepared reservations separately only when dispatch waits, fails or needs user action.
3. Show the full active roster once after launch. After that, show only rows whose meaningful state changed. Repeat the full roster only after a material team change such as adding, replacing or removing an agent.
4. On an unchanged one-minute timeout, send at most one aggregate one-line heartbeat while work remains active, and only if no other meaningful commentary was sent during that interval. Never repeat agent rows, task descriptions or models in an unchanged heartbeat.
5. Report attention immediately. Before final handoff, report completion, acceptance and any failed, blocked or unverified run.

The timeout performs no model call, but tool output and commentary still occupy coordinator context. Compact watch results and deduplicated messages therefore matter. Do not narrate every poll or streaming-progress update.

## One-line interface

Use one line per displayed agent, localized to the user's language:

```text
🟢 Implementer — implementer-api — работает
🟢 Implementer — implementer-ui — работает
🟡 Researcher — research-auth — завершён, ожидает интеграции
🔴 Reviewer — reviewer-hard — требует внимания
```

Use the assigned short outcome instead of the profile when it is already known and fits on one line. Otherwise the stable profile is the task label. Show requested models in the initial plan/launch update and again only when identity changes or is relevant to a problem. Call a model runtime-confirmed only when `actual_model` is present.

Indicator semantics:

- 🟢 active work with confirmed execution, or a verified task completion;
- 🟡 reserved, starting, cancelling, or completed but not yet accepted/integrated;
- 🔴 permission, orphaned, blocked, failed, timeout, or any health state requiring attention.

For an unchanged timeout use only the aggregate row, for example:

```text
🟢 Delegate Kit — 4 агента — работают 3, завершён 1, проблем 0
```

Use lifecycle terms precisely: `prepared` is reserved and `starting` is dispatching. Count an agent as started only when `execution_started` is true; this requires a spawned executor process. Older host records use their saved attachment evidence. `running` without that evidence is not yet working. `permission` needs user action, and `finished` is completed but not coordinator acceptance. A continuation replaces its earlier attempt in agent counts; `summary.attempts` in the full overview retains the audit total. The stage follows confirmed active work, while reserved later roles remain visible without advancing it.

`watch` is event-driven over meaningful lifecycle, health, identity and task acceptance changes. It intentionally ignores heartbeat-file churn and streaming token output. Its timeout is a liveness cadence, not evidence of worker progress and not permission to retry.

Task acceptance comes from `task_status`; `summary.verified_tasks` counts distinct verified tasks. Finished worker runs do not have an independent acceptance flag.

## Available usage and cost

`overview`, compact `watch` and `task report` include accounting for every attempt, including failed runs, reviewers and continuations. Agent rows show the latest attempt's raw usage and classified cost; the aggregate includes earlier attempts too. Report cost with meaningful lifecycle updates, not streaming token polls.

`accounting.coverage` remains partial because coordinator usage cannot reliably be attributed to a task. `by_billing` separates configured API, subscription and unknown payment modes, with separate reported and estimated dollar fields and counts of unknown runs. Omission is unknown, not zero. Claude, OpenCode and Pi/OMP amounts are shell/SDK price estimates; even an observed zero is not evidence of a free API call. Codex/Gemini provide usage when available but no monetary amount. Legacy host records may lack usage. Abruptly stopped runs may have no measurement.

Do not convert subscription tokens to money or describe an estimate as a charge. Configured billing is a user declaration, not authentication detection. Raw token fields retain their harness semantics (cached input may overlap input); do not blindly sum them. No extra model calls, price lookups or billing requests are made. Example: “Расходы частичные: оценка оболочки $0.18 при неизвестном способе оплаты; у 3 из 5 запусков стоимость неизвестна; оркестратор не учтён”.
