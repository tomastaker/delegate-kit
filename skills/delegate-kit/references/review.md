# Review: depth, lenses, composition

How many reviewers a diff deserves, which angle each one takes, and how their findings become one list. `agent-run route --role reviewer --diff <file> --author-backend <family|self>` applies all of it and prints the result; this file is the reasoning behind that output.

## Fresh context and family diversity

Every review uses a fresh read-only agent and a frozen diff/spec. This applies equally in solo and duo. Family diversity is a separate property, not a binary label for whether a review counts.

In duo, prefer another capable family when otherwise comparable. User assignments and known task suitability can select the author's family. A second slot should add a complementary lens and independently gathered evidence, rather than merely endorsing the first reviewer. It can belong to the same family in solo.

Slots use correctness, spec and standards priorities. The coordinator can choose a different composition when justified by the task; state the reason. A hard reviewer backend assignment applies to every slot. See routing.md for mode boundaries and preferences.

## Depth

| Depth | Reviewers | When |
|---|---|---|
| `single` | A | the default: under ~400 changed lines, ≤ 10 files, one module, no risk zone |
| `panel` | A + B, parallel and blind to each other | above any of those, or any risk zone touched |
| `led` | lead → A + B + C → lead | ~1200+ lines, 25+ files, 3+ modules, or a risk zone with a large diff |

A **mechanical** diff (formatting, lockfile bump, generated client) is always `single`; size means nothing there. Pass `--kind mechanical`.

The thresholds are starting points. The ledger records `lens` and `panel` per run: after a few panels, look at how many findings slot B raised that A did not and how many of those survived verification. If B keeps returning one low-severity nit per panel, raise the thresholds.

**A panel requires permission.** A standing `review.allow_multiple` grant or explicit user request can supply it; otherwise propose it. More than one session on one review is a cost the user decides on. `route` prints the numbers (`lines`, `files`, `modules`, `risk_zones`, `cost_note`); put them in the proposal and wait for the yes. `--depth` records that permission; the coordinator must not use it to grant itself permission.

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

Four structural checks sit alongside the smells, adapted from addyosmani/agent-skills `code-review-and-quality` (MIT), under the same two rules:

- **Relocated Complexity** — a refactor that moves logic without reducing the number of concepts a reader must hold → prefer the restructuring that makes a branch, mode or layer disappear; delete an abstraction before polishing it.
- **Leaked Feature Logic** — feature-specific code landing in a shared or general-purpose module, or a near-duplicate of an existing canonical helper → move it to the owning layer; reuse the canonical helper.
- **Unnamed Remedy** — a finding that says "too complex" without a move → name the restructuring: a typed model or dispatcher for a conditional chain, orchestration split from business logic, a pass-through wrapper deleted, a helper extracted.
- **Bulk Dependency Bump** — several packages upgraded in one change, changelog unread, lockfile diff unreviewed → one dependency per change, changelog read for behaviour changes, lockfile diff in the review, green suite before and after.

## The lead

At `led` depth the **review lead** (`dk-review-lead`; main senior model selected for planning) is called twice, and both calls are short because it reads *around* the diff, not through it:

1. **Before** — spec plus diff stat in, `plan` out: one reviewer per step with lens, files to concentrate on, exclusions, and the brief text. The brief is the most consequential artifact of the whole review, which is why the strongest model writes it.
2. **After** — the reviewers' result JSONs in, one merged `findings` list out, by the rules below.

At `panel` depth the parent does both jobs itself with the same rules; the lead exists for the size at which the parent would otherwise be reading three reports into its own context.

## Merge rules

Reviewers run **in parallel and blind to each other**. A reviewer that reads another's findings anchors on them and the second opinion collapses into agreement; the merge is a separate step.

- Same defect from two reviewers, even in different words → one finding, `raised_by: "A,B"`, one merged claim; corroboration alone does not prove correctness.
- Raised by one, not mentioned by the other → coverage, not a dispute. Keep it.
- One says high, the other **explicitly** says the same place is fine → a dispute. Settle it by a command first (a test, a typecheck, `npm ls`); spend a verifier only when a command cannot.
- Dedupe by meaning; `file:line` catches only the trivial duplicates.
- Rank by severity, then by how many slots raised it. Drop nothing silently.

## What it costs

`panel` is two review sessions instead of one. `led` is three plus two short lead calls, plus a verifier per real dispute — five to seven read-only sessions on one review, which is often more than the implementation cost. That is why the default is `single`, the thresholds are conservative, and the proposal always carries the numbers.
