import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const runner = fileURLToPath(new URL('../scripts/agent-run', import.meta.url));
const done = { status: 'done', summary: 'Fixture completed', changes: [], checks_run: [], not_verified: [], plan: [], findings: [], questions: [], sources: [], next_steps: [] };

function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-run-budget-'));
  try {
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
    const state = path.join(dir, 'state'); fs.mkdirSync(state);
    const log = path.join(dir, 'launches');
    fs.writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}\nconst fs=require('node:fs');\nfs.appendFileSync(${JSON.stringify(log)},'launch\\n');\nconsole.log(JSON.stringify({type:'thread.started',thread_id:'budget-session'}));\nfs.writeFileSync(process.argv[process.argv.indexOf('-o')+1], ${JSON.stringify(JSON.stringify(done))});\n`, { mode: 0o755 });
    const env = { ...process.env, PATH: bin, DELEGATE_KIT_HOME: state, DELEGATE_KIT_DEPTH: '', DELEGATE_KIT_PRESET: 'auto' };
    for (const key of ['MODE', 'MAX_WRITERS', 'MAX_WORKERS', 'MAX_RUNS', 'MAX_RETRIES']) delete env[`DELEGATE_KIT_${key}`];
    const command = args => spawnSync(process.execPath, [runner, ...args], { env, encoding: 'utf8', timeout: 15000 });
    const config = limits => fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify({ limits,
      profiles: { gpt: { roles: { planner: [{ model: 'fixture-base', effort: 'low' }, { model: 'fixture-strong', effort: 'high' }] } } } }));
    const launches = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').length : 0;
    fn({ command, config, launches });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const ok = result => { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };

test('actual external start/resume shares a task with native records and refuses budget overflow before model launch', () => fixture(({ command, config, launches }) => {
  config({ max_runs: 3, max_retries: 1 });
  ok(command(['budget', '--task', 'feature', '--record', '--ticket', 'research']));
  const first = ok(command(['run', '--parent', 'codex', '--role', 'planner', '--task', 'feature', '--ticket', 'plan', '--prompt', 'x']));
  assert.equal(first.profile, 'gpt'); assert.equal(first.level, 1); assert.equal(first.effort, 'low');
  const forbidden = command(['resume', first.id, '--level', '2', '--prompt', 'change model']);
  assert.notEqual(forbidden.status, 0); assert.match(forbidden.stderr, /fresh run/); assert.equal(launches(), 1);
  const resumed = ok(command(['resume', first.id, '--retry', '--prompt', 'clarify']));
  assert.equal(resumed.task, 'feature'); assert.equal(resumed.ticket, 'plan'); assert.equal(resumed.model, 'fixture-base');
  const snapshot = ok(command(['budget', '--task', 'feature']));
  assert.equal(snapshot.runs, 3); assert.equal(snapshot.retries.plan, 1); assert.equal(launches(), 2);
  const exhausted = command(['run', '--parent', 'codex', '--role', 'planner', '--task', 'feature', '--ticket', 'other', '--prompt', 'x']);
  assert.notEqual(exhausted.status, 0); assert.match(exhausted.stderr, /max 3 runs/); assert.equal(launches(), 2);
  config({ max_runs: 10, max_retries: 1 });
  const retry = command(['resume', first.id, '--retry', '--prompt', 'again']);
  assert.notEqual(retry.status, 0); assert.match(retry.stderr, /max 1 retries/); assert.equal(launches(), 2);
  assert.equal(ok(command(['budget', '--task', 'feature'])).runs, 3);
}));

test('detached supervisor records one start, and a stronger level uses a fresh model', () => fixture(({ command, config, launches }) => {
  config({ max_runs: 1 });
  const started = ok(command(['run', '--parent', 'codex', '--role', 'planner', '--level', '2', '--task', 'detached', '--ticket', 'plan', '--prompt', 'x', '--detach']));
  const finished = ok(command(['wait', started.id, '--timeout', '0.2']));
  assert.equal(finished.status, 'finished'); assert.equal(finished.worker_status, 'done'); assert.equal(finished.model, 'fixture-strong'); assert.equal(finished.effort, 'high');
  assert.equal(finished.level, 2); assert.equal(launches(), 1);
  assert.equal(ok(command(['budget', '--task', 'detached'])).runs, 1);
}));

test('configured task limits cannot be bypassed by omitting the task ID', () => fixture(({ command, config, launches }) => {
  config({ max_runs: 1 });
  const result = command(['run', '--parent', 'codex', '--role', 'planner', '--prompt', 'x']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /--task is required/); assert.equal(launches(), 0);
}));


test('a task-only run can resume without an optional ticket', () => fixture(({ command, config, launches }) => {
  config({ max_runs: 2 });
  const first = ok(command(['run', '--parent', 'codex', '--role', 'planner', '--task', 'task-only', '--prompt', 'x']));
  const resumed = ok(command(['resume', first.id, '--prompt', 'continue']));
  assert.equal(resumed.task, 'task-only'); assert.equal(resumed.ticket, null);
  assert.equal(ok(command(['budget', '--task', 'task-only'])).runs, 2);
  assert.equal(launches(), 2);
}));
