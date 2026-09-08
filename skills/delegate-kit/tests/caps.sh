#!/bin/bash
# Writer-cap tests (`--max-writers`, DELEGATE_KIT_MAX_WRITERS, native locks)
# and visible admission failures with `--detach`.
#
# Runs are synthetic: active external writer metadata uses the PID
# of this shell. No models are called and no scenario launches a provider CLI.
# External run attempts are rejected by capacity limits, worktree ownership,
# or invalid flags; the tests assert those refusals.
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
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: expected [$3], got [$2]"; FAIL=$((FAIL+1)); fi; }
has(){ grep -q -- "$2" <<<"$1" && echo yes || echo no; }
runs(){ ls "$DELEGATE_KIT_HOME/runs" 2>/dev/null | wc -l | tr -d ' '; }

mkwriter(){ # id [write=true] [cwd] — active external worker
  local d="$DELEGATE_KIT_HOME/runs/$1"; mkdir -p "$d"
  node -e '
    const fs=require("fs");const[,d,id,pid,write,cwd]=process.argv;
    fs.writeFileSync(d+"/meta.json",JSON.stringify({id,role:write === "true" ? "implementer" : "researcher",backend:"codex",model:"gpt-5.6-sol",effort:"high",
      cwd,write:write === "true",status:"running",pid:Number(pid),started:new Date().toISOString(),finished:null,sessionId:null},null,2));
  ' "$d" "$1" "$$" "${2:-true}" "${3:-/tmp}"
}

# Repository with worktrees w1..w5 (agent-wt uses sibling paths: <repo>.worktrees/<name>)
mkdir -p "$BASE/repo"; cd "$BASE/repo" || exit 1
git init -q -b main . && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
for w in w1 w2 w3 w4 w5; do "$WT" create "$w" >/dev/null 2>&1; done
WTS="$BASE/repo.worktrees"
mkdir -p "$DELEGATE_KIT_HOME/runs"

run(){ # cwd extra-args… — captures stderr; exit status is stored in $RC
  local cwd=$1; shift
  ERR=$(node "$AR" run --role implementer --backend codex --cwd "$cwd" --prompt x --no-route-hint "$@" 2>&1 >/dev/null); RC=$?
}

echo "── an external writer in another repository occupies a global writer slot"
mkdir -p "$BASE/other-repo"; git -C "$BASE/other-repo" init -q
mkwriter cross-repo true "$BASE/other-repo"
ERR=$("$WT" lock w1 --max-writers 1 2>&1 >/dev/null); RC=$?
ok "native writer rejected" "$RC" "1"
ok "global writer cap reported" "$(has "$ERR" "max 1 concurrent writers")" "yes"
mkwriter cross-repo false "$BASE/other-repo"
ERR=$("$WT" lock w1 --max-writers 1 --max-workers 1 2>&1 >/dev/null); RC=$?
ok "read-only external run occupies a worker slot" "$(has "$ERR" "max 1 active workers")" "yes"
"$WT" lock w1 --max-writers 1 --max-workers 2 >/dev/null
ok "read-only external run does not occupy a writer slot" "$?" "0"
"$WT" release w1 >/dev/null
rm -f "$DELEGATE_KIT_HOME/runs/cross-repo/meta.json"; rmdir "$DELEGATE_KIT_HOME/runs/cross-repo"

echo "── explicit cap: 2 external + 1 native = 3"
mkwriter e1; mkwriter e2
"$WT" lock w1 --label native-one >/dev/null
run "$WTS/w2" --max-writers 3
ok "rejected" "$RC" "1"
ok "cap of 3 reported" "$(has "$ERR" "max 3 concurrent writers")" "yes"
ok "external writers counted" "$(has "$ERR" "2 external: e1, e2")" "yes"
ok "native lock counted" "$(has "$ERR" "1 native: w1")" "yes"

echo "── --detach reports the same refusal without creating a run (silent failure regression)"
run "$WTS/w2" --max-writers 3 --detach
ok "rejected" "$RC" "1"
ok "reason printed" "$(has "$ERR" "max 3 concurrent writers")" "yes"
ok "no new runs" "$(runs)" "2"

echo "── --detach reports an occupied worktree before forking"
run "$WTS/w1" --max-writers 4 --detach
ok "rejected" "$RC" "1"
ok "native lock reported as the reason" "$(has "$ERR" "locked for a native subagent")" "yes"
ok "no new runs" "$(runs)" "2"

echo "── --max-writers raises the cap (4 > 3 occupied: ownership check is reached)"
run "$WTS/w1" --max-writers 4
ok "capacity check passed; ownership lock rejected" "$(has "$ERR" "locked for a native subagent")" "yes"
ok "no capacity error" "$(has "$ERR" "concurrent writers")" "no"

echo "── DELEGATE_KIT_MAX_WRITERS applies the same override to the session"
DELEGATE_KIT_MAX_WRITERS=4 run "$WTS/w1"
ok "capacity check passed" "$(has "$ERR" "concurrent writers")" "no"

