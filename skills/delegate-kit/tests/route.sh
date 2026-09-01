#!/bin/bash
# Стенд движка политики: `agent-run route` и `preset` — кто, на каком семействе,
# нативно или внешне, сколько ревьюеров и с какими линзами.
#
# Модели не вызываются: route детерминирован при --parent, PATH с заглушками CLI
# (каталог bin/ ниже) и DELEGATE_KIT_HOME с config.json. Пороги глубины проверяются
# на синтетических diff'ах ровно на границе, потому что именно границы решают,
# предложит ли координатор панель.
#
#   ./route.sh
set -u
AR="$(cd "$(dirname "$0")/../scripts" && pwd)/agent-run"
NODE=$(command -v node)
BASE="${TMPDIR:-/tmp}/dk-route-test.$$"
trap 'rm -rf "$BASE"' EXIT
export DELEGATE_KIT_HOME="$BASE/state"
unset DELEGATE_KIT_PRESET DELEGATE_KIT_PARENT DELEGATE_KIT_MAX_WRITERS DELEGATE_KIT_MAX_WORKERS
mkdir -p "$DELEGATE_KIT_HOME" "$BASE/both" "$BASE/codex-only" "$BASE/none"
for c in claude codex; do printf '#!/bin/sh\n' > "$BASE/both/$c"; chmod +x "$BASE/both/$c"; done
cp "$BASE/both/codex" "$BASE/codex-only/codex"
PASS=0; FAIL=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; PASS=$((PASS+1)); else echo "  ✘ $1: ожидалось [$3], получено [$2]"; FAIL=$((FAIL+1)); fi; }
# route CLIS args… — jq-выражение последним аргументом; CLIS = both|codex-only|none
route(){ local clis=$1; shift; local q=${*: -1}; set -- "${@:1:$#-1}"; PATH="$BASE/$clis" "$NODE" "$AR" route "$@" 2>/dev/null | jq -r "$q"; }
mkdiff(){ # path lines-per-file file…
  local out=$1 n=$2; shift 2; : > "$out"
  for f in "$@"; do { printf 'diff --git a/%s b/%s\n--- a/%s\n+++ b/%s\n@@ -1,1 +1,3 @@\n' "$f" "$f" "$f" "$f"; seq 1 "$n" | sed 's/^/+line /'; } >> "$out"; done
}

echo "── пресет auto, родитель Claude, оба CLI"
ok "planner → claude fable, нативно" "$(route both --role planner --parent claude '[.backend,.model,.dispatch,.invoke.subagent_type]|join(" ")')" "claude fable native dk-planner"
ok "implementer → codex sol, внешне" "$(route both --role implementer --parent claude '[.backend,.model,.effort,.dispatch]|join(" ")')" "codex gpt-5.6-sol high external"
ok "researcher → claude sonnet medium" "$(route both --role researcher --parent claude '[.backend,.model,.effort]|join(" ")')" "claude sonnet medium"
ok "reviewer после codex-автора → claude, независим, нативно" "$(route both --role reviewer --parent claude '.reviewers[0]|[.backend,(.independent|tostring),.dispatch]|join(" ")')" "claude true native"
ok "verifier — третья сторона к ревьюеру: обратно на codex" "$(route both --role verifier --parent claude '.backend + " " + (.why[0]|contains("third party")|tostring)')" "codex true"
ok "review-lead следует за planner'ом" "$(route both --role review-lead --parent claude '[.backend,.model]|join(" ")')" "claude fable"

