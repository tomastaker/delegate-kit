// Model identifiers belong to the host or user configuration, never to role policy.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export const roles = Object.fromEntries(['planner', 'implementer', 'reviewer', 'verifier', 'researcher', 'review-lead'].map(role => [role, { write: role === 'implementer' }]));
export const defaults = {
  codex: { family: 'gpt', adapter: 'codex' },
  claude: { family: 'claude', adapter: 'claude' },
  gemini: { family: 'gemini', adapter: 'gemini' },
  kimi: { family: 'kimi', adapter: 'opencode' },
  glm: { family: 'glm', adapter: 'opencode' },
};
const adapters = ['codex', 'claude', 'gemini', 'opencode'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const identifier = value => typeof value === 'string' && /^[a-z][a-z0-9_-]*$/.test(value);
export function readConfig(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  let config;
  try { config = JSON.parse(text); } catch { throw new Error(`Invalid JSON in ${file}; fix it before routing`); }
  check(object(config), 'config.json must contain an object');
  for (const key of Object.keys(config)) check(['mode', 'backends', 'families', 'roles', 'preferences', 'review', 'preset'].includes(key), `Unknown config key: ${key}`);
  return config;
}
export function backendTable(config) {
  check(config.backends === undefined || object(config.backends), 'backends must be an object');
  const table = structuredClone(defaults);
  for (const [name, entry] of Object.entries(config.backends || {})) {
    check(identifier(name) && object(entry), `Invalid backend ${name}`);
    for (const key of Object.keys(entry)) check(['family', 'adapter', 'model', 'efforts'].includes(key), `Unknown backends.${name}.${key}`);
    const merged = { ...table[name], ...entry };
    check(identifier(merged.family) && adapters.includes(merged.adapter), `Backend ${name} needs a family and a supported adapter`);
    check(merged.model === undefined || (typeof merged.model === 'string' && merged.model.trim() !== ''), `Invalid model for ${name}`);
    check(merged.efforts === undefined || (Array.isArray(merged.efforts) && merged.efforts.every(e => typeof e === 'string' && e.length)), `Invalid efforts for ${name}`);
    table[name] = merged;
  }
  return table;
}
export function installed(adapter) {
  // Adapter is validated against a fixed list; no model/config text reaches a shell.
  return spawnSync('/bin/sh', ['-c', `command -v ${adapter}`], { stdio: 'ignore' }).status === 0;
}
export function parentOf(opts, env = process.env) {
  return opts.parent || env.DELEGATE_KIT_PARENT ||
    (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT ? 'claude' :
      env.CODEX_SANDBOX || env.CODEX_NON_INTERACTIVE || env.CODEX_HOME ? 'codex' : null);
}
export function resolve(opts, config = {}, env = process.env, available = installed) {
  const table = backendTable(config);
  const role = opts.role;
  check(Object.hasOwn(roles, role), `--role must be one of ${Object.keys(roles).join('|')}`);
  const parent = parentOf(opts, env);
  check(!parent || Object.hasOwn(table, parent), `Unknown parent backend: ${parent}`);
  const mode = opts.mode || env.DELEGATE_KIT_MODE || config.mode || 'auto';
  check(['auto', 'solo', 'duo'].includes(mode), '--mode must be auto, solo or duo');
  // Legacy presets remain accepted as primary-backend preferences, without restoring model pins.
  const preset = opts.preset || env.DELEGATE_KIT_PRESET || config.preset || 'auto';
  const legacy = { 'main-claude': 'claude', 'main-codex': 'codex', 'main-gpt': 'codex' };
  check(preset === 'auto' || legacy[preset], 'Unknown preset; use auto, main-claude or main-codex');
  let pool = opts.families ? String(opts.families).split(',') : config.families;
  if (pool !== undefined) check(Array.isArray(pool) && pool.length > 0 && pool.every(b => typeof b === 'string' && Object.hasOwn(table, b)), 'families must list backend IDs');
  const explicitPool = pool !== undefined;
  pool = [...new Set(pool || [(mode === 'auto' ? opts.backend || config.roles?.[role]?.backend : null) || legacy[preset] || parent].filter(Boolean))];
  check(pool.length > 0, 'No current host detected; pass --parent or --backend (no JSON needed)');
  const count = new Set(pool.map(b => table[b].family)).size;
  check(count <= 2, 'Choose at most two families for this task');
  check(mode !== 'solo' || count === 1, 'solo requires exactly one family');
  check(mode !== 'duo' || count === 2, 'duo requires two families; pass --families backend-a,backend-b');
  const effectiveMode = count === 1 ? 'solo' : 'duo';
  const why = [`${effectiveMode}: ${pool.map(b => `${b} (${table[b].family})`).join(', ')}`];
  check(config.roles === undefined || object(config.roles), 'roles must be an object');
  check(config.preferences === undefined || object(config.preferences), 'preferences must be an object');
  for (const [name, assignment] of Object.entries(config.roles || {})) {
    check(Object.hasOwn(roles, name), `Unknown role: ${name}`);
    check(object(assignment), `roles.${name} must be an object`);
    // Preserve the old per-backend [model, effort] form during migration.
    if (!('backend' in assignment || 'model' in assignment || 'effort' in assignment)) {
      for (const [b, v] of Object.entries(assignment)) check(Object.hasOwn(table, b) && Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'string'), `Invalid legacy roles.${name}.${b}`);
    } else {
      for (const key of Object.keys(assignment)) check(['backend', 'model', 'effort'].includes(key), `Unknown roles.${name}.${key}`);
      check(!assignment.backend || Object.hasOwn(table, assignment.backend), `Unknown roles.${name}.backend`);
      for (const key of ['model', 'effort']) check(assignment[key] === undefined || (typeof assignment[key] === 'string' && assignment[key].length > 0), `Invalid roles.${name}.${key}`);
    }
  }
  for (const [key, pref] of Object.entries(config.preferences || {})) {
    check(Object.hasOwn(roles, key) || key === 'ui', `Unknown preference: ${key}`);
    check(Array.isArray(pref) && pref.every(b => typeof b === 'string' && Object.hasOwn(table, b)), `Invalid preferences.${key}`);
  }
  if (config.review !== undefined) {
    check(object(config.review), 'review must be an object');
    for (const key of Object.keys(config.review)) check(key === 'allow_multiple', `Unknown review.${key}`);
    check(config.review.allow_multiple === undefined || typeof config.review.allow_multiple === 'boolean', 'review.allow_multiple must be boolean');
  }
  const assignment = config.roles?.[role] || {};
  check(count === 1 || !(opts.model || assignment.model) || opts.backend || assignment.backend, 'A model selection in duo needs an explicit backend; model family is not inferred from its name');
  const needsAuthor = ['reviewer', 'verifier'].includes(role);
  let author = opts['author-backend'];
  if (author === 'self') { check(parent, 'self needs --parent'); author = parent; }
  check(!author || Object.hasOwn(table, author), 'Unknown --author-backend');
  check(!needsAuthor || author || (opts._run && opts.backend), '--author-backend is required for reviewer and verifier');
  const primary = legacy[preset] || (pool.includes(parent) ? parent : pool[0]);
  let backend = opts.backend || assignment.backend;
  const pinned = Boolean(backend);
  const reachable = b => b === parent || available(table[b].adapter);
  if (!backend) {
    const pref = config.preferences?.[opts.kind === 'ui' && role === 'implementer' ? 'ui' : role];
    if (pref !== undefined) check(Array.isArray(pref) && pref.every(b => typeof b === 'string' && Object.hasOwn(table, b)), 'preferences must contain lists of backend IDs');
    backend = pref?.find(b => pool.includes(b) && reachable(b));
    if (backend) why.push('selected a reachable user preference');
    if (!backend && role === 'reviewer' && author) backend = pool.find(b => table[b].family !== table[author].family && reachable(b));
    backend ||= pool.includes(primary) && reachable(primary) ? primary : pool.find(reachable);
    check(backend, 'No allowed executor is available');
  }
  check(Object.hasOwn(table, backend), `Unknown backend ${backend}`);
  // A one-off --backend defines the pool only without an explicit family/mode boundary.
  if (!pool.includes(backend) && !explicitPool && mode === 'auto' && opts.backend) pool = [backend];
  check(pool.includes(backend), `${backend} is outside the allowed families; update --families or the configured pool`);
  const entry = table[backend];
  const native = backend === parent && opts.external !== true;
  const ready = native || available(entry.adapter);
  if (!ready) why.push(`${entry.adapter} CLI is not installed; pinned target retained`);
  const old = assignment[backend];
  const matchingAssignment = !assignment.backend || assignment.backend === backend;
  const configuredModel = (matchingAssignment ? assignment.model : undefined) ?? old?.[0] ?? entry.model;
  const configuredEffort = (matchingAssignment ? assignment.effort : undefined) ?? old?.[1];
  const model = opts.model ?? configuredModel ?? (backend === parent ? opts['parent-model'] : undefined) ?? null;
  const effort = opts.effort ?? configuredEffort ?? null;
  check(model === null || (typeof model === 'string' && model.trim().length > 0), '--model requires a nonempty identifier');
  check(effort === null || (typeof effort === 'string' && effort.length > 0), '--effort requires a value');
  if (effort !== null) {
    const permitted = entry.efforts || (entry.adapter === 'codex' ? ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] : entry.adapter === 'claude' && entry.family === 'claude' ? ['low', 'medium', 'high', 'xhigh', 'max'] : []);
    check(permitted.includes(effort), `${backend} does not declare effort ${effort}; verify model support and configure backends.${backend}.efforts`);
    check(entry.adapter !== 'gemini', 'Gemini CLI has no --effort flag; configure model settings in Gemini');
  }
  if (!native && entry.adapter === 'opencode') check(model && model.includes('/'), 'OpenCode requires an explicit provider/model ID for Kimi/GLM; use --model or a backend model');
  why.push(opts.model ? 'model selected by explicit call' : configuredModel ? 'model selected by user configuration' : model ? 'model supplied by current session' : native ? 'model and unspecified effort inherit from the current session' : 'model and unspecified effort use CLI configuration; actual model is not yet confirmed');
  if (!pinned) why.push('quality first: keep the main senior model; use a smaller model only for bounded extraction with independently checked output');
  const crossFamily = author ? entry.family !== table[author].family : null;
  return { role, preset, mode: effectiveMode, requested_mode: mode, parent, author: author || null, backend, family: entry.family, adapter: entry.adapter,
    model, effort, write: roles[role].write, dispatch: native ? 'native' : 'external', available: ready,
    allowed_backends: pool, cross_family: crossFamily, fresh_context_required: needsAuthor,
    model_source: opts.model ? 'call' : configuredModel ? 'config' : model ? 'parent' : native ? 'inherit' : 'cli-default',
    actual_model: null, recommended_reasoning: ['planner', 'verifier', 'review-lead'].includes(role) ? 'deep' : role === 'researcher' ? 'normal' : 'careful', why };
}
