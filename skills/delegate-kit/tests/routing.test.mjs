import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, roles, readConfig } from '../scripts/routing.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/agent-run', import.meta.url)), 'route', '--role', 'reviewer', '--parent', 'codex', '--author-backend', 'self', '--diff', diff], { env: { ...process.env, DELEGATE_KIT_HOME: dir, DELEGATE_KIT_PRESET: 'auto' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); const r = JSON.parse(result.stdout);
    assert.equal(r.depth, 'panel'); assert.equal(r.ask_user, undefined); assert.equal(r.reviewers.length, 2);
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

const profiles = {
  roles: { researcher: [{ model: 'shared-lookup' }], reviewer: [{ family: 'claude', model: 'review-model', runner: 'claude' }] },
  profiles: {
    gpt: { roles: {
      planner: [{ model: 'plan-basic', effort: 'low' }, { model: 'plan-deep', effort: 'high' }],
      implementer: [{ model: 'write-model' }],
      researcher: [{ family: 'glm', runner: 'opencode', model: 'provider/lookup' }],
    } },
    claude: { roles: { planner: [{ model: 'claude-plan', effort: 'high' }] } },
    kimi: { roles: { planner: [{ model: 'kimi-plan' }] } },
  },
};
test('parent family selects profile; named override and missing profiles are explicit', () => {
  assert.equal(route({}, profiles).profile, 'gpt');
  assert.equal(route({}, profiles).model, 'plan-basic');
  assert.equal(route({ parent: 'claude' }, profiles).model, 'claude-plan');
  assert.equal(route({ parent: 'kimi' }, profiles).model, 'kimi-plan');
  assert.equal(route({ profile: 'claude' }, profiles).model, 'claude-plan');
  assert.throws(() => route({ profile: 'missing' }, profiles), /Unknown profile/);
  assert.equal(route({ parent: 'gemini', role: 'researcher' }, profiles).model, 'shared-lookup');
});
test('profile role replaces whole shared ladder; missing roles and specialist roles fall back', () => {
  const researcher = route({ role: 'researcher' }, profiles);
  assert.equal(researcher.model, 'provider/lookup'); assert.equal(researcher.levels, 1);
  const verifier = route({ role: 'verifier', 'author-backend': 'self' }, profiles);
  assert.equal(verifier.family, 'claude'); assert.equal(verifier.role, 'verifier');
  assert.equal(route({ role: 'review-lead', level: '2' }, profiles).model, 'plan-deep');
  const cfg = structuredClone(profiles);
  cfg.roles.verifier = [{ model: 'explicit-verifier' }];
  assert.equal(route({ role: 'verifier', 'author-backend': 'self' }, cfg).model, 'explicit-verifier');
});
test('level is one-based and never silently escalates or skips a pinned unavailable target', () => {
  const selected = route({ level: '2' }, profiles);
  assert.equal(selected.model, 'plan-deep'); assert.equal(selected.level, 2); assert.equal(selected.levels, 2);
  assert.deepEqual(selected.candidates, profiles.profiles.gpt.roles.planner);
  for (const level of [0, -1, 3, 1.5, 'NaN', true]) assert.throws(() => route({ level }, profiles), /--level/);
  const cfg = { roles: { planner: [{ family: 'claude', model: 'first' }, { model: 'second' }] } };
  const unavailable = route({}, cfg, () => false);
  assert.equal(unavailable.model, 'first'); assert.equal(unavailable.available, false); assert.equal(unavailable.level, 1);
});
test('three families can mix native and external roles without legacy pool configuration', () => {
  const planner = route({}, profiles);
  assert.equal(planner.mode, 'mixed'); assert.equal(planner.dispatch, 'native');
  assert.deepEqual(planner.allowed_families.sort(), ['claude', 'glm', 'gpt']);
  const researcher = route({ role: 'researcher' }, profiles);
  assert.equal(researcher.adapter, 'opencode'); assert.equal(researcher.dispatch, 'external');
  assert.throws(() => route({ mode: 'solo' }, profiles), /solo requires/);
  assert.throws(() => route({ mode: 'duo' }, profiles), /duo requires/);
  assert.throws(() => route({ role: 'researcher', families: 'codex' }, profiles), /outside/);
});
test('same family named backend uses native capability instead of backend ID equality', () => {
  const cfg = { backends: { fast: { family: 'gpt', adapter: 'codex', model: 'fast-model' } }, roles: { researcher: { backend: 'fast' } } };
  const native = route({ role: 'researcher' }, cfg, () => false);
  assert.equal(native.backend, 'fast'); assert.equal(native.dispatch, 'native'); assert.equal(native.available, true);
  const external = route({ role: 'researcher', 'no-native': true }, cfg, () => false);
  assert.equal(external.dispatch, 'external'); assert.equal(external.available, false);
});
test('native capabilities replace defaults and use the host adapter across families', () => {
  const cfg = { roles: { planner: [{ family: 'claude', model: 'target', runner: 'native' }] } };
  assert.throws(() => route({}, cfg), /Native execution is unavailable/);
  const result = route({ 'native-families': 'claude' }, cfg);
  assert.equal(result.dispatch, 'native'); assert.equal(result.adapter, 'codex'); assert.equal(result.external_adapter, 'claude');
  assert.equal(result.native_required, true);
  assert.throws(() => route({ 'native-families': 'claude', 'no-native': true }, cfg), /Native execution is unavailable/);
  assert.throws(() => route({ external: true }, cfg), /requires the host native tool/);
  assert.equal(route({ 'native-families': 'claude', model: 'gpt-choice' }, cfg).dispatch, 'external');
});
test('explicit runners select external transport even when the family has native support', () => {
  const cfg = { roles: { planner: [{ family: 'gpt', model: 'provider/model', runner: 'opencode' }] } };
  assert.equal(route({}, cfg).adapter, 'opencode'); assert.equal(route({}, cfg).dispatch, 'external');
  assert.equal(route({ runner: 'native' }, cfg).dispatch, 'native');
  assert.equal(route({ external: true }, profiles).dispatch, 'external');
});
test('explicit model defaults to current family instead of borrowing a foreign candidate', () => {
  const cfg = { roles: { planner: [{ family: 'claude', model: 'claude-pinned', runner: 'claude', effort: 'high' }] } };
  const result = route({ model: 'chosen-model' }, cfg);
  assert.equal(result.family, 'gpt'); assert.equal(result.model, 'chosen-model'); assert.equal(result.dispatch, 'native'); assert.equal(result.effort, null);
  assert.equal(route({ model: 'chosen-model', family: 'claude' }, cfg).family, 'claude');
  assert.equal(route({ model: 'claude-looking-name' }).family, 'gpt');
});
test('custom families need a declared runner externally and roundtrip without backend IDs', () => {
  const cfg = { roles: { planner: [{ family: 'custom', runner: 'opencode', model: 'provider/custom', efforts: ['think'], effort: 'think' }] } };
  const result = route({}, cfg);
  assert.equal(result.family, 'custom'); assert.equal(result.external_adapter, 'opencode');
  assert.equal(result.model, 'provider/custom'); assert.equal(result.effort, 'think');
  const replay = route({ family: result.family, runner: result.external_adapter, model: result.model, effort: result.effort, level: result.level }, cfg);
  assert.equal(replay.family, result.family); assert.equal(replay.adapter, result.adapter); assert.equal(replay.model, result.model);
  assert.throws(() => route({ family: 'custom', model: 'chosen' }), /No external runner/);
});
test('legacy per-backend assignments, preferences and preset remain readable', () => {
  const cfg = { roles: { planner: { codex: ['legacy-model', 'low'], claude: ['other', 'high'] } } };
  assert.equal(route({}, cfg).model, 'legacy-model'); assert.equal(route({}, cfg).effort, 'low');
  assert.equal(route({ backend: 'claude' }, cfg).model, 'other');
  assert.equal(route({ preset: 'main-claude' }).backend, 'claude');
});
test('readConfig validates inactive profiles, every ladder candidate and user limits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-profile-config-'));
  const file = path.join(dir, 'config.json');
  const read = cfg => { fs.writeFileSync(file, JSON.stringify(cfg)); return readConfig(file); };
  try {
    for (const invalid of [[], [null], [{ runner: 'typo' }], [{ family: '' }], [{ model: '' }], [{ backend: 'missing' }], [{ effort: 'high', efforts: ['low'] }], [{ typo: true }], [{}, { runner: 'typo' }], [{ runner: 'gemini', effort: 'high' }], [{ runner: 'opencode', model: 'missing-provider' }]]) {
      assert.throws(() => read({ profiles: { unused: { roles: { researcher: invalid } } } }));
    }
    assert.throws(() => read({ profiles: { unused: { typo: {} } } }), /Unknown/);
    assert.throws(() => read({ limits: { max_runs: 0 } }), /max_runs/);
    const cfg = { limits: { max_writers: 10, max_workers: 2, max_runs: 5, max_retries: 0 }, ...profiles };
    assert.deepEqual(read(cfg), cfg);
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('materializing a same-family backend preserves candidate effort declarations', () => {
  const cfg = { roles: { planner: [{ family: 'glm', runner: 'opencode', model: 'provider/model', efforts: ['think'], effort: 'think' }] } };
  const first = route({}, cfg);
  const second = route({ backend: first.backend, runner: first.external_adapter, model: first.model, effort: first.effort }, cfg);
  assert.equal(second.model, first.model); assert.equal(second.effort, first.effort); assert.equal(second.adapter, first.adapter);
});
