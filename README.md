# delegate-kit

A delegation policy and a small toolkit for people who use **Claude Code**, **Codex CLI** and **T3 Code** and want the agent they are talking to — whichever one that is — to hand off work to fresh, isolated workers when (and only when) it pays off.

It is a skill, not a new harness. You keep your tools, your logins and your subscriptions. You add one set of rules and three scripts.

## The problem it solves

Both Claude Code and Codex can spawn subagents, but left to themselves they make three kinds of mistakes:

1. **They delegate too much or too little.** A fresh worker costs a whole new session — system prompt, project instructions, re-reading the files — tens of thousands of tokens before it does anything. Micro-tasks should never be delegated; big ambiguous ones should always be planned first. Nothing enforces that.
2. **They review their own work.** A Codex-written change reviewed by Codex shares the same blind spots. Independent review means a different vendor, and neither CLI does that natively.
3. **They have no shared rules.** Your Claude Code session and your Codex session each reinvent how to brief a worker, where it may write, what it must return, and what is too dangerous to do unattended.
4. **They pay the expensive way for the cheap case.** Claude Code can spawn a Claude subagent natively; Codex can spawn a GPT one. Booting a whole headless CLI session for a worker the parent could have spawned itself is waste — but the *other* family is exactly where independence comes from, and that one does need the external session.

delegate-kit fixes all four with one skill (the policy), one wrapper (`agent-run`), one worktree helper (`agent-wt`), six native role definitions and one safety hook (`gate.sh`). The same files are read by Claude Code, Codex CLI and T3 Code (which runs Claude Code under the hood), so the behaviour is identical no matter which parent you open.

## How it works, in one picture

```
you ──► parent (Claude Code / T3 / Codex)  "change the tariff logic in the billing module"
              │
              │ 1. triage: small? → do it here. big/ambiguous/risky? → delegate
              │ 2. spec (from a grill session or your text) → .scratch/<task>/spec.md
              ▼
        planner ───────────────────────────────► Claude Fable, read-only            → plan JSON
              │                                    native if the parent is Claude,
              │                                    else agent-run run --backend claude
        agent-wt create tariffs  (git worktree + write-lock)
              │
        implementer ───────────────────────────► Codex Sol, write, sandboxed        → changes + checks JSON
              │                                    agent-run run --backend codex
              │                                    (native only from a Codex parent)
        agent-wt diff tariffs > review.diff
              │
        reviewer ──────────────────────────────► Claude Opus, read-only             → findings JSON
              │                                    the other family than the author
              │
              │ small findings: parent fixes. real ones: agent-run resume <implementer-id> "fix 1 and 3"
              │ disputed/high-risk: agent-run run --role verifier (third party)
              ▼
        merge / PR via gh, agent-wt remove tariffs, report to you
```

Every worker starts empty: it never sees the parent's conversation, it gets a brief, reads the repository itself, and returns one JSON object. That is the whole interface, and it is why briefs matter more than models.

## Native or external

Two independent questions per worker: which **family** the model comes from, and how it is **dispatched**. A parent can only spawn its own family natively, so:

| Worker family | parent = Claude Code / T3 | parent = Codex |
|---|---|---|
| Claude (`fable`, `opus`, `sonnet`, `haiku`) | **native** — the `Agent` tool with `dk-<role>` | **external** — `agent-run run --backend claude` |
| GPT (`gpt-5.6-sol`, `-terra`, `-luna`) | **external** — `agent-run run --backend codex` | **native** — `spawn_agent` with `dk-<role>` |

Native is the default inside the family: no CLI cold start, no log to read back, and the parent can continue the subagent in place. The role definitions carry the model and the effort — `agents/dk-*.md` for Claude Code, `[agents.dk-*]` in `~/.codex/config.toml` for Codex — so a dispatch is just a role name and a brief.

You go external inside the family too, deliberately, when you need what `agent-run` adds: the enforced read-only sandbox, the strict JSON schema, the ledger, a resumable run id, a hard timeout, a detached parallel writer, or the automatic cross-vendor fallback when a subscription runs out. A native read-only role is read-only by instruction and tool list; it is not a sandbox.

`agent-run route --role implementer` answers all of it in one call — family, model, effort, native or external, and the exact invocation.

## Presets: which subscription pays

Quota is not symmetric over time. A preset moves the token-heavy roles onto one family:

| Preset | planner | implementer | researcher | reviewer / verifier |
|---|---|---|---|---|
| `auto` (default) | Claude | Codex | Claude | derived from the author |
| `main-claude` | Claude | Claude | Claude | derived from the author |
| `main-codex` | Codex | Codex | Codex | derived from the author |

The reviewer and the verifier are never moved by a preset. They follow whoever wrote the code, because independence is the entire reason they exist — a knob that could flip them would be buying quota with the one property you are paying for. The consequence is explicit: `main-claude` implies a Codex reviewer and `main-codex` a Claude one, and a review is one read-only pass over a frozen diff, a fraction of what the implementer spends.

