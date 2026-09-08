import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { budget } from '../scripts/budget.mjs';

function fixture(t) {
  const stateDir = fs.mkdtempSync(fileURLToPath(new URL('../.budget-test-', import.meta.url)));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  return { stateDir, task: 'task-1' };
}
test('native records and external reservations share runs; retries are per ticket', t => {
  const opts = { ...fixture(t), limits: { runs: 4, retries: 1 } };
  assert.equal(budget(opts).runs, 0);
  assert.equal(budget({ ...opts, record: true, ticket: 'native' }).runs, 1);
  assert.equal(budget({ ...opts, record: true, ticket: 'external' }).runs, 2);
  assert.equal(budget({ ...opts, record: true, ticket: 'external', retry: true }).retries.external, 1);
  assert.throws(() => budget({ ...opts, record: true, ticket: 'external', retry: true }), /max 1 retries/);
  assert.equal(budget(opts).runs, 3);
  assert.equal(budget({ ...opts, record: true, ticket: 'native', retry: true }).runs, 4);
  assert.throws(() => budget({ ...opts, record: true }), /max 4 runs/);
  assert.equal(budget(opts).runs, 4);
  assert.equal(fs.existsSync(path.join(opts.stateDir, 'tasks', 'task-1.lock')), false);
});
test('limits are optional and zero retries means no retry', t => {
  const opts = fixture(t);
  assert.equal(budget({ ...opts, record: true }).runs, 1);
  assert.equal(budget({ stateDir: opts.stateDir }), null);
  assert.throws(() => budget({ ...opts, record: true, ticket: 'x', retry: true, limits: { retries: 0 } }), /max 0 retries/);
  assert.equal(budget(opts).runs, 1);
});
test('unsafe identifiers and incomplete budget arguments cannot create files', t => {
  const opts = fixture(t);
  for (const task of ['../escape', '.', '..', '/tmp/x', 'a/b', 'a'.repeat(129)]) {
    assert.throws(() => budget({ ...opts, task, record: true }), /safe identifier/);
  }
  assert.throws(() => budget({ stateDir: opts.stateDir, limits: { runs: 1 } }), /--task/);
  assert.throws(() => budget({ stateDir: opts.stateDir, limits: { retries: 0 } }), /--task/);
  assert.throws(() => budget({ ...opts, retry: true }), /--ticket/);
  assert.equal(fs.existsSync(path.join(opts.stateDir, 'tasks')), false);
});
test('ticket identifiers overlapping object properties remain ordinary counters', t => {
  const opts = fixture(t);
  for (const ticket of ['constructor', 'toString']) {
    const result = budget({ ...opts, ticket, retry: true, record: true, limits: { retries: 1 } });
    assert.equal(result.retries[ticket], 1);
    assert.throws(() => budget({ ...opts, ticket, retry: true, record: true, limits: { retries: 1 } }), /retries reached/);
  }
});
test('malformed state fails without resetting usage', t => {
  const opts = fixture(t);
  budget({ ...opts, record: true });
  const file = path.join(opts.stateDir, 'tasks', `${opts.task}.json`);
  fs.writeFileSync(file, '{"task":"task-1","runs":-1,"retries":{}}');
  assert.throws(() => budget({ ...opts, record: true }), /Invalid task budget/);
  assert.equal(JSON.parse(fs.readFileSync(file)).runs, -1);
});
test('concurrent processes cannot overspend a shared run or ticket retry allowance', async t => {
  const opts = fixture(t);
  const moduleURL = new URL('../scripts/budget.mjs', import.meta.url).href;
  const attempt = options => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import {budget} from ${JSON.stringify(moduleURL)}; try {budget(JSON.parse(process.argv[1]));} catch {process.exitCode=2;}`, JSON.stringify(options)], { stdio: 'ignore' });
    child.on('error', reject); child.on('exit', resolve);
  });
  let results = await Promise.all(Array.from({ length: 16 }, () => attempt({ ...opts, record: true, limits: { runs: 5 } })));
  assert.equal(results.filter(code => code === 0).length, 5);
  assert.equal(budget(opts).runs, 5);
  results = await Promise.all(Array.from({ length: 16 }, () => attempt({ ...opts, task: 'retry-race', ticket: 'same', retry: true, record: true, limits: { retries: 2 } })));
  assert.equal(results.filter(code => code === 0).length, 2);
  const state = budget({ ...opts, task: 'retry-race' });
  assert.equal(state.runs, 2); assert.equal(state.retries.same, 2);
});
