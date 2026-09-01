#!/bin/bash
# Стенд hooks/gate.sh: что просит подтверждения, что пропускает, и правило
# глубины делегирования — субагент (agent_type во входе хука) не запускает
# воркеров и не берёт lock на worktree, префикс подтверждения этого не открывает.
#
#   ./gate.sh
set -u
GATE="$(cd "$(dirname "$0")/../hooks" && pwd)/gate.sh"
LAST="${TMPDIR:-/tmp}/dk-gate-test.$$.json"; trap 'rm -f "$LAST"' EXIT
PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: ожидалось [$3], получено [$2]"; FAIL=$((FAIL+1)); fi; }
# gate HARNESS AGENT_TYPE COMMAND → decision (allow | ask | deny); сырой ответ в $LAST для reason
gate(){
  jq -cn --arg c "$3" --arg a "$2" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c}} + (if $a == "" then {} else {agent_type:$a} end)' \
    | DELEGATE_KIT_CONFIRMED= bash "$GATE" --harness "$1" > "$LAST"
  [ -s "$LAST" ] || echo '{}' > "$LAST"
  jq -r '.hookSpecificOutput.permissionDecision // "allow"' "$LAST"
}
reason(){ jq -r '.hookSpecificOutput.permissionDecisionReason // ""' "$LAST"; }

echo "── опасные команды: ask на Claude, deny с инструкцией на Codex"
ok "rm -rf → ask" "$(gate claude "" 'rm -rf build')" "ask"
ok "причина названа" "$(reason | grep -c 'rm -rf')" "1"
ok "sudo → ask" "$(gate claude "" 'sudo systemctl restart nginx')" "ask"
ok "git push --force → ask" "$(gate claude "" 'git push --force origin main')" "ask"
ok "DROP TABLE → ask" "$(gate claude "" 'psql -c "DROP TABLE users"')" "ask"
ok "codex: deny с префиксом подтверждения" "$(gate codex "" 'rm -rf build')" "deny"
ok "codex: инструкция про DELEGATE_KIT_CONFIRMED" "$(reason | grep -c 'DELEGATE_KIT_CONFIRMED=1')" "1"
ok "префикс подтверждения пропускает" "$(gate codex "" 'DELEGATE_KIT_CONFIRMED=1 rm -rf build')" "allow"

echo "── обычные команды проходят"
ok "ls" "$(gate claude "" 'ls -la')" "allow"
ok "git push без force" "$(gate claude "" 'git push origin feature')" "allow"
ok "rm одного файла" "$(gate claude "" 'rm build/out.txt')" "allow"
ok "не Bash-вход (нет command)" "$(printf '{"tool_name":"Read","tool_input":{"file_path":"x"}}' | bash "$GATE" --harness claude; echo "exit $?")" "exit 0"

echo "── глубина делегирования: субагент не запускает воркеров"
ok "координатор: agent-run run проходит" "$(gate claude "" 'agent-run run --role reviewer --backend codex --brief b.md')" "allow"
ok "субагент: agent-run run → deny" "$(gate claude "dk-implementer" 'agent-run run --role reviewer --backend codex --brief b.md')" "deny"
ok "причина — depth 1 с именем агента" "$(reason | grep -c 'depth is 1.*dk-implementer')" "1"
ok "субагент: agent-run resume → deny" "$(gate claude "dk-planner" 'agent-run resume 2026-x --brief n.md')" "deny"
ok "субагент: agent-wt lock → deny" "$(gate claude "dk-implementer" 'agent-wt lock slice-a')" "deny"
ok "субагент: путь к скрипту тоже" "$(gate claude "dk-implementer" '~/.claude/skills/delegate-kit/scripts/agent-run run --role planner --brief b.md')" "deny"
ok "субагент: в цепочке команд" "$(gate claude "dk-implementer" 'cd /repo && agent-run run --role planner --brief b.md')" "deny"
ok "субагент: префикс подтверждения не открывает" "$(gate claude "dk-implementer" 'DELEGATE_KIT_CONFIRMED=1 agent-run run --role planner --brief b.md')" "deny"
ok "субагент на Codex тоже deny" "$(gate codex "dk-reviewer" 'agent-run run --role verifier --brief b.md')" "deny"
ok "субагент: status/list/wait проходят" "$(gate claude "dk-reviewer" 'agent-run status 2026-x; agent-run list; agent-wt status s')" "allow"
ok "субагент: agent-wt diff проходит" "$(gate claude "dk-reviewer" 'agent-wt diff slice-a > review.diff')" "allow"
ok "субагент: обычные команды проходят" "$(gate claude "dk-implementer" 'npm test')" "allow"

echo; echo "Пройдено: $PASS, провалено: $FAIL"
exit $((FAIL > 0))
