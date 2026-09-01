#!/bin/bash
# Стенд потолков писателей (`--max-writers`, DELEGATE_KIT_MAX_WRITERS, нативные lock'и)
# и видимости отказа при `--detach`.
#
# Прогоны синтетические: meta.json «живых» внешних писателей пишется руками с pid
# этой оболочки, модели не вызываются. Ни один сценарий не доходит до spawn CLI:
# каждый заканчивается отказом — по потолку, по занятому worktree или по
# невалидному флагу, — и именно отказ здесь проверяется.
#
#   ./caps.sh
set -u
SCRIPTS="$(cd "$(dirname "$0")/../scripts" && pwd)"
AR="$SCRIPTS/agent-run"; WT="$SCRIPTS/agent-wt"
BASE="${TMPDIR:-/tmp}/dk-caps-test.$$"
trap 'rm -rf "$BASE"' EXIT
export DELEGATE_KIT_HOME="$BASE/state"
export DELEGATE_KIT_PARENT=claude
unset DELEGATE_KIT_MAX_WRITERS DELEGATE_KIT_MAX_WORKERS
PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: ожидалось [$3], получено [$2]"; FAIL=$((FAIL+1)); fi; }
has(){ grep -q -- "$2" <<<"$1" && echo yes || echo no; }
runs(){ ls "$DELEGATE_KIT_HOME/runs" 2>/dev/null | wc -l | tr -d ' '; }

mkwriter(){ # id — живой внешний писатель
  local d="$DELEGATE_KIT_HOME/runs/$1"; mkdir -p "$d"
  node -e '
    const fs=require("fs");const[,d,id,pid]=process.argv;
    fs.writeFileSync(d+"/meta.json",JSON.stringify({id,role:"implementer",backend:"codex",model:"gpt-5.6-sol",effort:"high",
      cwd:"/tmp",write:true,status:"running",pid:Number(pid),started:new Date().toISOString(),finished:null,sessionId:null},null,2));
  ' "$d" "$1" "$$"
}

# Репозиторий с worktree'ями w1..w5 (agent-wt кладёт их рядом: <repo>.worktrees/<name>)
mkdir -p "$BASE/repo"; cd "$BASE/repo" || exit 1
git init -q -b main . && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
for w in w1 w2 w3 w4 w5; do "$WT" create "$w" >/dev/null 2>&1; done
WTS="$BASE/repo.worktrees"
mkdir -p "$DELEGATE_KIT_HOME/runs"

run(){ # cwd extra-args… — печатает stderr; код возврата в $RC
  local cwd=$1; shift
  ERR=$(node "$AR" run --role implementer --backend codex --cwd "$cwd" --prompt x --no-route-hint "$@" 2>&1 >/dev/null); RC=$?
}

echo "── потолок по умолчанию: 2 внешних + 1 нативный = 3"
mkwriter e1; mkwriter e2
"$WT" lock w1 --label native-one >/dev/null
run "$WTS/w2"
ok "отказ" "$RC" "1"
ok "назван потолок 3" "$(has "$ERR" "max 3 concurrent writers")" "yes"
ok "внешние посчитаны" "$(has "$ERR" "2 external: e1, e2")" "yes"
ok "нативный lock посчитан" "$(has "$ERR" "1 native: w1")" "yes"
ok "подсказан --max-writers" "$(has "$ERR" "--max-writers N")" "yes"

echo "── тот же отказ при --detach виден, прогон не заводится (регрессия тихого провала)"
run "$WTS/w2" --detach
ok "отказ" "$RC" "1"
ok "причина напечатана" "$(has "$ERR" "max 3 concurrent writers")" "yes"
ok "новых прогонов нет" "$(runs)" "2"

echo "── занятый worktree при --detach тоже виден до fork"
run "$WTS/w1" --max-writers 4 --detach
ok "отказ" "$RC" "1"
ok "причина — нативный lock" "$(has "$ERR" "locked for a native subagent")" "yes"
ok "новых прогонов нет" "$(runs)" "2"

echo "── --max-writers поднимает потолок (4 > 3 занятых: до lock'а доходит)"
run "$WTS/w1" --max-writers 4
ok "потолок пройден, упёрлись в lock" "$(has "$ERR" "locked for a native subagent")" "yes"
ok "потолка в ошибке нет" "$(has "$ERR" "concurrent writers")" "no"

