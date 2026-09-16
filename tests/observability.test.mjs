import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const skill = fileURLToPath(new URL('../skills/delegate-kit', import.meta.url));
const cli = path.join(skill, 'scripts/dk.mjs');

function run(home, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    env: { ...process.env, DELEGATE_KIT_HOME: home },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function saveRun(home, run) {
  const folder = path.join(home, 'runs', run.id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'meta.json'), JSON.stringify(run));
}

function fixture(id, status, extra = {}) {
  return {
    schema_version: 2,
    id,
    parent_session: 'codex:test',
    task: 'status-ui',
    preset: 'main-test',
    profile: id,
    role: id.includes('reviewer') ? 'reviewer' : 'implementer',
    write: false,
    executor: { harness: 'codex', model: 'gpt-6-astra', transport: 'native', access: 'read-only' },
    workspace: { owner: 'delegate-kit', path: os.tmpdir() },
    status,
    attempt_kind: 'fresh',
    resume_of: null,
    actual_model: null,
    result_validated: false,
    accepted: false,
    required_profiles: [],
    created: new Date().toISOString(),
    usage: null,
    cost_usd: null,
    ...extra,
  };
}

test('watch is compact by default and --full preserves diagnostic detail', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-observability-'));
  try {
    saveRun(home, fixture('implementer-api', 'running', {
      host_attached: true,
      execution_started_at: new Date().toISOString(),
      host_checked_at: new Date().toISOString(),
      progress_at: new Date().toISOString(),
      actual_model: 'gpt-6-astra',
    }));
    saveRun(home, fixture('reviewer-hard', 'prepared'));

    const compact = run(home, ['watch', '--session', 'codex:test', '--task', 'status-ui', '--timeout-ms', '5']);
    assert.equal(compact.summary.icon, '🟢');
    assert.equal(compact.summary.working, 1);
    assert.equal(compact.agents.find(agent => agent.id === 'implementer-api').icon, '🟢');
    assert.equal(compact.agents.find(agent => agent.id === 'reviewer-hard').icon, '🟡');
    assert.equal(Object.hasOwn(compact, 'observed_at'), false);
    assert.equal(Object.hasOwn(compact, 'presets'), false);
    assert.equal(Object.hasOwn(compact.summary, 'statuses'), false);
    assert.equal(Object.hasOwn(compact.agents[0], 'requested_model'), false);

    const unchanged = run(home, ['watch', '--session', 'codex:test', '--task', 'status-ui', '--after', compact.cursor, '--timeout-ms', '5']);
    assert.equal(unchanged.changed, false);
    assert.equal(unchanged.watch_timed_out, true);
    assert.equal(unchanged.summary.icon, '🟢');
    assert.equal(Object.hasOwn(unchanged, 'agents'), false);

    const full = run(home, ['watch', '--session', 'codex:test', '--task', 'status-ui', '--timeout-ms', '5', '--full']);
    assert.equal(typeof full.observed_at, 'string');
    assert.deepEqual(full.presets, ['main-test']);
    assert.equal(full.summary.attempts, 2);
    assert.equal(full.agents[0].requested_model, 'gpt-6-astra');
    assert.equal(Object.hasOwn(full.agents[0], 'icon'), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
