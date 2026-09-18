import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { validateLimits } from './limits.mjs';

export const home = () => path.resolve(process.env.DELEGATE_KIT_HOME || path.join(os.homedir(), '.delegate-kit'));
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const check = (ok, message) => { if (!ok) throw new Error(message); };
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export function identifier(value, at = 'id') {
  check(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value), `${at}: use 1–80 letters, digits, _ or -`);
  return value;
}
export function keys(value, allowed, at) {
  check(object(value), `${at}: expected object`);
  for (const key of Object.keys(value)) check(allowed.includes(key), `${at}.${key}: unknown field`);
}
export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT' && arguments.length > 1) return fallback;
    throw new Error(`${file}: ${error instanceof SyntaxError ? 'invalid JSON' : error.message}`);
  }
}
export function atomicJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}
// Fail closed on abandoned locks. Never steal an operation based on PID reuse or age.
export function locked(file, fn, timeout = 5000) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + timeout;
  for (;;) {
    try { fs.mkdirSync(file, { mode: 0o700 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      check(Date.now() < deadline, `Operation locked: ${file}; verify the owner has stopped before recovery`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try { return fn(); } finally { fs.rmdirSync(file); }
}

export const harnesses = ['codex', 'claude', 'gemini', 'opencode', 'pi', 'omp'];
export const accessOf = agent => agent.access || (agent.role === 'implementer' ? 'workspace-write' : 'read-only');
export function validatePreset(preset) {
  keys(preset, ['schema_version', 'id', 'name', 'description', 'defaults', 'agents', 'limits', 'coordination'], 'preset');
  check(preset.schema_version === 2, 'preset.schema_version: expected 2');
  identifier(preset.id, 'preset.id');
  for (const key of ['name', 'description', 'coordination']) if (preset[key] !== undefined) check(nonempty(preset[key]), `preset.${key}: expected nonempty text`);
  validateLimits(preset.limits);
  check(object(preset.agents) && Object.keys(preset.agents).length > 0, 'preset.agents: at least one profile is required');
  const seen = new Set();
  for (const [id, agent] of Object.entries(preset.agents)) {
    identifier(id, 'agent id');
    check(!seen.has(id.toLowerCase()), `agents.${id}: case collision`); seen.add(id.toLowerCase());
    const at = `agents.${id}`;
    keys(agent, ['role', 'when', 'instructions', 'executor', 'access', 'review', 'routing'], at);
    identifier(agent.role, `${at}.role`);
    check(nonempty(agent.when), `${at}.when: describe when to use this agent`);
    if (agent.instructions !== undefined) check(nonempty(agent.instructions), `${at}.instructions: expected text`);
    check(agent.access === undefined || ['read-only', 'workspace-write'].includes(agent.access), `${at}.access: unsupported access`);
    if (agent.routing !== undefined) {
      keys(agent.routing, ['tier'], `${at}.routing`);
      check(['economy', 'standard', 'hard'].includes(agent.routing.tier), `${at}.routing.tier: expected economy, standard or hard`);
    }
    const e = agent.executor;
    keys(e, ['harness', 'provider', 'model', 'reasoning', 'transport', 'inherit_model'], `${at}.executor`);
    check(harnesses.includes(e.harness), `${at}.executor.harness: unsupported harness`);
    check(e.transport === undefined || ['auto', 'cli', 'native', 'paseo'].includes(e.transport), `${at}.executor.transport: unsupported transport`);
    check(e.inherit_model === undefined || e.inherit_model === true, `${at}.executor.inherit_model: omit or set true`);
    check(e.inherit_model ? e.model === undefined && e.provider === undefined && e.transport === 'native' : nonempty(e.model), `${at}.executor: exact model required, or explicit native inherit_model without model/provider`);
    for (const key of ['model', 'provider', 'reasoning']) if (e[key] !== undefined) {
      check(nonempty(e[key]) && !/[\x00-\x1f]/.test(e[key]), `${at}.executor.${key}: invalid value`);
      check(!/REPLACE_WITH|YOUR_|<[^>]+>/i.test(e[key]), `${at}.executor.${key}: replace placeholder before saving`);
    }
    if (agent.review !== undefined) {
      check(agent.role === 'reviewer' && accessOf(agent) === 'read-only', `${at}.review: only a read-only reviewer can require a review set`);
      keys(agent.review, ['also_run', 'independent'], `${at}.review`);
      check(agent.review.independent === undefined || agent.review.independent === true, `${at}.review.independent must be true`);
      check(Array.isArray(agent.review.also_run) && agent.review.also_run.length > 0, `${at}.review.also_run must list profiles`);
      check(new Set(agent.review.also_run).size === agent.review.also_run.length, `${at}.review.also_run: duplicate`);
      for (const target of agent.review.also_run) {
        check(target !== id && Object.hasOwn(preset.agents, target), `${at}.review: invalid reference ${target}`);
        check(preset.agents[target].role === 'reviewer' && accessOf(preset.agents[target]) === 'read-only', `${at}.review: ${target} must be a read-only reviewer`);
      }
      check(agent.role === 'reviewer' && accessOf(agent) === 'read-only', `${at}.review.also_run is only for a read-only reviewer set over the same frozen material`);
    }
  }
  if (preset.defaults !== undefined) {
    check(object(preset.defaults), 'preset.defaults: expected object');
    for (const [role, id] of Object.entries(preset.defaults)) {
      check(Object.hasOwn(preset.agents, id) && preset.agents[id].role === role, `defaults.${role}: invalid reference ${id}`);
    }
  }
  for (const id of Object.keys(preset.agents)) reviewSet(preset, id);
  return preset;
}
export function reviewSet(preset, id, chain = []) {
  check(!chain.includes(id), `review.also_run cycle: ${[...chain, id].join(' -> ')}`);
  const ids = [id, ...(preset.agents[id].review?.also_run || []).flatMap(target => reviewSet(preset, target, [...chain, id]))];
  check(new Set(ids).size === ids.length, `review.also_run repeats a profile in ${id}'s required set`);
  return ids;
}
export function presetFiles(root = home()) {
  const dir = path.join(root, 'presets');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort() : [];
}
export function loadPreset(id, root = home()) {
  identifier(id, 'preset');
  const matches = presetFiles(root).filter(name => name.toLowerCase() === `${id}.json`.toLowerCase());
  check(matches.length === 1, matches.length ? `Preset case collision: ${matches.join(', ')}` : `Unknown preset ${id}; available: ${presetFiles(root).join(', ') || '(none; run setup)'}`);
  check(matches[0] === `${id}.json`, `Preset IDs are case-sensitive; use ${matches[0].slice(0, -5)}`);
  const value = validatePreset(readJSON(path.join(root, 'presets', matches[0])));
  check(value.id === id, `Preset filename/id mismatch: ${id}`);
  return { preset: value, revision: hash(value) };
}
export function savePreset(preset, expected = null, root = home()) {
  validatePreset(preset);
  return locked(path.join(root, 'config.lock'), () => {
    const collisions = presetFiles(root).filter(name => name.toLowerCase() === `${preset.id}.json`.toLowerCase());
    if (collisions.length) {
      check(expected !== null, `Preset ${preset.id} already exists; editing requires its revision`);
      check(loadPreset(preset.id, root).revision === expected, `Preset ${preset.id} changed; reload before editing`);
    } else check(expected === null, `Preset ${preset.id} disappeared; reload before editing`);
    atomicJSON(path.join(root, 'presets', `${preset.id}.json`), preset);
    return { id: preset.id, revision: hash(preset) };
  });
}
export function copyPreset(from, to, root = home()) {
  const { preset } = loadPreset(from, root);
  return savePreset({ ...preset, id: identifier(to) }, null, root);
}
export function settings(root = home()) {
  const value = readJSON(path.join(root, 'settings.json'), { schema_version: 2 });
  keys(value, ['schema_version', 'default_preset'], 'settings');
  check(value.schema_version === 2, 'settings.schema_version: expected 2');
  if (value.default_preset !== undefined) identifier(value.default_preset, 'default_preset');
  return value;
}
export function setDefault(id, root = home()) {
  return locked(path.join(root, 'config.lock'), () => {
    loadPreset(id, root);
    const value = { ...settings(root), default_preset: id };
    atomicJSON(path.join(root, 'settings.json'), value); return value;
  });
}
export function context({ session, preset, taskOnly = false }, root = home()) {
  session ||= `dk:${randomUUID()}`;
  check(nonempty(session) && session.length <= 256, 'session: expected stable namespaced host ID or generated handle');
  const file = path.join(root, 'sessions', hash(session), 'session.json');
  return locked(`${file}.lock`, () => {
    const prior = readJSON(file, null);
    check(!prior || prior.session === session, 'Session handle mismatch');
    const selected = preset ?? prior?.preset ?? settings(root).default_preset;
    check(selected, 'No preset selected; run Delegate Kit start before delegation');
    const loaded = loadPreset(selected, root);
    if (!taskOnly) atomicJSON(file, { schema_version: 2, session, preset: selected });
    return { session, preset: selected, task_only: taskOnly, ...loaded };
  });
}
export function catalog(preset, role) {
  return { id: preset.id, defaults: preset.defaults || {}, coordination: preset.coordination || null,
    agents: Object.entries(preset.agents).filter(([, a]) => !role || a.role === role).map(([id, a]) => ({ id, role: a.role, when: a.when, executor: a.executor, access: accessOf(a), review: a.review || null, routing: a.routing || null })) };
}
