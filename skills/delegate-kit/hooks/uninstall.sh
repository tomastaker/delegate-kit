#!/usr/bin/env bash
# Remove delegate-kit's gate hook from Claude Code and Codex CLI configs (backs up first).
set -euo pipefail
strip() { local file=$1; [ -f "$file" ] || { echo "$file: absent"; return; }
  local ts tmp; ts=$(date +%Y%m%d-%H%M%S); tmp=$(mktemp)
  node - "$file" > "$tmp" <<'JS'
const fs = require("fs"); const file = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
if (cfg.hooks?.PreToolUse) {
  cfg.hooks.PreToolUse = cfg.hooks.PreToolUse.filter((g) => !(g.hooks || []).some((h) => /hooks\/gate\.sh --harness (claude|codex)/.test(h.command || "")));
  if (cfg.hooks.PreToolUse.length === 0) delete cfg.hooks.PreToolUse;
  if (Object.keys(cfg.hooks).length === 0) delete cfg.hooks;
}
process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
JS
  if diff -u "$file" "$tmp" >/dev/null; then echo "$file: nothing to remove"; rm -f "$tmp"; return; fi
  cp "$file" "$file.bak-delegate-kit-$ts"; mv "$tmp" "$file"; echo "updated $file (backup: $file.bak-delegate-kit-$ts)"; }
strip "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
strip "${CODEX_HOME:-$HOME/.codex}/hooks.json"
