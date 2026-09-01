# Score — 2026-09-02

Reviewers: Claude `opus` effort `high` via `claude -p`; Codex `gpt-5.6-sol` effort `high` via `codex exec`. Same brief and spec, no hints about the planted list. Raw output per run is the `NN-<backend>.json` beside this file. Scored by hand.

## Planted defects (see `../../PLANTED.md`)

| # | Defect | Claude | Codex |
|---|---|---|---|
| 1 | `totalPages` off by one on exact multiples | ✓ high | ✓ medium |
| 2 | decoded cursor offset not validated | ✓ high | ✓ medium |
| 3 | keys lowercased, spec says case-sensitive | ✓ high | ✓ high |
| 4 | `retryAfterMs` constant instead of until-oldest-expires | ✓ high | ✓ medium |
| 5 | `allocate` parts do not sum to `total` | ✓ high | ✓ high |
| 6 | `add` accepts non-integers | ✓ high | ✓ medium |
| 7 | `exp` seconds vs `Date.now()` milliseconds | ✓ high | ✓ high |
| 8 | role check by substring | ✓ high (two findings) | ✓ high |
| | **caught** | **8 / 8** | **8 / 8** |

## Findings beyond the planted list

Test-coverage remarks ("the suite does not exercise this") are excluded; they are true of every diff by construction.

| Diff | Finding | Claude | Codex |
|---|---|---|---|
| 01 | decoder accepts strings that are not valid base64url | | ✓ low |
| 02 | idle keys are never pruned from the Map, memory grows with distinct keys | ✓ medium | ✓ medium |
| 03 | non-integer ratio throws `RangeError`, spec says `TypeError` | ✓ medium | ✓ medium |
| 03 | non-array `ratios` reported as "ratios empty" | ✓ low | |
| 03 | sparse ratio arrays bypass validation | | ✓ low |
| 04 | `NaN` / non-finite `exp` passes the shape check | ✓ medium | ✓ medium |
| 04 | expiry boundary at exactly `exp` is ambiguous in the spec | ✓ low | |
| | **distinct** | **5** | **5** |
| | **union** | | **7** |

## Wall-clock

| Run | Backend | Started (UTC) | Finished | Duration |
|---|---|---|---|---|
| 01 | claude | 23:23:18 | 23:24:51 | 1 m 33 s |
| 01 | codex | 23:23:36 | 23:25:41 | 2 m 05 s |
| 02 | claude | 23:23:37 | 23:25:02 | 1 m 25 s |
| 02 | codex | 23:23:37 | 23:26:09 | 2 m 32 s |
| 03 | claude | 23:23:37 | 23:25:14 | 1 m 37 s |
| 03 | codex | 23:23:37 | 23:26:01 | 2 m 24 s |
| 04 | claude | 23:23:38 | 23:24:51 | 1 m 13 s |
| 04 | codex | 23:23:59 | 23:26:32 | 2 m 33 s |

All eight ran concurrently. One machine-wide cap refusal happened on launch because a ninth reviewer from another session was already running; `DELEGATE_KIT_MAX_WORKERS=9` admitted the last one.

## What this does and does not show

- Both families catch a planted set of eight textbook defects in small, well-specified diffs. The experiment does not demonstrate family-specific blind spots; a larger and subtler corpus would be needed for that.
- The families diverge in what they find beyond the list. The union is larger than either side, which is the practical argument for a second reviewer of the other family on a diff that matters.
- n = 4 diffs, 8 runs, one day. Treat the numbers as a bound, not a benchmark.