echo "── пресеты и приоритет"
ok "main-claude: implementer нативно на claude" "$(route both --role implementer --parent claude --preset main-claude '[.backend,.dispatch]|join(" ")')" "claude native"
ok "main-claude: ревьюер следует за автором → codex" "$(route both --role reviewer --parent claude --preset main-claude '.author + " " + .reviewers[0].backend')" "claude codex"
ok "main-codex под Codex-родителем: всё нативно" "$(route both --role planner --parent codex --preset main-codex '[.backend,.dispatch]|join(" ")')" "codex native"
ok "флаг сильнее env" "$(DELEGATE_KIT_PRESET=main-codex route both --role planner --parent claude --preset main-claude '.preset')" "main-claude"
ok "env сильнее config" "$($NODE "$AR" preset main-claude >/dev/null; DELEGATE_KIT_PRESET=main-codex route both --role planner --parent claude '.preset')" "main-codex"
ok "config сильнее auto" "$(route both --role researcher --parent claude '.preset + " " + .backend')" "main-claude claude"
rm -f "$DELEGATE_KIT_HOME/config.json"
ok "алиас main-gpt" "$(route both --role planner --parent claude --preset main-gpt '.preset')" "main-codex"
echo '{"roles":{"planner":{"claude":["opus","max"]}}}' > "$DELEGATE_KIT_HOME/config.json"
ok "config переопределяет модель роли" "$(route both --role planner --parent claude '.model + " " + .effort')" "opus max"
rm -f "$DELEGATE_KIT_HOME/config.json"

echo "── автор и независимость"
ok "--author-backend self: ревьюер на другом семействе" "$(route both --role reviewer --parent claude --author-backend self '.author + " " + .reviewers[0].backend + " " + (.reviewers[0].independent|tostring)')" "claude codex true"
ok "--kind ui под auto: implementer на claude" "$(route both --role implementer --parent claude --kind ui '.backend')" "claude"
ok "--kind ui: ревьюер следует за UI-автором → codex" "$(route both --role reviewer --parent claude --kind ui '.author + " " + .reviewers[0].backend')" "claude codex"

echo "── отсутствие CLI другого семейства"
ok "ревьюер падает на нативного, independent=false" "$(route none --role reviewer --parent claude --author-backend self '.reviewers[0]|[.backend,.dispatch,(.independent|tostring)]|join(" ")')" "claude native false"
ok "об этом сказано в note" "$(route none --role reviewer --parent claude --author-backend self '.reviewers[0].note|contains("not installed")')" "true"
ok "verifier без codex: same-family" "$(route none --role verifier --parent claude --author-backend self '.independence')" "same-family"
ok "implementer без codex: внешний с предупреждением, не падает" "$(route none --role implementer --parent claude '.dispatch + " " + (.why|map(select(contains("not installed")))|length|tostring)')" "external 1"
ok "явный --backend занимает слот A (раньше композиция его затирала)" "$(route both --role reviewer --parent claude --author-backend self --backend claude '.reviewers[0].backend + " " + (.reviewers[0].independent|tostring)')" "claude false"
ok "явный --backend без CLI не переезжает на другое семейство" "$(route codex-only --role reviewer --parent codex --author-backend self --backend claude '.reviewers[0].backend + " " + .reviewers[0].dispatch')" "claude external"
ok "закреплённый слот без CLI несёт note про отсутствие" "$(route codex-only --role reviewer --parent codex --author-backend self --backend claude '.reviewers[0].note|contains("not installed")')" "true"
ok "панель от закреплённого A чередуется дальше" "$(route both --role reviewer --parent claude --author-backend self --backend claude --depth panel '[.reviewers[].backend]|join(" ")')" "claude codex"

