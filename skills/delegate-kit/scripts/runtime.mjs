import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { home, check, identifier, hash, readJSON, atomicJSON, context, reviewSet, accessOf } from './presets.mjs';
import { resolveLimits } from './limits.mjs';
import { budget } from './budget.mjs';
import { admission, repositoryAdmission, alive } from './locks.mjs';
import { resolveExecutor } from './executors.mjs';
import { buildCommand, codexSandboxConfig, extractResult, validate } from './adapters.mjs';
import { inspectPermissions, mergeInline } from './opencode-permissions.mjs';
import { rpcCommand, rpcTurn, ompConfig } from './rpc.mjs';
import { resultSchema, checkResultCoverage } from './results.mjs';
import { runCost, usageSummary } from './usage.mjs';
import { contentTree } from './checkpoints.mjs';
import { taskOptions, taskBinding, assertBoundRun, recordRouting, taskSummary, boundContext, recordCompletion } from './tasks.mjs';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const active = ['prepared', 'starting', 'running', 'permission', 'cancelling', 'orphaned'];
const terminal = ['finished', 'failed', 'cancelled', 'timeout', 'blocked'];
const now = () => new Date().toISOString();
function diagnostic(message) {
  let text = String(message);
  for (const [key, value] of Object.entries(process.env)) {
    if (/(?:TOKEN|SECRET|PASSWORD|API_KEY)$/i.test(key) && value?.length >= 8) text = text.split(value).join('[redacted]');
  }
  return text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const dir = id => path.join(home(), 'runs', identifier(id, 'run'));
const metaFile = id => path.join(dir(id), 'meta.json');
export const getRun = id => { const m = readJSON(metaFile(id)); check(m.schema_version === 2, `Unsupported saved run format: ${id}`); return m; };
const save = m => atomicJSON(metaFile(m.id), m);
function allRuns() {
  const root = path.join(home(), 'runs');
  return fs.existsSync(root) ? fs.readdirSync(root).flatMap(id => { const f = path.join(root, id, 'meta.json'); return fs.existsSync(f) ? [readJSON(f)] : []; }) : [];
}
export function fingerprint(pid) {
  if (!alive(pid)) return null;
  const r = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}
function sameProcess(pid, stamp) { return Boolean(stamp && fingerprint(pid) === stamp); }
function groupAlive(pid) {
  if (!pid) return false;
  const r = spawnSync('ps', ['-eo', 'pid=,pgid=,stat='], { encoding: 'utf8' });
  check(r.status === 0, 'Cannot verify process group termination; ownership retained');
  return r.stdout.split('\n').some(line => { const [, group, state] = line.trim().split(/\s+/); return Number(group) === pid && state && !state.startsWith('Z'); });
}
function signal(m, value) {
  if (sameProcess(m.child_pid, m.child_fingerprint)) {
    try { process.kill(-m.child_pid, value); } catch (e) { if (e.code !== 'ESRCH') throw e; }
  } else check(!groupAlive(m.child_pid), 'Process identity cannot be verified; ownership retained for manual recovery');
}

function workspace(cwd, write) {
  cwd = fs.realpathSync(cwd || process.cwd());
  if (!write) return { owner: 'delegate-kit', path: cwd };
  const r = git(cwd, ['rev-parse', '--absolute-git-dir']);
  const common = git(cwd, ['rev-parse', '--git-common-dir']);
  check(r.status === 0 && common.status === 0, 'Writer needs an isolated Git worktree');
  const gitDir = r.stdout.trim();
  check(fs.realpathSync(gitDir) !== fs.realpathSync(path.resolve(cwd, common.stdout.trim())), 'Writer must use a linked worktree; create it with agent-wt');
  return { owner: 'delegate-kit', path: cwd, lock: path.join(gitDir, 'delegate-kit.lock') };
}
function reserveWriter(m) {
  if (!m.write) return;
  const file = m.workspace.lock, existing = readJSON(file, null);
  // An unknown owner is never stolen. Release through the original runtime.
  check(!existing, `Worktree already owned by ${existing?.id}; inspect and release the previous owner first`);
  atomicJSON(file, { id: m.id, kind: 'v2', cwd: m.cwd, role: m.role, since: now() });
}
function releaseWriter(m) {
  if (m.workspace?.lock && readJSON(m.workspace.lock, null)?.id === m.id) fs.rmSync(m.workspace.lock);
}
function counts(cwd) {
  const runs = allRuns().filter(r => active.includes(r.status));
  const result = { workers: runs.length, writers: runs.filter(r => r.write).length };
  if (cwd) {
    const common = git(cwd, ['rev-parse', '--git-common-dir']);
    if (common.status === 0) {
      const trees = path.join(path.resolve(cwd, common.stdout.trim()), 'worktrees');
      for (const name of fs.existsSync(trees) ? fs.readdirSync(trees) : []) {
        const lock = readJSON(path.join(trees, name, 'delegate-kit.lock'), null);
        if (lock && !runs.some(r => r.id === lock.id)) { result.workers++; result.writers++; }
      }
    }
  }
  return result;
}
function enforceCaps(caps, existing, additions) {
  for (const name of ['workers', 'writers']) check(caps[name] === null || existing[name] + additions[name] <= caps[name], `Explicit max ${caps[name]} ${name} reached; required set was not partially admitted`);
}
function promptFor(m, brief) {
  const instruction = m.agent.instructions || '';
  const taskContext = boundContext(m);
  const extraBrief = m.contract_revision && JSON.parse(taskContext).specification.content === brief ? '' : brief;
  const verification = m.write ? 'Before editing, establish that the assigned checks can run using your actual tools, environment and permissions. If they cannot, stop with blocked and the specific missing capability. Start authorized local test services when needed; use distinct resources and stop only processes you own. For bug fixes, establish a reproduction or concrete evidence of the cause before editing. Run every assigned mandatory check on your final changes; done requires all check_results passed. Optional caveats remain in not_verified.' : '';
  return `You own one bounded task as ${m.role}. Delegation depth is one. Access: ${m.executor.access}. Workspace: ${m.cwd || m.workspace.id}. Preserve other people's changes. Perform only authorized finishing actions.\n${instruction}\nTask contract: ${taskContext}\n${m.checkpoint ? `Review frozen checkpoint ${m.checkpoint} in ${m.cwd}; contract revision ${m.contract_revision}. The complete frozen specification is included in the contract above. This binding overrides paths in the brief.` : ''}\n\n${extraBrief}\n\nReturn one JSON object matching this schema. Include evidence and distinguish unverified work. ${verification} Do not claim acceptance on behalf of the coordinator.\n${JSON.stringify(resultSchema(m.agent, m.required_checks))}`;
}
export function prepare(options) {
  check(!process.env.DELEGATE_KIT_DEPTH, 'Worker cannot delegate (depth is one)');
  check(options.session, 'prepare requires a saved --session handle');
  identifier(options.task, 'task');
  options = taskOptions(options);
  const selected = context({ session: options.session, preset: options.preset, taskOnly: options.taskOnly });
  const p = selected.preset;
  const id = options.agent || p.defaults?.[options.role];
  check(id && Object.hasOwn(p.agents, id), 'Select an explicit profile or a configured role default from the active catalog');
  const ids = reviewSet(p, id);
  const brief = options.brief ? fs.readFileSync(options.brief, 'utf8') : options.workItem || options.checkpoint ? 'Complete the assigned work from the task contract. Report evidence and any unresolved questions.' : ''; check(brief.trim(), 'Provide a brief or a bound work item/checkpoint');
  const caps = resolveLimits(options.limits || {}, p);
  check(options.stallMs === undefined || Number.isSafeInteger(options.stallMs) && options.stallMs > 0, 'stallMs must be a positive integer');
  const binding = taskBinding(options, p, ids);
  if (binding?.cwd) options = { ...options, cwd: binding.cwd };
  const group = randomUUID();
  const rows = ids.map(profile => {
    const agent = p.agents[profile];
    const executor = resolveExecutor(agent, options.capabilities || [], h => spawnSync('which', [h], { stdio: 'ignore' }).status === 0);
    if (binding?.required_checks?.length && executor.transport === 'cli') {
      check(executor.harness !== 'pi' && (executor.harness !== 'omp' || executor.permissions?.shell === true), `${executor.harness}: assigned checks require command execution; configure a supported writer before implementation`);
    }
    const ws = workspace(options.cwd, accessOf(agent) === 'workspace-write');
    const run = randomUUID();
    return { ...binding, schema_version: 2, id: run, parent_session: options.session, task: options.task,
      budget_task: hash(`${options.session}\0${options.task}`), preset: p.id, preset_hash: selected.revision,
      profile, agent, executor, workspace: ws, cwd: ws.path, write: accessOf(agent) === 'workspace-write', role: agent.role,
      limits: caps, timeout_ms: options.timeoutMs || null, stall_ms: options.stallMs ?? 300000, group, required_profiles: ids, status: 'prepared', created: now(), resume_of: null, attempt_sequence: 1,
      host_attached: false, execution_started_at: null, launch_registration_pending: false, transport_session_id: null, transport_session_file: null, actual_model: null, usage: null, cost_usd: null,
      result_validated: false, attempt_kind: 'fresh', pid: null };
  });
  return admission(() => repositoryAdmission(rows.find(m => m.write && m.workspace.owner === 'delegate-kit')?.cwd, () => {
    check(hash(taskBinding(options, p, ids)) === hash(binding), 'Task binding changed during prepare; retry with current contract');
    enforceCaps(caps, counts(rows[0].workspace.owner === 'delegate-kit' ? rows[0].cwd : null), { workers: rows.length, writers: rows.filter(m => m.write).length });
    const before = budget({ stateDir: home(), task: rows[0].budget_task, limits: caps });
    check(caps.runs === null || before.runs + rows.length <= caps.runs, `Required review set exceeds max ${caps.runs} runs`);
    const reserved = [];
    try {
      // Burn attempt budget before any dispatchable metadata is published. A
      // crash may conservatively consume an attempt, but can never create an
      // uncounted prepared run that launch would accept.
      for (const m of rows) m.budget = budget({ stateDir: home(), task: m.budget_task, record: true, limits: caps });
      for (const m of rows) {
        reserveWriter(m); reserved.push(m);
        atomicJSON(path.join(dir(m.id), 'preset.snapshot.json'), p);
        atomicJSON(path.join(dir(m.id), 'result.schema.json'), resultSchema(m.agent, m.required_checks));
        fs.writeFileSync(path.join(dir(m.id), 'prompt.md'), promptFor(m, brief), { mode: 0o600 });
        save(m);
      }
      for (const m of rows) recordRouting(m);
    } catch (error) {
      for (const m of reserved) { m.status = 'failed'; m.error = error.message; save(m); releaseWriter(m); }
      throw error;
    }
    return { group, runs: rows.map(compact) };
  }));
}
export function compact(m) {
  const { capability, ...executor } = m.executor;
  return { id: m.id, parent_session: m.parent_session, task: m.task, preset: m.preset, profile: m.profile, role: m.role, write: m.write,
    executor: { ...executor, ...(capability ? { host: capability.host, version: capability.version } : {}) }, status: m.status, attempt_kind: m.attempt_kind, resume_of: m.resume_of, attempt_sequence: m.attempt_sequence || null,
    dispatch_token: m.claim || null, transport_session_id: m.transport_session_id, workspace: m.workspace, actual_model: m.actual_model,
    launch_registration_pending: Boolean(m.launch_registration_pending),
    result_validated: m.result_validated, result: m.result || null, error: m.error || null,
    work_item: m.work_item || null, checkpoint: m.checkpoint || null, contract_revision: m.contract_revision || null,
    task_result: taskSummary(m.parent_session, m.task), group: m.group, required_profiles: m.required_profiles, created: m.created, started: m.started || null, execution_started: executionStarted(m), execution_started_at: m.execution_started_at || null, finished: m.finished || null,
    logs: dir(m.id), usage: m.usage, cost_usd: m.cost_usd, cost: runCost(m), preflight_results: m.preflight_results || [] };
}
function health(m) {
  if (!active.includes(m.status) || m.status === 'prepared') return { state: 'inactive', attention_required: false };
  const age = value => Math.max(0, Date.now() - Date.parse(value || m.started || m.created));
  const stale = m.stall_ms ?? 300000;
  if (m.status === 'orphaned') return { state: 'orphaned', attention_required: true, action_required: 'Inspect processes and partial work; recover only after termination is verified.' };
  if (m.executor.transport !== 'cli') {
    if (age(m.progress_at) >= stale) return { state: 'no_progress', attention_required: true, action_required: 'Inspect the saved host agent and its turn/progress cursor. Diagnose or interrupt a confirmed stall; do not repeat an unchanged wait or start a duplicate.' };
    if (age(m.host_checked_at) >= 60000) return { state: 'check_host', attention_required: true, action_required: 'Query the saved host agent with its read-only status/wait tool, then record a correlated observation or stopped result.' };
    return { state: 'awaiting_host', attention_required: false };
  }
  const beat = readJSON(path.join(dir(m.id), 'heartbeat.json'), null);
  const verifiedBeat = beat?.claim === m.claim && beat.pid === m.pid ? beat.at : null;
  if (age(verifiedBeat) >= 30000) return { state: 'supervisor_unresponsive', attention_required: true, action_required: 'Supervisor heartbeat stopped. Inspect its process and child group; retain ownership until stopped.' };
  let last = Date.parse(m.started || m.created);
  for (const name of ['stdout.log', 'stderr.log']) {
    try { const stat = fs.statSync(path.join(dir(m.id), name)); if (stat.size) last = Math.max(last, stat.mtimeMs); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const idle = Math.max(0, Date.now() - last);
  return { state: idle >= stale ? 'no_progress' : 'running', idle_ms: idle, attention_required: idle >= stale,
    ...(idle >= stale ? { action_required: 'Process is alive but output has not advanced. Inspect logs/process activity; choose a justified observation interval or cancel after diagnosis. Do not blindly repeat wait or duplicate the worker.' } : {}) };
}
export function status(id) {
  return admission(() => statusUnlocked(id));
}

function statusUnlocked(id) {
  const m = getRun(id);
  if (m.executor.transport === 'cli' && ['running', 'starting', 'cancelling'].includes(m.status) && m.pid && !sameProcess(m.pid, m.pid_fingerprint)) {
    m.status = 'orphaned'; m.error = 'Supervisor identity is gone; inspect logs and use recover after verifying process termination'; save(m);
  }
  return { ...compact(m), health: health(m) };
}

function executionStarted(run) {
  if (run.execution_started === true) return true;
  if (run.execution_started_at) return true;
  if (run.executor.transport === 'cli') return run.child_kind !== 'preflight' && Boolean(run.child_pid);
  return run.host_attached === true;
}

function currentAttempts(runs) {
  const byId = new Map(runs.map(run => [run.id, run]));
  const rootOf = run => {
    let current = run, root = run.id;
    const seen = new Set([run.id]);
    while (current.resume_of && byId.has(current.resume_of) && !seen.has(current.resume_of)) {
      root = current.resume_of; seen.add(root); current = byId.get(root);
    }
    return root;
  };
  const groups = new Map();
  for (const run of runs) {
    const root = rootOf(run);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(run);
  }
  const latest = [];
  for (const group of groups.values()) {
    const parents = new Set(group.map(run => run.resume_of).filter(id => byId.has(id)));
    const leaves = group.filter(run => !parents.has(run.id));
    leaves.sort((a, b) => (Number(a.attempt_sequence) || 0) - (Number(b.attempt_sequence) || 0) ||
      String(a.created).localeCompare(String(b.created)) || a.id.localeCompare(b.id));
    latest.push(leaves.at(-1));
  }
  return latest.sort((a, b) => String(a.created).localeCompare(String(b.created)) || a.id.localeCompare(b.id));
}

function stageOf(runs) {
  if (!runs.length) return 'idle';
  if (runs.every(run => terminal.includes(run.status))) return 'complete';
  const working = runs.filter(run => executionStarted(run) && ['running', 'permission', 'cancelling', 'orphaned'].includes(run.status));
  if (!working.length) return 'preparation';
  const roles = new Set(working.map(run => run.role));
  if (roles.has('reviewer') || roles.has('verifier') || roles.has('review-lead')) return 'review';
  if (roles.has('implementer')) return 'implementation';
  if (roles.has('planner')) return 'planning';
  if (roles.has('researcher')) return 'research';
  return 'coordination';
}

export function overview({ session, task } = {}) {
  check(typeof session === 'string' && session.length > 0, 'overview requires --session');
  if (task !== undefined) identifier(task, 'task');
  return admission(() => {
    const selected = allRuns().filter(run => run.schema_version === 2 && run.parent_session === session && (task === undefined || run.task === task));
    const attempts = selected.map(run => statusUnlocked(run.id));
    const runs = currentAttempts(attempts);
    const statuses = Object.fromEntries([...active, ...terminal].map(name => [name, runs.filter(run => run.status === name).length]));
    const activeStates = new Set(active);
    const attention = runs.filter(run => run.health?.attention_required || ['permission', 'orphaned', 'blocked', 'failed', 'timeout'].includes(run.status)).length;
    const summary = {
      agents: runs.length,
      attempts: attempts.length,
      reserved: statuses.prepared,
      started: runs.filter(executionStarted).length,
      active: runs.filter(run => activeStates.has(run.status)).length,
      working: runs.filter(run => run.status === 'running' && executionStarted(run)).length,
      completed: statuses.finished,
      verified_tasks: new Set(runs.filter(run => run.task_result.status === 'verified').map(run => run.task)).size,
      attention,
      statuses,
    };
    const agents = runs.map(run => ({
      id: run.id,
      profile: run.profile,
      role: run.role,
      status: run.status,
      health: run.health,
      harness: run.executor.harness,
      transport: run.executor.transport,
      provider: run.executor.provider || null,
      requested_model: run.executor.model,
      actual_model: run.actual_model || null,
      attempt_kind: run.attempt_kind,
      attempt_sequence: run.attempt_sequence,
      resume_of: run.resume_of,
      task_status: run.task_result.status,
      dispatch_started: run.started,
      execution_started: executionStarted(run),
      execution_started_at: run.execution_started_at,
      finished: run.finished,
      usage: run.usage,
      cost: run.cost,
    }));
    const cursor = hash(JSON.stringify(agents.map(agent => ({
      id: agent.id, status: agent.status, health: agent.health?.state, attention: agent.health?.attention_required,
      actual_model: agent.actual_model, task_status: agent.task_status, execution_started: agent.execution_started,
    }))));
    const presets = [...new Set(runs.map(run => run.preset))].sort();
    return { session, task: task || null, presets, stage: stageOf(runs), cursor, observed_at: now(), summary, accounting: usageSummary(attempts), agents };
  });
}

function statusIcon(agent) {
  if (agent.health?.attention_required || ['permission', 'orphaned', 'blocked', 'failed', 'timeout'].includes(agent.status)) return '🔴';
  if (agent.status === 'running' && agent.execution_started) return '🟢';
  if (agent.task_status === 'verified') return '🟢';
  return '🟡';
}

function compactSnapshot(snapshot) {
  const icon = snapshot.summary.attention > 0 ? '🔴'
    : snapshot.summary.working > 0 || (snapshot.agents.length > 0 && snapshot.agents.every(agent => agent.task_status === 'verified')) ? '🟢'
      : '🟡';
  return {
    session: snapshot.session,
    task: snapshot.task,
    stage: snapshot.stage,
    cursor: snapshot.cursor,
    accounting: snapshot.accounting,
    summary: {
      icon,
      agents: snapshot.summary.agents,
      reserved: snapshot.summary.reserved,
      started: snapshot.summary.started,
      working: snapshot.summary.working,
      completed: snapshot.summary.completed,
      verified_tasks: snapshot.summary.verified_tasks,
      attention: snapshot.summary.attention,
    },
    agents: snapshot.agents.map(agent => ({
      icon: statusIcon(agent),
      id: agent.id,
      profile: agent.profile,
      role: agent.role,
      status: agent.status,
      health: agent.health?.state || null,
      attention: Boolean(agent.health?.attention_required),
      actual_model: agent.actual_model,
      execution_started: agent.execution_started,
      task_status: agent.task_status,
      usage: agent.usage,
      cost: agent.cost,
    })),
  };
}

export async function watch({ session, task, after, milliseconds = 60000, full = false } = {}) {
  check(Number.isSafeInteger(milliseconds) && milliseconds > 0, 'watch requires a positive timeout');
  const deadline = Date.now() + milliseconds;
  for (;;) {
    const snapshot = overview({ session, task });
    const result = full ? snapshot : compactSnapshot(snapshot);
    if (!after || snapshot.cursor !== after) return { ...result, changed: true };
    if (Date.now() >= deadline) {
      if (!full) return { session: result.session, task: result.task, stage: result.stage, cursor: result.cursor, summary: result.summary, changed: false, watch_timed_out: true };
      return { ...result, changed: false, watch_timed_out: true };
    }
    await sleep(Math.min(1000, deadline - Date.now()));
  }
}

export async function wait(id, milliseconds = 60000) {
  check(Number.isFinite(milliseconds) && milliseconds > 0, 'wait requires a positive timeout');
  const deadline = Date.now() + milliseconds;
  for (;;) {
    const m = status(id);
    if (terminal.includes(m.status) || ['permission', 'orphaned'].includes(m.status) || m.health.attention_required) return m;
    if (Date.now() >= deadline) return { ...m, wait_timed_out: true, action_required: m.executor.transport === 'cli' ? 'Check health and progress before the next bounded wait; investigate repeated unchanged waits.' : 'Query the saved host agent before waiting again; record its current turn state.' };
    await sleep(Math.min(500, deadline - Date.now()));
  }
}
export function launch(id) {
  check(!process.env.DELEGATE_KIT_DEPTH, 'Worker cannot launch another worker');
  return admission(() => {
    const m = getRun(id);
    assertBoundRun(m);
    check(m.status === 'prepared', `Run ${id} is ${m.status}; attach/recover it, do not dispatch twice`);
    check(m.executor.transport === 'cli', 'Native/Paseo launch is retired. Cancel this prepared run and explicitly select a CLI profile; active legacy runs can still be reconciled.');
    m.status = 'starting'; m.started = now(); m.claim = randomUUID();
    save(m);
    const fd = fs.openSync(path.join(dir(id), 'supervisor.log'), 'a', 0o600);
    const child = spawn(process.execPath, [path.join(skill, 'scripts/dk.mjs'), '_supervise', id, '--claim', m.claim], { detached: true, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    child.on('error', () => { admission(() => { const latest = getRun(id); latest.status = 'failed'; latest.error = 'Unable to spawn supervisor'; save(latest); releaseWriter(latest); }); });
    m.pid = child.pid || null; m.pid_fingerprint = child.pid ? fingerprint(child.pid) : null; save(m);
    child.unref(); return compact(m);
  });
}
export function attach(id, transportId, workspaceId) {
  check(typeof transportId === 'string' && transportId.length > 0 && transportId.length <= 512, 'Attach requires a concrete host agent ID');
  return admission(() => {
    const m = getRun(id); check(m.executor.transport !== 'cli', 'CLI attaches internally');
    if (m.status === 'running') { check(m.transport_session_id === transportId, 'Already attached to another agent'); return compact(m); }
    check(['starting', 'cancelling'].includes(m.status), 'Run must be dispatched before attach');
    check(!m.transport_session_id || m.transport_session_id === transportId, 'Resume must attach the original agent');
    if (m.executor.transport === 'paseo') check(workspaceId === m.workspace.id, 'Paseo returned a different workspace; reconcile before proceeding');
    if (m.checkpoint && !m.resume_of) check(!allRuns().some(r => r.id !== id && r.executor?.transport === m.executor.transport && r.executor?.capability?.daemon === m.executor.capability?.daemon && r.transport_session_id === transportId), 'Initial checkpoint review requires a fresh executor session');
    check(!allRuns().some(r => r.id !== id && active.includes(r.status) && r.executor?.transport === m.executor.transport && r.executor?.capability?.daemon === m.executor.capability?.daemon && r.transport_session_id === transportId), 'Host agent already belongs to another active attempt');
    m.transport_session_id = transportId; m.host_attached = true; m.execution_started_at ||= now(); if (m.status !== 'cancelling') m.status = 'running'; m.host_checked_at = now(); m.progress_at ||= m.started; save(m); return compact(m);
  });
}
function resultFrom(text, m) {
  let result; try { result = JSON.parse(text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1')); } catch { throw new Error('Worker result is not JSON'); }
  const error = validate(result, resultSchema(m.agent, m.required_checks)) || checkResultCoverage(result, m.required_checks); check(!error, `Invalid worker result: ${error}`); return result;
}
function finish(m, result, error, reason) {
  m.finished = now(); m.result = result || null; m.result_validated = Boolean(result);
  m.status = reason || (error || result?.status === 'failed' ? 'failed' : result?.status === 'blocked' ? 'blocked' : 'finished');
  if (error) m.error = diagnostic(error);
  atomicJSON(path.join(dir(m.id), 'result.json'), { status: m.status, validated: m.result_validated, result: m.result, error: m.error || null });
  save(m); releaseWriter(m); recordCompletion(m);
}
export function ingest(id, { hostAgent, event, result, stopped = false, dispatchToken, progress }) {
  return admission(() => {
    const m = getRun(id); check(m.executor.transport !== 'cli', 'CLI completion is collected by its supervisor');
    check(hostAgent === m.transport_session_id && hostAgent, 'Event is not correlated to the attached agent');
    check(dispatchToken && dispatchToken === m.claim, 'Event dispatch token does not match this attempt');
    if (event === 'complete') {
      check(result?.dispatch_token === m.claim, 'Result dispatch token does not match this attempt');
      result = result.result;
    }
    if (terminal.includes(m.status)) {
      check(event === 'complete' && JSON.stringify(result) === JSON.stringify(m.result), 'Conflicting terminal event'); return compact(m);
    }
    check(['running', 'permission', 'cancelling'].includes(m.status), 'Run is not attached');
    if (event === 'permission') { if (m.status !== 'cancelling') m.status = 'permission'; save(m); return compact(m); }
    if (event === 'running') {
      check(progress === undefined || typeof progress === 'string' && progress.length <= 512, 'Progress must be an observed host cursor');
      m.host_checked_at = now();
      if (progress !== undefined && progress !== m.progress_cursor) { m.progress_cursor = progress; m.progress_at = now(); }
      if (m.status !== 'cancelling') m.status = 'running'; save(m); return compact(m);
    }
    check(['complete', 'failed', 'cancelled'].includes(event) && stopped, 'Completion must confirm the host turn/process stopped before releasing ownership');
    let valid = null, error = null;
    if (event === 'complete') { try { valid = resultFrom(JSON.stringify(result), m); } catch (e) { error = e.message; } }
    finish(m, valid, error || (event === 'failed' ? 'Host reported failure' : null), event === 'cancelled' ? 'cancelled' : null);
    return compact(m);
  });
}
export function dispatchFailed(id, { dispatchToken, confirmedNotStarted, evidence }) {
  return admission(() => {
    const m = getRun(id);
    check(m.executor.transport !== 'cli' && ['starting', 'cancelling'].includes(m.status) && !m.host_attached, 'Only an unattached host dispatch can be reconciled as not started');
    check(dispatchToken && dispatchToken === m.claim, 'Dispatch token mismatch');
    check(confirmedNotStarted === true && typeof evidence === 'string' && evidence.trim(), 'Require host evidence confirming no agent/turn was started; a timeout is not proof');
    m.dispatch_failure_evidence = diagnostic(evidence);
    finish(m, null, 'Host confirmed dispatch did not start', m.status === 'cancelling' ? 'cancelled' : 'failed');
    return compact(m);
  });
}
export function resume(id, briefFile) {
  check(!process.env.DELEGATE_KIT_DEPTH, 'Worker cannot resume another worker');
  const brief = fs.readFileSync(briefFile, 'utf8'); check(brief.trim(), 'Brief is empty');
  return admission(() => {
    const prev = getRun(id);
    check(prev.executor.transport === 'cli', 'Native/Paseo continuation is retired; reconcile the saved run and explicitly select a CLI profile');
    assertBoundRun(prev);
    check(terminal.includes(prev.status) && prev.transport_session_id, 'Resume requires a stopped run with an exact saved session');
    check(!allRuns().some(r => active.includes(r.status) && r.parent_session === prev.parent_session && r.transport_session_id === prev.transport_session_id), 'An attempt already owns this executor session');
    if (prev.executor.transport === 'cli' && ['pi', 'omp'].includes(prev.executor.harness)) check(prev.transport_session_file && fs.existsSync(prev.transport_session_file), 'Saved RPC session file is unavailable; do not resume a prefix or last session');
    if (prev.contract_revision) taskBinding({ session: prev.parent_session, task: prev.task, workItem: prev.work_item, checkpoint: prev.checkpoint, cwd: prev.cwd, resumeReview: Boolean(prev.checkpoint) }, readJSON(path.join(dir(id), 'preset.snapshot.json')), [prev.profile]);
    const attemptSequence = Math.max(0, ...allRuns().filter(run => run.group === prev.group && run.profile === prev.profile).map(run => Number(run.attempt_sequence) || 0)) + 1;
    const m = { ...prev, id: randomUUID(), status: 'prepared', created: now(), started: null, execution_started_at: null, finished: null, error: null,
      resume_of: id, result: null, result_validated: false, attempt_kind: 'continuation', pid: null,
      attempt_sequence: attemptSequence, pid_fingerprint: null, child_pid: null, child_fingerprint: null, actual_model: null, actual_provider: null,
      usage: null, cost_usd: null, preflight_results: [], claim: null, invoke: null, host_attached: false, host_checked_at: null, progress_at: null, progress_cursor: null, launch_registration_pending: false, launch_recovery_evidence: null };
    return repositoryAdmission(m.write && m.workspace.owner === 'delegate-kit' ? m.cwd : null, () => {
      enforceCaps(prev.limits, counts(prev.workspace.owner === 'delegate-kit' ? prev.cwd : null), { workers: 1, writers: prev.write ? 1 : 0 });
      reserveWriter(m);
      try {
        m.budget = budget({ stateDir: home(), task: m.budget_task, ticket: m.profile, retry: true, record: true, limits: m.limits });
        atomicJSON(path.join(dir(m.id), 'preset.snapshot.json'), readJSON(path.join(dir(id), 'preset.snapshot.json')));
        atomicJSON(path.join(dir(m.id), 'result.schema.json'), resultSchema(m.agent, m.required_checks));
        fs.writeFileSync(path.join(dir(m.id), 'prompt.md'), promptFor(m, brief), { mode: 0o600 }); save(m); recordRouting(m);
      } catch (e) { releaseWriter(m); throw e; }
      return compact(m);
    });
  });
}
export async function cancel(id) {
  let m = admission(() => {
    const value = getRun(id);
    if (terminal.includes(value.status)) return value;
    if (value.status === 'prepared') { finish(value, null, null, 'cancelled'); return value; }
    value.status = 'cancelling'; save(value); return value;
  });
  if (terminal.includes(m.status)) return compact(m);
  if (m.executor.transport !== 'cli') return { ...compact(m), action_required: 'Interrupt the saved host agent; ingest cancelled with stopped=true only after the host confirms it stopped. Unattached dispatch must be reconciled with the host first.' };
  // A starting supervisor may not have registered a child yet. Its first action
  // observes cancelling under admission and exits without launching the model.
  if (sameProcess(m.pid, m.pid_fingerprint)) {
    process.kill(m.pid, 'SIGTERM'); // supervisor asks RPC abort before escalating
  } else if (m.child_pid) {
    signal(m, 'SIGTERM'); await sleep(250);
    if (groupAlive(m.child_pid)) signal(m, 'SIGKILL');
  }
  for (let i = 0; i < 50; i++) {
    m = getRun(id); if (terminal.includes(m.status)) return compact(m);
    if (!sameProcess(m.pid, m.pid_fingerprint) && !groupAlive(m.child_pid)) return recover(id);
    await sleep(100);
  }
  return { ...compact(m), action_required: 'Waiting for process termination; ownership is retained' };
}
export function recover(id, { confirmedNotStarted = false, evidence } = {}) {
  return admission(() => {
    const m = getRun(id);
    check(m.executor.transport === 'cli', 'Native recovery requires a correlated host completion event');
    if (m.launch_registration_pending) {
      check(confirmedNotStarted === true && typeof evidence === 'string' && evidence.trim(), 'Child registration was interrupted; retain ownership until process inspection confirms no worker started, then provide evidence');
      m.launch_recovery_evidence = diagnostic(evidence);
      m.launch_registration_pending = false;
    }
    check(!sameProcess(m.pid, m.pid_fingerprint) && !groupAlive(m.child_pid), 'Supervisor or child group may still be writing; ownership retained');
    if (!terminal.includes(m.status)) finish(m, null, 'Recovered stopped run; inspect partial changes before continuation', m.status === 'cancelling' ? 'cancelled' : 'failed');
    return compact(m);
  });
}
export async function supervise(id, claim) {
  let m = admission(() => {
    const value = getRun(id); check(value.claim === claim, 'Supervisor claim mismatch');
    if (value.status === 'cancelling') { finish(value, null, null, 'cancelled'); return value; }
    check(value.status === 'starting', 'Run has already been supervised');
    value.pid = process.pid; value.pid_fingerprint = fingerprint(process.pid); value.status = 'running'; save(value); return value;
  });
  if (m.status !== 'running') return;
  const beat = () => atomicJSON(path.join(dir(id), 'heartbeat.json'), { pid: process.pid, claim, at: now() });
  beat();
  const heartbeatTimer = setInterval(beat, 5000); heartbeatTimer.unref();
  let child, spawned = null, timer, gracefulTimer, forceTimer, result = null, failure = null, requestedReason = null, probing = false;
  const e = m.executor, isRPC = ['pi', 'omp'].includes(e.harness);
  const stdoutFile = path.join(dir(id), 'stdout.log'), stderrFile = path.join(dir(id), 'stderr.log');
  const logOut = fs.openSync(stdoutFile, 'a', 0o600), logErr = fs.openSync(stderrFile, 'a', 0o600);
  const stop = reason => {
    requestedReason ||= reason;
    if (!child?.pid) return;
    if (isRPC && child.stdin.writable) child.stdin.write(JSON.stringify({ id: 'dk-cancel', type: 'abort' }) + '\n', () => {});
    else { try { signal(getRun(id), 'SIGTERM'); } catch {} }
    gracefulTimer ||= setTimeout(() => { try { signal(getRun(id), 'SIGTERM'); } catch {} }, 300);
    forceTimer ||= setTimeout(() => { try { signal(getRun(id), 'SIGKILL'); } catch {} }, 1500);
  };
  const onSignal = () => stop('cancelled');
  process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
  const startChild = (built, cwd, modelCall = true) => {
    admission(() => {
      m = getRun(id); check(m.status === 'running' && !requestedReason, 'Run cancelled before launch');
      // The previous probe has ended. Do not leave its stale identity in the
      // registration gap for the next child: recovery must retain uncertainty.
      m.launch_registration_pending = true; m.child_pid = null; m.child_fingerprint = null; m.child_kind = null; save(m);
      child = spawn(built.cmd, built.args, { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, DELEGATE_KIT_DEPTH: '1', ...(built.config ? { OPENCODE_CONFIG_CONTENT: mergeInline(built.config), OPENCODE_AUTO_SHARE: 'false' } : {}) } });
      spawned = { pid: child.pid || null, fingerprint: child.pid ? fingerprint(child.pid) : null };
      m.child_pid = spawned.pid; m.child_fingerprint = spawned.fingerprint;
      m.child_kind = modelCall ? 'model' : 'preflight';
      if (modelCall) m.execution_started_at = child.pid ? now() : null;
      if (process.env.NODE_ENV === 'test' && process.env.DELEGATE_KIT_TEST_FAIL_CHILD_REGISTRATION === id) throw new Error('Injected child registration failure');
      if (modelCall && process.env.NODE_ENV === 'test' && process.env.DELEGATE_KIT_TEST_FAIL_MODEL_REGISTRATION === id) {
        atomicJSON(path.join(dir(id), 'injected-child.json'), spawned);
        throw new Error('Injected model registration failure after preflight');
      }
      m.launch_registration_pending = false; save(m);
    });
    const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, sig) => resolve({ code, sig })); });
    closed.catch(() => {});
    child.stderr.on('data', bytes => fs.writeSync(logErr, bytes));
    return closed;
  };
  try {
    if (m.timeout_ms) timer = setTimeout(() => stop('timeout'), m.timeout_ms);
    // Codex exposes a no-model sandbox command using the same configuration as
    // exec. Other harnesses must probe using their actual tools before editing;
    // raw OMP RPC bash bypasses tool approvals and is deliberately not used here.
    if (e.harness === 'codex') for (const probe of m.preflight || []) {
      probing = true;
      const cwd = fs.realpathSync(path.resolve(m.cwd, probe.cwd));
      check(cwd === m.cwd || cwd.startsWith(m.cwd + path.sep), 'Preflight cwd escapes workspace');
      const before = contentTree(m.cwd), started = now();
      const closed = startChild({ cmd: 'codex', args: ['sandbox', ...codexSandboxConfig(m.write, e.permissions), '--', ...probe.argv] }, cwd, false);
      child.stdout.on('data', bytes => fs.writeSync(logOut, bytes)); child.stdin.end();
      const deadline = setTimeout(() => stop('blocked'), probe.timeout_ms ?? 120000);
      let exit;
      try { exit = await closed; } finally { clearTimeout(deadline); }
      const clean = !groupAlive(spawned.pid);
      const passed = !requestedReason && exit.code === probe.expected_exit && clean && contentTree(m.cwd) === before;
      admission(() => {
        const value = getRun(id); value.preflight_results ||= [];
        value.preflight_results.push({ id: probe.id, argv: probe.argv, cwd, started_at: started, ended_at: now(), exit_code: exit.code,
          source: 'codex-sandbox', status: passed ? 'passed' : 'blocked', source_tree: before }); save(value);
      });
      if (!passed) { requestedReason ||= 'blocked'; throw new Error(`Readiness check ${probe.id} failed, left a process running or changed source; model not launched`); }
      child.stdout.removeAllListeners('data'); child.stderr.removeAllListeners('data');
    }
    probing = false;
    const prompt = fs.readFileSync(path.join(dir(id), 'prompt.md'), 'utf8');
    let built;
    if (isRPC) { atomicJSON(path.join(dir(id), 'runtime-config.json'), ompConfig); built = rpcCommand(e, dir(id), m.transport_session_file); }
    else {
      const permissions = e.harness === 'opencode' ? inspectPermissions({ cwd: m.cwd, agentName: `dk-${id}`, model: e.model }) : undefined;
      built = buildCommand({ adapter: e.harness, model: e.model, effort: e.reasoning, provider: e.provider,
        prompt, write: m.write, resumeId: m.transport_session_id, skillDir: skill, schemaFile: path.join(dir(id), 'result.schema.json'), agentName: `dk-${id}`, permissionRules: permissions, permissions: e.permissions });
      built.args = built.args.map(a => a === '__OUT__' ? path.join(dir(id), 'last-message.txt') : a);
    }
    const modelOutputOffset = fs.fstatSync(logOut).size;
    const closed = startChild(built, m.cwd);
    if (isRPC) {
      const output = await rpcTurn(child, e, prompt, state => admission(() => {
        const value = getRun(id);
        check(!value.transport_session_id || !state.sessionId || value.transport_session_id === state.sessionId, 'RPC resumed another session');
        value.transport_session_id = state.sessionId || value.transport_session_id;
        value.transport_session_file = state.sessionFile || value.transport_session_file; save(value);
      }), bytes => fs.writeSync(logOut, bytes), undefined, usage => admission(() => {
        const value = getRun(id); value.usage = usage; value.cost_usd = usage?.cost?.total ?? null; save(value);
      }));
      admission(() => { const value = getRun(id); value.actual_model = output.actual_model; value.actual_provider = output.actual_provider; save(value); });
      result = resultFrom(output.text, m);
      child.stdin.end();
      // Pi has no documented EOF disposal guarantee. Its model turn is already
      // terminal, so stop the idle transport; OMP drains on stdin EOF.
      if (e.harness === 'pi') signal(getRun(id), 'SIGTERM');
      const exit = await closed;
      output.assertHealthy();
      check(e.harness === 'pi' || exit.code === 0, 'OMP exited with a transport error');
    } else {
      child.stdout.on('data', bytes => fs.writeSync(logOut, bytes)); child.stdin.end();
      const exit = await closed;
      const extracted = extractResult(e.harness, fs.readFileSync(stdoutFile).subarray(modelOutputOffset).toString('utf8'), path.join(dir(id), 'last-message.txt'), resultSchema(m.agent, m.required_checks));
      admission(() => { const value = getRun(id); value.transport_session_id = extracted.sessionId || value.transport_session_id;
        value.actual_model = extracted.actualModel; value.usage = extracted.usage; value.cost_usd = extracted.cost_usd; save(value); });
      if (!requestedReason) {
        check(exit.code === 0 && !extracted.error, extracted.error || `CLI exited ${exit.code ?? exit.sig}`);
        result = resultFrom(JSON.stringify(extracted.result), m);
      }
    }
  } catch (error) { failure = error.message; if (probing) requestedReason ||= 'blocked'; }
  finally {
    clearInterval(heartbeatTimer); clearTimeout(timer); clearTimeout(gracefulTimer); clearTimeout(forceTimer); process.off('SIGTERM', onSignal); process.off('SIGINT', onSignal);
    // Keep the lease until all descendants have stopped, even after a leader exits.
    m = getRun(id);
    const ownedChild = spawned || (m.child_pid ? { pid: m.child_pid, fingerprint: m.child_fingerprint } : null);
    if (ownedChild?.pid && groupAlive(ownedChild.pid)) {
      // This supervisor created and continuously owns this process group.
      try { process.kill(-ownedChild.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') failure ||= error.message; }
      for (let i = 0; i < 50 && groupAlive(ownedChild.pid); i++) await sleep(100);
    }
    child?.stdout?.removeAllListeners('data'); child?.stderr?.removeAllListeners('data');
    fs.closeSync(logOut); fs.closeSync(logErr);
    admission(() => {
      const value = getRun(id);
      const childPid = ownedChild?.pid || value.child_pid || null;
      if (groupAlive(childPid)) {
        value.child_pid = childPid; value.child_fingerprint = ownedChild?.fingerprint || value.child_fingerprint || null;
        value.status = 'orphaned'; value.error = failure || 'Child group still active; ownership retained'; save(value);
      }
      else { value.launch_registration_pending = false; finish(value, result, failure, requestedReason || (value.status === 'cancelling' ? 'cancelled' : null)); }
    });
  }
}
