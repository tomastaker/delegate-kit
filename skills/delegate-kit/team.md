# Team

## Family

Launch subagents from your own family through the environment's native route. Use the other family when the user asks, when your own family's limits run out (with a notice), or for a second review of a high-risk change.

## Tiers

| Tier | Claude | GPT | Use for |
| --- | --- | --- | --- |
| light | `claude-haiku-5-5` | `gpt-6-luna` | Search with a clear scope in code, docs, logs or the web, returning a short summary with sources; running tests, builds and linters and reporting the result; mechanical or spec-exact edits that a test or typecheck confirms; extraction and summaries. |
| strong | `claude-opus-5-5` | `gpt-6.1-sol` | Implementation that needs judgement, debugging, design, code review and the final review of a branch or pull request. |
| manual only | `claude-fable-5-1` | `gpt-6-astra` | Only when the user names the model. |

Effort: `medium` by default; `high` for bug fixes in existing code, code review, multi-step research and design; `xhigh` for the hardest problems or after a failed attempt.

`claude-sonnet-5-5` at `medium` or `high` may replace `claude-opus-5-5` for spec-exact implementation that is too large or interconnected for the light tier, when the user wants to save Opus usage. It is not used for code review.

Other models, including earlier generations, run only when the user asks.