echo "── глубина ревью по diff"
D="$BASE/diffs"; mkdir -p "$D"
mkdiff "$D/399.diff" 399 src/a.ts; mkdiff "$D/400.diff" 400 src/a.ts
mkdiff "$D/10files.diff" 5 $(for i in $(seq 1 10); do echo "src/f$i.ts"; done)
mkdiff "$D/2mods.diff" 5 packages/a/x.ts packages/b/y.ts
mkdiff "$D/risk.diff" 3 src/auth/login.ts
mkdiff "$D/riskline.diff" 3 src/plain.ts; printf '+const password = "x";\n' >> "$D/riskline.diff"
mkdiff "$D/led.diff" 50 $(for m in 0 1 2; do for i in $(seq 1 9); do echo "packages/p$m/f$i.ts"; done; done)
mkdiff "$D/lock.diff" 2000 package-lock.json
R="--role reviewer --parent claude --author-backend self"
ok "399 строк → single, без вопроса" "$(route both $R --diff "$D/399.diff" '.depth + " " + (.ask_user!=null|tostring)')" "single false"
ok "400 строк → panel, вопрос пользователю" "$(route both $R --diff "$D/400.diff" '.depth + " " + (.ask_user!=null|tostring) + " " + (.reviewers|length|tostring)')" "panel true 2"
ok "10 файлов → panel" "$(route both $R --diff "$D/10files.diff" '.depth')" "panel"
ok "2 модуля → panel" "$(route both $R --diff "$D/2mods.diff" '.depth + " " + (.diff.modules|join(","))')" "panel packages/a,packages/b"
ok "risk zone по пути → panel даже на 3 строках" "$(route both $R --diff "$D/risk.diff" '.depth + " " + .diff.risk_zones[0]')" "panel src/auth/login.ts"
ok "risk zone по строке diff" "$(route both $R --diff "$D/riskline.diff" '.diff.risk_zones[0]')" "src/plain.ts"
ok "27 файлов, 3 модуля, 1350 строк → led" "$(route both $R --diff "$D/led.diff" '.depth + " " + (.diff.files|tostring) + " " + (.diff.modules|length|tostring)')" "led 27 3"
ok "lockfile — шум, не строки" "$(route both $R --diff "$D/lock.diff" '.depth + " " + (.diff.lines|tostring) + " " + .diff.noise_files[0]')" "single 0 package-lock.json"
ok "--kind mechanical: large → single" "$(route both $R --diff "$D/led.diff" --kind mechanical '.depth')" "single"
ok "--depth явно = «да», без вопроса" "$(route both $R --diff "$D/399.diff" --depth panel '.depth + " " + (.suggested.overridden|tostring) + " " + (.ask_user!=null|tostring)')" "panel true false"

echo "── состав панели"
ok "panel: A correctness на другом семействе, B spec на семействе автора" "$(route both $R --diff "$D/400.diff" '[.reviewers[]|.lens+":"+.backend+":"+(.independent|tostring)]|join(" ")')" "correctness:codex:true spec:claude:false"
ok "led: A/B/C чередуются, lead на семействе planner'а" "$(route both $R --diff "$D/led.diff" '([.reviewers[]|.lens+":"+.backend]|join(" ")) + " lead:" + .lead.backend + ":" + .lead.model')" "correctness:codex spec:claude standards:codex lead:claude:fable"
ok "led: 5 сессий в cost_note" "$(route both $R --diff "$D/led.diff" '.cost_note|startswith("5 read-only")')" "true"
ok "--kind refactor: линзы correctness+standards" "$(route both $R --diff "$D/400.diff" --kind refactor '[.reviewers[].lens]|join(" ")')" "correctness standards"
ok "merge_rules только при панели" "$(route both $R --diff "$D/399.diff" '.merge_rules==null')" "true"

echo "── отказы"
ok "модель чужого семейства на run" "$(PATH="$BASE/both" "$NODE" "$AR" run --role planner --backend claude --model gpt-5.6-sol --prompt x --parent claude 2>&1 | grep -c 'is a codex model but --backend is claude')" "1"
ok "--depth вне списка" "$(PATH="$BASE/both" "$NODE" "$AR" route $R --diff "$D/399.diff" --depth deep 2>&1 | grep -c 'depth must be')" "1"
ok "--diff для не-ревьюера" "$(PATH="$BASE/both" "$NODE" "$AR" route --role planner --parent claude --diff "$D/399.diff" 2>&1 | grep -c 'apply to --role reviewer')" "1"
ok "неизвестный пресет" "$(PATH="$BASE/both" "$NODE" "$AR" route --role planner --parent claude --preset main-gemini 2>&1 | grep -ci 'preset')" "1"

echo; echo "Пройдено: $PASS, провалено: $FAIL"
exit $((FAIL > 0))
