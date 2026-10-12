# Team

## Family

Launch subagents from your own family through the environment's native route. Use the other family when the user asks, when your own family's limits run out (with a notice), or for a second review of a high-risk change.

## Models

| Work | Claude | GPT |
| --- | --- | --- |
| Implementation that needs judgement, debugging, design | `claude-opus-5-5` | `gpt-6.1-sol` |
| Code review, including the review of a fix round | `claude-opus-5-5` | `gpt-6.1-sol` |
| Fix round where every finding names the file, the scenario and the fix | `claude-sonnet-5-5` | `gpt-6.1-sol` |
| Search with a clear scope, running checks and reporting the result, mechanical edits a test confirms | `claude-haiku-5-5` | `gpt-6-luna` |
| Only when the user names the model | `claude-fable-5-1` | `gpt-6-astra` |

Effort: `medium` for every launch. Raise it one level after a failed attempt or when the user asks.

Other models, including earlier generations, run only when the user asks.