echo "── DELEGATE_KIT_MAX_WRITERS делает то же на сессию"
DELEGATE_KIT_MAX_WRITERS=4 run "$WTS/w1"
ok "потолок пройден" "$(has "$ERR" "concurrent writers")" "no"

echo "── жёсткий потолок 8"
run "$WTS/w2" --max-writers 9
ok "отказ" "$RC" "1"
ok "назван потолок" "$(has "$ERR" "above the ceiling of 8")" "yes"
DELEGATE_KIT_MAX_WRITERS=9 run "$WTS/w2"
ok "env тоже не пересекает" "$(has "$ERR" "above the ceiling of 8")" "yes"
run "$WTS/w2" --max-writers
ok "флаг без числа" "$(has "$ERR" "must be an integer")" "yes"
run "$WTS/w2" --max-writers abc
ok "не число" "$(has "$ERR" "must be an integer")" "yes"

echo "── воркеров всего = писатели + 3, DELEGATE_KIT_MAX_WORKERS не ниже писателей + 1"
for i in 3 4 5 6; do mkwriter "r$i"; done   # 6 внешних прогонов
run "$WTS/w2" --max-writers 8
ok "8 + 3 = 11: воркеров хватает, упёрлись не в них" "$(has "$ERR" "active workers")" "no"
DELEGATE_KIT_MAX_WORKERS=1 run "$WTS/w2" --max-writers 8
ok "поднято до писателей + 1 = 9" "$(has "$ERR" "active workers")" "no"
run "$WTS/w2" --max-writers 3
ok "3 + 3 = 6 занято: отказ по воркерам" "$(has "$ERR" "max 6 active workers")" "yes"
for i in 3 4 5 6; do rm -rf "$DELEGATE_KIT_HOME/runs/r$i"; done

echo "── отказ внутри супервизора оставляет meta со статусом failed"
node "$AR" run --role implementer --backend codex --cwd "$WTS/w1" --prompt x --no-route-hint --max-writers 4 --_supervise --id sup-1 >/dev/null 2>&1
ok "код возврата" "$?" "1"
ok "meta записана" "$([ -f "$DELEGATE_KIT_HOME/runs/sup-1/meta.json" ] && echo yes || echo no)" "yes"
ok "status=failed" "$(node "$AR" status sup-1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).status))')" "failed"
ok "lifecycle=done" "$(node "$AR" status sup-1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).lifecycle))')" "done"
ok "причина в result" "$(has "$(cat "$DELEGATE_KIT_HOME/runs/sup-1/result.json")" "locked for a native subagent")" "yes"
ok "list не падает" "$(node "$AR" list >/dev/null 2>&1 && echo ok)" "ok"

echo "── agent-wt lock: тот же потолок по lock'ам репозитория"
"$WT" lock w2 >/dev/null; "$WT" lock w3 >/dev/null   # w1..w3 заняты
ERR=$("$WT" lock w4 2>&1 >/dev/null); RC=$?
ok "отказ" "$RC" "1"
ok "назван потолок и занятые" "$(has "$ERR" "max 3 concurrent writers reached in this repository (w1 w2 w3)")" "yes"
ok "нет lock'а на w4" "$("$WT" status w4 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).lock))')" "unlocked"
"$WT" lock w4 --max-writers 4 >/dev/null; ok "--max-writers 4 пускает" "$?" "0"
ERR=$("$WT" lock w5 --max-writers 9 2>&1 >/dev/null)
ok "жёсткий потолок" "$(has "$ERR" "above the ceiling of 8")" "yes"
DELEGATE_KIT_MAX_WRITERS=5 "$WT" lock w5 >/dev/null; ok "env пускает" "$?" "0"
ERR=$("$WT" lock w5 --max-writers 2>&1 >/dev/null)
ok "флаг без числа" "$(has "$ERR" "needs a number")" "yes"

echo "── agent-run видит все четыре нативных lock'а"
rm -rf "$DELEGATE_KIT_HOME/runs/e1" "$DELEGATE_KIT_HOME/runs/e2"
run "$WTS/w5" --max-writers 5
ok "5 нативных ≥ 5: отказ" "$(has "$ERR" "5 native: w1, w2, w3, w4, w5")" "yes"

echo; echo "Пройдено: $PASS, провалено: $FAIL"
exit $((FAIL > 0))
