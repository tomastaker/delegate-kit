#!/usr/bin/env bash
# Install optional gate hooks. Native definitions are generated per run.
# --claude / --codex select a host; --dry-run previews the changes.
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
GATE="$HERE/gate.sh"
CLAUDE_HOME="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
DO_CLAUDE=1; DO_CODEX=1; DRY=0
for a in "$@"; do case "$a" in
  --claude) DO_CODEX=0;; --codex) DO_CLAUDE=0;;
  --dry-run) DRY=1;;
  *) echo "unknown arg $a" >&2; exit 1;; esac; done
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
[ -x "$GATE" ] || chmod +x "$GATE"
TS=$(date +%Y%m%d-%H%M%S)

apply() { # $1 target file, $2 tmp file with the new content, $3 label
  local file=$1 tmp=$2
  if [ -f "$file" ] && diff -u "$file" "$tmp" >/dev/null 2>&1; then echo "$file: already up to date"; rm -f "$tmp"; return; fi
  echo "--- changes for $file:"; diff -u "${file}" "$tmp" 2>/dev/null || cat "$tmp"
  if [ $DRY -eq 1 ]; then rm -f "$tmp"; return; fi
  [ -f "$file" ] && cp "$file" "$file.bak-delegate-kit-$TS"
  mv "$tmp" "$file"; echo "updated $file${file:+ (backup: $file.bak-delegate-kit-$TS)}"
}

merge_hook() { # $1 file, $2 harness
  local file=$1 harness=$2
  if [ "$DRY" -eq 0 ]; then mkdir -p "$(dirname "$file")"; fi
  local tmp; tmp=$(mktemp)
  node - "$file" "$GATE" "$harness" > "$tmp" <<'EOF'
const fs = require("fs");
const [file, gate, harness] = process.argv.slice(2);
const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
cfg.hooks ??= {};
cfg.hooks.PreToolUse ??= [];
const entry = { matcher: "Bash", hooks: [{ type: "command", command: `${JSON.stringify(gate).slice(1, -1)} --harness ${harness}`, timeout: 10, statusMessage: "delegate-kit gate" }] };
// replace an existing delegate-kit entry, otherwise append
cfg.hooks.PreToolUse = cfg.hooks.PreToolUse.filter((g) => !(g.hooks || []).some((h) => /hooks\/gate\.sh --harness (claude|codex)/.test(h.command || "")));
cfg.hooks.PreToolUse.push(entry);
process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
EOF
  apply "$file" "$tmp"
}

[ $DO_CLAUDE -eq 1 ] && merge_hook "$CLAUDE_HOME/settings.json" claude
[ $DO_CODEX -eq 1 ] && merge_hook "$CODEX_DIR/hooks.json" codex
echo "done. Restart running sessions for hooks to take effect."
