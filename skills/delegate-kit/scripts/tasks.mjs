import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { home, hash, check, identifier, nonempty, keys, readJSON, atomicJSON, accessOf, loadPreset } from './presets.mjs';
import { admission } from './locks.mjs';
import { createSnapshot, getSnapshot, assertSnapshot, verifySnapshot, contentTree, getEvidence } from './checkpoints.mjs';
import { runCost, usageSummary } from './usage.mjs';

const active = new Set(['prepared', 'starting', 'running', 'permission', 'cancelling', 'orphaned']);
const now = () => new Date().toISOString();
const runs = () => {
  const root = path.join(home(), 'runs');
  return fs.existsSync(root) ? fs.readdirSync(root).flatMap(id => {
    const file = path.join(root, id, 'meta.json'); return fs.existsSync(file) ? [readJSON(file)] : [];
  }) : [];
};
const fileFor = (session, task) => {
  check(nonempty(session), 'Stable session required'); identifier(task, 'task');
  return path.join(home(), 'sessions', hash(session), 'tasks', `${task}.json`);
};
const coordinator = () => check(!process.env.DELEGATE_KIT_DEPTH, 'Task policy is coordinator-owned');
function git(cwd, args, raw = false) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); check(r.status === 0, r.stderr || 'Git failed'); return raw ? r.stdout : r.stdout.trim();
}
const repoIdentity = cwd => fs.realpathSync(path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir'])));
function stringList(value, at, empty = true) {
  check(Array.isArray(value) && (empty || value.length > 0) && value.every(nonempty) && new Set(value).size === value.length, `${at}: expected unique strings`);
}
function relative(value, at) {
  check(nonempty(value) && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..'), `${at}: relative path required`);
}
export function validateContract(c) {
  keys(c, ['version', 'session', 'task', 'repo', 'base', 'specification', 'work_items', 'checks', 'review', 'quality', 'finishing', 'integration_owner', 'trivial', 'baseline'], 'contract');
  if (c.trivial !== undefined) check(typeof c.trivial === 'boolean', 'trivial must be boolean');
  if (c.baseline !== undefined) check(nonempty(c.baseline), 'baseline must describe observed failures or unavailable environment');
  check(c.version === 1, 'Contract version must be 1'); identifier(c.task); check(nonempty(c.session), 'Contract session required');
  check(path.isAbsolute(c.repo || '') && nonempty(c.base), 'Absolute repo and base required');
  const s = c.specification;
  keys(s, ['path', 'digest', 'goal', 'requirements', 'non_goals'], 'specification');
  check(path.isAbsolute(s.path || '') && /^[a-f0-9]{64}$/.test(s.digest) && nonempty(s.goal), 'Specification path, SHA256 digest and goal required');
  check(Array.isArray(s.requirements) && s.requirements.length > 0, 'Requirements required');
  for (const r of s.requirements) { keys(r, ['id', 'text'], 'requirement'); identifier(r.id); check(nonempty(r.text), 'Requirement text required'); }
  const requirementIds = s.requirements.map(r => r.id); stringList(requirementIds, 'requirements'); stringList(s.non_goals, 'non_goals');
  check(Array.isArray(c.checks), 'Checks required');
  for (const q of c.checks) {
    keys(q, ['id', 'requirements', 'argv', 'cwd', 'expected_exit', 'required', 'timeout_ms', 'report', 'before_edit'], 'check');
    if (q.before_edit !== undefined) check(typeof q.before_edit === 'boolean', 'check.before_edit must be boolean');
    check(!q.before_edit || q.report === undefined, 'before_edit is an exit-status smoke check; put test reports on a separate behavioral check');
    identifier(q.id); stringList(q.requirements, 'check.requirements', false);
    check(q.requirements.every(id => requirementIds.includes(id)), 'Unknown check requirement');
    check(Array.isArray(q.argv) && q.argv.length > 0 && q.argv.every(nonempty), 'Check argv required'); relative(q.cwd, 'check.cwd');
    check(Number.isInteger(q.expected_exit) && typeof q.required === 'boolean', 'Check expected_exit and required needed');
    if (q.timeout_ms !== undefined) check(Number.isSafeInteger(q.timeout_ms) && q.timeout_ms > 0, 'Invalid timeout');
    if (q.report !== undefined) {
      keys(q.report, ['path', 'min_tests', 'targets'], 'check.report'); if (q.report.path !== undefined) relative(q.report.path, 'report.path');
      check(Number.isInteger(q.report.min_tests) && q.report.min_tests > 0, 'report.min_tests must be positive');
      if (q.report.targets !== undefined) stringList(q.report.targets, 'report.targets', false);
    }
  }
  const checkIds = c.checks.map(q => q.id); stringList(checkIds, 'checks');
  check(Array.isArray(c.work_items) && c.work_items.length > 0, 'Work items required');
  for (const w of c.work_items) {
    keys(w, ['id', 'required', 'profile', 'routing', 'scope', 'dependencies', 'checks', 'resources', 'max_failed_submissions'], 'work_item');
    identifier(w.id); identifier(w.profile); check(typeof w.required === 'boolean', 'work_item.required needed');
    keys(w.routing, ['defined', 'risk', 'reason'], 'routing');
    check(typeof w.routing.defined === 'boolean' && ['ordinary', 'high'].includes(w.routing.risk) && nonempty(w.routing.reason), 'Explicit routing assessment required');
    keys(w.scope, ['include', 'exclude'], 'scope'); stringList(w.scope.include, 'scope.include', false); stringList(w.scope.exclude, 'scope.exclude');
    [...w.scope.include, ...w.scope.exclude].forEach(p => relative(p, 'scope'));
    stringList(w.dependencies, 'dependencies'); stringList(w.checks, 'work_item.checks');
    check(w.checks.every(id => checkIds.includes(id)), 'Unknown work item check');
    check(Array.isArray(w.resources), 'Resources must be explicit, possibly empty');
    for (const r of w.resources) {
      keys(r, ['name', 'mode', 'capacity'], 'resource'); check(nonempty(r.name) && ['shared', 'exclusive'].includes(r.mode), 'Invalid resource claim');
      if (r.capacity !== undefined) check(Number.isSafeInteger(r.capacity) && r.capacity > 0, 'Resource capacity must be positive');
    }
    stringList(w.resources.map(r => r.name), 'resource names');
    if (w.max_failed_submissions !== undefined) check(Number.isSafeInteger(w.max_failed_submissions) && w.max_failed_submissions > 0, 'Invalid submission limit');
  }
  const itemIds = c.work_items.map(w => w.id); stringList(itemIds, 'work item IDs');
  const visit = (id, seen = []) => {
    check(!seen.includes(id), 'Work item dependency cycle'); const w = c.work_items.find(w => w.id === id);
    check(w, 'Unknown dependency'); w.dependencies.forEach(id => visit(id, [...seen, w.id]));
  }; itemIds.forEach(id => visit(id));
  keys(c.review, ['required', 'profiles', 'coverage'], 'review'); check(typeof c.review.required === 'boolean', 'review.required needed');
  stringList(c.review.profiles, 'review.profiles', c.review.required === false); stringList(c.review.coverage, 'review.coverage');
  check(c.review.coverage.every(id => requirementIds.includes(id)), 'Unknown review coverage');
  if (c.review.required) check(requirementIds.every(id => c.review.coverage.includes(id)), 'Review must cover each requirement');
  stringList(c.quality, 'quality'); stringList(c.finishing, 'finishing');
  check(nonempty(c.integration_owner), 'Integration owner required'); return c;
}
export function readTask(session, task, optional = false) {
  const state = readJSON(fileFor(session, task), null);
  check(optional || state, 'Task contract is not open');
  if (state) check(state.contract.session === session && state.contract.task === task, 'Task namespace mismatch');
  return state;
}
function event(state, kind, payload = {}) {
  const e = { event_version: 1, event_id: randomUUID(), at: now(), kind, task: state.contract.task, parent_session: state.contract.session, contract_revision: state.revision, ...payload };
  state.events.push(e);
}
function save(state) {
  atomicJSON(fileFor(state.contract.session, state.contract.task), state);
  return state;
}
function current(state) {
  check(hash(fs.readFileSync(state.contract.specification.path, 'utf8')) === state.contract.specification.digest, 'Specification changed; revise contract');
}
function ownedRuns(state) {
  const order = new Map(state.events.filter(e => e.kind === 'routing_decided').map((e, i) => [e.run, i]));
  return runs().filter(r => r.parent_session === state.contract.session && r.task === state.contract.task)
    .sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      || a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}
function noWriters(state) { check(!ownedRuns(state).some(r => r.write && active.has(r.status)), 'Writer may still be active; confirm termination'); }
function revision(state, expected) { check(expected === state.revision, 'Contract revision conflict; reload task'); }
export function normalizeContract(input) {
  const c = structuredClone(input);
  c.version ??= 1; c.base ??= 'HEAD'; c.quality ??= []; c.finishing ??= []; c.integration_owner ??= 'coordinator';
  if (c.specification) {
    c.specification.digest ??= hash(fs.readFileSync(c.specification.path, 'utf8'));
    c.specification.non_goals ??= [];
  }
  for (const q of c.checks || []) { q.cwd ??= '.'; q.expected_exit ??= 0; q.required ??= true; }
  for (const w of c.work_items || []) {
    w.required ??= true; w.dependencies ??= []; w.resources ??= []; w.checks ??= [];
    if (w.scope) w.scope.exclude ??= [];
  }
  if (c.review) {
    c.review.required ??= true;
    c.review.coverage ??= (c.specification?.requirements || []).map(r => r.id);
  }
  return c;
}

export function openTask(contract, expected, reason) {
  coordinator(); contract = normalizeContract(contract); validateContract(contract);
  return admission(() => {
    const prior = readTask(contract.session, contract.task, true);
    if (prior) { revision(prior, expected); noWriters(prior); check(nonempty(reason), 'Contract revision needs a reason'); }
    else check(expected === undefined, 'Task disappeared');
    const repo = repoIdentity(contract.repo), base = git(contract.repo, ['rev-parse', `${contract.base}^{commit}`]);
    if (prior) check(prior.repo === repo && prior.base === base, 'Task repo/base is immutable');
    contract.base = base;
    const state = { version: 1, contract, revision: hash(contract), repo, base, created: prior?.created || now(), status: 'unverified',
      events: prior?.events || [], submissions: prior?.submissions || [], escalations: prior?.escalations || [], dispositions: prior?.dispositions || [], checkpoints: prior?.checkpoints || [], evidence: prior?.evidence || [], current_checkpoint: null, exceptions: [] };
    current(state); event(state, 'contract_opened', { reason: reason || null }); return save(state);
  });
}

function boundCheckpoint(state, id) {
  const cp = getSnapshot(id);
  check(cp.session === state.contract.session && cp.task === state.contract.task && cp.repo === state.repo && cp.base === state.base && cp.contract_revision === state.revision && cp.spec_digest === state.contract.specification.digest, 'Checkpoint task/repo/revision binding mismatch');
  return cp;
}

function item(state, id) { const w = state.contract.work_items.find(w => w.id === id); check(w, 'Unknown work item'); return w; }
function failures(state, id, profile) { return state.submissions.filter(s => s.work_item === id && s.profile === profile && s.outcome === 'failed').length; }
function retryDecided(state, id) {
  return state.events.findLastIndex(e => e.kind === 'escalation_decided' && e.work_item === id) > state.events.findLastIndex(e => e.kind === 'solution_submitted' && e.work_item === id);
}
function selectedProfile(state, w) { return state.escalations.filter(e => e.work_item === w.id).at(-1)?.profile || w.profile; }
export function taskOptions(options) {
  const s = readTask(options.session, options.task, true);
  if (!s) return options;
  const checkpoint = options.checkpoint === 'current' ? s.current_checkpoint : options.checkpoint;
  check(options.checkpoint !== 'current' || checkpoint, 'No current checkpoint; run task check first');
  const w = !checkpoint && options.workItem ? item(s, options.workItem) : null;
  return { ...options, checkpoint, agent: options.agent || (w ? selectedProfile(s, w) : undefined) };
}
export function taskBinding(options, preset, profiles) {
  const state = readTask(options.session, options.task, true);
  if (!state) { check(!options.workItem && !options.checkpoint && !profiles.some(id => accessOf(preset.agents[id]) === 'workspace-write'), 'Open a task contract first'); return null; }
  current(state);
  if (options.checkpoint) {
    check(!options.workItem, 'Review binds checkpoint, not work item');
    check(state.current_checkpoint === options.checkpoint, 'Review checkpoint is stale');
    const cp = boundCheckpoint(state, options.checkpoint); assertSnapshot(cp); noWriters(state);
    check(profiles.every(id => preset.agents[id].role === 'reviewer' && accessOf(preset.agents[id]) === 'read-only'), 'Checkpoint requires read-only reviewers');
    check(options.resumeReview || state.contract.review.profiles.every(id => profiles.includes(id)), 'Review set does not cover required profiles');
    return { contract_revision: state.revision, checkpoint: cp.id, review_tree: cp.tree, cwd: cp.cwd, resources: [] };
  }
  const w = item(state, options.workItem);
  check(profiles.length === 1 && profiles[0] === selectedProfile(state, w), 'Profile differs from contract/escalation');
  const agent = preset.agents[profiles[0]];
  const latestSubmission = state.submissions.filter(s => s.work_item === w.id && s.profile === profiles[0] && s.revision === state.revision).at(-1);
  check(!['uncertain', 'capability'].includes(latestSubmission?.outcome) || retryDecided(state, w.id), 'Work item blocked; revise the contract or record a retry decision with task escalate');
  check(failures(state, w.id, profiles[0]) < (w.max_failed_submissions ?? Infinity), 'escalation_required: submission budget exhausted');
  for (const dependency of w.dependencies) {
    const submitted = state.submissions.filter(s => s.work_item === dependency && s.revision === state.revision).at(-1);
    check(submitted?.outcome === 'passed', `Dependency ${dependency} has no submitted result`);
    check(ownedRuns(state).filter(r => r.work_item === dependency).at(-1)?.id === submitted.run, `Dependency ${dependency} has a newer unsatisfied attempt`);
    const tree = contentTree(options.cwd);
    for (const [name, entry] of Object.entries(submitted.changed_entries || {})) check(git(options.cwd, ['ls-tree', tree, '--', name]) === entry, `Dependency ${dependency} result is not integrated: ${name}`);
  }
  if (agent.routing?.tier === 'economy' && accessOf(agent) === 'workspace-write') {
    check(w.routing.defined && w.routing.risk === 'ordinary', 'Economy writer requires defined ordinary-risk work');
    check(w.checks.some(id => state.contract.checks.find(q => q.id === id)?.required), 'Economy writer requires objective checks');
    check(state.contract.review.required && state.contract.review.profiles.length > 0, 'Economy writer requires independent review');
  }
  check(repoIdentity(options.cwd) === state.repo, 'Work item repo mismatch');
  check(!ownedRuns(state).some(r => r.work_item === w.id && active.has(r.status)), 'Work item already active');
  for (const claim of w.resources) {
    const holders = runs().filter(r => active.has(r.status)).flatMap(r => r.resources || []).filter(r => r.name === claim.name);
    check(!holders.some(r => r.mode === 'exclusive') && !(claim.mode === 'exclusive' && holders.length), `Resource ${claim.name} is busy`);
    const capacities = [claim, ...holders].map(r => r.capacity).filter(n => n !== undefined);
    check(!capacities.length || holders.length < Math.min(...capacities), `Resource ${claim.name} capacity reached`);
  }
  for (const r of ownedRuns(state).filter(r => r.write && active.has(r.status) && r.work_item)) {
    const other = item(state, r.work_item);
    const prefix = (a, b) => a === '.' || b === a || b.startsWith(a.replace(/\/$/, '') + '/');
    check(!w.scope.include.some(a => other.scope.include.some(b => prefix(a, b) || prefix(b, a))), 'Active work items have overlapping ownership; narrow scope or serialize the dependency');
  }
  return { contract_revision: state.revision, work_item: w.id, resources: w.resources,
    required_checks: accessOf(agent) === 'workspace-write' ? state.contract.checks.filter(q => q.required && w.checks.includes(q.id)).map(q => q.id) : [],
    preflight: state.contract.checks.filter(q => q.before_edit && w.checks.includes(q.id)),
    initial_tree: ownedRuns(state).find(r => r.work_item === w.id)?.initial_tree || contentTree(options.cwd) };
}
export function assertBoundRun(m) {
  if (!m.contract_revision) return;
  const state = readTask(m.parent_session, m.task); current(state); revision(state, m.contract_revision);
  if (m.checkpoint) { check(state.current_checkpoint === m.checkpoint, 'Stale review checkpoint'); assertSnapshot(boundCheckpoint(state, m.checkpoint)); }
  if (m.work_item) {
    const w = item(state, m.work_item); check(selectedProfile(state, w) === m.profile, 'Executor changed; fresh session required');
    check(failures(state, w.id, m.profile) < (w.max_failed_submissions ?? Infinity), 'escalation_required');
  }
}
export function recordRouting(m) {
  if (!m.contract_revision) return;
  const state = readTask(m.parent_session, m.task); state.status = 'unverified';
  if (m.work_item && state.current_checkpoint) { event(state, 'checkpoint_superseded', { checkpoint: state.current_checkpoint, reason: 'New work item attempt', run: m.id }); state.current_checkpoint = null; }
  event(state, 'routing_decided', { run: m.id, work_item: m.work_item || null, checkpoint: m.checkpoint || null, profile: m.profile, executor: m.executor, preset_digest: m.preset_hash }); save(state);
}
export function submitTask(session, task, expected, workItem, runId, outcome, reason) {
  coordinator(); return admission(() => {
    const state = readTask(session, task); revision(state, expected); current(state); item(state, workItem);
    check(['passed', 'failed', 'infrastructure', 'capability', 'uncertain'].includes(outcome) && nonempty(reason), 'Submission outcome and reason required');
    const r = ownedRuns(state).find(r => r.id === runId); check(r && r.work_item === workItem && r.contract_revision === state.revision && !active.has(r.status), 'Submission requires stopped bound run');
    check(ownedRuns(state).filter(run => run.work_item === workItem).at(-1)?.id === r.id, 'Submit the latest work item run');
    if (outcome === 'passed') check(r.result_validated && r.result?.status === 'done', 'Passed submission requires done result');
    const prior = state.submissions.filter(s => s.run === runId).at(-1);
    if (prior) {
      if (prior.outcome === outcome && prior.reason === reason) return state;
      check(prior.outcome === 'passed' && ['failed', 'capability', 'uncertain'].includes(outcome), 'Conflicting submission');
    }
    let changed_entries = {};
    if (outcome === 'passed') {
      const tree = contentTree(r.cwd), w = item(state, workItem);
      const changes = git(r.cwd, ['diff', '--name-only', '-z', r.initial_tree, tree]).split('\0').filter(Boolean);
      const matches = (name, scope) => scope === '.' || name === scope || name.startsWith(scope.replace(/\/$/, '') + '/');
      check(changes.every(name => w.scope.include.some(scope => matches(name, scope)) && !w.scope.exclude.some(scope => matches(name, scope))), 'Submission changes files outside ownership scope');
      changed_entries = Object.fromEntries(changes.map(name => [name, git(r.cwd, ['ls-tree', tree, '--', name])]));
    }
    const s = { changed_entries, work_item: workItem, run: runId, profile: r.profile, revision: state.revision, outcome, reason, at: now() };
    state.submissions.push(s); state.status = 'unverified';
    if (outcome !== 'passed' && state.current_checkpoint) { event(state, 'checkpoint_superseded', { checkpoint: state.current_checkpoint, reason: 'Submission rejected', run: runId }); state.current_checkpoint = null; } event(state, 'solution_submitted', s); return save(state);
  });
}
export function escalateTask(session, task, expected, workItem, profile, reason) {
  coordinator(); return admission(() => {
    const state = readTask(session, task); revision(state, expected); item(state, workItem); noWriters(state); identifier(profile); check(nonempty(reason), 'Escalation reason required');
    const previousRun = ownedRuns(state).filter(r => r.work_item === workItem).at(-1);
    if (previousRun) check(loadPreset(previousRun.preset).preset.agents[profile], 'Select an already configured profile');
    check(failures(state, workItem, profile) < (item(state, workItem).max_failed_submissions ?? Infinity), 'Selected profile is exhausted');
    const e = { work_item: workItem, profile, reason, at: now(), revision: state.revision }; state.escalations.push(e); event(state, 'escalation_decided', e); return save(state);
  });
}
export function checkpointTask(session, task, expected, cwd) {
  coordinator(); return admission(() => {
    const state = readTask(session, task); revision(state, expected); current(state); noWriters(state);
    check(repoIdentity(cwd) === state.repo, 'Checkpoint repo mismatch');
    for (const w of state.contract.work_items.filter(w => w.required)) {
      const latest = state.submissions.filter(s => s.work_item === w.id && s.revision === state.revision).at(-1);
      check(latest?.outcome === 'passed', `Work item ${w.id} has no successful current submission`);
    }
    if (state.current_checkpoint) {
      const prior = boundCheckpoint(state, state.current_checkpoint);
      if (fs.realpathSync(cwd) === fs.realpathSync(prior.source_cwd) && contentTree(cwd) === prior.tree) {
        assertSnapshot(prior, { source: true }); return prior;
      }
    }
    const cp = createSnapshot({ cwd, base: state.base, specDigest: state.contract.specification.digest, contractRevision: state.revision, session, task, specification: fs.readFileSync(state.contract.specification.path, 'utf8') });
    const expectedEntries = new Map(), visited = new Set();
    const dependsOn = (w, id) => w.dependencies.includes(id) || w.dependencies.some(dep => dependsOn(item(state, dep), id));
    const include = w => {
      if (visited.has(w.id)) return;
      w.dependencies.forEach(id => include(item(state, id))); visited.add(w.id);
      const submitted = state.submissions.filter(s => s.work_item === w.id && s.revision === state.revision).at(-1);
      check(submitted?.outcome === 'passed' && ownedRuns(state).filter(r => r.work_item === w.id).at(-1)?.id === submitted.run, `Work item ${w.id} latest run is not submitted`);
      for (const [name, entry] of Object.entries(submitted.changed_entries || {})) {
        const prior = expectedEntries.get(name);
        check(!prior || dependsOn(w, prior.owner), `Conflicting independent ownership: ${name}`);
        expectedEntries.set(name, { entry, owner: w.id });
      }
    };
    state.contract.work_items.filter(w => w.required).forEach(include);
    for (const [name, { entry, owner }] of expectedEntries) check(git(cp.cwd, ['ls-tree', cp.tree, '--', name]) === entry, `Integrated result differs from submission: ${owner}/${name}`);
    if (state.current_checkpoint) event(state, 'checkpoint_superseded', { checkpoint: state.current_checkpoint, replacement: cp.id });
    state.checkpoints.push(cp.id); state.current_checkpoint = cp.id; state.status = 'unverified'; state.exceptions = [];
    event(state, 'checkpoint_created', { checkpoint: cp.id }); save(state); return cp;
  });
}
export function verifyTask(checkpoint, checkId) {
  coordinator();
  const { cp, q } = admission(() => {
    const cp = getSnapshot(checkpoint), state = readTask(cp.session, cp.task); current(state); noWriters(state);
    revision(state, cp.contract_revision); check(state.current_checkpoint === cp.id, 'Stale checkpoint'); assertSnapshot(cp, { source: true });
    const q = state.contract.checks.find(q => q.id === checkId); check(q, 'Unknown approved check'); return { cp, q };
  });
  const receipt = verifySnapshot(checkpoint, q);
  return admission(() => {
    const state = readTask(cp.session, cp.task); current(state); noWriters(state); revision(state, cp.contract_revision);
    check(state.current_checkpoint === cp.id, 'Checkpoint changed during verification'); assertSnapshot(cp, { source: true });
    state.evidence.push(receipt); state.status = 'unverified'; event(state, 'check_completed', { checkpoint, check: checkId, evidence: receipt.id, status: receipt.status }); save(state); return receipt;
  });
}

export function checkTask(session, task, cwd, { rerun = false, revision: expectedRevision, checkpoint: expectedCheckpoint } = {}) {
  coordinator();
  let state = readTask(session, task); current(state); noWriters(state);
  if (expectedRevision !== undefined) revision(state, expectedRevision);
  if (expectedCheckpoint !== undefined) check(state.current_checkpoint === expectedCheckpoint, 'Checkpoint conflict; reload task');
  const expected = state.revision;
  for (const w of state.contract.work_items) {
    const run = ownedRuns(state).filter(r => r.work_item === w.id && r.contract_revision === expected).at(-1);
    if (run && !state.submissions.some(s => s.run === run.id)) {
      check(run.result_validated && run.result?.status === 'done', `Classify stopped result for ${w.id} with task submit before checking`);
      state = submitTask(session, task, expected, w.id, run.id, 'passed', 'Validated completion collected for checkpoint; acceptance pending checks and review');
    }
  }
  const cp = checkpointTask(session, task, expected, cwd);
  for (const q of state.contract.checks.filter(q => q.required)) {
    state = readTask(session, task);
    const latest = state.evidence.filter(e => e.checkpoint_id === cp.id && e.check_id === q.id).at(-1);
    let reusable = false;
    try { reusable = latest?.status === 'passed' && latest.snapshot_match && hash(getEvidence(latest.id)) === hash(latest)
      && fs.existsSync(latest.stdout_path) && fs.existsSync(latest.stderr_path) && (!q.report || fs.existsSync(latest.report_path)); } catch {}
    if (rerun || !reusable) verifyTask(cp.id, q.id);
  }
  return showTask(session, task);
}

function reviews(state) {
  return ownedRuns(state).filter(r => r.checkpoint === state.current_checkpoint && r.contract_revision === state.revision);
}
function findings(state) {
  return reviews(state).flatMap(r => (r.result?.findings || []).map((f, i) => ({ ...f, id: `${r.id}-${i}`, run: r.id })));
}
export function disposeFinding(session, task, expected, checkpoint, findingId, resolution, reason, authorization, evidence, source) {
  coordinator(); return admission(() => {
    const state = readTask(session, task); revision(state, expected); check(state.current_checkpoint === checkpoint, 'Stale disposition checkpoint');
    check(findings(state).some(f => f.id === findingId), 'Unknown finding');
    check(['refuted', 'fixed', 'accepted', 'needs-decision'].includes(resolution) && nonempty(reason), 'Disposition and reproducible reason required');
    if (resolution === 'accepted') check(nonempty(authorization), 'User authorization evidence required');
    if (resolution === 'refuted') {
      check(Boolean(evidence) !== Boolean(source), 'Refutation requires either a runtime evidence ID or frozen source citation');
      const cp = boundCheckpoint(state, checkpoint); assertSnapshot(cp);
      if (source) {
        keys(source, ['file', 'start', 'end'], 'source citation'); relative(source.file, 'source.file');
        check(Number.isInteger(source.start) && source.start > 0 && Number.isInteger(source.end) && source.end >= source.start, 'Valid source line range required');
        const entry = git(cp.cwd, ['ls-tree', cp.tree, '--', source.file]);
        check(/^100(?:644|755) blob /.test(entry), 'Source citation must name a tracked regular file');
        const text = git(cp.cwd, ['show', `${cp.tree}:${source.file}`], true);
        const lines = text.split('\n'); check(source.end <= lines.length, 'Source citation exceeds file');
        source = { ...source, tree: cp.tree, blob: entry.split(/\s+/)[2], excerpt: lines.slice(source.start - 1, source.end).join('\n') };
      } else {
        const receipt = getEvidence(evidence);
        check(receipt.checkpoint_id === checkpoint && receipt.contract_revision === state.revision && receipt.status === 'passed' && state.evidence.some(e => hash(e) === hash(receipt)), 'Refutation evidence must be a passed current approved check');
      }
    }
    check(resolution !== 'fixed', 'Code fixes require a new checkpoint and fresh checks/review; use refuted only for a demonstrated false finding');
    const d = { source: source || null, evidence: evidence || null, checkpoint, finding: findingId, resolution, reason, authorization: authorization || null, at: now() };
    state.dispositions.push(d); state.status = 'unverified'; event(state, 'finding_disposed', d); return save(state);
  });
}
function acceptanceGaps(state, cp) {
  const gaps = [];
  for (const w of state.contract.work_items.filter(w => w.required)) if (state.submissions.filter(s => s.work_item === w.id && s.revision === state.revision).at(-1)?.outcome !== 'passed') gaps.push(`work_item:${w.id}`);
  for (const q of state.contract.checks.filter(q => q.required)) {
    const e = state.evidence.filter(e => e.checkpoint_id === cp.id && e.check_id === q.id && e.spec_digest === cp.spec_digest && e.contract_revision === state.revision).at(-1);
    let valid = false;
    if (e) {
      try { valid = hash(getEvidence(e.id)) === hash(e) && e.snapshot_match === true && e.status === 'passed' && fs.existsSync(e.stdout_path) && fs.existsSync(e.stderr_path) && (!q.report || fs.existsSync(e.report_path)); } catch {}
    }
    if (!valid) gaps.push(`check:${q.id}`);
  }
  const rs = reviews(state);
  const validReview = r => r && r.role === 'reviewer' && !r.write && r.status === 'finished' && r.result_validated && r.result?.status === 'done' && r.cwd === cp.cwd && r.review_tree === cp.tree && !r.result.not_verified?.length;
  if (state.contract.review.required || !state.contract.trivial) {
    if (!state.contract.review.profiles.length) gaps.push('review:unconfigured');
    for (const profile of state.contract.review.profiles) {
      const r = rs.filter(r => r.profile === profile).at(-1);
      if (!validReview(r)) { gaps.push(`review:${profile}`); continue; }
      for (const member of r.required_profiles) if (!validReview(rs.filter(other => other.group === r.group && other.profile === member).at(-1))) gaps.push(`review:${member}`);
    }
  }
  for (const f of findings(state)) {
    if (f.kind === 'nit') continue;
    const d = state.dispositions.filter(d => d.checkpoint === cp.id && d.finding === f.id).at(-1);
    if (d?.resolution !== 'refuted') gaps.push(`finding:${f.id}`);
  }
  return [...new Set(gaps)];
}
export function acceptTask(session, task, expected, checkpoint, authorization) {
  coordinator(); return admission(() => {
    const state = readTask(session, task); revision(state, expected); current(state); noWriters(state);
    check(state.current_checkpoint === checkpoint, 'Accept the current checkpoint'); const cp = boundCheckpoint(state, checkpoint); assertSnapshot(cp, { source: true });
    check(!runs().some(r => r.write && active.has(r.status) && r.cwd === cp.source_cwd), 'Source workspace has an active writer');
    check(!reviews(state).some(r => active.has(r.status)), 'Required review still active');
    const gaps = acceptanceGaps(state, cp);
    const dispositionsAuthorize = gaps.length > 0 && gaps.every(g => g.startsWith('finding:') && state.dispositions.filter(d => d.checkpoint === checkpoint && d.finding === g.slice(8)).at(-1)?.authorization);
    check(!gaps.length || nonempty(authorization) || dispositionsAuthorize, `Task unverified: ${gaps.join(', ')}`);
    const status = gaps.length ? 'accepted_with_exceptions' : 'verified';
    if (state.status === status && state.accepted_checkpoint === checkpoint) return state;
    state.status = status; state.accepted_checkpoint = checkpoint; state.accepted_at = now(); state.exceptions = gaps; state.authorization = authorization || null;
    event(state, 'task_accepted', { checkpoint, status, exceptions: gaps, authorization: authorization || null }); return save(state);
  });
}
export function showTask(session, task) {
  const state = readTask(session, task); let stale = null;
  try { current(state); check(!ownedRuns(state).some(r => active.has(r.status)), 'Task has active runs'); if (state.current_checkpoint) assertSnapshot(getSnapshot(state.current_checkpoint), { source: true }); } catch (e) { stale = e.message; }
  const gaps = state.current_checkpoint ? acceptanceGaps(state, boundCheckpoint(state, state.current_checkpoint)) : ['checkpoint:missing'];
  return { ...state, status: stale || state.status === 'verified' && gaps.length ? 'unverified' : state.status, stale, gaps, findings: findings(state),
    work_items: state.contract.work_items.map(w => {
      const profile = selectedProfile(state, w), count = failures(state, w.id, profile);
      const outcome = state.submissions.filter(s => s.work_item === w.id && s.revision === state.revision).at(-1)?.outcome || null;
      return { id: w.id, profile, latest_run: ownedRuns(state).filter(r => r.work_item === w.id).at(-1)?.id || null, outcome, failures: count,
        reconsider: count >= 2 && outcome === 'failed' && !retryDecided(state, w.id), escalation_required: count >= (w.max_failed_submissions ?? Infinity) };
    }) };
}
export function taskSummary(session, task) {
  if (!readTask(session, task, true)) return { status: 'standalone_read_only' };
  const s = showTask(session, task); return { status: s.status, revision: s.revision, checkpoint: s.current_checkpoint, stale: s.stale };
}
export function taskReport(session, task) {
  const s = showTask(session, task), rr = ownedRuns(s), costs = rr.map(r => r.cost_usd);
  return { task, session, status: s.status, submissions: s.submissions.length, corrections: s.submissions.filter(s => s.outcome === 'failed').length,
    escalations: s.escalations.length, findings: findings(s).length, accepted_first_submission: s.status === 'verified' && s.contract.work_items.every(w => s.submissions.filter(s => s.work_item === w.id).length === 1),
    wall_clock_ms: ['verified', 'accepted_with_exceptions'].includes(s.status) && s.accepted_at ? Date.parse(s.accepted_at) - Date.parse(s.created) : null,
    observed_run_cost_usd: costs.some(n => n !== null && n !== undefined) ? costs.reduce((sum, n) => sum + (n ?? 0), 0) : null,
    cost_complete: false, cost_source: 'Legacy sum of shell-reported values, including estimates; use accounting.by_billing. Coordinator not measured.', human_repair_time: null, late_regressions: null,
    accounting: usageSummary(rr),
    profiles: rr.map(r => ({ profile: r.profile, run: r.id, requested: r.executor, confirmed_model: r.actual_model, usage: r.usage, cost_usd: r.cost_usd, cost: runCost(r) })) };
}

export function boundContext(m) {
  if (!m.contract_revision) return '';
  const s = readTask(m.parent_session, m.task);
  const work = m.work_item ? item(s, m.work_item) : null;
  const checks = work ? s.contract.checks.filter(q => work.checks.includes(q.id)) : s.contract.checks;
  const spec = s.contract.specification;
  // A pointer outside the worktree is not sufficient: e.g. OpenCode denies
  // external_directory. Supply the exact source once rather than silently losing
  // interfaces/constraints that cannot be inferred from check-to-requirement links.
  const fullText = fs.readFileSync(m.checkpoint ? getSnapshot(m.checkpoint).spec_path : spec.path, 'utf8');
  check(hash(fullText) === spec.digest, 'Specification changed before dispatch');
  return JSON.stringify({ specification: { ...spec, content: fullText }, quality: s.contract.quality,
    ...(work ? { work_item: work, dependencies: s.contract.work_items.filter(w => work.dependencies.includes(w.id)).map(w => ({ id: w.id, scope: w.scope })) } : { review: s.contract.review }), checks, finishing: s.contract.finishing });
}

export function recordCompletion(m) {
  if (!m.contract_revision) return;
  const state = readTask(m.parent_session, m.task);
  if (state.events.some(e => e.run === m.id && ['review_completed', 'run_completed'].includes(e.kind))) return;
  state.status = 'unverified';
  event(state, m.checkpoint ? 'review_completed' : 'run_completed', { run: m.id, work_item: m.work_item || null, checkpoint: m.checkpoint || null, profile: m.profile,
    status: m.status, requested_model: m.executor.model ?? null, confirmed_model: m.actual_model ?? null, usage: m.usage, cost_usd: m.cost_usd,
    finding_classes: (m.result?.findings || []).map(f => f.kind), duration_ms: m.started ? Date.parse(m.finished) - Date.parse(m.started) : null });
  save(state);
}
