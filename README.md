# delegate-kit

A delegation policy and a small toolkit for people who use **Claude Code**, **Codex CLI** and **T3 Code** and want the agent they are talking to — whichever one that is — to hand off work to fresh, isolated workers when (and only when) it pays off.

It is a skill, not a new harness. You keep your tools, your logins and your subscriptions. You add one set of rules and three scripts.

## The problem it solves

Both Claude Code and Codex can spawn subagents, but left to themselves they make three kinds of mistakes:

1. **They delegate too much or too little.** A fresh worker costs a whole new session — system prompt, project instructions, re-reading the files — tens of thousands of tokens before it does anything. Micro-tasks should never be delegated; big ambiguous ones should always be planned first. Nothing enforces that.
2. **They review their own work.** A Codex-written change reviewed by Codex shares the same blind spots. Independent review means a different vendor, and neither CLI does that natively.
3. **They have no shared rules.** Your Claude Code session and your Codex session each reinvent how to brief a worker, where it may write, what it must return, and what is too dangerous to do unattended.

delegate-kit fixes all three with one skill (the policy), one wrapper (`agent-run`), one worktree helper (`agent-wt`) and one safety hook (`gate.sh`). The same files are read by Claude Code, Codex CLI and T3 Code (which runs Claude Code under the hood), so the behaviour is identical no matter which parent you open.

## How it works, in one picture

```
you ──► parent (Claude Code / T3 / Codex)  "change the tariff logic in the billing module"
              │
              │ 1. triage: small? → do it here. big/ambiguous/risky? → delegate
              │ 2. spec (from a grill session or your text) → .scratch/<task>/spec.md
              ▼
        agent-run run --role planner ──────────► fresh Claude (Fable, read-only)   → plan JSON
              │
        agent-wt create tariffs  (git worktree + write-lock)
              │
        agent-run run --role implementer ──────► fresh Codex (Sol, write, sandboxed) → changes + checks JSON
              │
        agent-wt diff tariffs > review.diff
              │
        agent-run run --role reviewer ─────────► fresh Claude (Opus, read-only)    → findings JSON
              │
              │ small findings: parent fixes. real ones: agent-run resume <implementer-id> "fix 1 and 3"
              │ disputed/high-risk: agent-run run --role verifier (third party)
              ▼
        merge / PR via gh, agent-wt remove tariffs, report to you
```

Every worker is a **new headless session** (`claude -p` or `codex exec`). It never sees the parent's conversation. It gets a brief, reads the repository itself, and returns one JSON object. That is the whole interface, and it is why briefs matter more than models.

## The roles

| Role | What it does | Default | Access |
|---|---|---|---|
| **planner** | Decomposes a task: ordered steps, files per step, risks, blocking vs non-blocking questions, the checks that prove completion. | Claude **Fable** high (fallback Opus; on Codex: Sol high) | read-only |
| **implementer** | Implements one vertical slice in its own worktree, runs the acceptance checks it can, commits on its branch. | Codex **Sol** high; Claude **Opus** high for UI/design-heavy work | write, sandboxed, one per worktree |
| **reviewer** | Reads a frozen diff against the spec. Returns findings with severity, kind (spec / correctness / standards / nit), file:line, evidence, suggested fix. Never restates the diff. | **The other vendor than the author**, high effort. UX review → Claude Opus | read-only |
| **verifier** | Settles a disputed or high-risk finding: confirmed / refuted / needs-human, with evidence. | A third party: Codex Sol xhigh after an Opus review, Claude Fable high after a Sol review | read-only |
| **researcher** | Checks current documentation, quotes primary sources with URL and date, marks what it could not verify. | Claude **Sonnet** medium or Codex **Terra** medium | read-only, web |

And one non-role that matters most: **the parent itself**. Up to about three files, a clear spec and low risk — it just does the work. Micro-fixes after a review, explanations, diagnoses, and everything destructive or production-adjacent (sudo, deletes, services, firewalls, certificates, production databases, SSH into servers) stay with the parent, in the foreground, with you watching.

## Why these models

The choices follow from three facts, not from brand preference:

- **Planning is the cheapest step and the most expensive place to be wrong.** One read-only call, whose mistakes propagate into implementation and review. So the planner gets the strongest model available.
- **Reviews by the same model family share blind spots.** Independence is the value of a review, so the reviewer is always the other vendor than the author. A verifier is a third party again.
- **A small model on a micro-task does not pay back the fixed cost of a worker.** Start-up dominates, so Luna/Haiku-class models are not used as workers. Within a family, raising *reasoning effort* moves review and planning quality more than raising model size.

Everything is overridable per call (`--backend`, `--model`, `--effort`) or by telling the parent ("plan with Fable", "review with Sol"). The ledger (`~/.delegate-kit/ledger.jsonl`) records model, effort, tokens, duration and outcome per run, so after a couple of weeks you can see where an expensive model never changed the outcome and where a cheap one kept failing — and adjust the table in `scripts/agent-run`.

## When one subscription runs out

`agent-run` detects usage-limit and rate-limit errors. If the chosen vendor is out of quota, it retries the same brief once on the other vendor, using that vendor's default model for the role, and marks the result with `fallback_from`. For a reviewer this may put the review on the author's vendor; the result says so, and the parent is told to mention it. Turn it off with `--fallback none` or `DELEGATE_KIT_FALLBACK=none`. Resumed sessions never fall back — a session lives on one vendor.

