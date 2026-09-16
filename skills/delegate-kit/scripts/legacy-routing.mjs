// Model identifiers belong to the host or user configuration, never to role policy.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validateLimits } from './limits.mjs';

export const roles = Object.fromEntries(['planner', 'implementer', 'reviewer', 'verifier', 'researcher', 'review-lead'].map(role => [role, { write: role === 'implementer' }]));
export const defaults = {
  codex: { family: 'gpt', adapter: 'codex' },
  claude: { family: 'claude', adapter: 'claude' },
  gemini: { family: 'gemini', adapter: 'gemini' },
  kimi: { family: 'kimi', adapter: 'opencode' },
  glm: { family: 'glm', adapter: 'opencode' },
};
const adapters = ['codex', 'claude', 'gemini', 'opencode'];
const runners = ['auto', 'native', ...adapters];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const identifier = value => typeof value === 'string' && /^[a-z][a-z0-9_-]*$/.test(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const candidateKeys = ['model', 'effort', 'family', 'runner', 'backend', 'efforts'];
const isCandidate = value => candidateKeys.some(key => Object.hasOwn(value, key));
const defaultEfforts = (adapter, family) => adapter === 'codex' ? ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
  : adapter === 'claude' && family === 'claude' ? ['low', 'medium', 'high', 'xhigh', 'max'] : [];
export function readConfig(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  let config;
  try { config = JSON.parse(text); } catch { throw new Error(`Invalid JSON in ${file}; fix it before routing`); }
  validateConfig(config);
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
function validateCandidate(candidate, location, table) {
  check(object(candidate), `${location} must be an object`);
  for (const key of Object.keys(candidate)) check(candidateKeys.includes(key), `Unknown ${location}.${key}`);
  for (const key of ['model', 'effort']) check(candidate[key] === undefined || nonempty(candidate[key]), `Invalid ${location}.${key}`);
  check(candidate.family === undefined || identifier(candidate.family), `Invalid ${location}.family`);
  check(candidate.runner === undefined || runners.includes(candidate.runner), `Invalid ${location}.runner`);
  check(candidate.backend === undefined || Object.hasOwn(table, candidate.backend), `Unknown ${location}.backend`);
  check(candidate.efforts === undefined || (Array.isArray(candidate.efforts) && candidate.efforts.every(nonempty)), `Invalid ${location}.efforts`);
  if (candidate.backend && candidate.family) check(table[candidate.backend].family === candidate.family, `${location}.family conflicts with backend`);
  if (candidate.efforts && candidate.effort) check(candidate.efforts.includes(candidate.effort), `${location} does not declare effort ${candidate.effort}`);
  // Explicit external transports have static restrictions, even in inactive profiles.
  if (adapters.includes(candidate.runner)) {
    const entry = table[candidate.backend];
    const family = candidate.family ?? entry?.family;
    const model = candidate.model ?? entry?.model;
    if (candidate.runner === 'opencode' && model) check(model.includes('/'), `${location}: OpenCode requires provider/model`);
    if (candidate.effort) {
      check(candidate.runner !== 'gemini', `${location}: Gemini CLI has no --effort flag`);
      const permitted = candidate.efforts ?? entry?.efforts ?? defaultEfforts(candidate.runner, family);
      // An omitted family depends on the current parent; resolve checks it later.
      if (family || candidate.runner !== 'claude' || candidate.efforts || entry?.efforts) check(permitted.includes(candidate.effort), `${location} does not declare effort ${candidate.effort}`);
    }
  }
}
function validateRoles(assignments, location, table) {
  check(assignments === undefined || object(assignments), `${location} must be an object`);
  for (const [name, assignment] of Object.entries(assignments || {})) {
    check(Object.hasOwn(roles, name), `Unknown role: ${name}`);
    const at = `${location}.${name}`;
    if (Array.isArray(assignment)) {
      check(assignment.length > 0, `${at} must be a nonempty candidate list`);
      assignment.forEach((candidate, index) => validateCandidate(candidate, `${at}[${index}]`, table));
    } else {
      check(object(assignment), `${at} must be an object or nonempty candidate list`);
      if (isCandidate(assignment)) validateCandidate(assignment, at, table);
      else for (const [backend, pair] of Object.entries(assignment)) {
        check(Object.hasOwn(table, backend) && Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === 'string'), `Invalid legacy ${at}.${backend}`);
      }
    }
  }
}
function validateConfig(config) {
  check(object(config), 'config.json must contain an object');
  for (const key of Object.keys(config)) check(['mode', 'backends', 'families', 'roles', 'profiles', 'preferences', 'review', 'preset', 'limits'].includes(key), `Unknown config key: ${key}`);
  const table = backendTable(config);
  check(config.mode === undefined || ['auto', 'solo', 'duo'].includes(config.mode), 'mode must be auto, solo or duo');
  check(config.preset === undefined || ['auto', 'main-claude', 'main-codex', 'main-gpt'].includes(config.preset), 'Unknown preset');
  check(config.families === undefined || (Array.isArray(config.families) && config.families.length > 0 && config.families.every(b => typeof b === 'string' && Object.hasOwn(table, b))), 'families must list backend IDs');
  validateRoles(config.roles, 'roles', table);
  check(config.profiles === undefined || object(config.profiles), 'profiles must be an object');
  for (const [name, profile] of Object.entries(config.profiles || {})) {
    check(identifier(name) && object(profile), `Invalid profile ${name}`);
    for (const key of Object.keys(profile)) check(key === 'roles', `Unknown profiles.${name}.${key}`);
    validateRoles(profile.roles, `profiles.${name}.roles`, table);
  }
  check(config.preferences === undefined || object(config.preferences), 'preferences must be an object');
  for (const [key, pref] of Object.entries(config.preferences || {})) {
    check(Object.hasOwn(roles, key) || key === 'ui', `Unknown preference: ${key}`);
    check(Array.isArray(pref) && pref.every(b => typeof b === 'string' && Object.hasOwn(table, b)), `Invalid preferences.${key}`);
  }
  if (config.review !== undefined) {
    check(object(config.review), 'review must be an object');
    for (const key of Object.keys(config.review)) check(key === 'allow_multiple', `Unknown review.${key}`);
    check(config.review.allow_multiple === undefined || typeof config.review.allow_multiple === 'boolean', 'review.allow_multiple must be boolean');
  }
  validateLimits(config.limits);
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
  const table = validateConfig(config);
  const role = opts.role;
  check(Object.hasOwn(roles, role), `--role must be one of ${Object.keys(roles).join('|')}`);
  const parent = parentOf(opts, env);
  check(!parent || Object.hasOwn(table, parent), `Unknown parent backend: ${parent}`);
  const parentFamily = table[parent]?.family;
  const profile = opts.profile ?? (Object.hasOwn(config.profiles || {}, parentFamily) ? parentFamily : null);
  check(profile === null || (typeof profile === 'string' && Object.hasOwn(config.profiles || {}, profile)), `Unknown profile: ${profile}`);
  const assignments = { ...config.roles, ...config.profiles?.[profile]?.roles };
  const fallbackRole = { verifier: 'reviewer', 'review-lead': 'planner' }[role];
  const assignment = assignments[role] ?? assignments[fallbackRole] ?? {};
  const ladder = Array.isArray(assignment) ? assignment : [assignment];
  const level = opts.level === undefined ? 1 : Number(opts.level);
  check((typeof opts.level === 'string' || typeof opts.level === 'number' || opts.level === undefined) && Number.isSafeInteger(level) && level >= 1 && level <= ladder.length, `--level must be between 1 and ${ladder.length}`);
  let candidate = isCandidate(ladder[level - 1]) ? ladder[level - 1] : {};
  const mode = opts.mode || env.DELEGATE_KIT_MODE || config.mode || 'auto';
  check(['auto', 'solo', 'duo'].includes(mode), '--mode must be auto, solo or duo');
  const preset = opts.preset || env.DELEGATE_KIT_PRESET || config.preset || 'auto';
  const legacy = { 'main-claude': 'claude', 'main-codex': 'codex', 'main-gpt': 'codex' };
  check(preset === 'auto' || legacy[preset], 'Unknown preset; use auto, main-claude or main-codex');
  check(opts.backend === undefined || Object.hasOwn(table, opts.backend), `Unknown backend ${opts.backend}`);
  check(opts.family === undefined || identifier(opts.family), '--family requires a family identifier');
  check(opts.runner === undefined || runners.includes(opts.runner), '--runner must be auto, native, codex, claude, gemini or opencode');
  const candidateFamily = value => value.family ?? table[value.backend]?.family ?? parentFamily;
  // A call selecting another executor must not carry model pins from the old one.
  if ((opts.backend && ((candidate.backend && candidate.backend !== opts.backend) || candidateFamily(candidate) !== table[opts.backend].family)) ||
      (opts.family && candidateFamily(candidate) !== opts.family) ||
      (opts.model && !opts.family && !opts.backend && candidateFamily(candidate) !== parentFamily)) candidate = {};
  let family = opts.family ?? table[opts.backend]?.family ?? candidateFamily(candidate);
  let backend = opts.backend ?? candidate.backend;
  const explicitModel = opts.model !== undefined;
  if (explicitModel && !opts.family && !opts.backend) family = parentFamily;
  if (opts.backend && opts.family) check(table[opts.backend].family === opts.family, '--family conflicts with --backend');
  const runner = opts.runner ?? candidate.runner ?? 'auto';
  check(!(runner === 'native' && opts.external === true), 'runner native requires the host native tool; agent-run run cannot execute it externally');
  let nativeFamilies = opts['native-families'] === undefined ? [parentFamily].filter(Boolean) : String(opts['native-families']).split(',');
  check(nativeFamilies.every(identifier), '--native-families must list family identifiers');
  if (opts['no-native'] === true) nativeFamilies = [];
  const canNative = f => Boolean(parent && nativeFamilies.includes(f));
  const forceExternal = opts.external === true || adapters.includes(runner);
  let pool = opts.families === undefined ? config.families : String(opts.families).split(',');
  const explicitPool = pool !== undefined;
  if (explicitPool) check(Array.isArray(pool) && pool.length > 0 && pool.every(b => typeof b === 'string' && Object.hasOwn(table, b)), 'families must list backend IDs');
  const modern = profile !== null || Object.values(assignments).some(value => Array.isArray(value) || value.family !== undefined || value.runner !== undefined) || opts.family !== undefined || opts.runner !== undefined;
  let allowedFamilies;
  if (explicitPool) allowedFamilies = pool.map(b => table[b].family);
  else if (modern) {
    allowedFamilies = [parentFamily];
    if (mode !== 'solo') {
      for (const value of Object.values(assignments)) {
        for (const item of Array.isArray(value) ? value : [value]) {
          if (isCandidate(item)) allowedFamilies.push(candidateFamily(item));
        }
      }
    }
    if (mode === 'auto') allowedFamilies.push(family);
    pool = Object.keys(table).filter(b => allowedFamilies.includes(table[b].family));
  } else {
    pool = [(mode === 'auto' ? backend : null) || legacy[preset] || parent].filter(Boolean);
    allowedFamilies = pool.map(b => table[b].family);
  }
  allowedFamilies = [...new Set(allowedFamilies.filter(Boolean))];
  pool = [...new Set(pool)];
  check(allowedFamilies.length > 0, 'No current host detected; pass --parent or --backend (no JSON needed)');
  const count = allowedFamilies.length;
  check(mode !== 'solo' || count === 1, 'solo requires exactly one family');
  check(mode !== 'duo' || count === 2, 'duo requires two families; pass --families backend-a,backend-b');
  const effectiveMode = count === 1 ? 'solo' : count === 2 ? 'duo' : 'mixed';
  const why = [`${effectiveMode}: ${allowedFamilies.join(', ')}`];
  const needsAuthor = ['reviewer', 'verifier'].includes(role);
  let author = opts['author-backend'];
  if (author === 'self') { check(parent, 'self needs --parent'); author = parent; }
  check(!author || Object.hasOwn(table, author), 'Unknown --author-backend');
  check(!needsAuthor || author || (opts._run && opts.backend), '--author-backend is required for reviewer and verifier');
  const pinned = backend || Array.isArray(assignment) || isCandidate(candidate) || opts.family || opts.runner || explicitModel;
  const reachable = b => (!forceExternal && canNative(table[b].family)) || available(table[b].adapter);
  if (!backend && !pinned) {
    const pref = config.preferences?.[opts.kind === 'ui' && role === 'implementer' ? 'ui' : role];
    backend = pref?.find(b => pool.includes(b) && reachable(b));
    if (backend) why.push('selected a reachable user preference');
    if (!backend && role === 'reviewer' && author) backend = pool.find(b => table[b].family !== table[author].family && reachable(b));
    const primary = legacy[preset] || (pool.includes(parent) ? parent : pool[0]);
    backend ||= pool.includes(primary) && reachable(primary) ? primary : pool.find(reachable);
    check(backend, 'No allowed executor is available');
    family = table[backend].family;
  }
  backend ||= Object.keys(table).find(b => table[b].family === family && (!adapters.includes(runner) || table[b].adapter === runner)) ||
    Object.keys(table).find(b => table[b].family === family) || family;
  check(allowedFamilies.includes(family) && (!explicitPool || pool.includes(backend)), `${backend} is outside the allowed families; update --families or the configured pool`);
  const entry = table[backend] || {};
  const native = !forceExternal && canNative(family);
  check(runner !== 'native' || native, `Native execution is unavailable for family ${family}; declare host support with --native-families`);
  const externalAdapter = adapters.includes(runner) ? runner : entry.adapter;
  const adapter = native ? table[parent].adapter : externalAdapter;
  check(adapter, `No external runner configured for family ${family}; set runner or backend`);
  const ready = native || available(adapter);
  if (!ready) why.push(`${adapter} CLI is not installed; pinned target retained`);
  const old = !Array.isArray(assignment) && !isCandidate(assignment) ? assignment[backend] : undefined;
  const configuredModel = candidate.model ?? old?.[0] ?? entry.model;
  const configuredEffort = candidate.effort ?? old?.[1];
  const model = opts.model ?? configuredModel ?? (native && family === parentFamily ? opts['parent-model'] : undefined) ?? null;
  const effort = opts.effort ?? configuredEffort ?? null;
  check(model === null || nonempty(model), '--model requires a nonempty identifier');
  check(effort === null || nonempty(effort), '--effort requires a value');
  if (effort !== null) {
    const permitted = candidate.efforts || entry.efforts || defaultEfforts(adapter, family);
    check(permitted.includes(effort), `${backend} does not declare effort ${effort}; verify model support and configure candidate.efforts or backends.${backend}.efforts`);
    check(native || adapter !== 'gemini', 'Gemini CLI has no --effort flag; configure model settings in Gemini');
  }
  if (!native && adapter === 'opencode') check(model && model.includes('/'), 'OpenCode requires an explicit provider/model ID for Kimi/GLM; use --model or a backend model');
  why.push(explicitModel ? 'model selected by explicit call' : configuredModel ? 'model selected by user configuration' : model ? 'model supplied by current session' : native ? 'model and unspecified effort inherit from the current session' : 'model and unspecified effort use CLI configuration; actual model is not yet confirmed');
  return { role, preset, mode: effectiveMode, requested_mode: mode, parent, author: author || null, backend, family, adapter, external_adapter: externalAdapter ?? null,
    profile, level, levels: ladder.length, candidates: ladder, runner, native_required: runner === 'native',
    model, effort, write: roles[role].write, dispatch: native ? 'native' : 'external', available: ready,
    allowed_backends: pool, allowed_families: allowedFamilies, cross_family: author ? family !== table[author].family : null, fresh_context_required: needsAuthor,
    model_source: explicitModel ? 'call' : configuredModel ? 'config' : model ? 'parent' : native ? 'inherit' : 'cli-default',
    actual_model: null, recommended_reasoning: ['planner', 'verifier', 'review-lead'].includes(role) ? 'deep' : role === 'researcher' ? 'normal' : 'careful', why };
}
