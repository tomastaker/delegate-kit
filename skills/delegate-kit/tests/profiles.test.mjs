import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolve } from '../scripts/routing.mjs';

const skill = fileURLToPath(new URL('..', import.meta.url));
const repo = path.resolve(skill, '../..');
const example = JSON.parse(fs.readFileSync(path.join(skill, 'examples/config.json'), 'utf8'));
const choose = (parent, role, level = 1) => resolve({ parent, role, level, 'author-backend': 'self' }, example, {}, () => true);

test('editable example switches the team with its coordinator and strengthens only the chosen role', () => {
  const gpt = choose('codex', 'implementer');
  assert.equal(gpt.profile, 'gpt'); assert.equal(gpt.model, 'gpt-6-astra');
  assert.equal(gpt.dispatch, 'native'); assert.equal(gpt.effort, 'low');
  assert.equal(choose('codex', 'implementer', 2).effort, 'high');
  const plan = choose('codex', 'planner');
  assert.equal(plan.model, 'fable'); assert.equal(plan.adapter, 'claude'); assert.equal(plan.dispatch, 'external');
  assert.equal(choose('codex', 'reviewer').model, 'opus');
  const claude = choose('claude', 'implementer');
  assert.equal(claude.profile, 'claude'); assert.equal(claude.model, 'opus'); assert.equal(claude.dispatch, 'native');
  assert.equal(choose('claude', 'reviewer').adapter, 'codex');
  assert.equal(choose('kimi', 'implementer').dispatch, 'native');
  assert.equal(choose('kimi', 'implementer').model, null);
  const glm = choose('kimi', 'reviewer');
  assert.equal(glm.family, 'glm'); assert.equal(glm.adapter, 'opencode'); assert.equal(glm.dispatch, 'external');
  assert.equal(glm.mode, 'mixed');
});

test('README JSON examples are valid configuration fragments and local assets/links exist', () => {
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  for (const [, json] of readme.matchAll(/```json\n([\s\S]*?)\n```/g)) {
    const cfg = JSON.parse(json);
    resolve({ parent: 'codex', role: 'implementer' }, cfg, {}, () => true);
  }
  const links = [...readme.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]);
  const images = [...readme.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
  for (const target of [...links, ...images]) {
    if (/^(https?:|#)/.test(target)) continue;
    assert.ok(fs.existsSync(path.join(repo, target.split('#')[0])), `missing README target ${target}`);
  }
});

function withConfig(run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-profile-command-'));
  const env = { ...process.env, DELEGATE_KIT_HOME: home, DELEGATE_KIT_PRESET: 'auto' };
  delete env.DELEGATE_KIT_MODE;
  const command = args => spawnSync(process.execPath, [path.join(skill, 'scripts/agent-run'), ...args], { env, encoding: 'utf8' });
  try { fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify(example)); run(command, home); }
  finally { fs.rmSync(home, { recursive: true, force: true }); }
}

test('external route arguments preserve the selected foreign candidate on a dry reroute', () => withConfig(command => {
  const routed = command(['route', '--parent', 'codex', '--role', 'planner']);
  assert.equal(routed.status, 0, routed.stderr);
  const first = JSON.parse(routed.stdout);
  assert.equal(first.dispatch, 'external');
  const args = first.invoke.argv.slice(2);
  const rerouted = command(['route', ...args]);
  assert.equal(rerouted.status, 0, rerouted.stderr);
  const second = JSON.parse(rerouted.stdout);
  for (const field of ['family', 'adapter', 'model', 'effort', 'profile', 'level']) assert.equal(second[field], first[field], field);
}));

test('external run refuses a required native candidate before creating a worker', () => withConfig((command, home) => {
  const result = command(['run', '--parent', 'kimi', '--role', 'researcher', '--prompt', 'Must not launch']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /native/i);
  assert.deepEqual(fs.readdirSync(path.join(home, 'runs')), []);
}));
