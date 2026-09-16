#!/bin/bash
# Inspect partial work left by a stopped legacy writer.
# The same inspection supplies context to legacy fallback attempts.
# These checks do not call models.
#
#   ./inspect.sh
set -u
SCRIPTS="$(cd "$(dirname "$0")/../skills/delegate-kit/scripts" && pwd)"
AR="$SCRIPTS/agent-run"; WT="$SCRIPTS/agent-wt"
BASE="${TMPDIR:-/tmp}/dk-inspect-test.$$"
trap 'rm -rf "$BASE"' EXIT
export DELEGATE_KIT_HOME="$BASE/state"
PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: expected [$3], got [$2]"; FAIL=$((FAIL+1)); fi; }
G="git -c user.email=t@t -c user.name=t"

mkdir -p "$BASE/repo"; cd "$BASE/repo" || exit 1
git init -q -b main . && $G commit -q --allow-empty -m init
"$WT" create slice >/dev/null 2>&1
W="$BASE/repo.worktrees/slice"

echo "-- Clean worktree"
ok "git=true, partial=false" "$(node "$AR" inspect "$W" | jq -r '[.git,.partial,(.commits|length),(.dirty|length)]|join(" ")')" "true false 0 0"
ok "Worktree creation records the base" "$(node "$AR" inspect "$W" | jq -r '.base == "'"$(git rev-parse HEAD)"'"')" "true"
ok "Clean worktree has no note" "$(node "$AR" inspect "$W" | jq -r '.note')" "null"

echo "-- Committed and uncommitted changes after base"
echo a > "$W/a.txt"; $G -C "$W" add a.txt; $G -C "$W" commit -q -m "add a"
echo b > "$W/b.txt"; echo a2 > "$W/a.txt"
OUT=$(node "$AR" inspect "$W")
ok "partial=true" "$(jq -r '.partial' <<<"$OUT")" "true"
ok "One commit with its subject" "$(jq -r '.commits|length|tostring' <<<"$OUT") $(jq -r '.commits[0].subject' <<<"$OUT")" "1 add a"
ok "Modified and untracked files are listed" "$(jq -r '[.dirty[]|.status+":"+.path]|sort|join(" ")' <<<"$OUT")" "??:b.txt M:a.txt"
ok "Note includes the commit" "$(jq -r '.note' <<<"$OUT" | grep -c 'add a')" "1"
ok "Note includes dirty files" "$(jq -r '.note' <<<"$OUT" | grep -c 'M a.txt, ?? b.txt')" "1"
ok "Note instructs continuation" "$(jq -r '.note' <<<"$OUT" | grep -c 'continue from it')" "1"

echo "-- Files inside new directories are listed individually"
mkdir -p "$W/src/new"; echo c > "$W/src/new/c.txt"; echo d > "$W/src/new/d.txt"
ok "Lists individual files rather than the directory" "$(node "$AR" inspect "$W" | jq -r '[.dirty[]|select(.path|startswith("src/new/"))|.path]|sort|join(" ")')" "src/new/c.txt src/new/d.txt"
rm -rf "$W/src"

echo "-- Missing base counts only dirty files"
rm "$BASE/repo/.git/worktrees/slice/delegate-kit.base"
ok "Missing base reports dirty files without counting commits" "$(node "$AR" inspect "$W" | jq -r '[(.base|tostring),(.commits|length),(.dirty|length),.partial]|join(" ")')" "null 0 2 true"

echo "-- Non-Git directory"
mkdir -p "$BASE/plain"
ok "git=false, partial=false" "$(node "$AR" inspect "$BASE/plain" | jq -r '[.git,.partial]|join(" ")')" "false false"
ok "Missing directory is rejected" "$(node "$AR" inspect "$BASE/nope" 2>&1 | grep -c 'no such directory')" "1"

echo; echo "Passed: $PASS, failed: $FAIL"
exit $((FAIL > 0))
