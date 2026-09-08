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
unset DELEGATE_KIT_MAX_WRITERS DELEGATE_KIT_MAX_WORKERS DELEGATE_KIT_MAX_RUNS DELEGATE_KIT_MAX_RETRIES
PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: ожидалось [$3], получено [$2]"; FAIL=$((FAIL+1)); fi; }
has(){ grep -q -- "$2" <<<"$1" && echo yes || echo no; }
runs(){ ls "$DELEGATE_KIT_HOME/runs" 2>/dev/null | wc -l | tr -d ' '; }

mkwriter(){ # id [write=true] [cwd] — живой внешний воркер
  local d="$DELEGATE_KIT_HOME/runs/$1"; mkdir -p "$d"
  node -e '
    const fs=require("fs");const[,d,id,pid,write,cwd]=process.argv;
    fs.writeFileSync(d+"/meta.json",JSON.stringify({id,role:write === "true" ? "implementer" : "researcher",backend:"codex",model:"gpt-5.6-sol",effort:"high",
      cwd,write:write === "true",status:"running",pid:Number(pid),started:new Date().toISOString(),finished:null,sessionId:null},null,2));
  ' "$d" "$1" "$$" "${2:-true}" "${3:-/tmp}"
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

echo "── внешний писатель другого репозитория занимает общий writer slot"
mkdir -p "$BASE/other-repo"; git -C "$BASE/other-repo" init -q
mkwriter cross-repo true "$BASE/other-repo"
ERR=$("$WT" lock w1 --max-writers 1 2>&1 >/dev/null); RC=$?
ok "нативному писателю отказано" "$RC" "1"
ok "назван общий writer cap" "$(has "$ERR" "max 1 concurrent writers")" "yes"
mkwriter cross-repo false "$BASE/other-repo"
ERR=$("$WT" lock w1 --max-writers 1 --max-workers 1 2>&1 >/dev/null); RC=$?
ok "read-only внешний занимает worker slot" "$(has "$ERR" "max 1 active workers")" "yes"
"$WT" lock w1 --max-writers 1 --max-workers 2 >/dev/null
ok "read-only внешний не занимает writer slot" "$?" "0"
"$WT" release w1 >/dev/null
rm -f "$DELEGATE_KIT_HOME/runs/cross-repo/meta.json"; rmdir "$DELEGATE_KIT_HOME/runs/cross-repo"

echo "── явный потолок: 2 внешних + 1 нативный = 3"
mkwriter e1; mkwriter e2
"$WT" lock w1 --label native-one >/dev/null
run "$WTS/w2" --max-writers 3
ok "отказ" "$RC" "1"
ok "назван потолок 3" "$(has "$ERR" "max 3 concurrent writers")" "yes"
ok "внешние посчитаны" "$(has "$ERR" "2 external: e1, e2")" "yes"
ok "нативный lock посчитан" "$(has "$ERR" "1 native: w1")" "yes"

echo "── тот же отказ при --detach виден, прогон не заводится (регрессия тихого провала)"
run "$WTS/w2" --max-writers 3 --detach
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

echo "── нет произвольного потолка 8; занятый worktree остаётся защищён"
run "$WTS/w1" --max-writers 9
ok "отказ" "$RC" "1"
ok "9 разрешено, отказ по владению" "$(has "$ERR" "locked for a native subagent")" "yes"
DELEGATE_KIT_MAX_WRITERS=20 run "$WTS/w1"
ok "env допускает 20" "$(has "$ERR" "locked for a native subagent")" "yes"
run "$WTS/w1"
ok "без явного ограничения нет cap 3" "$(has "$ERR" "locked for a native subagent")" "yes"
run "$WTS/w2" --max-writers
ok "флаг без числа" "$(has "$ERR" "must be an integer")" "yes"
run "$WTS/w2" --max-writers abc
ok "не число" "$(has "$ERR" "must be an integer")" "yes"

echo "── max-workers независим от writer cap и не повышается автоматически"
for i in 3 4 5 6; do mkwriter "r$i"; done   # 6 внешних прогонов
run "$WTS/w1" --max-writers 8
ok "без max-workers нет производного потолка" "$(has "$ERR" "locked for a native subagent")" "yes"
DELEGATE_KIT_MAX_WORKERS=1 run "$WTS/w1" --max-writers 8
ok "env 1 остаётся жёстким ограничением" "$(has "$ERR" "max 1 active workers")" "yes"
run "$WTS/w1" --max-writers 8 --max-workers 6
ok "явный max-workers 6" "$(has "$ERR" "max 6 active workers")" "yes"
for i in 3 4 5 6; do rm -rf "$DELEGATE_KIT_HOME/runs/r$i"; done

echo "── отказ внутри супервизора оставляет meta со статусом failed"
node "$AR" run --role implementer --backend codex --cwd "$WTS/w1" --prompt x --no-route-hint --max-writers 4 --_supervise --id sup-1 >/dev/null 2>&1
ok "код возврата" "$?" "1"
ok "meta записана" "$([ -f "$DELEGATE_KIT_HOME/runs/sup-1/meta.json" ] && echo yes || echo no)" "yes"
ok "status=failed" "$(node "$AR" status sup-1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).status))')" "failed"
ok "lifecycle=done" "$(node "$AR" status sup-1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).lifecycle))')" "done"
ok "причина в result" "$(has "$(cat "$DELEGATE_KIT_HOME/runs/sup-1/result.json")" "locked for a native subagent")" "yes"
ok "list не падает" "$(node "$AR" list >/dev/null 2>&1 && echo ok)" "ok"

echo "── agent-wt lock: общий потолок внешних писателей и нативных lock'ов"
"$WT" lock w2 >/dev/null; "$WT" lock w3 >/dev/null   # w1..w3 заняты
ERR=$("$WT" lock w4 --max-writers 5 2>&1 >/dev/null); RC=$?
ok "отказ" "$RC" "1"
ok "назван потолок и общее число писателей" "$(has "$ERR" "max 5 concurrent writers reached (5 known writers)")" "yes"
ok "нет lock'а на w4" "$("$WT" status w4 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).lock))')" "unlocked"
"$WT" lock w4 --max-writers 6 >/dev/null; ok "--max-writers 6 пускает" "$?" "0"
"$WT" lock w5 --max-writers 9 >/dev/null; ok "больше восьми разрешено" "$?" "0"
"$WT" release w5 >/dev/null
DELEGATE_KIT_MAX_WRITERS=7 "$WT" lock w5 >/dev/null; ok "env пускает" "$?" "0"
"$WT" release w5 >/dev/null
ERR=$("$WT" lock w5 --max-workers 1 --max-writers 20 2>&1 >/dev/null); RC=$?
ok "native max-workers не повышается под writer cap" "$RC" "1"
ok "назван worker cap" "$(has "$ERR" "max 1 active workers")" "yes"
"$WT" lock w5 --max-workers 7 >/dev/null; ok "2 внешних + 4 нативных оставляют один слот" "$?" "0"
ERR=$("$WT" lock w5 --max-writers 2>&1 >/dev/null)
ok "флаг без числа" "$(has "$ERR" "needs a number")" "yes"

echo "── нативные lock'и входят и в общий счёт воркеров (read-only прогон)"
ERR=$(node "$AR" run --role researcher --backend codex --cwd "$BASE/repo" --prompt x --max-workers 6 --no-route-hint 2>&1 >/dev/null); RC=$?
ok "2 внешних + 5 нативных ≥ 6: отказ" "$RC" "1"
ok "названы оба вида" "$(has "$ERR" "max 6 active workers reached (2 external: e1, e2; 5 native: w1, w2, w3, w4, w5)")" "yes"

echo "── agent-run видит все пять нативных lock'ов"
rm -rf "$DELEGATE_KIT_HOME/runs/e1" "$DELEGATE_KIT_HOME/runs/e2"
run "$WTS/w5" --max-writers 5
ok "5 нативных ≥ 5: отказ" "$(has "$ERR" "5 native: w1, w2, w3, w4, w5")" "yes"

echo "── гонка: 8 одновременных lock --max-writers 1 дают ровно один lock"
for w in w1 w2 w3 w4 w5; do "$WT" release "$w" >/dev/null; done
for w in w6 w7 w8; do "$WT" create "$w" >/dev/null 2>&1; done
for w in w1 w2 w3 w4 w5 w6 w7 w8; do "$WT" lock "$w" --max-writers 1 >/dev/null 2>&1 & done; wait
ok "занят один worktree" "$("$WT" list | jq '[.[] | select(.lock | startswith("locked"))] | length')" "1"
ok "мьютекс отпущен" "$([ -e "$BASE/repo/.git/delegate-kit.caps.lock" ] && echo held || echo free)" "free"

echo "── гонка: повторный захват одного worktree не меняет владельца"
for w in w1 w2 w3 w4 w5 w6 w7 w8; do "$WT" release "$w" >/dev/null 2>&1; done
for i in 1 2 3 4 5 6 7 8; do ("$WT" lock w1 --label "owner-$i" >/dev/null 2>&1 && touch "$BASE/won-$i") & done; wait
ok "один успешный владелец" "$(find "$BASE" -name 'won-*' | wc -l | tr -d ' ')" "1"

echo "── брошенные мьютексы с мёртвым pid не блокируют"
for w in w1 w2 w3 w4 w5 w6 w7 w8; do "$WT" release "$w" >/dev/null 2>&1; done
mkdir -p "$BASE/repo/.git/delegate-kit.caps.lock"; echo 999999 > "$BASE/repo/.git/delegate-kit.caps.lock/pid"
"$WT" lock w8 --max-writers 8 >/dev/null; ok "agent-wt снял труп репозиторного мьютекса" "$?" "0"
echo 999999 > "$DELEGATE_KIT_HOME/caps.lock"
mkdir -p "$BASE/repo/.git/delegate-kit.caps.lock"; echo 999999 > "$BASE/repo/.git/delegate-kit.caps.lock/pid"
run "$WTS/w7" --max-writers 1
ok "agent-run снял оба трупа и дошёл до потолка" "$(has "$ERR" "concurrent writers reached")" "yes"
ok "машинный мьютекс отпущен" "$([ -e "$DELEGATE_KIT_HOME/caps.lock" ] && echo held || echo free)" "free"
ok "репозиторный мьютекс отпущен" "$([ -e "$BASE/repo/.git/delegate-kit.caps.lock" ] && echo held || echo free)" "free"

echo "── agent-wt видит process-lock внешнего писателя в любом linked worktree"
"$WT" release w8 >/dev/null
git -C "$BASE/repo" worktree add -q -b dk/elsewhere "$BASE/elsewhere" >/dev/null 2>&1
jq -n --arg pid "$$" '{id:"ext-1",role:"implementer",kind:"process",pid:($pid|tonumber),cwd:"x"}' > "$BASE/repo/.git/worktrees/elsewhere/delegate-kit.lock"
ERR=$("$WT" lock w1 --max-writers 1 2>&1 >/dev/null); RC=$?
ok "отказ: чужой worktree занят живым процессом" "$RC" "1"
ok "он посчитан" "$(has "$ERR" "(1 known writers)")" "yes"
mkwriter ext-1 true x
"$WT" lock w1 --max-writers 2 --max-workers 2 >/dev/null
ok "meta и process-lock одного воркера считаются один раз" "$?" "0"
"$WT" release w1 >/dev/null
rm -f "$DELEGATE_KIT_HOME/runs/ext-1/meta.json"; rmdir "$DELEGATE_KIT_HOME/runs/ext-1"
mkwriter reader false x
ERR=$("$WT" lock w1 --max-writers 1 2>&1 >/dev/null)
ok "read-only meta в том же cwd не скрывает process-lock писателя" "$(has "$ERR" "max 1 concurrent writers")" "yes"
rm -f "$DELEGATE_KIT_HOME/runs/reader/meta.json"; rmdir "$DELEGATE_KIT_HOME/runs/reader"
jq -n '{id:"ext-2",role:"implementer",kind:"process",pid:999999,cwd:"x"}' > "$BASE/repo/.git/worktrees/elsewhere/delegate-kit.lock"
"$WT" lock w1 --max-writers 1 >/dev/null; ok "мёртвый process-lock не считается" "$?" "0"

echo "── agent-wt читает config.limits; флаг выше по приоритету"
echo '{"limits":{"max_writers":1}}' > "$DELEGATE_KIT_HOME/config.json"
ERR=$("$WT" lock w2 2>&1 >/dev/null); RC=$?
ok "config writer cap отклоняет второй lock" "$RC" "1"
ok "назван лимит из config" "$(has "$ERR" "max 1 concurrent writers")" "yes"
"$WT" lock w2 --max-writers 2 >/dev/null; ok "флаг переопределяет config" "$?" "0"
"$WT" release w2 >/dev/null
echo '{"limits":{"max_workers":1}}' > "$DELEGATE_KIT_HOME/config.json"
ERR=$("$WT" lock w2 2>&1 >/dev/null)
ok "config worker cap" "$(has "$ERR" "max 1 active workers")" "yes"
echo '{"limits":{"max_workers":0}}' > "$DELEGATE_KIT_HOME/config.json"
ERR=$("$WT" lock w2 --max-workers 20 2>&1 >/dev/null); RC=$?
ok "невалидный config не скрывается флагом" "$RC" "1"
rm -f "$DELEGATE_KIT_HOME/config.json"

echo; echo "Пройдено: $PASS, провалено: $FAIL"
exit $((FAIL > 0))
