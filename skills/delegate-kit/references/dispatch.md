# Dispatch: native or external, and which subscription pays

Every worker has two independent properties: which **family** the model comes from (Claude or GPT) and how it is **dispatched** — natively by the parent harness, or externally as a headless `claude -p` / `codex exec` session through `agent-run`. `agent-run route --role <role>` resolves both; this file is the reasoning behind its answer.

## Native inside the family, external across it

A parent can only spawn its own family natively:

| Worker family | parent = Claude Code / T3 | parent = Codex |
|---|---|---|
| Claude (`fable`, `opus`, `sonnet`, `haiku`) | **native** — `Agent` tool, `subagent_type: dk-<role>` | external — `agent-run run --backend claude` |
| GPT (`gpt-5.6-sol`, `-terra`, `-luna`) | external — `agent-run run --backend codex` | **native** — `spawn_agent`, agent `dk-<role>` |

Native is the default inside the family: no CLI cold start, no log to read back, the result lands in the parent's own turn, and the subagent can be continued in place. The role definitions carry the model, the effort and the tool list — `agents/dk-*.md` for Claude Code, `[agents.dk-*]` in `~/.codex/config.toml` for Codex, both installed by `hooks/install.sh` — so a native dispatch is the role name plus the brief. The brief is the same document either way; `references/brief-template.md`.

### What native gives up

Exactly the things a bad delegation loses first, so choose external — even inside the family — when one of them matters:

- **An enforced sandbox.** External read-only roles run under `claude --permission-mode plan` / `codex -s read-only`. A native role is read-only by instruction and by a tool list with no writer in it — fine for a reviewer you dispatched yourself, not fine as the isolation boundary around an untrusted change.
- **The strict result schema.** External workers are held to `references/result-schema.json` by the vendor's structured-output flag; native ones follow it because the definition asks. Expect to re-read a malformed result occasionally.
- **Ledger, run id, timeout, quota fallback.** All live in `agent-run`. To compare models later, resume a worker tomorrow, or have the other vendor pick up when this one hits its limit, go external.
- **The write-lock for free.** `agent-run` takes the worktree lock itself; a native writer needs the parent to take and release it:

```
agent-wt create <task> && agent-wt lock <task> --label dk-implementer
# dispatch the native subagent; the brief names the worktree path
agent-wt diff <task> > review.diff ; agent-wt release <task>
```

`agent-run` refuses to start an external writer in a worktree locked this way, and the reverse — one writer per worktree, however it was dispatched.

## Presets: which subscription pays

Quota is not symmetric over time. A preset moves the token-heavy roles — **planner, implementer, researcher** — onto one family:

| Preset | planner | implementer | researcher | reviewer / verifier / lead |
|---|---|---|---|---|
| `auto` (default) | claude | codex | claude | derived from the author |
| `main-claude` | claude | claude | claude | derived from the author |
| `main-codex` | codex | codex | codex | derived from the author |

The reviewer and verifier are **never moved by a preset**. They are derived from whoever wrote the code, because independence is the reason they exist; a knob that could flip them would buy quota with the one property delegation is for. The consequence is explicit: `main-claude` implies a Codex reviewer, `main-codex` a Claude one. That is cheap — a review is one read-only pass over a frozen diff, a fraction of what the implementer spends — so the preset still moves the bulk of the cost. If the family you are sparing is also the one that must review, run the review later rather than on the author's own family.

Under `auto`, a UI/design-heavy implementation goes to Claude (`--kind ui`); the reviewer follows.

Set it, in order of precedence:

1. in the invocation — `/delegate-kit main-claude`, `$delegate-kit main-codex`, or the words in the request. Aliases: `main-gpt`, `main-openai` → `main-codex`; `main-anthropic` → `main-claude`. Pass it as `--preset` to every `agent-run` call in that task;
2. per call — `agent-run run --preset main-claude …`;
3. for the shell — `DELEGATE_KIT_PRESET=main-claude`;
4. persistently — `agent-run preset main-claude` (`~/.delegate-kit/config.json`; `agent-run preset` alone prints the current one).

Explicit `--backend` / `--model` / `--effort` always win over the preset, and the user can simply name a model ("plan with Fable", "review with Sol").

## Changing the defaults for yourself

The role table shipped in `scripts/agent-run` is the default for every user of the skill: planner, verifier and review lead on the strongest model, implementer and reviewer on the workhorse tier. Change it for yourself — not for everyone — in `~/.delegate-kit/config.json`:

```json
{
  "preset": "main-claude",
  "roles": {
    "planner":  { "claude": ["fable", "xhigh"] },
    "reviewer": { "codex":  ["gpt-5.6-sol", "xhigh"] }
  }
}
```

Each entry is `["model", "effort"]` per family; anything you leave out keeps the shipped default, and `agent-run preset` prints the effective table. A malformed entry is reported and ignored, never applied half-way. This is the place for "I always want the planner on xhigh" — one edit instead of saying it every time, and the repository's defaults stay universal.

A Claude parent under `main-claude` runs almost everything natively and pays for exactly one external session — the Codex reviewer. That is the cheapest shape this skill has.
