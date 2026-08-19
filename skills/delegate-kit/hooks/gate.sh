#!/usr/bin/env bash
# delegate-kit gate — PreToolUse hook for shell commands in Claude Code and Codex CLI.
# Dangerous commands must be confirmed by the user:
#   Claude Code : returns permissionDecision "ask" (native approval prompt).
#   Codex CLI   : "ask" is not supported by Codex hooks, so the command is denied with
#                 instructions to get the user's explicit confirmation and re-run with the
#                 DELEGATE_KIT_CONFIRMED=1 prefix, which this gate lets through.
# Usage (registered by hooks/install.sh): gate.sh --harness claude|codex
set -euo pipefail

HARNESS="claude"
[ "${1:-}" = "--harness" ] && HARNESS="${2:-claude}"

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
[ -z "$CMD" ] && exit 0

# explicit confirmation prefix (visible in the approval UI / transcript)
if printf '%s' "$CMD" | grep -Eq '^[[:space:]]*DELEGATE_KIT_CONFIRMED=1[[:space:]]'; then exit 0; fi
[ "${DELEGATE_KIT_CONFIRMED:-}" = "1" ] && exit 0

# Patterns: one reason per line. Keep them specific enough not to fire on read-only diagnostics.
# command-position anchor: start, after ; & | ( ` or after xargs/exec/env/nohup/time
A='(^|[;&|(`][[:space:]]*|(xargs|exec|env|nohup|time|nice|caffeinate)[[:space:]]+)'
reason=""
check() { if printf '%s' "$CMD" | grep -Eiq "$1"; then reason="$2"; fi; }
check "${A}(sudo|doas)[[:space:]]"                                   "privilege escalation (sudo)"
check "${A}rm[[:space:]]+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r[[:space:]]+-f|-f[[:space:]]+-r)[a-z]*([[:space:]]|\$)" "recursive forced delete (rm -rf)"
check "${A}rm[[:space:]]+-[a-z]*r[a-z]*[[:space:]]+(/|~|\\\$HOME|\\.\\.?)([[:space:]]|\$)" "recursive delete of a root-like path"
check 'launchctl[[:space:]]+(load|unload|bootstrap|bootout|kickstart|remove|disable|enable)' "launchd service change"
check 'systemctl[[:space:]]+(stop|restart|disable|mask|enable|daemon-reload)|service[[:space:]]+[a-z0-9._-]+[[:space:]]+(stop|restart)' "system service change"
check "ufw[[:space:]]+(enable|disable|allow|deny|reject|limit|delete|insert|reset|route|default)" "firewall change"
check "(iptables|ip6tables)[[:space:]]+.*(-A|-I|-D|-F|-X|-P|--append|--insert|--delete|--flush|--policy)([[:space:]]|\$)" "firewall change"
check "(nft[[:space:]]+(add|delete|flush|insert|replace)|pfctl[[:space:]]+.*-(e|d|F|f)\\b|firewall-cmd[[:space:]]+.*--(add|remove|permanent|reload))" "firewall change"
check '(certbot|acme\.sh|openssl[[:space:]]+(req|x509|genrsa|ecparam))' "certificate / key operation"
check '(psql|mysql|mariadb|mongosh|mongo|redis-cli|sqlite3)\b.*\b(DROP|TRUNCATE|DELETE[[:space:]]+FROM|FLUSHALL|FLUSHDB|ALTER[[:space:]]+TABLE)' "destructive database statement"
check '\b(DROP[[:space:]]+(DATABASE|TABLE|SCHEMA)|TRUNCATE[[:space:]]+TABLE)\b' "destructive database statement"
check 'git[[:space:]]+push[[:space:]].*(--force([[:space:]]|$)|-f([[:space:]]|$)|--force-with-lease|\+[a-zA-Z])' "force push"
check 'git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-z]*f|branch[[:space:]]+-D|checkout[[:space:]]+--[[:space:]]+\.)' "history/worktree-destroying git command"
check "${A}(reboot|shutdown|halt|poweroff)([[:space:]]|\$)" "host reboot/shutdown"
check '(diskutil[[:space:]]+(erase|partition|reformat)|mkfs\.|(^|[[:space:]])dd[[:space:]]+if=|fdisk|parted)' "disk/partition operation"
check 'chmod[[:space:]]+(-R[[:space:]]+)?(777|a\+rwx)|chown[[:space:]]+-R[[:space:]]+[^[:space:]]+[[:space:]]+/([[:space:]]|$)' "broad permission change"
check 'docker[[:space:]]+(system[[:space:]]+prune|volume[[:space:]]+(rm|prune)|rm[[:space:]]+-f|compose[[:space:]]+down[[:space:]].*(-v|--volumes))' "destructive docker operation"
check 'kill[[:space:]]+-9[[:space:]]+-1|killall[[:space:]]+-9|pkill[[:space:]]+-9[[:space:]]+-f[[:space:]]+\.' "broad process kill"
check 'crontab[[:space:]]+-r' "crontab wipe"
check '>[[:space:]]*/dev/(sd|disk|nvme)|>[[:space:]]*/etc/' "write to device or /etc"
check 'ssh[[:space:]].*[[:space:]](sudo|rm[[:space:]]+-rf|systemctl[[:space:]]+(stop|restart|disable)|reboot|shutdown|docker[[:space:]]+(rm|system[[:space:]]+prune)|dd[[:space:]]+if=|mkfs)' "destructive command over SSH"
check '(^|[[:space:]])(security[[:space:]]+delete|defaults[[:space:]]+delete|tmutil[[:space:]]+delete|rm[[:space:]].*\.(pem|key|p12)\b)' "secrets/keychain/backup deletion"

[ -z "$reason" ] && exit 0

short=$(printf '%s' "$CMD" | head -c 200 | tr '\n' ' ')
if [ "$HARNESS" = "codex" ]; then
  msg="delegate-kit gate: '$short' looks dangerous ($reason). Do NOT retry blindly. Show the exact command to the user, explain the blast radius, and only after the user explicitly confirms re-run it prefixed with: DELEGATE_KIT_CONFIRMED=1 <command>"
  jq -cn --arg m "$msg" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$m}}'
else
  msg="delegate-kit gate: $reason — confirm this command explicitly: $short"
  jq -cn --arg m "$msg" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$m}}'
fi
exit 0
