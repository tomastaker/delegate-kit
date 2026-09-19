// Shell/SDK price calculations are estimates even when returned by a provider CLI.
// Never infer billing from a model name, provider, token count or an observed zero.
const estimates = { claude: 'Claude CLI total_cost_usd', opencode: 'OpenCode step costs', pi: 'Pi SDK usage.cost', omp: 'OMP SDK usage.cost' };
const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const sum = values => {
  const known = values.filter(value => value !== null);
  const total = known.reduce((a, b) => a + b, 0);
  return known.length && Number.isFinite(total) ? total : null;
};

export function runCost(run) {
  const value = amount(run.cost_usd);
  const source = run.cost_source || (run.executor?.transport === 'cli' ? estimates[run.executor.harness] : null);
  const kind = value === null ? 'unknown' : run.cost_kind === 'reported' && run.cost_source ? 'reported' : source ? 'estimated' : 'unknown';
  return { amount_usd: value, kind, source: source || null,
    billing: run.executor?.billing || 'unknown', billing_source: run.executor?.billing ? 'configured' : 'unknown' };
}

export function usageSummary(runs) {
  const costs = runs.map(run => run.cost || runCost(run));
  const groups = Object.fromEntries(['api', 'subscription', 'unknown'].map(billing => {
    const rows = costs.filter(c => c.billing === billing);
    return [billing, {
      reported_usd: sum(rows.map(c => c.kind === 'reported' ? c.amount_usd : null)),
      estimated_usd: sum(rows.map(c => c.kind === 'estimated' ? c.amount_usd : null)),
      unknown_runs: rows.filter(c => c.kind === 'unknown').length,
    }];
  }));
  // Keep harness-specific counters intact: cached input has incompatible meanings
  // across providers. A single scalar token total would double count some usage.
  return { coverage: 'partial', attempts: runs.length,
    usage_known_runs: runs.filter(r => r.usage != null).length,
    cost_known_runs: costs.filter(c => c.kind !== 'unknown').length,
    cost_unknown_runs: costs.filter(c => c.kind === 'unknown').length,
    by_billing: groups, coordinator: { status: 'unavailable', reason: 'Usage cannot be attributed to this task' } };
}
