# Brief template

Keep it under ~40 lines. The worker reads the code itself; your job is to remove ambiguity, not to narrate the repository.

The same brief serves both dispatch paths: `--brief` for an external `agent-run` worker, or the prompt body for a native subagent. Do not restate the role in it — the role preamble comes from `agent-run` or from the installed `dk-*` definition. A native writer needs one extra line the external one gets from `--cwd`: **the absolute worktree path it may touch.**

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

## Worktree (native writers only)
Work only inside `<absolute path from agent-wt create>`. Run git as `git -C <that path> ...`.

## Return
The delegate-kit result JSON. If anything is ambiguous, return `status: blocked` with precise `questions` instead of guessing.
```

## Role-specific additions

**planner**: "Do not change files. Return `plan` as ordered steps with the files each step touches, `questions` split into blocking and non-blocking, and the checks that prove completion."

**reviewer**: "Read-only. The diff is at `<path>`; the spec at `<path>`. Return `findings` with severity (`high` | `medium` | `low`), `file`, `line`, `claim`, `evidence`, `suggested_fix`, and `kind` (`spec` | `correctness` | `standards` | `nit`). Findings only — the diff is already known, and scope is the diff."

**reviewer on a panel** (add to the above): "Your lens is `<spec | correctness | standards>` — its definition is in `references/review.md`; for `standards`, the smell baseline there applies under the repo's own rules. The lens is your priority, not your boundary: report a high-severity problem outside it too. Concentrate on `<files the lead or route assigned>`; skip `<generated, lockfiles, vendored>`. Set `lens` on every finding. You are one of `<n>` reviewers; you do not see the others' findings." Externally the lens also goes on the command: `--lens <lens> --panel <id>`.

**review-lead**, call 1: "Spec at `<path>`. Diff stat: `<agent-run route --role reviewer --diff output>`. Depth: `led`. Return `plan`: one step per reviewer with lens, files to concentrate on, exclusions, and the brief text." Call 2: "Reviewer results: `<result.json paths or pasted JSON, labelled A/B/C>`. Return one merged `findings` list with `raised_by`; disputes as `verdict: needs-human`."

**verifier**: "Finding: <text>. Counter-argument: <text>. Return `findings[0].verdict` as `confirmed`, `refuted` or `needs-human` with evidence."

**researcher**: "Primary sources only. Every claim with URL and date. Mark anything you could not open as UNVERIFIED. Return `summary` and `sources`."
