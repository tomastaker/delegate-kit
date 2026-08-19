#!/usr/bin/env bash
# Register delegate-kit's gate hook in Claude Code (~/.claude/settings.json) and Codex CLI (~/.codex/hooks.json).
# Idempotent. Backs up each file before editing and prints a diff. Use --claude / --codex to limit, --dry-run to preview.
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
GATE="$HERE/gate.sh"
DO_CLAUDE=1; DO_CODEX=1; DRY=0
for a in "$@"; do case "$a" in --claude) DO_CODEX=0;; --codex) DO_CLAUDE=0;; --dry-run) DRY=1;; *) echo "unknown arg $a" >&2; exit 1;; esac; done
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
[ -x "$GATE" ] || chmod +x "$GATE"

merge() { # $1 file, $2 harness
  local file=$1 harness=$2 ts; ts=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$(dirname "$file")"
  [ -f "$file" ] || echo '{}' > "$file"
  local tmp; tmp=$(mktemp)
  node - "$file" "$GATE" "$harness" > "$tmp" <<'EOF'
const fs = require("fs");
const [file, gate, harness] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
cfg.hooks ??= {};
cfg.hooks.PreToolUse ??= [];
const entry = { matcher: "Bash", hooks: [{ type: "command", command: `${JSON.stringify(gate).slice(1, -1)} --harness ${harness}`, timeout: 10, statusMessage: "delegate-kit gate" }] };
// replace an existing delegate-kit entry, otherwise append
cfg.hooks.PreToolUse = cfg.hooks.PreToolUse.filter((g) => !(g.hooks || []).some((h) => /hooks\/gate\.sh --harness (claude|codex)/.test(h.command || "")));
cfg.hooks.PreToolUse.push(entry);
process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
EOF
  if diff -u "$file" "$tmp" >/dev/null; then echo "$file: already up to date"; rm -f "$tmp"; return; fi
  echo "--- changes for $file:"; diff -u "$file" "$tmp" || true
  if [ $DRY -eq 1 ]; then rm -f "$tmp"; return; fi
  cp "$file" "$file.bak-delegate-kit-$ts"; mv "$tmp" "$file"; echo "updated $file (backup: $file.bak-delegate-kit-$ts)"
}

[ $DO_CLAUDE -eq 1 ] && merge "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json" claude
[ $DO_CODEX -eq 1 ] && merge "${CODEX_HOME:-$HOME/.codex}/hooks.json" codex
echo "done. Restart running claude/codex sessions for hooks to take effect."
