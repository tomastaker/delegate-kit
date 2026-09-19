import test from 'node:test';
import assert from 'node:assert/strict';
import { resultSchema, checkResultCoverage } from '../skills/delegate-kit/scripts/results.mjs';
import { validate } from '../skills/delegate-kit/scripts/adapters.mjs';
const common = { status: 'done', summary: 'Evidence', questions: [], not_verified: [] };
test('each role accepts a compact payload and refuses unrelated fields', () => {
  for (const [role, payload] of Object.entries({ implementer: { changes: [], checks_run: [] }, researcher: { sources: [] }, planner: { plan: [] }, reviewer: { findings: [] }, verifier: { findings: [] }, 'review-lead': { plan: [], findings: [] }, custom: {}, constructor: {}, toString: {} })) {
    const schema = resultSchema({ role });
    assert.equal(validate({ ...common, ...payload }, schema), null, role);
    assert.ok(validate({ ...common, ...payload, next_steps: [] }, schema), role);
    if (Object.keys(payload).length) assert.ok(validate(common, schema), role);
  }
});
test('custom writers use implementation evidence and malformed role payloads fail', () => {
  const schema = resultSchema({ role: 'database-specialist', access: 'workspace-write' });
  assert.equal(validate({ ...common, changes: [], checks_run: [] }, schema), null);
  assert.ok(validate({ ...common, changes: [{ file: 17 }], checks_run: [] }, schema));
  assert.ok(validate({ ...common, findings: [{ claim: 'incomplete' }] }, resultSchema({ role: 'reviewer' })));
});
test('done requires all assigned mandatory checks; optional caveats and long summaries survive', () => {
  const schema = resultSchema({ role: 'implementer' }, ['behavior']);
  const result = { ...common, changes: [], checks_run: [], summary: 'Details '.repeat(5000), not_verified: ['Optional platform not tested'],
    check_results: [{ id: 'behavior', status: 'passed', evidence: 'node --test in assigned worktree: expected assertion passed' }] };
  assert.equal(validate(result, schema), null);
  assert.equal(checkResultCoverage(result, ['behavior']), null);
  assert.ok(checkResultCoverage({ ...result, check_results: [] }, ['behavior']));
  assert.ok(checkResultCoverage({ ...result, check_results: [...result.check_results, ...result.check_results] }, ['behavior']));
  result.check_results[0].status = 'blocked';
  assert.match(checkResultCoverage(result, ['behavior']), /not done/);
  result.status = 'blocked';
  assert.equal(checkResultCoverage(result, ['behavior']), null);
});