echo "── no arbitrary cap of 8; occupied worktrees remain protected"
run "$WTS/w1" --max-writers 9
ok "rejected" "$RC" "1"
ok "9 accepted; ownership check rejected" "$(has "$ERR" "locked for a native subagent")" "yes"
DELEGATE_KIT_MAX_WRITERS=20 run "$WTS/w1"
ok "environment allows 20" "$(has "$ERR" "locked for a native subagent")" "yes"
run "$WTS/w1"
ok "no implicit cap of 3" "$(has "$ERR" "locked for a native subagent")" "yes"
run "$WTS/w2" --max-writers
ok "flag without a number" "$(has "$ERR" "must be an integer")" "yes"
run "$WTS/w2" --max-writers abc
ok "not a number" "$(has "$ERR" "must be an integer")" "yes"

echo "── max-workers is independent of the writer cap and is not raised automatically"
for i in 3 4 5 6; do mkwriter "r$i"; done   # 6 external runs
run "$WTS/w1" --max-writers 8
ok "no derived worker cap when max-workers is unset" "$(has "$ERR" "locked for a native subagent")" "yes"
DELEGATE_KIT_MAX_WORKERS=1 run "$WTS/w1" --max-writers 8
ok "environment value 1 remains a hard limit" "$(has "$ERR" "max 1 active workers")" "yes"
run "$WTS/w1" --max-writers 8 --max-workers 6
ok "explicit max-workers 6" "$(has "$ERR" "max 6 active workers")" "yes"
for i in 3 4 5 6; do rm -rf "$DELEGATE_KIT_HOME/runs/r$i"; done

echo "── supervisor admission failure persists failed metadata"
node "$AR" run --role implementer --backend codex --cwd "$WTS/w1" --prompt x --no-route-hint --max-writers 4 --_supervise --id sup-1 >/dev/null 2>&1
ok "exit status" "$?" "1"
ok "metadata written" "$([ -f "$DELEGATE_KIT_HOME/runs/sup-1/meta.json" ] && echo yes || echo no)" "yes"
ok "status=failed" "$(node "$AR" status sup-1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).status))')" "failed"
ok "lifecycle=done" "$(node "$AR" status sup-1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).lifecycle))')" "done"
ok "reason included in result" "$(has "$(cat "$DELEGATE_KIT_HOME/runs/sup-1/result.json")" "locked for a native subagent")" "yes"
ok "list succeeds" "$(node "$AR" list >/dev/null 2>&1 && echo ok)" "ok"

echo "── agent-wt lock: shared cap for external writers and native locks"
"$WT" lock w2 >/dev/null; "$WT" lock w3 >/dev/null   # w1..w3 occupied
ERR=$("$WT" lock w4 --max-writers 5 2>&1 >/dev/null); RC=$?
ok "rejected" "$RC" "1"
ok "cap and total writer count reported" "$(has "$ERR" "max 5 concurrent writers reached (5 known writers)")" "yes"
ok "w4 has no lock" "$("$WT" status w4 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).lock))')" "unlocked"
"$WT" lock w4 --max-writers 6 >/dev/null; ok "--max-writers 6 admits the lock" "$?" "0"
"$WT" lock w5 --max-writers 9 >/dev/null; ok "values above eight are accepted" "$?" "0"
"$WT" release w5 >/dev/null
DELEGATE_KIT_MAX_WRITERS=7 "$WT" lock w5 >/dev/null; ok "environment override admits the lock" "$?" "0"
"$WT" release w5 >/dev/null
ERR=$("$WT" lock w5 --max-workers 1 --max-writers 20 2>&1 >/dev/null); RC=$?
ok "native max-workers is not raised to match the writer cap" "$RC" "1"
ok "worker cap reported" "$(has "$ERR" "max 1 active workers")" "yes"
"$WT" lock w5 --max-workers 7 >/dev/null; ok "2 external + 4 native leave one slot" "$?" "0"
ERR=$("$WT" lock w5 --max-writers 2>&1 >/dev/null)
ok "flag without a number" "$(has "$ERR" "needs a number")" "yes"

echo "── native locks count toward the worker cap (read-only run)"
ERR=$(node "$AR" run --role researcher --backend codex --cwd "$BASE/repo" --prompt x --max-workers 6 --no-route-hint 2>&1 >/dev/null); RC=$?
ok "2 external + 5 native >= 6: rejected" "$RC" "1"
ok "both worker types reported" "$(has "$ERR" "max 6 active workers reached (2 external: e1, e2; 5 native: w1, w2, w3, w4, w5)")" "yes"

echo "── agent-run sees all five native locks"
rm -rf "$DELEGATE_KIT_HOME/runs/e1" "$DELEGATE_KIT_HOME/runs/e2"
run "$WTS/w5" --max-writers 5
ok "5 native >= 5: rejected" "$(has "$ERR" "5 native: w1, w2, w3, w4, w5")" "yes"

echo "── race: 8 concurrent lock --max-writers 1 calls produce exactly one lock"
for w in w1 w2 w3 w4 w5; do "$WT" release "$w" >/dev/null; done
for w in w6 w7 w8; do "$WT" create "$w" >/dev/null 2>&1; done
for w in w1 w2 w3 w4 w5 w6 w7 w8; do "$WT" lock "$w" --max-writers 1 >/dev/null 2>&1 & done; wait
ok "one worktree occupied" "$("$WT" list | jq '[.[] | select(.lock | startswith("locked"))] | length')" "1"
ok "mutex released" "$([ -e "$BASE/repo/.git/delegate-kit.caps.lock" ] && echo held || echo free)" "free"

