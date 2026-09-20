# Remove a previously installed Delegate Kit hook

This note applies only if you ran Delegate Kit's optional `hooks/install.sh`. Its registrations can still point to a removed `hooks/gate.sh`, causing a missing-command error when the assistant invokes Bash. The current skill does not install hooks.

The locations and entry shape below come from the [installer at commit 2737718](https://github.com/tomastaker/delegate-kit/blob/2737718a8ab7aeeaba2b2bdbbce1372fe7079d02/skills/delegate-kit/hooks/install.sh); they describe what that installer wrote, not a claim about current harness configuration formats.

1. Use an ordinary terminal or editor outside the affected assistant session. Locate the files used at installation time:
   - Claude: `~/.claude/settings.json`, or `settings.json` inside the directory specified by `CLAUDE_CONFIG_DIR` at that time.
   - Codex: `~/.codex/hooks.json`, or `hooks.json` inside the directory specified by `CODEX_HOME` at that time.
   If a file is absent, there is nothing to remove there. If those variables have since changed, inspect the original configuration directory.
2. Make a separate backup copy of each file you will edit. Inside `hooks.PreToolUse`, locate the Bash entry whose nested command points to your Delegate Kit installation. The installer created this shape:

   ```json
   {
     "matcher": "Bash",
     "hooks": [
       {
         "type": "command",
         "command": "/absolute/path/to/delegate-kit/hooks/gate.sh --harness claude",
         "timeout": 10,
         "statusMessage": "delegate-kit gate"
       }
     ]
   }
   ```

   The Codex entry ends with `--harness codex`. Match the actual installation path as well as this suffix; `statusMessage` alone is not sufficient identification.
3. Remove only that command object from the nested `hooks` array. If the array becomes empty, remove its parent matcher entry from `PreToolUse`. Preserve other commands, matchers and configuration settings. Keep the JSON valid, including commas. Do not delete the entire configuration file.
4. Validate the edited JSON, for example with `python3 -m json.tool /absolute/path/to/config.json > /dev/null`. Review the diff against your backup to confirm that only the intended registration was removed.
5. Restart affected assistant sessions and run a harmless shell command such as `pwd`. Confirm that no missing Delegate Kit hook error remains before replacing or removing an old installation. If it was already replaced, the same cleanup applies.

If configuration loading fails, restore the edited file from its backup and inspect the change before retrying. Preserve the backup until the check succeeds. This procedure does not remove runtime data, logs or worktrees and does not require restoring the removed runtime or running its uninstall script.