```bash
/delegate-kit main-claude          # in Claude Code, for this task
$delegate-kit main-codex           # in Codex
agent-run preset main-claude       # persist it (~/.delegate-kit/config.json)
DELEGATE_KIT_PRESET=main-codex …   # for one shell
agent-run run --preset main-claude --role implementer …
```

Aliases: `main-gpt` and `main-openai` mean `main-codex`; `main-anthropic` means `main-claude`. Plain words work too — "let Codex implement this", "main model Claude" — the parent maps them to the preset. Explicit `--backend`/`--model`/`--effort` always win.

Your own defaults go in `~/.delegate-kit/config.json` — `"preset"`, and `"roles"` with `["model", "effort"]` per role and family — so "I always want the planner on xhigh" is one edit rather than a phrase in every request, and the repository's table stays the default for everyone else. `agent-run preset` prints the effective table.

## Review depth: one reviewer, or a panel of lenses

One reviewer from the other family buys **independence** — and that is where the value of a review comes from, so it is the first slot and nothing moves it. A second reviewer with the same brief buys almost nothing: the same angle finds the same things twice. What a second slot should buy is a second **lens**.

| Depth | Reviewers | When |
|---|---|---|
| `single` | one, the other family than the author | the default: a small diff, one module, no risk zone |
| `panel` | two lenses in parallel, blind to each other | ~400+ changed lines, 10+ files, 2+ modules, or any risk zone |
| `led` | a review lead plans → three lenses → the lead merges | ~1200+ lines, 25+ files, 3+ modules |

The lenses are `spec` (does it do what was asked), `correctness` (is it right) and `standards` (does it follow the repo's conventions, plus a fixed smell baseline). The first two axes and the baseline are adapted from [mattpocock's code-review skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) (MIT) — it keeps its two axes separate for the same reason this skill keeps reviewers blind to each other: one angle must not mask another.

Slot A is the other family than the author; slot B may sit on the author's family, because independence is already paid for and the second slot is there for coverage. `agent-run route --role reviewer --diff review.diff` measures the frozen diff — lines, files, modules, risk zones — and prints the depth, the composition and the cost. A panel is always **proposed with those numbers and run on your yes**; `--depth` set explicitly is that yes. Findings are merged by meaning, agreement raises confidence, silence from one reviewer is coverage rather than a dispute, and an explicit contradiction goes to a command first and a verifier second. The full rules: `references/review.md`.

What it costs is said plainly: `panel` is two review sessions, `led` is three plus two short lead calls plus a verifier per real dispute. That is often more than the implementation cost, which is why `single` is the default and the thresholds are conservative.

## The roles

| Role | What it does | Default | Access |
|---|---|---|---|
| **planner** | Decomposes a task: ordered steps, files per step, risks, blocking vs non-blocking questions, the checks that prove completion. | Claude **Fable** high (fallback Opus; on Codex: **Sol** xhigh) | read-only |
| **implementer** | Implements one vertical slice in its own worktree, runs the acceptance checks it can, commits on its branch. | Codex **Sol** high; Claude **Opus** high for UI/design-heavy work | write, sandboxed, one per worktree |
| **reviewer** | Reads a frozen diff against the spec. Returns findings with severity, kind (spec / correctness / standards / nit), file:line, evidence, suggested fix. Never restates the diff. | **The other vendor than the author**, high effort. UX review → Claude Opus | read-only |
| **review-lead** | On a large or risky diff: plans the reviewers (lens, files, brief) before the review and merges their findings into one ranked list after. Two short calls; reads around the diff, not through it. | The planner's family at its strongest: Claude **Fable** high or Codex **Sol** xhigh | read-only |
| **verifier** | Settles a disputed or high-risk finding: confirmed / refuted / needs-human, with evidence. | A third party: Codex Sol xhigh after an Opus review, Claude Fable high after a Sol review | read-only |
| **researcher** | Checks current documentation, quotes primary sources with URL and date, marks what it could not verify. | Claude **Sonnet** medium or Codex **Terra** medium | read-only, web |

And one non-role that matters most: **the parent itself**. Up to about three files, a clear spec and low risk — it just does the work. Micro-fixes after a review, explanations, diagnoses, and everything destructive or production-adjacent (sudo, deletes, services, firewalls, certificates, production databases, SSH into servers) stay with the parent, in the foreground, with you watching.

## Why these models

The choices follow from three facts, not from brand preference:

- **Planning is the cheapest step and the most expensive place to be wrong.** One read-only call, whose mistakes propagate into implementation and review. So the planner gets the strongest model available.
- **Reviews by the same model family share blind spots.** Independence is the value of a review, so the reviewer is always the other vendor than the author. A verifier is a third party again.
- **A small model on a micro-task does not pay back the fixed cost of a worker.** Start-up dominates — a worker that reads one line out of one file still costs ~50k input tokens — so the small tier (`gpt-5.6-luna`, `haiku`) is rarely used as a worker at all; when it is, prefer Luna, which follows a brief more literally. Within a family, raising *reasoning effort* moves review and planning quality more than raising model size. That is also why the strongest Codex role is Sol at `xhigh`: the CLI is offered Sol, Terra and Luna, and no `pro` worker at all.
- **Research that ends in a recommendation is planning.** The researcher role is for extraction — fetch the docs, quote them with a URL. The moment the deliverable is a verdict or a choice between options, it needs the planner's tier, because a wrong call propagates downstream.

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

