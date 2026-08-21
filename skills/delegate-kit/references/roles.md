# Roles: who, why, and how to prompt them

The matrix in SKILL.md is a default, not a law. This file explains the reasoning so you can deviate deliberately.

## Which family a model name belongs to

The orchestrator may be a Claude model or a GPT model; the worker's family is set by
`--backend`, and `--model` must name a model from that family. Claude tiers, strongest
first: `fable`, `opus`, `sonnet`, `haiku`. Codex tiers: `gpt-5.6-sol`, `gpt-5.6-terra`,
`gpt-5.6-luna` — the CLI is not offered a `pro` worker, so the strongest Codex role is
sol at `xhigh` (verify with `~/.codex/models_cache.json`, which also lists the efforts
each model accepts). Effort: `low | medium | high | xhigh | max`, plus `ultra` on Codex.
`agent-run` rejects a name from the wrong family rather than silently falling back.

## Native or external, and why it is not just plumbing

A parent spawns its own family natively — the `Agent` tool in Claude Code, `spawn_agent`
in Codex — and the other family through `agent-run`. Native dispatch is cheaper in
wall-clock and in the parent's own tokens: no CLI cold start, no reading a JSON log back,
and the subagent can be continued in place. That is why it is the default inside the family.

What you give up going native is worth naming, because it is exactly what a bad delegation
loses first:

- **No enforced sandbox.** An external read-only role runs under `--permission-mode plan` /
  `-s read-only`; a native one is read-only because its definition says so and its tool list
  has no writer. Instruction-level read-only is fine for a reviewer you dispatched yourself;
  it is not fine as the isolation boundary around an untrusted change.
- **No strict output schema.** External workers are held to `references/result-schema.json`
  by the vendor's structured-output flag. Native ones follow the contract because the role
  definition asks them to. Expect to have to re-read a malformed result occasionally.
- **No ledger, no run id, no timeout, no quota fallback.** Those live in `agent-run`. If you
  want to compare models later, or to resume a worker tomorrow, or to have the other vendor
  pick up automatically when this one hits its limit, dispatch externally.
- **No write-lock for free.** `agent-run` takes the worktree lock itself. A native writer
  needs `agent-wt lock <task>` from the parent and `agent-wt release <task>` afterwards.

The role definitions live in `agents/dk-*.md` (Claude Code) and
`references/codex-agents.toml` (Codex); `hooks/install.sh` installs both. They carry the
model and the effort, so a native dispatch is `subagent_type: dk-reviewer` and nothing else —
do not paste the role description into the prompt.

## Presets: which subscription pays

Quota is not symmetric over time. A preset (`auto`, `main-claude`, `main-codex`) moves the
token-heavy roles — planner, implementer, researcher — onto one family. It deliberately does
not move the reviewer or the verifier: those are derived from whoever wrote the code, and a
preset that could flip them would quietly buy quota by giving up independence, which is the
one thing delegation is for. A review is one read-only pass over a frozen diff, so leaving it
on the other family costs little.

Read the second-order effect before choosing: `main-claude` means the reviewer is Codex, and
`main-codex` means it is Claude. If the family you are trying to spare is also the one that
must review, the honest move is to run the review later rather than to run it on the author's
own family — or to accept the fallback note that `agent-run` prints when it had to.

`agent-run route --role <role>` resolves preset, family, model, effort and dispatch in one
call. Use it instead of re-deriving the table from memory; `agent-run preset <name>` persists
the choice in `~/.delegate-kit/config.json`.

## The cost model that drives every choice

- A worker is a fresh session. Fixed cost per worker: its system prompt, project instructions, skill listing, and re-reading the files it needs. Tens of thousands of tokens before it does anything useful.
- Therefore small tasks never pay off as workers, whatever the model. The parent does them in-context.
- Within a model family, **reasoning effort** moves quality more than model size for review and planning. Raise effort before you raise the model tier.
- Prompt caching works per vendor on identical prefixes: five Codex reviewers share one cached prefix. Cross-vendor calls share nothing — that is fine, it is the price of independence.
- The parent's own turns are cheap if the parent is a mid-tier model (Opus 5, Sol, Sonnet 5, Terra). Running the parent on the strongest model for routine orchestration is the most common waste.

## planner

- **Default** `claude` fable high. Fallback opus high. On the Codex side gpt-5.6-sol xhigh (there is no `pro` worker).
- **Why strongest**: one read-only call; errors here propagate into implementation and review. Decomposition quality is the whole point.
- **Prompt hints**: give the spec, ask for a plan with ordered steps, file-level touch list, risks, open questions marked `blocking` vs `nice-to-know`, and acceptance checks. Ask it to state assumptions explicitly. Forbid code changes.
- **When to skip**: the parent is already a strong model and the task is clear, or the task is small.

