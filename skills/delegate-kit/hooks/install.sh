#!/usr/bin/env bash
# Install delegate-kit into Claude Code and Codex CLI:
#   1. the gate hook   -> ~/.claude/settings.json (PreToolUse) and ~/.codex/hooks.json
#   2. the native subagent roles -> ~/.claude/agents/dk-*.md and [agents.dk-*] in ~/.codex/config.toml
# Idempotent. Backs up every file it edits and prints a diff first.
#   --claude / --codex   only that harness      --hooks-only / --agents-only   only that half
#   --dry-run            show diffs, change nothing
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SKILL=$(cd "$HERE/.." && pwd)
GATE="$HERE/gate.sh"
AGENTS_DIR="$SKILL/agents"
CODEX_AGENTS="$SKILL/references/codex-agents.toml"
CLAUDE_HOME="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
DO_CLAUDE=1; DO_CODEX=1; DO_HOOKS=1; DO_AGENTS=1; DRY=0
for a in "$@"; do case "$a" in
  --claude) DO_CODEX=0;; --codex) DO_CLAUDE=0;;
  --hooks-only) DO_AGENTS=0;; --agents-only) DO_HOOKS=0;;
  --dry-run) DRY=1;;
  *) echo "unknown arg $a" >&2; exit 1;; esac; done
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
[ -x "$GATE" ] || chmod +x "$GATE"
TS=$(date +%Y%m%d-%H%M%S)

apply() { # $1 target file, $2 tmp file with the new content, $3 label
  local file=$1 tmp=$2
  if diff -u "$file" "$tmp" >/dev/null 2>&1; then echo "$file: already up to date"; rm -f "$tmp"; return; fi
  echo "--- changes for $file:"; diff -u "$file" "$tmp" || true
  if [ $DRY -eq 1 ]; then rm -f "$tmp"; return; fi
  [ -f "$file" ] && cp "$file" "$file.bak-delegate-kit-$TS"
  mv "$tmp" "$file"; echo "updated $file${file:+ (backup: $file.bak-delegate-kit-$TS)}"
}

merge_hook() { # $1 file, $2 harness
  local file=$1 harness=$2
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
  apply "$file" "$tmp"
}

link_claude_agents() { # symlink the role definitions so edits in the repo take effect immediately
  local dir="$CLAUDE_HOME/agents"
  [ $DRY -eq 1 ] || mkdir -p "$dir"
  for src in "$AGENTS_DIR"/dk-*.md; do
    local name; name=$(basename "$src"); local dst="$dir/$name"
    if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then echo "$dst: already linked"; continue; fi
    if [ -e "$dst" ] && [ ! -L "$dst" ]; then
      echo "$dst exists and is not our symlink"
      [ $DRY -eq 1 ] || { cp "$dst" "$dst.bak-delegate-kit-$TS"; echo "  backed up to $dst.bak-delegate-kit-$TS"; }
    fi
    echo "link $dst -> $src"
    [ $DRY -eq 1 ] || ln -sfn "$src" "$dst"
  done
}

merge_codex_agents() { # splice the [agents.dk-*] block between markers in config.toml
  local file="$CODEX_DIR/config.toml"
  mkdir -p "$CODEX_DIR"; [ -f "$file" ] || : > "$file"
  local tmp; tmp=$(mktemp)
  node - "$file" "$CODEX_AGENTS" > "$tmp" <<'EOF'
const fs = require("fs");
const [file, block] = process.argv.slice(2);
const START = "# >>> delegate-kit agents >>>", END = "# <<< delegate-kit agents <<<";
const body = [START, fs.readFileSync(block, "utf8").trimEnd(), END].join("\n");
let cfg = fs.readFileSync(file, "utf8");
// markers match whole lines only, so the same text inside a comment never counts
const lineIdx = (s, marker) => { const m = new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").exec(s); return m ? m.index : -1; };
const i = lineIdx(cfg, START);
const j = i === -1 ? -1 : (() => { const k = lineIdx(cfg.slice(i + START.length), END); return k === -1 ? -1 : i + START.length + k; })();
if (i !== -1 && j !== -1) cfg = cfg.slice(0, i) + body + cfg.slice(j + END.length);
else cfg = cfg.replace(/\s*$/, "") + (cfg.trim() ? "\n\n" : "") + body + "\n";
process.stdout.write(cfg);
EOF
  apply "$file" "$tmp"
}

if [ $DO_HOOKS -eq 1 ]; then
  [ $DO_CLAUDE -eq 1 ] && merge_hook "$CLAUDE_HOME/settings.json" claude
  [ $DO_CODEX -eq 1 ] && merge_hook "$CODEX_DIR/hooks.json" codex
fi
if [ $DO_AGENTS -eq 1 ]; then
  [ $DO_CLAUDE -eq 1 ] && link_claude_agents
  [ $DO_CODEX -eq 1 ] && merge_codex_agents
fi
echo "done. Restart running claude/codex sessions for hooks and roles to take effect."
