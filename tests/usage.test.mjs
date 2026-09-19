import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { extractResult } from '../skills/delegate-kit/scripts/adapters.mjs';
import { rpcTurn, sumUsage } from '../skills/delegate-kit/scripts/rpc.mjs';
import { runCost, usageSummary } from '../skills/delegate-kit/scripts/usage.mjs';

const schema = { type: 'object' };
test('billing and shell estimates remain distinct, including subscription zero and unknown values', () => {
  const run = { executor: { harness: 'claude', transport: 'cli', billing: 'subscription' }, cost_usd: 0 };
  assert.deepEqual(runCost(run), { amount_usd: 0, kind: 'estimated', source: 'Claude CLI total_cost_usd', billing: 'subscription', billing_source: 'configured' });
  assert.equal(runCost({ ...run, cost_usd: -1 }).kind, 'unknown');
  assert.equal(runCost({ executor: { harness: 'codex', transport: 'cli' }, usage: { input: 1000 } }).amount_usd, null);
  const summary = usageSummary([run, { ...run, cost_usd: 0.25, resume_of: 'first' }, { executor: { harness: 'codex' } },
    { executor: { harness: 'claude', transport: 'cli', billing: 'api' }, cost_usd: 0.1 },
    { executor: { billing: 'api' }, cost_usd: 0.2, cost_kind: 'reported', cost_source: 'fixture invoice' }]);
  assert.equal(summary.attempts, 5);
  assert.equal(summary.by_billing.subscription.estimated_usd, 0.25);
  assert.equal(summary.by_billing.subscription.reported_usd, null);
  assert.equal(summary.by_billing.api.estimated_usd, 0.1);
  assert.equal(summary.by_billing.api.reported_usd, 0.2);
  assert.equal(summary.cost_unknown_runs, 1);
  assert.equal(summary.coverage, 'partial');
  assert.equal(summary.coordinator.status, 'unavailable');
});
const parseSteps = steps => extractResult('opencode', [...steps.map(part => ({ type: 'step_finish', sessionID: 's', part })), { type: 'text', part: { text: '{}' } }].map(JSON.stringify).join('\n'), null, schema);
// Contract: https://github.com/anomalyco/opencode/blob/v1.18.23/packages/opencode/src/session/processor.ts#L435-L454
// CLI emission: https://github.com/anomalyco/opencode/blob/v1.18.23/packages/opencode/src/cli/cmd/run.ts#L749-L750
const step = (id, cost = 0.1) => ({ id, messageID: 'm', tokens: { input: 10, output: 2, cache: { read: 0, write: 0 } }, cost });
test('Claude distinguishes an observed zero cost from missing cost', () => {
  for (const [value, expected] of [[0, 0], [undefined, null], [null, null], [0.25, 0.25]]) {
    assert.equal(extractResult('claude', JSON.stringify({ structured_output: {}, total_cost_usd: value }), null, schema).cost_usd, expected);
  }
});
test('OpenCode sums distinct step deltas once per part ID, including equal values', () => {
  const a = step('a'), b = step('b');
  const result = parseSteps([a, b, a]);
  assert.deepEqual(result.usage, { input: 20, output: 4, cache: { read: 0, write: 0 } });
  assert.equal(result.cost_usd, 0.2);
  assert.equal(parseSteps([step(undefined), step(undefined)]).usage.input, 20);
  assert.equal(parseSteps([a, { ...a, cost: 0.3 }]).cost_usd, 0.3);
});
test('OpenCode preserves unknown measurements and real zero across steps', () => {
  assert.equal(parseSteps([]).usage, null);
  assert.equal(parseSteps([step('a', 0), step('b', 0)]).cost_usd, 0);
  const partial = { id: 'b', tokens: { input: 5, cache: { read: 0 } } };
  const result = parseSteps([step('a'), partial]);
  assert.equal(result.cost_usd, null);
  assert.deepEqual(result.usage, { input: 15, output: null, cache: { read: 0, write: null } });
  assert.equal(parseSteps([step('a'), { id: 'b' }]).usage, null);
});
test('RPC deduplicates reply identities without collapsing equal usage', () => {
  const a = { responseId: 'a', provider: 'p', model: 'm', usage: { input: 5, cost: { total: 0 } } };
  const b = { ...a, responseId: 'b' };
  assert.deepEqual(sumUsage([a, b, structuredClone(a)]), { input: 10, cost: { total: 0 } });
  assert.equal(sumUsage([{ usage: a.usage }, { usage: a.usage }]).input, 10);
  assert.equal(sumUsage([a, { ...b, usage: undefined }]), null);
});
for (const terminalMessages of [true, false]) test(`RPC repeated events count once with terminal messages=${terminalMessages}`, async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();
  const emit = frame => child.stdout.emit('data', Buffer.from(JSON.stringify(frame) + '\n'));
  const a = { role: 'assistant', responseId: 'a', model: 'm', provider: 'p', content: [{ type: 'text', text: 'tool step' }], usage: { input: 5, cost: { total: 0 } } };
  const b = { ...a, responseId: 'b', content: [{ type: 'text', text: 'done' }] };
  child.stdin.write = (line, callback) => {
    const request = JSON.parse(line);
    queueMicrotask(() => {
      const data = request.type === 'set_model' ? { id: 'm', provider: 'p' } : request.type === 'get_state' ? { model: { id: 'm', provider: 'p' }, sessionId: 's', sessionFile: '/session' } : {};
      emit({ type: 'response', id: request.id, command: request.type, success: true, data });
      if (request.type === 'prompt') {
        for (const message of [a, a, b, b]) emit({ type: 'message_end', message });
        const terminal = { type: 'agent_end', ...(terminalMessages ? { messages: [a, a, b] } : {}) };
        emit(terminal); emit(terminal);
      }
      callback?.();
    });
    return true;
  };
  const result = await rpcTurn(child, { harness: 'pi', provider: 'p', model: 'm' }, 'prompt', () => {}, () => {});
  assert.equal(result.text, 'done');
  assert.deepEqual(result.usage, { input: 10, cost: { total: 0 } });
  result.assertHealthy();
});
