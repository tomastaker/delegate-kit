# GPT team

Profiles transcribed from the user's supplied screenshot. All use Codex with the model, reasoning and access preferences below. This file configures specialists; the current conversational agent remains the coordinator, regardless of its model family.

## Execution

Choose the launch route using Delegate Kit's normal rules: prefer native subagents when they can run the selected Codex model and preserve the specified settings; otherwise use an available Codex CLI or another matching Codex interface. No fixed command is required. Resolve model identifiers and supported parameters from the actual tool; the identifiers below correspond to the supplied display names.

`Auto-review` and `Full access` are the access labels from the source environment. Preserve their meaning when selecting a route, using its documented controls. They are not portable CLI flags. If a route cannot express the required access behavior, report the mismatch rather than silently treating the modes as equivalent. A profile never overrides the current environment's permissions or authorizes extra actions. Even a reviewer with Full access has an assessment-only assignment unless editing is explicitly requested.

No substitute models are preauthorized. Model and reasoning availability on another host must be checked there; listing a model here does not confirm access to it.

## Profiles

| Profile | Model | Reasoning | Access | When to use |
| --- | --- | --- | --- | --- |
| researcher | `gpt-5.6-luna` | high | Auto-review | Basic research in code, websites and documentation. |
| researcher-hard | `gpt-5.6-sol` | medium | Auto-review | More difficult research where a basic worker could miss the key information or draw the wrong conclusion. |
| Planner | `gpt-6-astra` | medium | Auto-review | Planning a complex, multi-stage task that requires risk assessment and choosing an approach. Use when a separate planning contribution is needed. |
| implementer-basic | `gpt-5.6-luna` | high | Full access | Implementing clearly specified tasks with minimal regression risk. Prefer for suitable bounded work. |
| implementer | `gpt-5.6-sol` | high | Full access | Implementing medium- and high-complexity tasks with clear boundaries. |
| implementer-hard | `gpt-6-astra` | low | Full access | The most complex and consequential implementation work, with unclear boundaries and substantial regression risk. |
| reviewer-basic | `gpt-5.6-sol` | high | Auto-review | General code review and investigation of problems. |
| reviewer-hard | `gpt-6-astra` | medium | Full access | Deep review of changes with a high cost of error or serious consequences, including payments and authorization. |

Some descriptions were truncated in the screenshot. Their visible meaning is retained above; hidden wording has not been reconstructed verbatim. Model selections, reasoning values, access labels and profile names match the visible configuration.
