import fs from 'node:fs';
import path from 'node:path';

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a safe identifier (letters, digits, ., _, -; at most 128 characters)`);
  }
}
function count(value) { return Number.isSafeInteger(value) && value >= 0; }
function readState(file, task) {
  let state;
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { task, runs: 0, retries: {} }; throw error; }
  if (!object(state) || state.task !== task || !count(state.runs) || !object(state.retries) ||
      !Object.values(state.retries).every(value => count(value) && value <= state.runs)) {
    throw new Error(`Invalid task budget state: ${file}`);
  }
  return state;
}
function check(state, ticket, retry, limits) {
  if (limits.runs !== null && state.runs >= limits.runs) throw new Error(`Task ${state.task}: max ${limits.runs} runs reached`);
  if (retry && limits.retries !== null && (Object.hasOwn(state.retries, ticket) ? state.retries[ticket] : 0) >= limits.retries) {
    throw new Error(`Task ${state.task}, ticket ${ticket}: max ${limits.retries} retries reached`);
  }
}

// Read a snapshot, or reserve exactly one start/resume. Native and external callers use
// the same operation. Limits are supplied per invocation; this file stores only usage.
export function budget({ stateDir, task, ticket, retry = false, record = false, limits = {} }) {
  const caps = { runs: limits.runs ?? null, retries: limits.retries ?? null };
  for (const [key, value] of Object.entries(caps)) {
    if (value !== null && (!count(value) || (key === 'runs' && value === 0))) throw new Error(`Invalid budget limit: ${key}`);
  }
  if (!task) {
    if (caps.runs !== null || caps.retries !== null || retry || ticket) throw new Error('--task is required when a run/retry limit, ticket or retry is set');
    return null;
  }
  identifier(task, '--task');
  if (ticket !== undefined) identifier(ticket, '--ticket');
  if (retry && !ticket) throw new Error('--retry requires --ticket');
  const dir = path.join(stateDir, 'tasks');
  const file = path.join(dir, `${task}.json`);
  if (!record) return { ...readState(file, task), limits: caps };
  fs.mkdirSync(dir, { recursive: true });
  const mutex = path.join(dir, `${task}.lock`);
  const deadline = Date.now() + 15_000;
  while (true) {
    try { fs.mkdirSync(mutex); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error(`Budget mutex held: ${mutex}; verify no budget operation is running before removing a stale lock`);
      sleep(10);
    }
  }
  const temp = path.join(mutex, 'state.json');
  try {
    const state = readState(file, task);
    check(state, ticket, retry, caps);
    state.runs += 1;
    if (retry) state.retries[ticket] = (Object.hasOwn(state.retries, ticket) ? state.retries[ticket] : 0) + 1;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n');
    fs.renameSync(temp, file);
    return { ...state, limits: caps };
  } finally {
    fs.rmSync(temp, { force: true });
    fs.rmdirSync(mutex);
  }
}
