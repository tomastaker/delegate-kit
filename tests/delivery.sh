#!/bin/bash
# Completion delivery contracts for --on-finish, notify and lifecycle.
#
# Synthetic metadata fixtures; no worker or model calls.
# Backend execution is tested separately.
# Run ./delivery.sh for functional checks.
#
# Run ./delivery.sh --race N for N concurrency rounds.
# The default race uses 20 rounds of eight processes.
#
# Stress the creation window and hooks that close stdin early.
# These regressions require concurrency to reproduce consistently.
# A payload larger than the pipe buffer exercises the EPIPE path.
set -u
AR="$(cd "$(dirname "$0")/../skills/delegate-kit/scripts" && pwd)/agent-run"
BASE="${TMPDIR:-/tmp}/dk-delivery-test.$$"
trap 'rm -rf "$BASE"' EXIT
export DELEGATE_KIT_HOME="$BASE/state"
PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: expected [$3], got [$2]"; FAIL=$((FAIL+1)); fi; }

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
      result:{status:"done",summary:"synthetic run "+id,changes:[],checks_run:[],not_verified:[],findings:[],plan:[],questions:[],sources:[],next_steps:[]}};
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
    for _i in $(seq 1 $procs); do node "$AR" notify rr >/dev/null 2>&1 & done; wait
    local n s; n=$(grep -c hit "$log"); s=$(field rr delivery.state)
    [ "$n" = "1" ] || { echo "  round $r: deliveries $n"; bad=$((bad+1)); }
    [ "$s" = "delivered" ] || { echo "  round $r: state $s"; lost=$((lost+1)); }
  done
  echo "rounds: $rounds × $procs processes, duplicates: $bad, undelivered: $lost"
  [ $((bad+lost)) -eq 0 ]
}

rm -rf "$DELEGATE_KIT_HOME"; mkdir -p "$DELEGATE_KIT_HOME/runs"
if [ "${1:-}" = "--race" ]; then race "${2:-20}"; exit $?; fi

HOOKLOG="$BASE/hook.log"; : > "$HOOKLOG"
HOOK="echo \"fired \$DK_RUN_ID \$DK_STATUS \$DK_LIFECYCLE\" >> $HOOKLOG"

echo "-- Completed run delivery"
mkrun r-done finished 999999 sess-abc "$HOOK"
node "$AR" notify >/dev/null
ok "Completion hook fired" "$(grep -c 'fired r-done' "$HOOKLOG")" "1"
ok "Delivery state recorded" "$(field r-done delivery.state)" "delivered"
ok "Live session is parked" "$(out r-done lifecycle)" "parked"

echo "-- Exactly once"
node "$AR" notify >/dev/null; node "$AR" list >/dev/null; node "$AR" status r-done >/dev/null
ok "Hook still fired only once" "$(grep -c 'fired r-done' "$HOOKLOG")" "1"

echo "-- Running tasks are not delivered"
mkrun r-live running $$ null "$HOOK"
node "$AR" notify >/dev/null
ok "Hook did not fire" "$(grep -c 'fired r-live' "$HOOKLOG")" "0"

echo "-- Supervisor death triggers reconciliation and delivery"
mkrun r-orph running 999998 null "$HOOK"
node "$AR" list >/dev/null
ok "Dead supervisor becomes orphaned" "$(field r-orph status)" "orphaned"
ok "Hook fires after supervisor death" "$(grep -c 'fired r-orph' "$HOOKLOG")" "1"
ok "No session means done" "$(out r-orph lifecycle)" "done"

echo "-- Quota failure defers delivery to the next attempt"
mkrun r-quota failed-quota 999997 null "$HOOK"
node "$AR" notify >/dev/null
ok "Quota fallback defers delivery" "$(grep -c 'fired r-quota' "$HOOKLOG")" "0"

echo "-- Retries and backoff"
mkrun r-bad finished 999996 null "exit 3"
node "$AR" notify >/dev/null
ok "Attempt counted" "$(field r-bad delivery.attempts)" "1"
ok "Next retry scheduled" "$([ "$(field r-bad delivery.nextAttemptAt)" = null ] && echo absent || echo present)" "present"
ok "Exit status included in error" "$(field r-bad delivery.lastError | grep -c 'exited 3')" "1"
node "$AR" notify >/dev/null
ok "No retry before deadline" "$(field r-bad delivery.attempts)" "1"
for _i in 2 3 4 5; do rewind r-bad; node "$AR" notify >/dev/null; done
ok "Attempts exhausted" "$(field r-bad delivery.attempts)" "5"
ok "Delivery marked failed" "$(field r-bad delivery.state)" "failed"
node "$AR" notify >/dev/null
ok "No automatic retry after failure" "$(field r-bad delivery.attempts)" "5"
node "$AR" notify r-bad --force >/dev/null
ok "Force retries delivery" "$(field r-bad delivery.attempts)" "6"

echo "-- Concurrent delivery"
mkrun r-race finished 999995 s "$HOOK"
for _i in $(seq 1 8); do node "$AR" notify r-race >/dev/null 2>&1 & done; wait
ok "Concurrent delivery fires once" "$(grep -c 'fired r-race' "$HOOKLOG")" "1"
ok "Delivery claim released" "$([ -e "$DELEGATE_KIT_HOME/runs/r-race/delivery.lock" ] && echo present || echo absent)" "absent"

echo "-- Hook that does not read stdin avoids EPIPE"
mkrun r-epipe finished 999993 null "$HOOK"
# Delivery regression coverage.
node -e 'const f=process.argv[1];const m=JSON.parse(require("fs").readFileSync(f));m.result.summary="x".repeat(200000);require("fs").writeFileSync(f,JSON.stringify(m))' "$DELEGATE_KIT_HOME/runs/r-epipe/meta.json"
node "$AR" notify >/dev/null
ok "Hook fired" "$(grep -c 'fired r-epipe' "$HOOKLOG")" "1"
ok "Delivery counted" "$(field r-epipe delivery.state)" "delivered"
ok "No error recorded" "$(field r-epipe delivery.lastError)" "null"
ok "Payload file is available" "$([ -s "$DELEGATE_KIT_HOME/runs/r-epipe/delivery-payload.json" ] && echo present || echo absent)" "present"

echo "-- Polling without a hook"
mkrun r-nohook finished 999994 null null
node "$AR" list >/dev/null 2>&1
ok "List succeeds" "$?" "0"
ok "No delivery record without a hook" "$(field r-nohook delivery)" "null"

echo; echo "Passed: $PASS, failed: $FAIL"
exit $((FAIL > 0))
