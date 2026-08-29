# External workers: the other family, through `agent-run`

A coordinator can spawn only its own family natively. A worker from the other family is a **headless CLI session** — `claude -p` or `codex exec` — started by `scripts/agent-run`. It is launched once with a complete brief, runs to a terminal state, and returns one JSON result. Nothing steers it mid-run; a follow-up is `agent-run resume <id>`. That is the whole difference from a native worker, and every rule below follows from it.

| Worker family | coordinator = Claude Code / T3 | coordinator = Codex |
|---|---|---|
| Claude (`fable`, `opus`, `sonnet`, `haiku`) | native | **external** — `agent-run run --backend claude` |
| GPT (`gpt-5.6-sol`, `-terra`, `-luna`) | **external** — `agent-run run --backend codex` | native |

`agent-run route --role <role>` resolves family and dispatch in one call and prints the exact invocation. `run` without `route` works too; it warns when the worker could have been native.

## Preflight

Before the first external call of a task, confirm the CLI is there: `command -v codex` / `command -v claude`. `route` does this itself: when the other family's CLI is missing, a reviewer or verifier comes back as a fresh **native** worker with `independent: false` and a note — the review still happens, on the author's family, and the report says so. Any other role in that state needs the CLI installed or `--backend` on the coordinator's own family.

## Starting and collecting

```
agent-run run --role <role> --backend <family> [--cwd <worktree>] --brief brief.md [--detach] [--timeout MIN] [--on-finish CMD]
agent-run wait <id> | status <id> | list | log <id> [out|err|prompt] | kill <id> | resume <id> --brief next.md
```

- **One worker, nothing else to do** → `run` blocks and prints the result.
- **Several staggered workers, or a coordinator that must stay responsive** → `--detach`, then either `wait <id>` or `--on-finish CMD`. The hook fires exactly once per run on any terminal state, with the result on stdin and `DK_RUN_ID`, `DK_STATUS`, `DK_RESULT_PATH` in the environment; a non-zero exit is retried, delivery survives a dead supervisor. Point it where the coordinator will actually look — a log it tails, a desktop notifier. Without a hook, an external worker is invisible until polled.
- **Run states.** `status` is how a run ended; `lifecycle` is whether `resume` can still revive it (`parked`) or not (`done`). `orphaned` (supervisor died) and `timeout` are terminal but the worker has usually committed before dying — read the worktree before rerunning.
- **Timeouts are a fuse.** Writers and planners 90 min, reviewers and researchers 45; `--timeout` raises one run. Set it up front for a brief you expect to be long.

### Under a Codex coordinator

Codex's shell tool yields after `yield_time_ms` (default 1 s) and returns `Process running with session ID N` — the process is alive, the output is simply not there yet. A blocking `agent-run run` or `wait` therefore needs `yield_time_ms: 300000` on every call, and an early return is reaped by session id, never retried with a fresh `run` (each retry starts one more worker). `--detach` + `status` polling sidesteps the issue.

## Presets: which subscription pays

Quota is not symmetric over time. A preset moves the token-heavy roles — planner, implementer, researcher — onto one family:

| Preset | planner | implementer | researcher | reviewer / verifier |
|---|---|---|---|---|
| `auto` (default) | claude | codex | claude | derived from the author |
| `main-claude` | claude | claude | claude | derived from the author |
| `main-codex` | codex | codex | codex | derived from the author |

The reviewer follows the **author**, never the preset: `main-claude` implies a Codex reviewer, `main-codex` a Claude one. A review is one read-only pass over a frozen diff, a fraction of what the implementer spends, so the preset still moves the bulk of the cost. Under `auto`, `--kind ui` sends the implementation to Claude and the reviewer follows.

Precedence: the words in the request (`main-claude`, `main-codex`; aliases `main-gpt`/`main-openai`, `main-anthropic`) → `--preset` per call → `DELEGATE_KIT_PRESET` → `agent-run preset <P>` persisted in `~/.delegate-kit/config.json` → `auto`. Explicit `--backend` / `--model` / `--effort` win over the preset, and the user can name a model for one role ("review with Sol").

Per-role defaults for one user, in the same file — the shipped table in `scripts/agent-run` stays the default for everyone:

```json
{ "preset": "main-claude",
  "roles": { "planner": { "claude": ["fable", "xhigh"] }, "reviewer": { "codex": ["gpt-5.6-sol", "xhigh"] } } }
```

`agent-run preset` alone prints the effective table. A malformed entry is reported and ignored.

## Limits and safety

- **Delegation depth is 1.** `agent-run` disables subagents on both CLIs; the shipped `dk-*` definitions carry no `Agent` tool.
- **Writers** run in a worktree under the backend's own sandbox (`workspace-write` / `acceptEdits`); the dangerous modes are outside this skill. `agent-run` refuses a worktree locked for a native writer, and the reverse.
- **Read-only roles** run under `codex -s read-only` / `claude --permission-mode plan` — the enforced boundary a native role lacks. When it matters (an untrusted diff, a risk zone), dispatch that role externally even inside the family.
- **Quota fallback.** On a usage or rate limit `agent-run` retries the brief once on the other family and marks the result `fallback_from`. For a reviewer that can land the review on the author's family — the result says so; report it or re-run later. `--fallback none` disables it; resumes never fall back.
- `hooks/gate.sh` makes dangerous shell commands need the user's confirmation in the coordinator (Claude: the approval prompt; Codex: denied with instructions to confirm and re-run prefixed `DELEGATE_KIT_CONFIRMED=1`).
- The ledger `~/.delegate-kit/ledger.jsonl` records model, effort, preset, lens, tokens, duration and outcome per external run. Read it before changing a default.

A Claude coordinator under `main-claude` runs everything natively and pays for exactly one external session — the Codex reviewer. That is the cheapest shape this skill has.
