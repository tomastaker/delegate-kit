#!/bin/bash
# Seeded-review bench: four small diffs, two planted defects each, reviewed by a
# Claude reviewer and a Codex reviewer through agent-run. Eight headless runs,
# roughly two to three minutes each, on your own subscriptions.
#
#   bench/seeded-review/run.sh [OUT_DIR]     default OUT_DIR = results/<today>
#
# Scoring is by hand: compare each result.json against PLANTED.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AR="$HERE/../../skills/delegate-kit/scripts/agent-run"
OUT="${1:-$HERE/results/$(date +%F)}"
WORK="${TMPDIR:-/tmp}/dk-seeded-review.$$"
mkdir -p "$OUT" "$WORK/repo"
cd "$WORK/repo"
git init -q -b main
mkdir -p src
cp "$HERE/base-package.json" package.json; cp "$HERE/base-README.md" README.md; cp "$HERE/base-errors.js" src/errors.js
git add -A && git -c user.name=bench -c user.email=bench@local commit -qm base
export DELEGATE_KIT_MAX_WORKERS="${DELEGATE_KIT_MAX_WORKERS:-8}"
ids=()
for diff in "$HERE"/diffs/*.diff; do
  n="$(basename "$diff" .diff)"; name="${n#*-}"
  git checkout -q main && git checkout -qb "$n" && git apply "$diff" && git add -A && git -c user.name=bench -c user.email=bench@local commit -qm "$n"
  git checkout -q main
  wt="$WORK/wt/$n"; git worktree add -q "$wt" "$n"
  sed -e "s#__NAME__#$name#g" -e "s#__WT__#$wt#g" -e "s#__DIFF__#$diff#g" "$HERE/brief.md" > "$WORK/$n.brief.md"
  for backend in claude codex; do
    id="$(node "$AR" run --role reviewer --backend "$backend" --cwd "$wt" --brief "$WORK/$n.brief.md" --detach --timeout 25 </dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')"
    ids+=("$n $backend $id"); echo "started $n $backend $id"
  done
done
for entry in "${ids[@]}"; do
  set -- $entry
  node "$AR" wait "$3" --timeout 30 </dev/null >/dev/null || true
  cp "$HOME/.delegate-kit/runs/$3/result.json" "$OUT/$1-$2.json" 2>/dev/null || echo "no result for $1 $2 ($3)"
  echo "$1 $2: $(node -e 'const r=require(process.argv[1]);console.log(r.findings.length+" findings")' "$OUT/$1-$2.json" 2>/dev/null || echo failed)"
done
echo "results in $OUT"