echo "── race: repeated acquisition of one worktree preserves its owner"
for w in w1 w2 w3 w4 w5 w6 w7 w8; do "$WT" release "$w" >/dev/null 2>&1; done
for i in 1 2 3 4 5 6 7 8; do ("$WT" lock w1 --label "owner-$i" >/dev/null 2>&1 && touch "$BASE/won-$i") & done; wait
ok "exactly one successful owner" "$(find "$BASE" -name 'won-*' | wc -l | tr -d ' ')" "1"

echo "── abandoned mutexes with dead PIDs do not block admission"
for w in w1 w2 w3 w4 w5 w6 w7 w8; do "$WT" release "$w" >/dev/null 2>&1; done
mkdir -p "$BASE/repo/.git/delegate-kit.caps.lock"; echo 999999 > "$BASE/repo/.git/delegate-kit.caps.lock/pid"
"$WT" lock w8 --max-writers 8 >/dev/null; ok "agent-wt recovered the stale repository mutex" "$?" "0"
echo 999999 > "$DELEGATE_KIT_HOME/caps.lock"
mkdir -p "$BASE/repo/.git/delegate-kit.caps.lock"; echo 999999 > "$BASE/repo/.git/delegate-kit.caps.lock/pid"
run "$WTS/w7" --max-writers 1
ok "agent-run recovered both stale mutexes and reached the capacity check" "$(has "$ERR" "concurrent writers reached")" "yes"
ok "global mutex released" "$([ -e "$DELEGATE_KIT_HOME/caps.lock" ] && echo held || echo free)" "free"
ok "repository mutex released" "$([ -e "$BASE/repo/.git/delegate-kit.caps.lock" ] && echo held || echo free)" "free"

echo "── agent-wt sees an external writer process lock in any linked worktree"
"$WT" release w8 >/dev/null
git -C "$BASE/repo" worktree add -q -b dk/elsewhere "$BASE/elsewhere" >/dev/null 2>&1
jq -n --arg pid "$$" '{id:"ext-1",role:"implementer",kind:"process",pid:($pid|tonumber),cwd:"x"}' > "$BASE/repo/.git/worktrees/elsewhere/delegate-kit.lock"
ERR=$("$WT" lock w1 --max-writers 1 2>&1 >/dev/null); RC=$?
ok "rejected: another worktree is owned by a live process" "$RC" "1"
ok "writer counted" "$(has "$ERR" "(1 known writers)")" "yes"
mkwriter ext-1 true x
"$WT" lock w1 --max-writers 2 --max-workers 2 >/dev/null
ok "metadata and process lock for one worker are counted once" "$?" "0"
"$WT" release w1 >/dev/null
rm -f "$DELEGATE_KIT_HOME/runs/ext-1/meta.json"; rmdir "$DELEGATE_KIT_HOME/runs/ext-1"
mkwriter reader false x
ERR=$("$WT" lock w1 --max-writers 1 2>&1 >/dev/null)
ok "read-only metadata in the same cwd does not hide a writer process lock" "$(has "$ERR" "max 1 concurrent writers")" "yes"
rm -f "$DELEGATE_KIT_HOME/runs/reader/meta.json"; rmdir "$DELEGATE_KIT_HOME/runs/reader"
jq -n '{id:"ext-2",role:"implementer",kind:"process",pid:999999,cwd:"x"}' > "$BASE/repo/.git/worktrees/elsewhere/delegate-kit.lock"
"$WT" lock w1 --max-writers 1 >/dev/null; ok "dead process lock is not counted" "$?" "0"

echo "── agent-wt reads config.limits; flags take precedence"
echo '{"limits":{"max_writers":1}}' > "$DELEGATE_KIT_HOME/config.json"
ERR=$("$WT" lock w2 2>&1 >/dev/null); RC=$?
ok "configured writer cap rejects the second lock" "$RC" "1"
ok "configured limit reported" "$(has "$ERR" "max 1 concurrent writers")" "yes"
"$WT" lock w2 --max-writers 2 >/dev/null; ok "flag overrides configuration" "$?" "0"
"$WT" release w2 >/dev/null
echo '{"limits":{"max_workers":1}}' > "$DELEGATE_KIT_HOME/config.json"
ERR=$("$WT" lock w2 2>&1 >/dev/null)
ok "config worker cap" "$(has "$ERR" "max 1 active workers")" "yes"
echo '{"limits":{"max_workers":0}}' > "$DELEGATE_KIT_HOME/config.json"
ERR=$("$WT" lock w2 --max-workers 20 2>&1 >/dev/null); RC=$?
ok "invalid configuration is not hidden by a flag" "$RC" "1"
rm -f "$DELEGATE_KIT_HOME/config.json"

echo; echo "Passed: $PASS, failed: $FAIL"
exit $((FAIL > 0))
