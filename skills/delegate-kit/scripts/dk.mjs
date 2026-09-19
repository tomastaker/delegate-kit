#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { home, check, readJSON, validatePreset, presetFiles, loadPreset, savePreset, copyPreset, setDefault, context, catalog } from './presets.mjs';
import { discover } from './executors.mjs';
import { prepare, launch, attach, ingest, resume, status, overview, watch, wait, cancel, recover, supervise, getRun, dispatchFailed } from './runtime.mjs';

import { openTask, readTask, checkTask, showTask, acceptTask, checkpointTask, verifyTask, submitTask, escalateTask, disposeFinding, taskReport } from './tasks.mjs';

function args(input) {
  const o = { _: [] };
  const booleans = ['task-only', 'details', 'rerun', 'stopped', 'confirmed-not-started', 'full'];
  for (let i = 0; i < input.length; i++) {
    if (!input[i].startsWith('--')) { o._.push(input[i]); continue; }
    const key = input[i].slice(2); check(!Object.hasOwn(o, key), `Duplicate --${key}`);
    if (booleans.includes(key)) o[key] = true;
    else { check(input[i + 1] !== undefined && !input[i + 1].startsWith('--'), `--${key} requires a value`); o[key] = input[++i]; }
  }
  return o;
}
const optKeys = {
  context: ['session', 'preset', 'task-only'], catalog: ['session', 'preset', 'task-only', 'role'],
  presets: ['file', 'revision'], prepare: ['session', 'preset', 'task-only', 'task', 'agent', 'role', 'work-item', 'checkpoint', 'brief', 'cwd', 'capabilities', 'timeout-ms', 'stall-ms', 'max-workers', 'max-writers', 'max-runs', 'max-retries'],
  run: [], attach: ['host-agent', 'workspace-id'], status: [], result: [], overview: ['session', 'task'], watch: ['session', 'task', 'after', 'timeout-ms', 'full'], wait: ['timeout-ms'], resume: ['brief'], cancel: [], recover: ['confirmed-not-started', 'evidence'],
  'dispatch-failed': ['dispatch-token', 'confirmed-not-started', 'evidence'],
  event: ['host-agent', 'event', 'file', 'stopped', 'dispatch-token', 'progress'], doctor: [],
  task: ['session', 'task', 'contract', 'revision', 'reason', 'checkpoint', 'work-item', 'run', 'outcome', 'agent', 'finding', 'resolution', 'authorization', 'evidence', 'source', 'cwd', 'format', 'details', 'rerun'],
  checkpoint: ['session', 'task', 'revision', 'cwd'], verify: ['check'],
  _supervise: ['claim'], help: [], start: [],
};
function taskView(state, details) {
  if (details) return state;
  const s = showTask(state.contract.session, state.contract.task);
  return { session: s.contract.session, task: s.contract.task, status: s.status, revision: s.revision,
    checkpoint: s.current_checkpoint, stale: s.stale, gaps: s.gaps, work_items: s.work_items, findings: s.findings, exceptions: s.exceptions };
}
export async function main(input = process.argv.slice(2)) {
  process.umask(0o077);
  const o = args(input), [command = 'help', action, target] = o._;
  check(Object.hasOwn(optKeys, command), `Unknown command ${command}; use help`);
  for (const key of Object.keys(o)) check(key === '_' || optKeys[command].includes(key), `Unknown ${command} option --${key}`);
  const ms = o['timeout-ms'] === undefined ? undefined : Number(o['timeout-ms']);
  if (ms !== undefined) check(Number.isSafeInteger(ms) && ms > 0, '--timeout-ms must be a positive integer');
  const selection = { session: o.session, preset: o.preset, taskOnly: o['task-only'] === true };
  switch (command) {
    case 'context': {
      check(action === 'open', 'Use context open'); const c = context(selection);
      return { session: c.session, preset: c.preset.id, revision: c.revision, task_only: c.task_only };
    }
    case 'catalog': { check(o.session, 'catalog requires --session'); const c = context(selection); return { session: c.session, revision: c.revision, ...catalog(c.preset, o.role) }; }
    case 'presets': {
      if (action === 'list' || action === 'audit') return presetFiles().map(file => {
        try { const p = loadPreset(file.slice(0, -5)); return { id: p.preset.id, revision: p.revision, valid: true }; }
        catch (e) { return { file, valid: false, error: e.message }; }
      });
      if (action === 'show') return loadPreset(target);
      if (action === 'validate') { const p = validatePreset(readJSON(o.file)); return { id: p.id, valid: true }; }
      if (action === 'save') return savePreset(readJSON(o.file), o.revision ?? null);
      if (action === 'copy') return copyPreset(target, o._[3]);
      if (action === 'set-default') return setDefault(target);
      throw new Error('Use presets list|audit|show ID|validate --file FILE|save --file FILE [--revision HASH]|copy X1 Y2|set-default ID');
    }
    case 'prepare': return prepare({ ...selection, task: o.task, agent: o.agent, role: o.role, workItem: o['work-item'], checkpoint: o.checkpoint, brief: o.brief, cwd: o.cwd, timeoutMs: ms, stallMs: o['stall-ms'] === undefined ? undefined : Number(o['stall-ms']),
      capabilities: o.capabilities ? readJSON(o.capabilities) : [],
      limits: Object.fromEntries(Object.entries(o).filter(([k]) => k.startsWith('max-'))) });
    case 'task': {
      const authorization = o.authorization ? fs.readFileSync(o.authorization, 'utf8') : undefined;
      if (action === 'open') {
        const contract = readJSON(o.contract); check(contract.session === o.session && contract.task === o.task, 'Contract namespace differs from command');
        return taskView(openTask(contract, o.revision, o.reason), o.details);
      }
      if (action === 'check') return taskView(checkTask(o.session, o.task, o.cwd, { rerun: o.rerun, revision: o.revision, checkpoint: o.checkpoint }), o.details);
      if (action !== 'open') { const state = readTask(o.session, o.task); o.revision ??= state.revision; o.checkpoint ??= state.current_checkpoint; }
      if (action === 'show') return taskView(readTask(o.session, o.task), o.details);
      if (action === 'accept') return taskView(acceptTask(o.session, o.task, o.revision, o.checkpoint, authorization), o.details);
      if (action === 'submit') return submitTask(o.session, o.task, o.revision, o['work-item'], o.run, o.outcome, o.reason);
      if (action === 'escalate') return escalateTask(o.session, o.task, o.revision, o['work-item'], o.agent, o.reason);
      if (action === 'disposition') return disposeFinding(o.session, o.task, o.revision, o.checkpoint, o.finding, o.resolution, o.reason, authorization, o.evidence, o.source ? readJSON(o.source) : undefined);
      if (action === 'report') {
        const report = taskReport(o.session, o.task);
        check(!o.format || ['json', 'csv'].includes(o.format), 'Use --format json|csv');
        if (o.format === 'csv') {
          const entries = Object.entries(report).filter(([, value]) => !Array.isArray(value));
          const csv = value => '"' + (value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')).replaceAll('"', '""') + '"';
          return { format: 'csv', content: entries.map(([key]) => csv(key)).join(',') + '\n' + entries.map(([, value]) => csv(value)).join(',') + '\n' };
        }
        return report;
      }
      throw new Error('Use task open|show|check|submit|escalate|disposition|accept|report');
    }
    case 'checkpoint': check(action === 'create', 'Use checkpoint create'); return checkpointTask(o.session, o.task, o.revision, o.cwd);
    case 'verify': return verifyTask(action, o.check);
    case 'run': return launch(action);
    case 'attach': return attach(action, o['host-agent'], o['workspace-id']);
    case 'dispatch-failed': return dispatchFailed(action, { dispatchToken: o['dispatch-token'], confirmedNotStarted: o['confirmed-not-started'], evidence: o.evidence ? fs.readFileSync(o.evidence, 'utf8') : undefined });
    case 'event': return ingest(action, { hostAgent: o['host-agent'], event: o.event, result: o.file ? readJSON(o.file) : undefined, stopped: o.stopped, dispatchToken: o['dispatch-token'], progress: o.progress });
    case 'status': case 'result': return status(action);
    case 'overview': return overview({ session: o.session, task: o.task });
    case 'watch': return watch({ session: o.session, task: o.task, after: o.after, milliseconds: ms, full: o.full === true });
    case 'wait': return wait(action, ms);
    case 'resume': return resume(action, o.brief);
    case 'cancel': return cancel(action);
    case 'recover': return recover(action, { confirmedNotStarted: o['confirmed-not-started'], evidence: o.evidence ? fs.readFileSync(o.evidence, 'utf8') : undefined });
    case 'doctor': return { executors: discover(), root: home(), note: 'No model calls made. Installed/version is not proof of authorization. See references/providers.md.' };
    case '_supervise': await supervise(action, o.claim); return;
    default: return { setup: 'The current chat remains coordinator. Use references/setup.md to create a complete preset; do not infer models or launch paid smoke tests.',
      commands: ['task open --session HOST:ID --task ID --contract FILE [--revision HASH --reason TEXT]', 'task show|report --session HOST:ID --task ID', 'task check --session HOST:ID --task ID --cwd PATH', 'verify CHECKPOINT --check CHECK', 'task accept --session HOST:ID --task ID [--authorization FILE]', 'doctor', 'presets list|audit|show ID', 'presets validate|save --file FILE [--revision HASH]', 'presets copy X1 Y2', 'presets set-default X1',
        'context open [--session HOST:ID] [--preset X1] [--task-only]', 'catalog --session HOST:ID [--role ROLE]',
        'prepare --session HOST:ID --task ID --agent PROFILE --brief FILE [--cwd WORKTREE] [--capabilities FILE]',
        'run ID', 'overview --session HOST:ID [--task ID]',
        'watch --session HOST:ID [--task ID] [--after CURSOR] [--timeout-ms 60000] [--full]', 'status|result|wait|cancel ID', 'recover ID [--confirmed-not-started --evidence FILE]', 'resume ID --brief FILE'],
      root: home(), note: 'Invoke this script by its installed path. No global dk command is installed.' };
  }
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(value => { if (value !== undefined) console.log(JSON.stringify(value, null, 2)); }).catch(error => {
    console.error(JSON.stringify({ error: error.message })); process.exitCode = 1;
  });
}
