# Roles: who, why, and how to prompt them

The matrix in SKILL.md is a default, not a law. This file explains the reasoning so you can deviate deliberately.

## The cost model that drives every choice

- A worker is a fresh session. Fixed cost per worker: its system prompt, project instructions, skill listing, and re-reading the files it needs. Tens of thousands of tokens before it does anything useful.
- Therefore small tasks never pay off as workers, whatever the model. The parent does them in-context.
- Within a model family, **reasoning effort** moves quality more than model size for review and planning. Raise effort before you raise the model tier.
- Prompt caching works per vendor on identical prefixes: five Codex reviewers share one cached prefix. Cross-vendor calls share nothing — that is fine, it is the price of independence.
- The parent's own turns are cheap if the parent is a mid-tier model (Opus 5, Sol, Sonnet 5, Terra). Running the parent on the strongest model for routine orchestration is the most common waste.

## planner

- **Default** `claude` fable high. Fallback opus high. Codex fallback gpt-5.6-sol high.
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

- **Default** third party: `codex` gpt-5.6-sol xhigh after an Opus review; `claude` fable high after a Sol review.
- **When**: the implementer disputes a finding, or a high-severity finding lands in a risk zone. Not for every review.
- **Prompt**: the finding, the counter-argument, the relevant diff hunk. Ask for a verdict (`confirmed` / `refuted` / `needs-human`) with evidence.

## researcher

- **Default** `claude` sonnet medium or `codex` gpt-5.6-terra medium.
- **Why cheap**: "fetch official docs, quote with URL and date, say what is verified and what is not" is extraction, not judgement. If judgement is needed (compare architectures, pick a library), that is a planner call.
- **Rules**: primary sources first; a search snippet is not evidence; return URLs and dates; mark `UNVERIFIED` explicitly.

## Small models (Luna, Haiku) — when

Almost never as workers. The start-up cost dominates. Candidates: bulk mechanical transforms across many files with a clear rule, where a cheap model per unit matters. Even then prefer Terra/Sonnet at medium effort for reliability. As a *parent* for trivial chat-level work a small model is fine.

## Parent model choice

- Routine orchestration: Opus 5 / Sol / Sonnet 5 / Terra. The parent writes briefs and reads reports; that does not need the top model.
- Switch the parent up (Fable / Sol xhigh) for a grill session, an architecture decision, or a hard bug the parent must reason about itself. Switch back afterwards.

## Tuning

`~/.delegate-kit/ledger.jsonl` has one line per run: role, backend, model, effort, tokens, duration, status. After a couple of weeks, look for roles where the expensive model never changes the outcome (downgrade) and roles with repeated `failed`/`blocked` (upgrade or fix the brief template).
