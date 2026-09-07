import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, roles, readConfig } from '../scripts/routing.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const route = (opts, cfg = {}, present = () => true) => resolve({ role: 'planner', parent: 'codex', ...opts }, cfg, {}, present);
test('zero JSON keeps the current model for every role; same-family review requires fresh context', () => {
  for (const role of Object.keys(roles)) {
    const r = route({ role, 'author-backend': 'self' });
    assert.equal(r.backend, 'codex'); assert.equal(r.model, null); assert.equal(r.effort, null); assert.equal(r.model_source, 'inherit');
    if (role === 'reviewer') { assert.equal(r.cross_family, false); assert.equal(r.fresh_context_required, true); }
  }
});
test('known parent GPT-6 is preserved; explicit selection wins', () => {
  assert.equal(route({ 'parent-model': 'gpt-6-astra' }).model, 'gpt-6-astra');
  const r = route({ model: 'gpt-6-astra', effort: 'low' }, { roles: { planner: { model: 'old-model' } } });
  assert.equal(r.model, 'gpt-6-astra'); assert.equal(r.effort, 'low');
});
test('solo can choose several profiles in one family; cannot cross its boundary', () => {
  const cfg = { mode: 'solo', families: ['codex', 'fast'], backends: { fast: { family: 'gpt', adapter: 'codex', model: 'lookup-model' } } };
  assert.equal(route({ role: 'researcher', backend: 'fast' }, cfg).mode, 'solo');
  assert.throws(() => route({ backend: 'claude' }, cfg), /outside/);
});
test('duo chooses another family by default and honours a same-family hard reviewer', () => {
  const cfg = { mode: 'duo', families: ['codex', 'claude'] };
  assert.equal(route({ role: 'reviewer', 'author-backend': 'self' }, cfg).backend, 'claude');
  assert.equal(route({ role: 'reviewer', 'author-backend': 'self' }, { ...cfg, roles: { reviewer: { backend: 'codex' } } }).cross_family, false);
  assert.throws(() => route({ mode: 'duo' }), /two families/);
});
test('unavailable preference falls back inside pool; hard assignment remains visible', () => {
  const cfg = { families: ['codex', 'claude'], preferences: { planner: ['claude'] } };
  assert.equal(route({}, cfg, () => false).backend, 'codex');
  const pinned = route({}, { ...cfg, roles: { planner: { backend: 'claude' } } }, () => false);
  assert.equal(pinned.backend, 'claude'); assert.equal(pinned.available, false);
});
test('model family is separate from CLI and identifiers are not guessed by prefix', () => {
  const cfg = { families: ['claude', 'glm-on-claude'], backends: { 'glm-on-claude': { family: 'glm', adapter: 'claude', model: 'GLM-CURRENT' } } };
  const r = route({ parent: 'claude', role: 'reviewer', 'author-backend': 'self' }, cfg);
  assert.equal(r.adapter, 'claude'); assert.equal(r.family, 'glm'); assert.equal(r.cross_family, true);
});
test('Kimi and GLM require explicit OpenCode provider identity externally', () => {
  for (const family of ['kimi', 'glm']) {
    assert.throws(() => route({ backend: family }), /provider\/model/);
    const r = route({ backend: family, model: `chosen-provider/${family}-current` });
    assert.equal(r.family, family); assert.equal(r.adapter, 'opencode');
  }
});
test('unsupported effort fails; known OpenCode variant is passed without remapping', () => {
  assert.throws(() => route({ backend: 'gemini', effort: 'xhigh' }), /does not declare/);
  assert.throws(() => route({ backend: 'kimi', model: 'moonshot/current', effort: 'high' }), /does not declare/);
  const r = route({ backend: 'kimi', effort: 'thinking' }, { backends: { kimi: { model: 'moonshot/current', efforts: ['thinking'] } } });
  assert.equal(r.effort, 'thinking');
});
test('invalid config and unknown roles never silently restore defaults', () => {
  assert.throws(() => route({}, { roles: { typo: {} } }), /Unknown role/);
  assert.throws(() => route({}, { review: { allow_multiple: 'false' } }), /boolean/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-config-'));
  try { fs.writeFileSync(path.join(dir, 'config.json'), '{'); assert.throws(() => readConfig(path.join(dir, 'config.json')), /Invalid JSON/); }
  finally { fs.rmSync(dir, { recursive: true }); }
});
test('panel modes, hard assignments and user approval survive actual route command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-route-'));
  try {
    const cfg = { mode: 'solo', families: ['codex'], roles: { reviewer: { backend: 'codex' } } };
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg));
    const diff = path.join(dir, 'review.diff');
    fs.writeFileSync(diff, 'diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n' + '+x\n'.repeat(400));
    const result = spawnSync(process.execPath, [new URL('../scripts/agent-run', import.meta.url).pathname, 'route', '--role', 'reviewer', '--parent', 'codex', '--author-backend', 'self', '--diff', diff], { env: { ...process.env, DELEGATE_KIT_HOME: dir, DELEGATE_KIT_PRESET: 'auto' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); const r = JSON.parse(result.stdout);
    assert.equal(r.depth, 'panel'); assert.match(r.ask_user, /yes/); assert.equal(r.reviewers.length, 2);
    for (const reviewer of r.reviewers) { assert.equal(reviewer.backend, 'codex'); assert.equal(reviewer.cross_family, false); }
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('explicit solo backend cannot silently replace the parent family', () => {
  assert.throws(() => route({mode:'solo',backend:'claude'}), /outside/);
});
test('backend override does not inherit another backend role model or effort', () => {
  const selected = route({backend:'claude'}, {roles:{planner:{backend:'codex',model:'gpt-selected',effort:'ultra'}}});
  assert.equal(selected.model, null); assert.equal(selected.effort, null);
});
