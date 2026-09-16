# Independent review

Review substantial delegated implementation and changes whose failure modes justify an independent check. Select profiles from the active team's descriptions and explicit defaults. Trivial direct work does not need an agent ceremony. Scope coverage to actual contracts, ambiguity and failure impact; keywords, line counts and family rankings do not pick reviewers.

Every initial reviewer gets a fresh read-only context, the same frozen specification and diff, and no other reviewer's findings. Freshness and family diversity are different properties. Two agents of the same model can provide independent analysis; agreement alone is not proof.

A read-only reviewer profile's `review.also_run` is a required reviewer set over the same already-frozen specification and diff, validated and reserved by `prepare`. Dispatch all returned runs and keep their initial results independent. It does not encode an implementer-to-reviewer dependency: prepare review only after the implementation checkpoint exists. A missing/unavailable mandatory reviewer makes the set incomplete. Optional extra coverage is a coordinator decision within user limits. A review lead can help resolve difficult decomposition; it is never an automatic prelude.

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

## Merge rules

Reviewers run **in parallel and blind to each other**. A reviewer that reads another's findings anchors on them and the second opinion collapses into agreement; the merge is a separate step.

- Same defect from two reviewers, even in different words → one finding, `raised_by: "A,B"`, one merged claim; corroboration alone does not prove correctness.
- Raised by one, not mentioned by the other → coverage, not a dispute. Keep it.
- One says high, the other **explicitly** says the same place is fine → a dispute. Settle it by a command first (a test, a typecheck, `npm ls`); spend a verifier only when a command cannot.
- Dedupe by meaning; `file:line` catches only the trivial duplicates.
- Rank by severity, then by how many slots raised it. Drop nothing silently.


After a concrete fix, repeat the affected checks and resume the relevant reviewer with the new hunks and finding dispositions. For disputed claims use reproducible commands first, then a configured verifier if meaningful uncertainty remains. Avoid an unbounded argument to consensus. Accept only after checking the evidence and every required reviewer result.