## implementer

- **Default** `codex` gpt-5.6-sol high for backend, refactors, types, scripts; `claude` opus high for UI/design-heavy work or when the repo's conventions are Claude-shaped (CLAUDE.md heavy).
- **One worker = one vertical slice.** Do not split a feature horizontally across workers.
- **Always in a worktree** created by `agent-wt`. The implementer commits on its branch; the parent integrates.
- **Prompt hints**: spec path, acceptance criteria, the commands that prove success (tests, typecheck, build), conventions to follow, files not to touch, and "return `blocked` with questions instead of guessing" for anything ambiguous.

## reviewer

- **Default** opposite vendor of the author, high effort. After a Codex implementer: `claude` opus high. After a Claude implementer: `codex` gpt-5.6-sol high. UX/product review: `claude` opus.
- **Why other vendor**: the same model family reviewing itself shares blind spots. Independence is the value.
- **Read-only.** Give it the frozen diff (`agent-wt diff`) and the spec. Ask for findings with severity, file:line, the claim, the evidence, and a suggested fix. Ask it to separate "spec mismatch" from "standards" from "nit". Ask it not to restate the diff.
- **Effort**: high by default; xhigh only in risk zones (auth, payments, migrations).

## verifier

- **Default** third party: `codex` gpt-5.6-sol xhigh after an Opus review; `claude` fable high after a Sol review. Dispatch it externally even when the family matches the parent — a verdict you will act on deserves the enforced sandbox and the recorded run.
- **When**: the implementer disputes a finding, or a high-severity finding lands in a risk zone. Not for every review.
- **First ask whether a command settles it.** Many findings are mechanically checkable: `npm ls`, a test, a typecheck, a grep, a diff against the previous state. Those the parent verifies directly — one command beats another opinion, and it produces evidence instead of a second guess. Spend a verifier only on claims that turn on judgement: is this severity right, is this the intended behaviour, is this design defensible.
- **Prompt**: the finding, the counter-argument, the relevant diff hunk. Ask for a verdict (`confirmed` / `refuted` / `needs-human`) with evidence.

## researcher

- **Default** `claude` sonnet medium or `codex` gpt-5.6-terra medium.
- **Why cheap**: "fetch official docs, quote with URL and date, say what is verified and what is not" is extraction, not judgement.
- **The routing trap.** If judgement is needed — compare architectures, pick a library, decide whether an upgrade is safe — that is a **planner** call, not a researcher one. The word "research" hides two different jobs. Decide by what the worker returns: a quote is research, a verdict is planning. Getting this wrong is the most common misuse of this skill, because "go read the docs" sounds like extraction right up until the answer has to be a recommendation.
- **Escalate on risk.** Even for genuine extraction, raise to `--model opus --effort high` (or `gpt-5.6-sol high`) when the subject is security, auth, payments, data loss, or cross-version compatibility. Observed failure mode: a cheap researcher quotes changelogs correctly and then predicts tooling behaviour wrongly — it said a peer-dependency mismatch would be a warning; the package manager hard-failed on it.
- **Rules**: primary sources first; a search snippet is not evidence; return URLs and dates; mark `UNVERIFIED` explicitly.

## Small models — when

The small tier is `gpt-5.6-luna` on the Codex side and `haiku` on the Claude side. **Within it, prefer Luna**: it reasons better and follows a brief more literally, and literal brief-following is exactly what fails first on a cheap worker.

Almost never as workers, though. The start-up cost dominates — a worker that reads one line out of one file still costs ~50k input tokens. Candidates: bulk mechanical transforms across many files with an unambiguous rule, where per-unit cost actually matters. Even then Terra or Sonnet at medium effort is usually the better trade. As a *parent* for trivial chat-level work a small model is fine.

## Parent model choice

- Routine orchestration: Opus 5 / Sol / Sonnet 5 / Terra. The parent writes briefs and reads reports; that does not need the top model.
- Switch the parent up (Fable / Sol xhigh) for a grill session, an architecture decision, or a hard bug the parent must reason about itself. Switch back afterwards.
- The parent's family also decides which roles can be native at all. A Claude parent under `main-claude` runs almost everything natively and pays for exactly one external session — the Codex reviewer. That is the cheapest shape this skill has, and it is the one to reach for when Codex quota is the scarce resource.

## Tuning

`~/.delegate-kit/ledger.jsonl` has one line per external run: role, backend, model, effort, preset, tokens, duration, status. Native dispatches are not in it — that is a real gap when you are comparing families, and a reason to run a comparison externally on both sides rather than trusting an impression. After a couple of weeks, look for roles where the expensive model never changes the outcome (downgrade) and roles with repeated `failed`/`blocked` (upgrade or fix the brief template).
