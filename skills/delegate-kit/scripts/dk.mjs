#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { home, check, readJSON, validatePreset, presetFiles, loadPreset, savePreset, copyPreset, setDefault, context, catalog } from './presets.mjs';
import { discover } from './executors.mjs';
import { migrate } from './migrate.mjs';
import { prepare, launch, attach, ingest, resume, status, wait, cancel, recover, accept, supervise, getRun, dispatchFailed } from './runtime.mjs';

function args(input) {
  const o = { _: [] };
  const booleans = ['task-only', 'dry-run', 'apply', 'stopped', 'confirmed-not-started'];
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
  presets: ['file', 'revision'], prepare: ['session', 'preset', 'task-only', 'task', 'agent', 'role', 'brief', 'cwd', 'capabilities', 'workspace', 'timeout-ms', 'stall-ms', 'max-workers', 'max-writers', 'max-runs', 'max-retries'],
  run: [], attach: ['host-agent', 'workspace-id'], status: [], result: [], wait: ['timeout-ms'], resume: ['brief'], cancel: [], recover: [], accept: [],
  'dispatch-failed': ['dispatch-token', 'confirmed-not-started', 'evidence'],
  event: ['host-agent', 'event', 'file', 'stopped', 'dispatch-token', 'progress'], doctor: [], migrate: ['decisions', 'dry-run', 'apply'],
  materialize: ['directory'], _supervise: ['claim'], help: [], start: [],
};
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
    case 'prepare': return prepare({ ...selection, task: o.task, agent: o.agent, role: o.role, brief: o.brief, cwd: o.cwd, timeoutMs: ms, stallMs: o['stall-ms'] === undefined ? undefined : Number(o['stall-ms']),
      capabilities: o.capabilities ? readJSON(o.capabilities) : [], workspace: o.workspace ? readJSON(o.workspace) : null,
      limits: Object.fromEntries(Object.entries(o).filter(([k]) => k.startsWith('max-'))) });
    case 'run': return launch(action);
    case 'attach': return attach(action, o['host-agent'], o['workspace-id']);
    case 'dispatch-failed': return dispatchFailed(action, { dispatchToken: o['dispatch-token'], confirmedNotStarted: o['confirmed-not-started'], evidence: o.evidence ? fs.readFileSync(o.evidence, 'utf8') : undefined });
    case 'event': return ingest(action, { hostAgent: o['host-agent'], event: o.event, result: o.file ? readJSON(o.file) : undefined, stopped: o.stopped, dispatchToken: o['dispatch-token'], progress: o.progress });
    case 'status': case 'result': return status(action);
    case 'wait': return wait(action, ms);
    case 'resume': return resume(action, o.brief);
    case 'cancel': return cancel(action);
    case 'recover': return recover(action);
    case 'accept': return accept(action);
    case 'doctor': return { executors: discover(), root: home(), note: 'No model calls made. Installed/version is not proof of authorization. See references/providers.md.' };
    case 'migrate': check(!(o.apply && o['dry-run']), 'Choose --apply or --dry-run'); return migrate(o.decisions ? readJSON(o.decisions) : {}, o.apply === true);
    case 'materialize': {
      const m = getRun(action), definition = m.invoke?.definition;
      check(m.executor.transport === 'native' && definition && m.status === 'starting', 'Run must return a native definition before materialization');
      check(o.directory, '--directory must be the verified host agent directory');
      const file = path.join(path.resolve(o.directory), `${definition.name}.md`);
      const text = `---\nname: ${definition.name}\ndescription: Isolated Delegate Kit run ${m.id}\nmodel: ${JSON.stringify(definition.model)}\n${definition.effort ? `effort: ${JSON.stringify(definition.effort)}\n` : ''}tools: ${definition.tools.join(', ')}\ndisallowedTools: ${definition.disallowedTools.join(', ')}\n---\n${definition.instructions}\n`;
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      if (fs.existsSync(file)) check(fs.readFileSync(file, 'utf8') === text, 'Managed role path conflicts with an existing file');
      else fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 });
      return { file, name: definition.name, cleanup: 'Remove only this unchanged per-run file after completion; never shared user roles' };
    }
    case '_supervise': await supervise(action, o.claim); return;
    default: return { setup: 'The current chat remains coordinator. Use references/setup.md to create a complete preset; do not infer models or launch paid smoke tests.',
      commands: ['doctor', 'presets list|audit|show ID', 'presets validate|save --file FILE [--revision HASH]', 'presets copy X1 Y2', 'presets set-default X1',
        'context open [--session HOST:ID] [--preset X1] [--task-only]', 'catalog --session HOST:ID [--role ROLE]',
        'prepare --session HOST:ID --task ID --agent PROFILE --brief FILE [--cwd WORKTREE] [--capabilities FILE] [--workspace FILE]',
        'run ID', 'attach ID --host-agent ID [--workspace-id ID]', 'event ID --host-agent ID --dispatch-token TOKEN --event complete --file RESULT --stopped',
        'dispatch-failed ID --dispatch-token TOKEN --confirmed-not-started --evidence FILE', 'status|result|wait|cancel|recover|accept ID', 'resume ID --brief FILE', 'migrate --dry-run [--decisions FILE]'],
      root: home(), note: 'Invoke this script by its installed path. No global dk command is installed. Legacy runs use agent-run.' };
  }
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(value => { if (value !== undefined) console.log(JSON.stringify(value, null, 2)); }).catch(error => {
    console.error(JSON.stringify({ error: error.message })); process.exitCode = 1;
  });
}
