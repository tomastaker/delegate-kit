import test from 'node:test';
import assert from 'node:assert/strict';
import { resultSchema } from '../skills/delegate-kit/scripts/results.mjs';
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
