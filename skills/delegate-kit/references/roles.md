# Roles: who, why, and how to prompt them

`agent-run route --role <role>` prints the default for any role; this file is the reasoning, so you can deviate deliberately. Where a worker runs and which subscription pays are in `external.md`; review depth and lenses in `review.md`.

## The two families

`--backend` picks the family; `--model` must name a model from it, and `agent-run` rejects a mismatch instead of falling back.

| Tier | `claude` | `codex` |
|---|---|---|
| strongest — planning, the review lead, hard verification | `fable` | `gpt-5.6-sol` at `xhigh` |
| high — the workhorse for implement and review | `opus` | `gpt-5.6-sol` |
| mid — extraction and mechanical work | `sonnet` | `gpt-5.6-terra` |
| small — rarely worth a worker | `haiku` | `gpt-5.6-luna` |

The Codex CLI is offered `sol`, `terra` and `luna` only (`~/.codex/models_cache.json` lists them and the efforts each accepts); there is no `pro` worker, so the strongest Codex role is sol at `xhigh` — consistent with the rule below that effort moves quality more than tier. Effort: `low | medium | high | xhigh | max`, plus `ultra` on Codex.

### Defaults per role

| Role | Model / effort | Family | Access |
|---|---|---|---|
| planner | `fable` high / `gpt-5.6-sol` xhigh | preset | read-only |
| implementer | `opus` high / `gpt-5.6-sol` high | preset; `--kind ui` → Claude under `auto` | write, in a worktree |
| reviewer | `opus` high / `gpt-5.6-sol` high | **the other family than the author** when its CLI is installed; else a fresh worker of the author's family, reported | read-only |
| review-lead | `fable` high / `gpt-5.6-sol` xhigh | the planner's family | read-only |
| verifier | `fable` high / `gpt-5.6-sol` xhigh | third party to the reviewer | read-only |
| researcher | `sonnet` medium / `gpt-5.6-terra` medium | preset | read-only, web |

## The cost model that drives every choice

- A worker is a fresh session. Fixed cost per worker: its system prompt, project instructions, skill listing, and re-reading the files it needs. Tens of thousands of tokens before it does anything useful.
- Therefore small tasks never pay off as workers, whatever the model. The parent does them in-context.
- The running cost is turns × context, because every turn re-reads the whole context (cached, at a tenth of the input price — but there are millions of them). Measured on 17 native implementers of 170–525 turns: the second half of a run costs 1.3–2.8× its first half, cache reads are ~70% of the bill, cache writes after 5-minute expiry ~25%, output ~8%. Two consequences. One ticket = one worker: two tickets in one worker cost about 1.5× two workers, and the fixed start of a worker (~20k tokens) is noise beside that. And a fix round belongs to a fresh worker once the author is long: a round on a 250k-token worker costs about three times the same round from a fresh start.
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

- **Default** the other family than the author, high effort. After a Codex implementer: `claude` opus high. After a Claude implementer: `codex` gpt-5.6-sol high. UX/product review: `claude` opus.
- **Why the other family**: the same family reviewing itself shares blind spots. Independence is the value — the first slot of a panel, never something a preset moves. When the other CLI is missing, `route` falls back to a fresh native reviewer and says so; a fresh context is the floor, the other family the preference.
- **Depth and lenses**: one reviewer by default; a panel of two or three lenses for large or risky diffs, proposed with numbers and run only on the user's yes. `review.md`.
- **The author is named, never assumed.** `route` and `run` take `--author-backend claude|codex|self` for reviewer and verifier; a diff the coordinator wrote itself is `self`, so the same family is never marked independent by default.
- **Read-only.** Give it the frozen diff (`agent-wt diff`) and the spec. Ask for findings with severity, file:line, the claim, the evidence, and a suggested fix. Ask it to separate "spec mismatch" from "standards" from "nit". Ask it not to restate the diff.
- **Effort**: high by default; xhigh only in risk zones (auth, payments, migrations).

## review-lead

- **Default** the planner's family at its strongest: `claude` fable high or `codex` gpt-5.6-sol xhigh.
- **When**: `led` depth only — a diff large enough that the parent would otherwise read three reviewers' reports into its own context. At `panel` depth the parent merges by the same rules itself.
- **Two short calls.** Before the review it reads the spec and the diff *stat*, not the body, and returns the reviewer plan with one brief per lens. After the review it reads the result JSONs and returns one merged list. If it is reading the whole diff it has become a fourth reviewer, which is the expensive mistake to watch for.
- **Prompt**: call 1 — spec path, `agent-run route --role reviewer --diff` output, intended depth; ask for `plan`. Call 2 — the result JSON paths; ask for `findings` with `raised_by`, disputes as `needs-human`.

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
- The parent's family decides which roles can be native at all (`external.md`, `hosts.md`).

## Tuning

`~/.delegate-kit/ledger.jsonl` has one line per external run: role, backend, model, effort, preset, lens, panel, tokens, duration, status. Native dispatches are not in it — that is a real gap when you are comparing families, and a reason to run a comparison externally on both sides rather than trusting an impression. After a couple of weeks, look for roles where the expensive model never changes the outcome (downgrade) and roles with repeated `failed`/`blocked` (upgrade or fix the brief template).
