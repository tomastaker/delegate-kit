# Review: depth, lenses, composition

How many reviewers a diff deserves, which angle each one takes, and how their findings become one list. `agent-run route --role reviewer --diff <file>` applies all of it and prints the result; this file is the reasoning behind that output.

## Independence is the first slot, not the whole review

One reviewer from the other family than the author buys **independence**: two families share fewer blind spots than one. That is the invariant of this skill and nothing moves it — not a preset, not a panel, not quota.

A second reviewer with the same brief buys almost nothing: the obvious findings come back twice and the subtle ones stay missed, because both reviewers looked from the same angle. What a second slot should buy is a second **lens**. So a panel is composed as lenses first, families second:

| Slot | Lens | Family | Buys |
|---|---|---|---|
| A | `correctness` (or the lead's pick) | the other family than the author | independence |
| B | `spec` | the author's family is allowed | coverage |
| C | `standards` | alternates back | coverage |

Slot B may sit on the author's family because independence is already paid for by A; that is also what keeps a panel affordable when one subscription is the scarce one.

## Depth

| Depth | Reviewers | When |
|---|---|---|
| `single` | A | the default: under ~400 changed lines, ≤ 10 files, one module, no risk zone |
| `panel` | A + B, parallel and blind to each other | above any of those, or any risk zone touched |
| `led` | lead → A + B + C → lead | ~1200+ lines, 25+ files, 3+ modules, or a risk zone with a large diff |

A **mechanical** diff (formatting, lockfile bump, generated client) is always `single`; size means nothing there. Pass `--kind mechanical`.

The thresholds are starting points. The ledger records `lens` and `panel` per run: after a few panels, look at how many findings slot B raised that A did not and how many of those survived verification. If B keeps returning one low-severity nit per panel, raise the thresholds.

**A panel is always proposed, never assumed.** More than one session on one review is a cost the user decides on. `route` prints the numbers (`lines`, `files`, `modules`, `risk_zones`, `cost_note`); put them in the proposal and wait for the yes. `--depth` set explicitly is that yes.

## Lenses

Three, deliberately few, and aligned with the two axes of [mattpocock's code-review skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) (MIT) plus the one that finds bugs:

- **`spec`** — does the diff do what was asked: requirements missing or partial, behaviour nobody asked for, requirements that look implemented but wrong. Every finding quotes the spec line.
- **`correctness`** — is the code right: edge cases, error paths, concurrency, data loss, leaks, callers not updated, contract and schema drift.
- **`standards`** — does the code follow the repository's documented conventions, and the smell baseline below.

A lens is a **priority, not a boundary**. Each reviewer reports a high-severity problem outside its lens too; a gap between lenses costs more than a duplicate, and the merge step removes duplicates anyway.

### Standards: the smell baseline

Adapted from the same skill, which took it from Fowler, *Refactoring*, ch. 3. It applies even when the repository documents nothing, under two rules: **a documented repo standard overrides the baseline**, and **a baseline smell is always a judgement call** — label it ("possible Feature Envy"), never report it as a violation. Skip anything a linter or formatter already enforces.

Each reads *what it is* → *how to fix*:

- **Mysterious Name** — a name that does not reveal what it does or holds → rename; if no honest name comes, the design is murky.
- **Duplicated Code** — the same logic shape in more than one hunk or file → extract the shape, call it from both.
- **Feature Envy** — a method reaching into another object's data more than its own → move it onto the data it envies.
- **Data Clumps** — the same few fields or params always travelling together → bundle them into one type.
- **Primitive Obsession** — a primitive standing in for a domain concept → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurring → polymorphism, or one shared map.
- **Shotgun Surgery** — one logical change forcing scattered edits across many files → gather what changes together.
- **Divergent Change** — one module edited for several unrelated reasons → split so each changes for one reason.
- **Speculative Generality** — abstraction or hooks for needs the spec does not have → delete; inline until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller should not depend on → hide the walk behind one method.
- **Middle Man** — a class or function that mostly delegates onward → cut it, call the real target.
- **Refused Bequest** — a subclass ignoring most of what it inherits → drop the inheritance, compose.

## The lead

At `led` depth the **review lead** (`dk-review-lead`; strongest model of the preset's planner family) is called twice, and both calls are short because it reads *around* the diff, not through it:

1. **Before** — spec plus diff stat in, `plan` out: one reviewer per step with lens, files to concentrate on, exclusions, and the brief text. The brief is the most consequential artifact of the whole review, which is why the strongest model writes it.
2. **After** — the reviewers' result JSONs in, one merged `findings` list out, by the rules below.

At `panel` depth the parent does both jobs itself with the same rules; the lead exists for the size at which the parent would otherwise be reading three reports into its own context.

## Merge rules

Reviewers run **in parallel and blind to each other**. A reviewer that reads another's findings anchors on them and the second opinion collapses into agreement; the merge is a separate step.

- Same defect from two reviewers, even in different words → one finding, `raised_by: "A,B"`, higher confidence, no verifier.
- Raised by one, not mentioned by the other → coverage, not a dispute. Keep it.
- One says high, the other **explicitly** says the same place is fine → a dispute. Settle it by a command first (a test, a typecheck, `npm ls`); spend a verifier only when a command cannot.
- Dedupe by meaning; `file:line` catches only the trivial duplicates.
- Rank by severity, then by how many slots raised it. Drop nothing silently.

## What it costs

`panel` is two review sessions instead of one. `led` is three plus two short lead calls, plus a verifier per real dispute — five to seven read-only sessions on one review, which is often more than the implementation cost. That is why the default is `single`, the thresholds are conservative, and the proposal always carries the numbers.
