#!/bin/bash
# Стенд механики доставки завершений (`--on-finish`, `notify`, lifecycle).
#
# Прогоны синтетические: meta.json пишется руками, модели не вызываются, квота
# не тратится. Настоящего воркера здесь нет намеренно — проверяется доставка,
# а не бэкенд.
#
#   ./delivery.sh          функциональные проверки
#   ./delivery.sh --race N N раундов конкуренции (по умолчанию 20 × 8 процессов)
#
# Гонку стоит гонять отдельно и подолгу: оба дефекта, найденные при внедрении
# (пустая заявка в окне создания и EPIPE у хука, не читающего stdin),
# проявлялись лишь под нагрузкой и в одиночном прогоне выглядели как флак.
set -u
AR="$(cd "$(dirname "$0")/../scripts" && pwd)/agent-run"
BASE="${TMPDIR:-/tmp}/dk-delivery-test.$$"
trap 'rm -rf "$BASE"' EXIT
export DELEGATE_KIT_HOME="$BASE/state"
PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: ожидалось [$3], получено [$2]"; FAIL=$((FAIL+1)); fi; }

mkrun(){ # id status pid sessionId onFinish
  local d="$DELEGATE_KIT_HOME/runs/$1"; mkdir -p "$d"
  node -e '
    const fs=require("fs");const[,d,id,status,pid,sess,hook]=process.argv;
    const m={id,role:"researcher",backend:"codex",model:"gpt-5.6-terra",effort:"medium",
      cwd:"/tmp",write:false,status,pid:Number(pid),started:new Date(Date.now()-6e4).toISOString(),
      finished:status==="running"?null:new Date().toISOString(),
      sessionId:sess==="null"?null:sess,workerStatus:status==="finished"?"done":null,
      onFinish:hook==="null"?null:hook,
      delivery:hook==="null"?null:{state:"pending",attempts:0,nextAttemptAt:null,lastError:null,deliveredAt:null},
      result:{status:"done",summary:"синтетический прогон "+id,changes:[],checks_run:[],not_verified:[],findings:[],plan:[],questions:[],sources:[],next_steps:[]}};
    fs.writeFileSync(d+"/meta.json",JSON.stringify(m,null,2));
    fs.writeFileSync(d+"/result.json",JSON.stringify(m.result,null,2));
  ' "$d" "$1" "$2" "$3" "$4" "$5"
}
field(){ node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));const p=process.argv[2].split(".");let v=m;for(const k of p)v=v?.[k];console.log(v===undefined?"undefined":v===null?"null":v)' "$DELEGATE_KIT_HOME/runs/$1/meta.json" "$2"; }
out(){ node "$AR" status "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(process.argv[1].split(".").reduce((a,k)=>a?.[k],o))})' "$2"; }
rewind(){ node -e 'const fs=require("fs"),p=process.argv[1];const m=JSON.parse(fs.readFileSync(p));m.delivery.nextAttemptAt=new Date(Date.now()-1000).toISOString();fs.writeFileSync(p,JSON.stringify(m,null,2))' "$DELEGATE_KIT_HOME/runs/$1/meta.json"; }

race(){
  local rounds="${1:-20}" procs=8 bad=0 lost=0
  for r in $(seq 1 "$rounds"); do
    rm -rf "$DELEGATE_KIT_HOME"; mkdir -p "$DELEGATE_KIT_HOME/runs"
    local log="$BASE/race.log"; : > "$log"
    mkrun rr finished 999999 s "echo hit >> $log"
    for i in $(seq 1 $procs); do node "$AR" notify rr >/dev/null 2>&1 & done; wait
    local n s; n=$(grep -c hit "$log"); s=$(field rr delivery.state)
    [ "$n" = "1" ] || { echo "  раунд $r: срабатываний $n"; bad=$((bad+1)); }
    [ "$s" = "delivered" ] || { echo "  раунд $r: состояние $s"; lost=$((lost+1)); }
  done
  echo "раундов: $rounds × $procs процессов, дублей: $bad, недоставлено: $lost"
  [ $((bad+lost)) -eq 0 ]
}

rm -rf "$DELEGATE_KIT_HOME"; mkdir -p "$DELEGATE_KIT_HOME/runs"
if [ "${1:-}" = "--race" ]; then race "${2:-20}"; exit $?; fi

HOOKLOG="$BASE/hook.log"; : > "$HOOKLOG"
HOOK="echo \"fired \$DK_RUN_ID \$DK_STATUS \$DK_LIFECYCLE\" >> $HOOKLOG"

echo "── доставка завершённого прогона"
mkrun r-done finished 999999 sess-abc "$HOOK"
node "$AR" notify >/dev/null
ok "хук сработал" "$(grep -c 'fired r-done' "$HOOKLOG")" "1"
ok "состояние доставки" "$(field r-done delivery.state)" "delivered"
ok "lifecycle=parked при живой сессии" "$(out r-done lifecycle)" "parked"

echo "── ровно однажды"
node "$AR" notify >/dev/null; node "$AR" list >/dev/null; node "$AR" status r-done >/dev/null
ok "срабатываний по-прежнему одно" "$(grep -c 'fired r-done' "$HOOKLOG")" "1"

echo "── живой прогон не доставляется"
mkrun r-live running $$ null "$HOOK"
node "$AR" notify >/dev/null
ok "хук не сработал" "$(grep -c 'fired r-live' "$HOOKLOG")" "0"

echo "── смерть супервизора: сверка плюс доставка"
mkrun r-orph running 999998 null "$HOOK"
node "$AR" list >/dev/null
ok "статус переведён в orphaned" "$(field r-orph status)" "orphaned"
ok "хук сработал по факту смерти" "$(grep -c 'fired r-orph' "$HOOKLOG")" "1"
ok "lifecycle=done без сессии" "$(out r-orph lifecycle)" "done"

echo "── провал по квоте не доставляется (доставит перезапуск)"
mkrun r-quota failed-quota 999997 null "$HOOK"
node "$AR" notify >/dev/null
ok "хук не сработал" "$(grep -c 'fired r-quota' "$HOOKLOG")" "0"

echo "── ретраи и backoff"
mkrun r-bad finished 999996 null "exit 3"
node "$AR" notify >/dev/null
ok "попытка учтена" "$(field r-bad delivery.attempts)" "1"
ok "срок следующей назначен" "$([ "$(field r-bad delivery.nextAttemptAt)" = null ] && echo нет || echo есть)" "есть"
ok "код возврата в ошибке" "$(field r-bad delivery.lastError | grep -c 'exited 3')" "1"
node "$AR" notify >/dev/null
ok "до срока повтора нет" "$(field r-bad delivery.attempts)" "1"
for i in 2 3 4 5; do rewind r-bad; node "$AR" notify >/dev/null; done
ok "попытки исчерпаны" "$(field r-bad delivery.attempts)" "5"
ok "доставка помечена провалившейся" "$(field r-bad delivery.state)" "failed"
node "$AR" notify >/dev/null
ok "сама не ретраится" "$(field r-bad delivery.attempts)" "5"
node "$AR" notify r-bad --force >/dev/null
ok "--force поднимает" "$(field r-bad delivery.attempts)" "6"

echo "── конкуренция"
mkrun r-race finished 999995 s "$HOOK"
for i in $(seq 1 8); do node "$AR" notify r-race >/dev/null 2>&1 & done; wait
ok "сработало ровно однажды" "$(grep -c 'fired r-race' "$HOOKLOG")" "1"
ok "заявка снята" "$([ -e "$DELEGATE_KIT_HOME/runs/r-race/delivery.lock" ] && echo есть || echo нет)" "нет"

echo "── хук, не читающий stdin, не провал (регрессия EPIPE)"
mkrun r-epipe finished 999993 null "$HOOK"
# Payload раздут за буфер трубы (64 КиБ): иначе разрыв ловится лишь иногда.
node -e 'const f=process.argv[1];const m=JSON.parse(require("fs").readFileSync(f));m.result.summary="д".repeat(200000);require("fs").writeFileSync(f,JSON.stringify(m))' "$DELEGATE_KIT_HOME/runs/r-epipe/meta.json"
node "$AR" notify >/dev/null
ok "хук сработал" "$(grep -c 'fired r-epipe' "$HOOKLOG")" "1"
ok "доставка засчитана" "$(field r-epipe delivery.state)" "delivered"
ok "ошибка не записана" "$(field r-epipe delivery.lastError)" "null"
ok "payload доступен файлом" "$([ -s "$DELEGATE_KIT_HOME/runs/r-epipe/delivery-payload.json" ] && echo есть || echo нет)" "есть"

echo "── прогон без хука не ломает поллинг"
mkrun r-nohook finished 999994 null null
node "$AR" list >/dev/null 2>&1
ok "list отработал" "$?" "0"
ok "delivery отсутствует" "$(field r-nohook delivery)" "null"

echo; echo "Пройдено: $PASS, провалено: $FAIL"
exit $((FAIL > 0))
