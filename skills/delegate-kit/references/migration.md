# Migration from v1

V2 uses one complete team per `presets/ID.json`, independent of the coordinator's family. The legacy parser lives in `scripts/legacy-routing.mjs`; `routing.mjs` is a compatibility export. Old `agent-run` commands warn when creating new v1 work. Use `dk.mjs` for new dispatches.

Start with `node <skill>/scripts/dk.mjs migrate --dry-run`. It reads `config.json`, materializes shared roles into each team, turns ladder candidates into separately named profiles, and shows proposed files and unresolved decisions. No model calls or writes occur. [legacy-config.json](../examples/legacy-config.json) illustrates the old format; do not use it for new setup.

Explicit backend/runner/model/effort and limits carry over. Generic descriptions preserve ordinary versus alternative assignments without guessing UI specialization or price. Dynamic inheritance, ambiguous parent routes, out-of-pool assignments, legacy preferences and solo/duo restrictions require a decision; none is silently relaxed. Unsupported values and placeholders are reported before applying.

For assignments that intentionally depended on the parent, supply a decisions file, for example:

```json
{
  "parents": { "gpt": "codex", "claude": "claude" },
  "default_preset": "gpt"
}
```

For auto/native family assignments, a matching explicit parent determines the original harness. Multiple harnesses in one family require that choice rather than selecting the first backend. These mappings are explicit user decisions; team names themselves have no routing meaning. A missing default remains unset. If other ambiguities remain, use conversational setup to construct and validate the intended complete v2 JSON from the dry-run output. Keep the original legacy file unchanged as evidence; the automatic converter deliberately refuses to invent missing models or translate preferences into specialties.

After user authorization, `migrate --apply --decisions FILE` backs up the exact old config, saves complete presets atomically per file, and records `migration-v2.json`. It refuses existing destinations/settings instead of overwriting them. A completed migration is idempotent and preserves later v2 edits. If a process crashes during a multi-file apply before the journal is saved, rerun dry-run and inspect the backup/proposed files; an existing destination is a recovery diagnostic, never permission to overwrite.

Existing v1 run directories remain readable/continuable with `agent-run status ID`, `agent-run wait ID`, and `agent-run resume ID --brief FILE`. They keep their original adapter/model/session. Passing them to `dk.mjs` gives a specific legacy-command diagnostic. Do not migrate an active model session to a new executor.

Optional old hooks and static native roles can remain for legacy runs. They do not select v2 teams. `hooks/install.sh --dry-run` and `hooks/uninstall.sh` manage only known package components; v2 does not require global role installation. V2 Claude native definitions are per-run and must not replace a shared user role.
