# Seeded-review bench

Four small diffs, two planted defects each, reviewed by a Claude reviewer and a Codex reviewer through `agent-run`. The question is whether a second family adds findings, and at what cost.

| File | Role |
|---|---|
| `diffs/NN-<name>.diff` | the change under review: source, spec, passing tests |
| `PLANTED.md` | the eight defects and where they sit |
| `brief.md` | the reviewer brief; `run.sh` fills the paths |
| `base-*` | the three files of the base commit the diffs apply to |
| `run.sh` | builds a throwaway repo, launches the eight reviews, collects `result.json` per run |
| `results/<date>/` | raw results and a hand-scored `SCORE.md` |

Run it:

```bash
bench/seeded-review/run.sh
```

Eight headless runs of two to three minutes each, in parallel, on your own subscriptions. Both CLIs must be installed and logged in. Score by hand against `PLANTED.md`; test-coverage remarks do not count, since every diff ships with tests that miss its defects by construction.
