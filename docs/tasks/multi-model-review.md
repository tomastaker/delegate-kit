# Multi-model review and T3 Code: task checklist

Branch `t3/multi-model-review`. Stages: done → reviewed → functionally checked → accepted → shipped.

| Item | Stage | Where to look |
| --- | --- | --- |
| T3 Code section: catalog, `delegate_task`, effort keys, worktree for reviewers, no polling | done | `skills/delegate-kit/SKILL.md`, "In T3 Code" |
| Plan review by a second family for large or risky plans, at most 2 rounds | done | `SKILL.md`, "Plan review" |
| Code review: Claude and GPT in parallel, blind, verdicts instead of scores, round budget 3/5 | done | `SKILL.md`, "Review" |
| Scope guard against review-driven growth | done | `SKILL.md`, "Review" |
| Rulings: decide alone vs. ask the user | done | `SKILL.md`, "Rulings" |
| Separate brief items for workers and reviewers | done | `SKILL.md`, "Brief" and "Review" |
| GPT Sol row in the team, fallback when Sol is missing | done | `skills/delegate-kit/team.md` |
| PR skills from tstack: full-send, full-stop, file-pr, babysit-pr, leaving-pr-comments | done | `skills/*`, `THIRD_PARTY_NOTICES.md` |
| README, verification record, package check | done | `README.md`, `docs/verification.md`, `docs/check_package.py` |
| Install locally (Claude Code and Codex) | pending | `~/.agents/skills/` |
| Close PR #17 | pending | GitHub |
| Live coordinator run with GPT Sol (after the user buys Plus) | not started | user starts it separately |

## Open questions

- Turning off automatic Codex review on GitHub needs the user's ChatGPT web session.

## Follow-ups

- (none yet)
