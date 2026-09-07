<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
  <img src="assets/logo.png" alt="delegate-kit" width="280">
</picture>

# delegate-kit

**Delegate with the models you have. Verify what they produce.**

[![CI](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/tomastaker/delegate-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
</div>

A coding skill that decides when to keep work in your session, when to use workers, and how to check their results. Each writer gets an isolated git worktree. A fresh reviewer checks substantial changes against the specification. The coordinator integrates the work and reports what was actually verified.

It works with one model family or two. No routing JSON is required to start.

## Defaults that prioritize quality

Implementation, planning and review stay on the main senior model. Simpler tasks use less reasoning when the model supports it. Smaller models are exceptions for narrow research or extraction whose results the coordinator can check cheaply.

Native workers inherit the current model unless you choose another. The skill does not pin a release-specific model or silently downgrade implementation. External CLIs use their own model configuration unless a model is explicitly supplied; the coordinator checks that configuration before relying on it.

The coordinator selects models from the capabilities actually available in your environment. It does not infer quality from model names or invent support for a reasoning setting.

## Solo and duo

| Mode | Available families | Model selection | Review |
|---|---|---|---|
| `solo` | One | Any supported model within that family | A fresh agent from the same family |
| `duo` | Two | Models from either allowed family | One suitable reviewer; complementary cross-family reviewers when justified and authorized |
| `auto` | Resolves from the allowed pool | Uses the applicable solo/duo rules | Same guarantees |

One family can provide several models. Solo does not mean one fixed model. Duo does not mean two reviewers on every task.

Without configuration, the skill starts with your current family. Tell it which additional family you want to use; the coordinator checks availability and supplies the routing arguments. Merely having another CLI installed does not authorize spending on it.

A fresh context and a different family are reported separately. Neither guarantees a correct review. The coordinator verifies substantive findings and runs the acceptance checks.

## Supported execution paths

| Family | External adapter | Important detail |
|---|---|---|
| GPT | Codex CLI | Native inheritance or explicit model and supported reasoning effort |
| Claude | Claude Code | Inherited native roles; explicit CLI model/effort when selected |
| Gemini | Gemini CLI | Headless JSONL, plan/auto_edit policies; no generic effort flag |
| Kimi | OpenCode | Explicit provider/model from your configured provider |
| GLM | OpenCode | Explicit provider/model; coding-plan and API providers are distinct |

A backend profile keeps the **family** separate from the **CLI adapter**. GLM behind a configured Claude Code endpoint can therefore be labelled GLM correctly. The policy can also run in other hosts using their native tools.

The integrations were checked against official documentation and local CLI help. Routing, generated arguments, result parsing and lifecycle behavior are tested with fixtures. **Live Kimi/GLM/Gemini model runs have not been validated for this release.** Authentication and provider billing remain in the user's CLI configuration. [Adapter contracts and official sources](skills/delegate-kit/references/providers.md).

## Install

```bash
npx skills add tomastaker/delegate-kit
```

Or install from a checkout:

```bash
git clone https://github.com/tomastaker/delegate-kit ~/dev/delegate-kit
mkdir -p ~/.agents/skills ~/.claude/skills ~/.codex/skills
ln -s ~/dev/delegate-kit/skills/delegate-kit ~/.agents/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.claude/skills/delegate-kit
ln -s ../../.agents/skills/delegate-kit ~/.codex/skills/delegate-kit
```

Install the native roles and optional shell gate for Claude Code/Codex:

```bash
~/.agents/skills/delegate-kit/hooks/install.sh --dry-run
~/.agents/skills/delegate-kit/hooks/install.sh
```

Use `--agents-only`, `--hooks-only`, `--claude` or `--codex` to limit installation. External adapters need Node 20+, bash, git, jq and their authenticated CLI. Gemini writers also need its configured sandbox runtime. Native delegation needs the host's subagent capability.

**Upgrading an earlier installation:** rerun the installer to remove the old managed Codex role block and its pinned models. Codex roles are generated as standalone files under `~/.codex/agents/`; Claude roles use inheritance. Unrelated configuration and unmanaged Codex agents are preserved. Backups are created before changes. Restart affected sessions.

To uninstall hooks and native roles, run `hooks/uninstall.sh`, then remove the skill links you installed. Run logs remain available for inspection.

## Use it

Examples of requests:

- “Implement this feature using delegate-kit.”
- “Use solo with my current family. Pick models and reasoning for quality.”
- “Use GPT and Claude in duo. Choose the reviewer based on the change.”
- “Use Gemini for this review.”
- “Use my configured Kimi model for implementation and GLM for review.”

You can specify a model or a role in ordinary language. The coordinator carries that choice into dispatch. It asks before adding multiple reviewers unless you already authorized them.

The work follows six shapes: DIRECT, SCOUT, PLAN, SINGLE, PARALLEL and SEQUENTIAL. Small tasks stay in the session. Coupled changes stay with one writer. Independent tasks can run in separate worktrees. Default writer cap is three; raising it requires an ownership partition and permission, with a ceiling of eight.

## Optional configuration

Use `~/.delegate-kit/config.json` only when you want persistent control:

```json
{
  "mode": "duo",
  "families": ["codex", "claude"],
  "roles": {
    "implementer": { "backend": "codex" }
  },
  "preferences": {
    "reviewer": ["claude", "codex"],
    "ui": ["claude", "codex"]
  },
  "review": { "allow_multiple": false }
}
```

`roles` contains binding assignments. `preferences` guides the coordinator without fixing the answer. Backend profiles can supply a model and supported effort values. For OpenCode, copy an available provider/model identifier from your own configured catalog, rather than a version from this README.

[Configuration and precedence](skills/delegate-kit/references/routing.md).

## Scripts

From the checkout:

```bash
skills/delegate-kit/scripts/agent-run doctor
skills/delegate-kit/scripts/agent-run route --role planner --parent codex
skills/delegate-kit/scripts/agent-run route --role reviewer --parent codex \
  --families codex,claude --author-backend self
```

`agent-run --help` covers run, resume, status, delivery and inspection. `agent-wt --help` covers worktrees and locks. External run metadata lives in `~/.delegate-kit`, overridable with `DELEGATE_KIT_HOME`.

A failed worker never silently retries on another provider. Inspect partial work before selecting another executor. Resume keeps the saved target. Invalid result JSON fails the run instead of being accepted as “done.”

## Limits and validation

- Fresh-context review reduces dependence on the author's explanation; it does not eliminate shared model errors.
- Read-only adapters may exclude shell tools. The coordinator runs the missing checks. OpenCode writers retain command approval requirements, so headless checks or commits can require coordinator completion.
- Worktrees coordinate writes; they are not a security sandbox. Permission boundaries differ by adapter.
- The shell gate detects selected dangerous command patterns. It is not a complete command parser or universal sandbox.
- Native runs are not automatically included in the external-run ledger. Unconfirmed runtime model identity is reported as unknown.
- The historical [seeded-review experiment](bench/seeded-review/README.md) is retained as evidence, not proof that cross-family review is superior. No new paid comparisons were run for this change.

Local checks, without model calls:

```bash
bash skills/delegate-kit/tests/route.sh
bash skills/delegate-kit/tests/caps.sh
bash skills/delegate-kit/tests/gate.sh
bash skills/delegate-kit/tests/inspect.sh
bash skills/delegate-kit/tests/delivery.sh
```

## License and acknowledgments

MIT. Review lenses and the standards baseline draw from [mattpocock/skills](https://github.com/mattpocock/skills) and [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Host dispatch and git coordination were informed by [Hyperskills](https://github.com/hyperb1iss/hyperskills); bounded worker ownership by [Superpowers](https://github.com/obra/superpowers). The original artwork was inspired by [ponytail](https://github.com/DietrichGebert/ponytail).
