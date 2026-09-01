# Planted defects

Two per diff. A reviewer "catches" one when a finding names the line and the mechanism.

| Diff | # | Where | Defect | Kind |
|---|---|---|---|---|
| 01-pagination | 1 | `totalPages` | `floor(n/size)+1` instead of `ceil`: one page too many when `n` is a multiple of `size` | off-by-one |
| 01-pagination | 2 | cursor decode | a decodable cursor with a negative, fractional or out-of-range `offset` is accepted; spec demands `InvalidCursor` | missing validation |
| 02-ratelimit | 3 | `key.toLowerCase()` | keys are opaque and case-sensitive by spec; distinct keys share one counter | spec violation |
| 02-ratelimit | 4 | `retryAfterMs` | constant `windowMs` instead of time until the oldest hit leaves the window | spec violation |
| 03-money | 5 | `allocate` | independent `Math.round` per party: parts do not sum to `total` | correctness |
| 03-money | 6 | `add` | floats and strings accepted; spec demands `TypeError` on non-integers | missing validation |
| 04-authz | 7 | `isExpired` | `exp` in seconds compared with `Date.now()` in milliseconds | units |
| 04-authz | 8 | `can` | substring match on the joined roles: `"superadmin"` grants `admin`, `"editor"` grants `edit` | substring match |