Because the policy is a skill and the hook is shared, you can also just open the *other* CLI as the parent and keep the same rules. Nothing in delegate-kit is tied to one vendor being the orchestrator.

## The tools

**`agent-run`** — starts, resumes, waits for, lists and kills workers.

- Applies role defaults (backend, model, effort, read-only vs write).
- Read-only roles run with `codex -s read-only` / `claude --permission-mode plan`. Writers run with `codex -s workspace-write` / `claude --permission-mode acceptEdits`. Never `bypassPermissions`, never `danger-full-access`.
- Writers must run in a git worktree; one writer per worktree (a lock file in the worktree's git dir); at most 2 writers and 4 workers at once.
- Delegation depth is 1: a worker cannot start workers.
- Every run returns the same JSON contract (`status: done | blocked | failed`, `summary`, `changes`, `checks_run`, `not_verified`, `findings`, `plan`, `questions`, `next_steps`) and is archived under `~/.delegate-kit/runs/<id>/`.
- A worker cannot talk to you. If it needs an answer it returns `status: blocked` with `questions`; the parent asks you and resumes the same session.

**`agent-wt`** — git worktrees next to the repo (`<repo>.worktrees/<name>`, branch `dk/<name>`), with status, frozen diff against the recorded base, lock release, removal and cleanup of merged worktrees.

**`hooks/gate.sh`** — a PreToolUse hook registered in both CLIs. Dangerous shell commands (sudo, `rm -rf`, service and firewall changes, certificates, destructive SQL, force-push, history-destroying git, destructive commands over SSH, disk operations…) require your explicit confirmation. On Claude Code that is the normal approval prompt. Codex hooks cannot prompt, so there the command is denied with an instruction to confirm with you and re-run it prefixed with `DELEGATE_KIT_CONFIRMED=1`.

## Install

Requirements: bash, git, jq, node ≥ 20; `claude` and/or `codex` installed and logged in with your own account.

```bash
# the skill
npx skills add tomastaker/delegate-kit
# or manually:
git clone https://github.com/tomastaker/delegate-kit ~/dev/delegate-kit
ln -s ~/dev/delegate-kit/skills/delegate-kit ~/.agents/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.claude/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.codex/skills/delegate-kit

# the safety hook (backs up your settings and shows the diff first)
~/.agents/skills/delegate-kit/hooks/install.sh --dry-run
~/.agents/skills/delegate-kit/hooks/install.sh          # or --claude / --codex only

# optional: scripts on PATH
echo 'export PATH="$HOME/.agents/skills/delegate-kit/scripts:$PATH"' >> ~/.zshrc
```

Uninstall: `hooks/uninstall.sh`, remove the three symlinks, and `rm -rf ~/.delegate-kit` if you do not want to keep the ledger and run logs.

## Use

Work as usual. The parent loads the skill when a task spans modules, needs a review, or you say "delegate", "plan this", "review this". You can also invoke it explicitly: `/delegate-kit` in Claude Code, `$delegate-kit` in Codex.

If you like to interview yourself first, run your grill skill, save the outcome as `.scratch/<task>/spec.md`, and the planner and implementer will be pointed at it instead of a retold version.

The parent drives the scripts; you rarely call them by hand, but you can:

```bash
agent-run run --role planner --brief .scratch/tariffs/brief.md
agent-wt create tariffs
agent-run run --role implementer --backend codex --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/impl.md
agent-wt diff tariffs > .scratch/tariffs/review.diff
agent-run run --role reviewer --backend claude --cwd ../repo.worktrees/tariffs --brief .scratch/tariffs/review.md
agent-run resume <implementer-id> --prompt "Fix findings 1 and 3 from the review: ..."
agent-run list            # what is running / finished
agent-run kill <id>       # stop a worker; its worktree lock is released
```

Two implementers in parallel: add `--detach` to each, then `agent-run wait <id>`.

## What it will not do

- It does not steer a worker mid-run. Headless sessions run to completion; you wait, read the result, and resume with a follow-up. When you need live steering inside one vendor, the parent's own native subagents are the better tool — the skill says so.
- It is not a sandbox. The gate is a list of known dangerous command shapes; the real isolation is the CLIs' own sandboxes plus the worktree.
- It does not make delegation cheap. A worker is a full session; the skill exists to make sure you pay that price only when independence, parallelism or a clean context is worth it.
- Model names are the CLIs' aliases (`fable`, `opus`, `sonnet`, `gpt-5.6-sol`, `gpt-5.6-terra`). When vendors rename models, update the table at the top of `scripts/agent-run`.

## A note on subscriptions

Workers run through the official CLIs with the logins you already have. Running your own sessions this way is ordinary use of Claude Code and Codex. Do not wrap this into a product that routes other people's subscriptions — that is what the vendors prohibit.

## Layout

```
skills/delegate-kit/
  SKILL.md                     the policy the parent reads
  references/roles.md          reasoning per role, prompt hints, tuning
  references/brief-template.md how to write a brief
  references/result-schema.json the JSON contract
  scripts/agent-run            workers: run / resume / list / status / wait / kill / log
  scripts/agent-wt             worktrees: create / list / status / diff / release / remove / cleanup
  hooks/gate.sh                PreToolUse safety gate (Claude Code + Codex)
  hooks/install.sh, uninstall.sh
```

## License

MIT
