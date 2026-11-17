# Team

## Family

Launch subagents through the environment's native route. The other model family is the **second-family** reviewer the skill calls for in plan review and code review; for any other work it runs only when the user names it.

## Models

| Work | Model | Effort |
| --- | --- | --- |
| Implementation that needs judgement, debugging, design | `claude-opus-5-5` | `medium` |
| Implementation or review touching money, security, access rights or data migrations | `claude-opus-5-5` | `high` |
| Code review, including the review of a fix round | `claude-opus-5-5` | `medium` |
| Second-family review: a plan, a risky change, a wave's integrated diff | the newest GPT Sol the catalog offers (`gpt-6.2-sol`, `gpt-6.1-sol` on 2026-11-18) | `high` |
| Research across code: tracing a subsystem, hunting a class of bugs | `claude-opus-5-5` | `medium` |
| Research across documents and the web: reading, comparing, summarizing sources | `claude-sonnet-5-5` | `medium` |
| Fix round where every finding names the file, the scenario and the fix | `claude-sonnet-5-5` | `medium` |
| Walking finished screens in the browser as a user | `claude-sonnet-5-5` | `medium` |
| Fetching and extracting facts, search with a clear scope, running checks and reporting the result, mechanical edits a test confirms | `claude-haiku-5-5` | `medium` |
| Only when the user names the model | `claude-fable-5-2` | as named |

When the catalog offers no GPT Sol, the second-family review runs on the strongest GPT it offers, named in the report. When you coordinate from a GPT model, the second family is Claude: `claude-opus-5-5` at `high`.

Raise effort when the user asks, and after a failed attempt as the skill's escalation rule says.

Other models, including earlier generations, run only when the user asks.
