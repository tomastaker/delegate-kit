import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePreset, catalog } from '../skills/delegate-kit/scripts/presets.mjs';

const agentSchema = JSON.parse(fs.readFileSync(new URL('../skills/delegate-kit/assets/preset.schema.json', import.meta.url))).properties.agents.additionalProperties;
const profile = role => ({ role, when: 'Explicit bounded fixture', executor: { harness: 'codex', model: 'fixture', transport: 'cli' } });
const preset = () => ({ schema_version: 2, id: 'test', agents: { author: profile('implementer'), reviewer: profile('reviewer'), second: profile('reviewer') } });

test('optional routing tiers preserve profiles without tiers, arbitrary names and exact settings', () => {
  const p = preset();
  assert.equal(catalog(validatePreset(p)).agents[0].routing, null);
  for (const tier of ['economy', 'standard', 'hard']) {
    p.agents.author.routing = { tier };
    assert.equal(catalog(validatePreset(p)).agents[0].routing.tier, tier);
    assert.deepEqual(p.agents.author.executor, profile('implementer').executor);
  }
  for (const routing of [{}, { tier: 'cheap' }, { tier: 'economy', price: 0 }, null, []]) {
    p.agents.author.routing = routing;
    assert.throws(() => validatePreset(p), /routing/);
  }
});

test('required review sets belong only to read-only reviewers', () => {
  const p = preset();
  p.agents.reviewer.review = { also_run: ['second'], independent: true };
  validatePreset(p);
  p.agents.author.review = { also_run: ['reviewer'] };
  assert.throws(() => validatePreset(p), /only a read-only reviewer/);
  delete p.agents.author.review;
  p.agents.reviewer.access = 'workspace-write';
  assert.throws(() => validatePreset(p), /only a read-only reviewer/);
  p.agents.reviewer.access = 'read-only';
  p.agents.second.access = 'workspace-write';
  assert.throws(() => validatePreset(p), /must be a read-only reviewer/);
});

test('published schema enforces review ownership and strict optional routing shape', () => {
  // Exercise the exact conditional with profile cases, including default read-only access.
  const condition = agentSchema.allOf.find(rule => rule.if.required.includes('review'));
  const schemaAllowsReview = a => !Object.hasOwn(a, 'review') || Object.entries(condition.then.properties).every(([key, rule]) => !Object.hasOwn(a, key) || a[key] === rule.const);
  for (const role of ['reviewer', 'implementer', 'researcher']) {
    for (const access of [undefined, 'read-only', 'workspace-write']) {
      const p = preset();
      p.agents.reviewer = { ...profile(role), ...(access ? { access } : {}), review: { also_run: ['second'] } };
      let runtimeAllows = true;
      try { validatePreset(p); } catch { runtimeAllows = false; }
      assert.equal(schemaAllowsReview(p.agents.reviewer), runtimeAllows, `${role}/${access}`);
    }
  }
  const routing = agentSchema.properties.routing;
  assert.equal(routing.additionalProperties, false);
  assert.deepEqual(routing.required, ['tier']);
  assert.deepEqual(routing.properties.tier.enum, ['economy', 'standard', 'hard']);
  assert.equal(agentSchema.required.includes('routing'), false);
});

test('task and runtime evidence schemas publish versioned strict record shapes', () => {
  const read = name => JSON.parse(fs.readFileSync(new URL(`../skills/delegate-kit/assets/${name}.schema.json`, import.meta.url)));
  for (const name of ['task', 'checkpoint', 'evidence']) {
    const schema = read(name);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.version.const, 1);
    assert.ok(schema.required.includes('version'));
    const inspect = node => {
      if (!node || typeof node !== 'object') return;
      if (node.pattern) assert.doesNotThrow(() => new RegExp(node.pattern));
      if (node.required && node.properties) for (const key of node.required) assert.ok(Object.hasOwn(node.properties, key), `${name}: required ${key} declared`);
      for (const value of Object.values(node)) inspect(value);
    };
    inspect(schema);
  }
  const contract = read('task');
  const relative = new RegExp(contract.properties.checks.items.properties.cwd.pattern);
  for (const value of ['.', 'tests', 'src/file.mjs']) assert.ok(relative.test(value));
  for (const value of ['/etc', '../x', 'src/../x', 'src\\..\\x', '  ']) assert.equal(relative.test(value), false);
  assert.deepEqual(contract.properties.review.allOf[0].then.properties.profiles, { minItems: 1 });
  const checkpoint = read('checkpoint');
  for (const field of ['source_cwd', 'cwd', 'repo', 'base', 'tree', 'spec_digest', 'contract_revision']) assert.ok(checkpoint.required.includes(field));
  const evidence = read('evidence');
  for (const field of ['checkpoint_id', 'check_id', 'requirements', 'argv', 'environment', 'status', 'snapshot_match', 'stdout_path', 'stderr_path']) assert.ok(evidence.required.includes(field));
  assert.deepEqual(evidence.properties.status.enum, ['passed', 'failed', 'inconclusive']);
  assert.deepEqual(evidence.properties.exit_code.type, ['integer', 'null']);
  assert.equal(evidence.required.includes('tests'), false);
});
