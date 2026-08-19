# Brief template

Keep it under ~40 lines. The worker reads the code itself; your job is to remove ambiguity, not to narrate the repository.

```markdown
# Task: <short name>

## Goal
<one paragraph: what must be true when you are done>

## Spec
<path to .scratch/<task>/spec.md, or 3-8 bullet requirements>

## Acceptance criteria
- <observable check 1, ideally a command: `pnpm test -- tariffs`>
- <check 2>

## Where to look
- <dir/file> — <why>
- <dir/file> — <why>

## Constraints
- Follow the repo's AGENTS.md/CLAUDE.md. Do not touch: <paths>.
- No new dependencies without stating why.
- <project-specific rule>

## Return
The delegate-kit result JSON. If anything is ambiguous, return `status: blocked` with precise `questions` instead of guessing.
```

## Role-specific additions

**planner**: "Do not change files. Return `plan` as ordered steps with the files each step touches, `questions` split into blocking and non-blocking, and the checks that prove completion."

**reviewer**: "Read-only. The diff is at `<path>`; the spec at `<path>`. Return `findings` with severity (`high` | `medium` | `low`), `file`, `line`, `claim`, `evidence`, `suggested_fix`, and `kind` (`spec` | `correctness` | `standards` | `nit`). Do not restate the diff. Do not propose refactors outside the diff's scope."

**verifier**: "Finding: <text>. Counter-argument: <text>. Return `findings[0].verdict` as `confirmed`, `refuted` or `needs-human` with evidence."

**researcher**: "Primary sources only. Every claim with URL and date. Mark anything you could not open as UNVERIFIED. Return `summary` and `sources`."
