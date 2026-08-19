# delegate-kit

One delegation policy for Claude Code, Codex CLI and the T3 Code app — without a new harness.

You keep talking to whichever agent you opened. That agent stays the orchestrator. When a task is big, ambiguous, or needs an independent review, it starts a fresh headless worker (`claude -p` or `codex exec`) through a small wrapper, in its own git worktree, with a JSON result contract — and reviews are always done by the *other* vendor.

Workers run on your own subscriptions through the official CLIs. Nothing is proxied, nothing is re-billed.

## What you get

- **A skill** (`skills/delegate-kit/SKILL.md`): when to do it yourself, when to delegate, which role gets which model, how to brief a worker, how to handle its result. Readable by Claude Code, Codex and any Agent-Skills-compatible tool.
- **`agent-run`** — starts/resumes/waits/kills workers with role defaults (planner, implementer, reviewer, verifier, researcher), enforces read-only vs write, one writer per worktree, max concurrency, delegation depth 1, and writes a ledger (model, effort, tokens, duration, outcome).
- **`agent-wt`** — git worktrees with a write-lock that `agent-run` honours; frozen diffs for review; cleanup.
- **`gate.sh`** — a PreToolUse hook for both CLIs: dangerous shell commands (sudo, rm -rf, service/firewall/cert changes, destructive SQL, force-push, destructive SSH…) require your explicit confirmation.

## Defaults (change them in `agent-run` or per call)

| Role | Backend / model / effort | Access |
|---|---|---|
| planner | claude fable high (fallback opus; codex gpt-5.6-sol high) | read-only |
| implementer | codex gpt-5.6-sol high (UI-heavy: claude opus high) | write, in a worktree |
| reviewer | the other vendor than the author, high | read-only |
| verifier | third party, xhigh/high, only for disputed or high-risk findings | read-only |
| researcher | claude sonnet medium / codex gpt-5.6-terra medium | read-only |

Why these: planning is one cheap read-only call whose mistakes are the most expensive; reviews by the same model family share blind spots; small models on micro-tasks do not pay back the fixed cost of a fresh worker. Details in `skills/delegate-kit/references/roles.md`.

## Install

Requirements: bash, git, jq, node ≥ 20; `claude` and/or `codex` installed and logged in.

```bash
# 1. the skill (any of these)
npx skills add tomastaker/delegate-kit          # Agent Skills CLI, into ~/.agents/skills
git clone https://github.com/tomastaker/delegate-kit ~/dev/delegate-kit
ln -s ~/dev/delegate-kit/skills/delegate-kit ~/.agents/skills/delegate-kit   # then symlink into ~/.claude/skills and ~/.codex/skills if your tools don't read ~/.agents/skills

# 2. the hooks (backs up settings, prints a diff)
~/.agents/skills/delegate-kit/hooks/install.sh            # --claude / --codex / --dry-run

# 3. optional: put the scripts on PATH
export PATH="$HOME/.agents/skills/delegate-kit/scripts:$PATH"
```

Uninstall: `hooks/uninstall.sh`, remove the symlinks, delete `~/.delegate-kit` if you want the ledger gone.

## Use

Just work. The parent loads the skill when it sees a multi-module task, a review request, or words like "delegate", "plan this", "review this". Or invoke it explicitly: `/delegate-kit` in Claude Code, `$delegate-kit` in Codex.

Typical flow for a real task:

```
agent-run run --role planner --brief .scratch/tariffs/brief.md
agent-wt create tariffs
agent-run run --role implementer --backend codex --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/impl.md
agent-wt diff tariffs > .scratch/tariffs/review.diff
agent-run run --role reviewer --backend claude --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/review.md
agent-run resume <implementer-id> --prompt "Fix findings 1 and 3 from the review: ..."
```

Two implementers in parallel: add `--detach`, then `agent-run wait <id>`. `agent-run list` shows what is running; `agent-run kill <id>` stops a worker and releases its worktree lock.

## Design notes

- Workers never inherit the parent's context. The brief is the interface. Keep it short and precise (`references/brief-template.md`).
- A worker cannot ask you anything; it returns `status: blocked` with `questions`, the parent asks you and resumes the same session.
- Codex hooks cannot prompt, so on Codex the gate denies and asks the agent to get your confirmation and re-run with a `DELEGATE_KIT_CONFIRMED=1` prefix. On Claude Code it is a normal approval prompt.
- Subscriptions: workers use the CLIs' own logins (Claude Max via Claude Code, ChatGPT via Codex). Running your own sessions this way is ordinary use of those tools; do not build a product that routes *other people's* subscriptions through it.

## Limits

- Headless workers cannot be steered mid-run; you wait, then resume. Use native subagents of the parent when you need live steering within one vendor.
- Model names are CLI aliases (`fable`, `opus`, `sonnet`, `gpt-5.6-sol` …); update the matrix when vendors rename things.
- The gate is a regex allow-list of *known* dangerous shapes, not a sandbox.

## License

MIT
