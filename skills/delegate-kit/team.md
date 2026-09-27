# Team

Mixed Claude + GPT team. The current chat is the coordinator; it may be Claude Opus 5.5 or a GPT-6 model. User and project instructions take precedence over this file.

## How to use the team

- Do small, understood work yourself. Delegate when it saves your context or usage limit, when pieces are independent and can run in parallel, or when another model must look at the work.
- Split work by independent context (a module, a set of files, a question), not by stage. Planning, implementation and review are not a required chain.
- Brief each specialist with the outcome, editable scope, the finish line, how to demonstrate the result (see [quality.md](quality.md)) and a time budget. Specialists do not delegate further unless the brief says so; do not use GPT `ultra` effort for specialists.

## Choosing the family

Each profile lists a GPT and a Claude option of equal standing.

- By default, give the work to the family other than yours. This spreads usage across both subscriptions and makes the reviewer come from a different family than the author.
- A reviewer comes from the family that did not write the riskiest part of the change. This overrides every other preference.
- The user may override the default for a task ("use more Claude", "save GPT").
- When a model hits a usage limit or is unavailable, switch to the other family's option with a notice.
- Claude Fable 5.1 is used only where listed below, with a notice. Sonnet and any unlisted model need the user's approval.

## Profiles

| Profile | GPT | Claude | Access | Use for |
| --- | --- | --- | --- | --- |
| scout | `gpt-6-luna` · high | `claude-opus-5-5` · low | read | Lookup in code, docs, logs and web; broad sweeps whose result is a short summary with sources. |
| implementer-basic | `gpt-6-sol` · low | `claude-opus-5-5` · low | write | Fully specified edits: renames, repetitive changes, fixes with a known cause. |
| implementer | `gpt-6-sol` · medium | `claude-opus-5-5` · medium | write | The default for bounded implementation, including connected changes across several files. |
| implementer-hard | `gpt-6-astra` · low; medium if the brief has open questions or after a failed attempt | `claude-opus-5-5` · high; `claude-fable-5-1` · high after a failed attempt | write | Unclear invariants, costly regressions, work where a normal attempt failed. |
| ui-designer | `gpt-6-sol` · high, only when Claude is unavailable | `claude-opus-5-5` · high, always preferred | write, browser | Layout, visual design, interaction flows and UX copy. |
| planner | `gpt-6-astra` · medium | `claude-opus-5-5` · high; `claude-fable-5-1` · high for novel, high-stakes, multi-component designs | read | Call when the task spans several components or stages, has consequential design choices, or you are unsure how to decompose it. Returns bounded assignments, each with scope and finish line. Any family; choose the other family when the point is an independent view of your own plan. |
| reviewer | `gpt-6-sol` · high | `claude-opus-5-5` · high | read, browser for UI | Independent review of a code change. |
| cross-review | `gpt-6-astra` · high | `claude-opus-5-5` · high | read, browser for UI | Both in parallel on the same revision. For payments or money, authentication or permissions, deletion or migration of production data, security boundaries, or when the user asks. Announce it when you start it. |

## Routes

Launch your own family natively and the other family from the terminal with its vendor CLI. Both routes use the user's subscriptions. Do not use plugins, other agents, API keys, third-party providers or model pickers offered by the current interface. If the listed route is unavailable, report it and offer the other family's model; do not substitute a route.

| Coordinator | Claude model | GPT model |
| --- | --- | --- |
| Claude | Native agent tool with the profile's model. If it cannot set the effort, the session effort is accepted. | Terminal: `codex exec -m <model> -c model_reasoning_effort=<level> -s read-only\|workspace-write -C <working copy> -o "$w/result" -`. Add `--skip-git-repo-check` outside Git. |
| GPT | Terminal: `claude -p --model <model> --effort <level> --permission-mode plan\|acceptEdits [--allowedTools <check commands>] --output-format stream-json --verbose`. The final text is `jq -r .result` of the last log line. | Native subagent when it can set the profile's model and effort; otherwise the `codex exec` command above. |

### Launching and watching a terminal run

Give each run its own directory. Write the brief to `$w/brief`, then launch detached; `<CLI>` is the command from the table and reads the brief from stdin:

```sh
w=$(mktemp -d); echo $(( $(date +%s) + <budget seconds> )) > "$w/deadline"
( <CLI> < "$w/brief"; echo $? > "$w/exit" ) > "$w/log" 2>&1 < /dev/null & echo $! > "$w/pid"
```

Then wait with this watch command. It checks every 30 seconds inside the shell and ends with one line: `EXITED` (read the result), `STALLED` (no log output for 10 minutes) or `OVER_BUDGET`. A Claude coordinator runs it as a background command and gets one notification. A GPT coordinator runs it in the foreground with a tool timeout above `limit`; `RUNNING` means only the call's limit passed, so run it again.

```sh
w=<run dir>; limit=3000; end=$(( $(date +%s) + limit ))
while kill -0 "$(cat "$w/pid")" 2>/dev/null; do
  sleep 30
  if [ -n "$(find "$w/log" -mmin +10)" ]; then echo STALLED; exit; fi
  if [ "$(date +%s)" -ge "$(cat "$w/deadline")" ]; then echo OVER_BUDGET; exit; fi
  if [ "$(date +%s)" -ge "$end" ]; then echo RUNNING; exit; fi
done
echo "EXITED code=$(cat "$w/exit" 2>/dev/null)"
```

On `STALLED` or `OVER_BUDGET`, read the log tail and the working copy. If the run is still progressing, extend `$w/deadline` or `touch "$w/log"` and watch again; otherwise stop it with `pkill -P <pid>; kill <pid>` and preserve its partial work. Remove the run directory after accepting the result.

- Before the first terminal launch in a session, confirm subscription login: `codex login status` reports ChatGPT, `claude auth status` reports claude.ai, and no `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set. Otherwise stop and report.
- Read work uses `-s read-only` or `--permission-mode plan`; write work uses `-s workspace-write` or `--permission-mode acceptEdits`. Parallel writers use separate worktrees; launch from the worktree directory.
- Full-access and bypass modes need the user's approval.
