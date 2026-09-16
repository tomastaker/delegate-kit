#!/bin/bash
# Gate contracts: dangerous commands, explicit confirmation and delegation depth.
# A worker cannot launch another worker or acquire a writer lock.
# Confirmation does not bypass the depth restriction.
#
#   ./gate.sh
set -u
GATE="$(cd "$(dirname "$0")/../skills/delegate-kit/hooks" && pwd)/gate.sh"
LAST="${TMPDIR:-/tmp}/dk-gate-test.$$.json"; trap 'rm -f "$LAST"' EXIT
PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: expected [$3], got [$2]"; FAIL=$((FAIL+1)); fi; }
# gate HARNESS AGENT_TYPE COMMAND returns allow, ask or deny; LAST retains the reason.
gate(){
  jq -cn --arg c "$3" --arg a "$2" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c}} + (if $a == "" then {} else {agent_type:$a} end)' \
    | DELEGATE_KIT_CONFIRMED='' bash "$GATE" --harness "$1" > "$LAST"
  [ -s "$LAST" ] || echo '{}' > "$LAST"
  jq -r '.hookSpecificOutput.permissionDecision // "allow"' "$LAST"
}
reason(){ jq -r '.hookSpecificOutput.permissionDecisionReason // ""' "$LAST"; }

echo "-- Dangerous commands ask on Claude and deny with guidance on Codex"
ok "rm -rf → ask" "$(gate claude "" 'rm -rf build')" "ask"
ok "The reason identifies the command" "$(reason | grep -c 'rm -rf')" "1"
ok "sudo → ask" "$(gate claude "" 'sudo systemctl restart nginx')" "ask"
ok "git push --force → ask" "$(gate claude "" 'git push --force origin main')" "ask"
ok "DROP TABLE → ask" "$(gate claude "" 'psql -c "DROP TABLE users"')" "ask"
ok "Codex denies with confirmation guidance" "$(gate codex "" 'rm -rf build')" "deny"
ok "Codex names the confirmation environment variable" "$(reason | grep -c 'DELEGATE_KIT_CONFIRMED=1')" "1"
ok "Explicit confirmation allows the command" "$(gate codex "" 'DELEGATE_KIT_CONFIRMED=1 rm -rf build')" "allow"

echo "-- Ordinary commands are allowed"
ok "ls" "$(gate claude "" 'ls -la')" "allow"
ok "Non-force git push" "$(gate claude "" 'git push origin feature')" "allow"
ok "Remove one file" "$(gate claude "" 'rm build/out.txt')" "allow"
ok "Non-shell input without command" "$(printf '{"tool_name":"Read","tool_input":{"file_path":"x"}}' | bash "$GATE" --harness claude; echo "exit $?")" "exit 0"

echo "-- Delegation depth prevents nested workers"
ok "Coordinator can launch a worker" "$(gate claude "" 'agent-run run --role reviewer --backend codex --brief b.md')" "allow"
ok "Worker cannot launch another worker" "$(gate claude "dk-implementer" 'agent-run run --role reviewer --backend codex --brief b.md')" "deny"
ok "Depth reason names the worker" "$(reason | grep -c 'depth is 1.*dk-implementer')" "1"
ok "Worker cannot resume another worker" "$(gate claude "dk-planner" 'agent-run resume 2026-x --brief n.md')" "deny"
ok "Worker cannot lock a worktree" "$(gate claude "dk-implementer" 'agent-wt lock slice-a')" "deny"
# The command is input to the gate parser, so preserve its literal tilde.
# shellcheck disable=SC2088
ok "Tilde helper path is covered" "$(gate claude "dk-implementer" '~/.claude/skills/delegate-kit/scripts/agent-run run --role planner --brief b.md')" "deny"
ok "Quoted executable is covered" "$(gate claude "dk-implementer" '"agent-run" run --role planner --brief b.md')" "deny"
ok "Quoted helper path is covered" "$(gate claude "dk-implementer" "'/home/me/bin/agent-wt' lock task")" "deny"
ok "env and node wrappers are covered" "$(gate claude "dk-implementer" 'env DELEGATE_KIT_PRESET=auto node /x/agent-run run --role planner --brief b.md')" "deny"
ok "Command chains are covered" "$(gate claude "dk-implementer" 'cd /repo && agent-run run --role planner --brief b.md')" "deny"
ok "Confirmation cannot bypass delegation depth" "$(gate claude "dk-implementer" 'DELEGATE_KIT_CONFIRMED=1 agent-run run --role planner --brief b.md')" "deny"
ok "Codex worker is also denied" "$(gate codex "dk-reviewer" 'agent-run run --role verifier --brief b.md')" "deny"
ok "Worker can inspect status and wait" "$(gate claude "dk-reviewer" 'agent-run status 2026-x; agent-run list; agent-wt status s')" "allow"
ok "Worker can inspect worktree diff" "$(gate claude "dk-reviewer" 'agent-wt diff slice-a > review.diff')" "allow"
ok "Worker can run ordinary commands" "$(gate claude "dk-implementer" 'npm test')" "allow"

ok "Worker cannot prepare a v2 run" "$(gate claude "dk-researcher" 'node /installed/delegate-kit/scripts/dk.mjs prepare --session x --task t --agent a --brief b')" "deny"
ok "Worker cannot resume a v2 run" "$(gate claude "dk-researcher" 'node /installed/delegate-kit/scripts/dk.mjs resume run --brief b')" "deny"
ok "Worker can read a v2 result" "$(gate claude "dk-researcher" 'node /installed/delegate-kit/scripts/dk.mjs result run')" "allow"

echo; echo "Passed: $PASS, failed: $FAIL"
exit $((FAIL > 0))
