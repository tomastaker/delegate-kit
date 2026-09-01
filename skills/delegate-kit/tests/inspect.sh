#!/bin/bash
# Стенд `agent-run inspect`: что прерванный писатель оставил в worktree и какую
# заметку получит его fallback-перезапуск. Та же функция кормит quota fallback,
# поэтому проверяется здесь, без запуска моделей.
#
#   ./inspect.sh
set -u
SCRIPTS="$(cd "$(dirname "$0")/../scripts" && pwd)"
AR="$SCRIPTS/agent-run"; WT="$SCRIPTS/agent-wt"
BASE="${TMPDIR:-/tmp}/dk-inspect-test.$$"
trap 'rm -rf "$BASE"' EXIT
export DELEGATE_KIT_HOME="$BASE/state"
PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: ожидалось [$3], получено [$2]"; FAIL=$((FAIL+1)); fi; }
G="git -c user.email=t@t -c user.name=t"

mkdir -p "$BASE/repo"; cd "$BASE/repo" || exit 1
git init -q -b main . && $G commit -q --allow-empty -m init
"$WT" create slice >/dev/null 2>&1
W="$BASE/repo.worktrees/slice"

echo "── чистый worktree"
ok "git=true, partial=false" "$(node "$AR" inspect "$W" | jq -r '[.git,.partial,(.commits|length),(.dirty|length)]|join(" ")')" "true false 0 0"
ok "база записана agent-wt create" "$(node "$AR" inspect "$W" | jq -r '.base == "'"$(git rev-parse HEAD)"'"')" "true"
ok "note пустой" "$(node "$AR" inspect "$W" | jq -r '.note')" "null"

echo "── коммит и грязный файл после базы"
echo a > "$W/a.txt"; $G -C "$W" add a.txt; $G -C "$W" commit -q -m "add a"
echo b > "$W/b.txt"; echo a2 > "$W/a.txt"
OUT=$(node "$AR" inspect "$W")
ok "partial=true" "$(jq -r '.partial' <<<"$OUT")" "true"
ok "один коммит с темой" "$(jq -r '.commits|length|tostring' <<<"$OUT") $(jq -r '.commits[0].subject' <<<"$OUT")" "1 add a"
ok "грязные: изменённый и новый" "$(jq -r '[.dirty[]|.status+":"+.path]|sort|join(" ")' <<<"$OUT")" "??:b.txt M:a.txt"
ok "note называет коммит" "$(jq -r '.note' <<<"$OUT" | grep -c 'add a')" "1"
ok "note называет грязные файлы" "$(jq -r '.note' <<<"$OUT" | grep -c 'M a.txt, ?? b.txt')" "1"
ok "note велит читать и продолжать" "$(jq -r '.note' <<<"$OUT" | grep -c 'continue from it')" "1"

echo "── без базы считаются только грязные файлы"
rm "$BASE/repo/.git/worktrees/slice/delegate-kit.base"
ok "base=null, коммиты не считаются, грязные видны" "$(node "$AR" inspect "$W" | jq -r '[(.base|tostring),(.commits|length),(.dirty|length),.partial]|join(" ")')" "null 0 2 true"

echo "── не git"
mkdir -p "$BASE/plain"
ok "git=false, partial=false" "$(node "$AR" inspect "$BASE/plain" | jq -r '[.git,.partial]|join(" ")')" "false false"
ok "нет каталога — отказ" "$(node "$AR" inspect "$BASE/nope" 2>&1 | grep -c 'no such directory')" "1"

echo; echo "Пройдено: $PASS, провалено: $FAIL"
exit $((FAIL > 0))
