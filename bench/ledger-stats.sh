#!/bin/bash
# Prints the README "Numbers" table from your own delegate-kit ledger: every
# external run under $DELEGATE_KIT_HOME/runs (default ~/.delegate-kit/runs).
#
#   bench/ledger-stats.sh [--exclude REGEX]   drop runs whose cwd matches REGEX
#
# Findings are counted as the reviewer returned them, not as adjudicated.
set -euo pipefail
EXCLUDE=""
[ "${1:-}" = "--exclude" ] && EXCLUDE="${2:-}"
export EXCLUDE
node - <<'EOF'
const fs = require("fs"), path = require("path");
const home = process.env.DELEGATE_KIT_HOME || path.join(process.env.HOME, ".delegate-kit");
const dir = path.join(home, "runs");
const exclude = process.env.EXCLUDE ? new RegExp(process.env.EXCLUDE) : null;
const rows = [];
for (const id of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  let m; try { m = JSON.parse(fs.readFileSync(path.join(dir, id, "meta.json"), "utf8")); } catch { continue; }
  if (exclude && exclude.test(m.cwd || "")) continue;
  const f = (m.result && m.result.findings) || [];
  const dur = m.started && m.finished ? (new Date(m.finished) - new Date(m.started)) / 60000 : null;
  rows.push({ role: m.role, backend: m.backend, status: m.status, cwd: m.cwd, started: m.started, dur, findings: f.length, high: f.filter((x) => x.severity === "high").length });
}
const median = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const fmt = (v, unit = "") => (v == null ? "" : `${Math.round(v)}${unit}`);
const rev = (b) => rows.filter((r) => r.role === "reviewer" && r.status === "finished" && r.backend === b);
const cx = rev("codex"), cl = rev("claude"), all = [...cx, ...cl];
const dates = rows.map((r) => r.started).filter(Boolean).sort();
const repos = new Set(rows.map((r) => r.cwd));
console.log(`Runs: ${rows.length} across ${repos.size} working directories, ${dates[0]?.slice(0, 10) ?? "?"} to ${dates.at(-1)?.slice(0, 10) ?? "?"}\n`);
console.log("| | Codex reading Claude | Claude reading Codex | Together |");
console.log("|---|---|---|---|");
console.log(`| Cross-family reviews of real diffs | ${cx.length} | ${cl.length} | **${all.length}** |`);
console.log(`| … that came back with at least one **high**-severity finding | ${cx.filter((r) => r.high).length} | ${cl.filter((r) => r.high).length} | **${all.filter((r) => r.high).length}** |`);
console.log(`| … that came back with nothing | ${cx.filter((r) => !r.findings).length} | ${cl.filter((r) => !r.findings).length} | ${all.filter((r) => !r.findings).length} |`);
console.log(`| Median findings per review | ${fmt(median(cx.map((r) => r.findings)))} | ${fmt(median(cl.map((r) => r.findings)))} | |`);
console.log(`| Median wall-clock per review | ${fmt(median(cx.map((r) => r.dur)), " min")} | ${fmt(median(cl.map((r) => r.dur)), " min")} | |`);
const imp = rows.filter((r) => r.role === "implementer" && r.status === "finished");
const pl = rows.filter((r) => r.role === "planner" && r.status === "finished");
console.log(`\nImplementer runs finished: ${imp.length}, median ${fmt(median(imp.map((r) => r.dur)), " min")}. Planner runs: ${pl.length}, median ${fmt(median(pl.map((r) => r.dur)), " min")}.`);
EOF