- `agent-run route` resolves preset, family, model, effort and native-vs-external in one call; with `--role reviewer --diff FILE` it also sizes the review (depth, lenses, composition, cost). `agent-run preset` shows or persists the default preset. `--lens` and `--panel` on a reviewer run put the lens in the prompt and group the panel's runs in the ledger.

**`agent-wt`** — git worktrees next to the repo (`<repo>.worktrees/<name>`, branch `dk/<name>`), with status, frozen diff against the recorded base, lock and release, removal and cleanup of merged worktrees. `agent-wt lock <name>` is how a parent reserves a worktree for a subagent it spawned natively; `agent-run` refuses to start an external writer there, and the other way round.

**`agents/dk-*.md` and `references/codex-agents.toml`** — the six roles as native subagent definitions, one set per harness, carrying model, effort and tool list. Installed by `hooks/install.sh` into `~/.claude/agents/` and `~/.codex/config.toml`.

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

# the safety hook + the native role definitions (backs up your settings and shows the diff first)
~/.agents/skills/delegate-kit/hooks/install.sh --dry-run
~/.agents/skills/delegate-kit/hooks/install.sh          # or --claude / --codex / --hooks-only / --agents-only

# optional: scripts on PATH
echo 'export PATH="$HOME/.agents/skills/delegate-kit/scripts:$PATH"' >> ~/.zshrc
```

The three skill symlinks make the policy live: `SKILL.md`, the scripts and the references are read straight out of your clone, so editing the repository changes the behaviour of the next session with no install step. The role definitions are the exception and that is why `install.sh` exists — a harness discovers subagents only in `~/.claude/agents/` and in `~/.codex/config.toml`, never inside a skill folder. `install.sh` symlinks the Claude ones (so they stay live too) and splices the Codex block between markers, replacing it on every re-run.

Uninstall: `hooks/uninstall.sh` (removes the hook, the `dk-*` agent symlinks and the `[agents.dk-*]` block), remove the three skill symlinks, and `rm -rf ~/.delegate-kit` if you do not want to keep the ledger, the preset and the run logs.

## Use

Work as usual. The parent loads the skill when a task spans modules, needs a review, or you say "delegate", "plan this", "review this". You can also invoke it explicitly: `/delegate-kit` in Claude Code, `$delegate-kit` in Codex.

If you like to interview yourself first, run your grill skill, save the outcome as `.scratch/<task>/spec.md`, and the planner and implementer will be pointed at it instead of a retold version.

The parent drives the scripts; you rarely call them by hand, but you can:

```bash
agent-run route --role implementer --preset main-claude   # who should run this, where, how
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

- It does not steer an *external* worker mid-run. Headless sessions run to completion; you wait, read the result, and resume with a follow-up. Native subagents can be steered, which is one more reason the skill prefers them inside the family.
- It does not put native dispatches in the ledger. `~/.delegate-kit/ledger.jsonl` records external runs only, so a model comparison has to be run externally on both sides.
- It is not a sandbox. The gate is a list of known dangerous command shapes; the real isolation is the CLIs' own sandboxes plus the worktree.
- It does not make delegation cheap. A worker is a full session; the skill exists to make sure you pay that price only when independence, parallelism or a clean context is worth it.
- Model names are the CLIs' own aliases, and the two families never mix: Claude is `fable | opus | sonnet | haiku`, Codex is `gpt-5.6-sol | gpt-5.6-terra | gpt-5.6-luna`. `agent-run` rejects a name from the family that does not match `--backend`. When vendors rename models, update the table at the top of `scripts/agent-run`, the guard next to it, and the two role-definition sets.

## A note on subscriptions

Workers run through the official CLIs with the logins you already have. Running your own sessions this way is ordinary use of Claude Code and Codex. Do not wrap this into a product that routes other people's subscriptions — that is what the vendors prohibit.

## Layout

```
skills/delegate-kit/
  SKILL.md                     the policy the parent reads
  agents/dk-*.md               the six roles as native Claude Code subagents
  references/codex-agents.toml the six roles as native Codex subagents
  references/dispatch.md       native vs external, presets — the reasoning behind agent-run route
  references/roles.md          families, tiers, reasoning per role, prompt hints, tuning
  references/review.md         review depth, lenses, panel composition, merge rules, smell baseline
  references/brief-template.md how to write a brief
  references/result-schema.json the JSON contract
  scripts/agent-run            routing + workers: route / preset / run / resume / list / status / wait / kill / log
  scripts/agent-wt             worktrees: create / list / status / diff / lock / release / remove / cleanup
  hooks/gate.sh                PreToolUse safety gate (Claude Code + Codex)
  hooks/install.sh, uninstall.sh
```

## License

MIT
