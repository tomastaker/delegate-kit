import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { savePreset, loadPreset, copyPreset, context, setDefault, validatePreset, hash, readJSON } from '../skills/delegate-kit/scripts/presets.mjs';
import { resolveExecutor, bridgeInvocation } from '../skills/delegate-kit/scripts/executors.mjs';
import { FrameDecoder, sumUsage } from '../skills/delegate-kit/scripts/rpc.mjs';
import { migrate } from '../skills/delegate-kit/scripts/migrate.mjs';
import { prepare, launch, wait, resume, attach, ingest as ingestRaw, dispatchFailed, accept, cancel, recover, status, getRun } from '../skills/delegate-kit/scripts/runtime.mjs';

// Host fixtures echo the per-attempt token supplied in the dispatched prompt.
function ingest(id, event) {
  const token = getRun(id).claim;
  return ingestRaw(id, { ...event, dispatchToken: token,
    ...(event.event === 'complete' ? { result: { dispatch_token: token, result: event.result } } : {}) });
}
const dk = fileURLToPath(new URL('../skills/delegate-kit/scripts/dk.mjs', import.meta.url));
const done = { status: 'done', summary: 'verified result', changes: [], checks_run: ['fixture'], not_verified: [], plan: [], findings: [], questions: [], sources: [], next_steps: [] };
const agent = (harness = 'codex', extra = {}) => ({ role: 'researcher', when: 'Bounded investigation', executor: { harness, model: 'test-model', ...(harness === 'pi' || harness === 'omp' ? { provider: 'test-provider' } : {}), ...extra } });
const preset = (id = 'X1', a = agent()) => ({ schema_version: 2, id, defaults: { [a.role]: 'general' }, agents: { general: a } });
const cap = (transport = 'native', harness = 'codex') => ({ verified: true, host: transport === 'native' ? 'codex' : 'paseo', version: 'fixture-v1', harness, transport,
  resume: true, result: true, cancel: true, access: ['read-only', 'workspace-write'], models: [{ id: 'test-model', reasoning: ['high'] }],
  ...(transport === 'paseo' ? { daemon: 'fixture-daemon', mode_ids: { 'read-only': 'read-only', 'workspace-write': 'workspace-write' } } : {}) });

async function sandbox(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-v2-'));
  const old = process.env.DELEGATE_KIT_HOME, oldPath = process.env.PATH;
  process.env.DELEGATE_KIT_HOME = path.join(root, 'state');
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  const fake = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),kind=path.basename(process.argv[1])==='pi-worker.mjs'?'pi':path.basename(process.argv[1]);
const value=f=>args[args.indexOf(f)+1];
const result=${JSON.stringify(done)};
if(args.includes('--version')){console.log('fixture 1.0.0');process.exit(0)}
fs.appendFileSync(${JSON.stringify(path.join(root, 'calls.jsonl'))},JSON.stringify({kind,args})+'\\n');
if(kind==='pi'||kind==='omp') {
 const sessionDir=value('--session-dir');
 const sessionFile=args.includes('--resume')?value('--resume'):args.includes('--session')?value('--session'):path.join(sessionDir,'session.jsonl');
 const sessionId=fs.existsSync(sessionFile)?fs.readFileSync(sessionFile,'utf8'):'session-'+require('node:crypto').randomUUID();
 fs.writeFileSync(sessionFile,sessionId);
 let model={id:value('--model'),provider:value('--provider')},thinkingLevel=value('--thinking'),buffer='';
 const send=o=>process.stdout.write(JSON.stringify(o)+'\\n');
 if(kind==='omp')send({type:'ready',protocolVersion:1,supportedProtocolVersions:process.env.DK_FAKE_RPC_CASE==='protocol'?[1]:[1,2],maxFrameBytes:1048576,maxReassembledFrameBytes:67108864});
 send({type:'extension_ui_request',method:'setStatus',id:'display'});
 process.stdin.on('data',bytes=>{buffer+=bytes;let end;while((end=buffer.indexOf('\\n'))!==-1){const q=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);let data;
 if(q.type==='set_model'){model={id:q.modelId,provider:q.provider};data=model}
 if(q.type==='set_thinking_level')thinkingLevel=q.level;
 if(q.type==='get_state')data={sessionId,sessionFile,model,thinkingLevel:process.env.DK_FAKE_RPC_CASE==='clamp'?'low':thinkingLevel};
 send({id:q.id,type:'response',command:q.type,success:true,...(data?{data}:{})});
 if(q.type==='prompt') {
 if(process.env.DK_FAKE_RPC_CASE==='late-error'){setTimeout(()=>send({id:q.id,type:'response',command:'prompt',success:false,error:'late scheduling failure'}),20);continue;}
 if(process.env.DK_FAKE_RPC_CASE==='nonterminal')send({type:'agent_end',isTerminal:false,messages:[]});
 setTimeout(()=>{send({type:'agent_start'});const last={role:'assistant',model:model.id,provider:model.provider,stopReason:'stop',content:[{type:'text',text:JSON.stringify(result)}]};const messages=[last];
 if(process.env.DK_FAKE_RPC_CASE==='multi-usage'){last.usage={input:200,output:20,totalTokens:220,cost:{total:2}};messages.unshift({role:'assistant',model:model.id,provider:model.provider,stopReason:'toolUse',content:[],usage:{input:100,output:10,totalTokens:110,cost:{total:1}}});for(const message of messages)send({type:'message_end',message});}
 send({type:'agent_end',messages})},Number(process.env.DK_FAKE_DELAY||200));}
 }});process.stdin.on('end',()=>{if(process.env.DK_FAKE_RPC_CASE==='eof')process.stdout.write('{');process.exit(0)});
} else {
 const id=args.includes('resume')?args[args.length-2]:'cli-session-'+require('node:crypto').randomUUID();
 setTimeout(()=>{
 if(process.env.DK_FAKE_BAD) { console.log('{}'); process.exit(0); }
 if(kind==='codex'){fs.writeFileSync(value('-o'),JSON.stringify(result));console.log(JSON.stringify({type:'thread.started',thread_id:id}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:3}}));}
 if(kind==='claude')console.log(JSON.stringify({type:'result',session_id:args.includes('--resume')?value('--resume'):id,structured_output:result}));
 if(kind==='gemini'){console.log(JSON.stringify({type:'init',session_id:args.includes('--resume')?value('--resume'):id}));console.log(JSON.stringify({type:'message',role:'assistant',content:JSON.stringify(result)}));console.log(JSON.stringify({type:'result',status:'success'}));}
 },Number(process.env.DK_FAKE_DELAY||10));
}
`;
  for (const name of ['codex', 'claude', 'gemini', 'pi', 'omp']) fs.writeFileSync(path.join(bin, name), fake, { mode: 0o755 });
  // A fake installed Pi package exercises the SDK bootstrap as well as RPC.
  const piPackage = path.join(root, 'pi-package'), piUser = path.join(root, 'pi-user');
  fs.mkdirSync(piPackage); fs.mkdirSync(piUser);
  fs.writeFileSync(path.join(piUser, 'settings.json'), JSON.stringify({ retry: { enabled: true }, compaction: { enabled: true }, transport: 'sse' }));
  fs.writeFileSync(path.join(piPackage, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', type: 'module', main: './index.mjs' }));
  fs.writeFileSync(path.join(piPackage, 'cli.cjs'), fake, { mode: 0o755 });
  fs.rmSync(path.join(bin, 'pi')); fs.symlinkSync(path.join(piPackage, 'cli.cjs'), path.join(bin, 'pi'));
  fs.writeFileSync(path.join(piPackage, 'index.mjs'), `
    import assert from 'node:assert/strict';
    const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
    export const SettingsManager={inMemory(settings){assert.equal(settings.retry.enabled,false);assert.equal(settings.compaction.enabled,false);assert.equal(settings.transport,'sse');return settings;}};
    export const SessionManager={create(cwd,dir){return {cwd,dir}},open(file){return {file}}};
    export const getAgentDir=()=>${JSON.stringify(piUser)};
    export async function createAgentSessionServices(o){assert.equal(o.resourceLoaderOptions.noExtensions,true);assert.equal(o.resourceLoaderOptions.noSkills,true);return {modelRuntime:{getAvailableSnapshot:()=>[{id:value('--model'),provider:value('--provider')}]},diagnostics:[]};}
    export async function createAgentSessionFromServices(o){assert.ok(!o.tools.includes('bash'));assert.ok(o.tools.includes('read'));return {session:{}};}
    export async function createAgentSessionRuntime(factory,o){return factory(o);}
    export async function runRpcMode(){await import('./cli.cjs');}
  `);
  process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
  const brief = path.join(root, 'brief.md'); fs.writeFileSync(brief, 'Return evidence for a bounded test task.');
  try { await fn({ root, brief, state: process.env.DELEGATE_KIT_HOME }); }
  finally {
    delete process.env.DK_FAKE_DELAY; delete process.env.DK_FAKE_BAD; delete process.env.DK_FAKE_RPC_CASE;
    process.env.PATH = oldPath;
    if (old === undefined) delete process.env.DELEGATE_KIT_HOME; else process.env.DELEGATE_KIT_HOME = old;
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const invoke = args => spawnSync(process.execPath, [dk, ...args], { encoding: 'utf8', env: process.env });
function parallel(args) {
  return new Promise(resolve => { const c = spawn(process.execPath, [dk, ...args], { env: process.env }); let out = '', err = ''; c.stdout.on('data', b => out += b); c.stderr.on('data', b => err += b); c.on('close', code => resolve({ code, out, err })); });
}
function setup() { savePreset(preset()); setDefault('X1'); return context({ session: 'test:chat' }); }
function prep(brief, extra = {}) { return prepare({ session: 'test:chat', task: 'task', agent: 'general', brief, ...extra }).runs[0]; }

test('P01–P08: session selection, task overrides, copy and broken inactive preset isolation', () => sandbox(async ({ state }) => {
  savePreset(preset()); copyPreset('X1', 'Y2'); setDefault('X1');
  assert.equal(context({ session: 'codex:A' }).preset.id, 'X1');
  assert.equal(context({ session: 'codex:B', preset: 'Y2' }).preset.id, 'Y2');
  setDefault('Y2'); assert.equal(context({ session: 'codex:A' }).preset.id, 'X1');
  assert.equal(context({ session: 'codex:A', preset: 'Y2', taskOnly: true }).preset.id, 'Y2');
  assert.equal(context({ session: 'codex:A' }).preset.id, 'X1');
  assert.throws(() => context({ session: 'codex:A', preset: 'Missing' }), /Unknown preset/);
  fs.writeFileSync(path.join(state, 'presets/broken.json'), '{');
  assert.equal(context({ session: 'codex:A' }).preset.id, 'X1');
  const audit = JSON.parse(invoke(['presets', 'audit']).stdout); assert.equal(audit.find(p => p.file === 'broken.json').valid, false);
  const y = loadPreset('Y2'); y.preset.agents.general.executor.model = 'different'; savePreset(y.preset, y.revision);
  assert.equal(loadPreset('X1').preset.agents.general.executor.model, 'test-model');
  assert.throws(() => copyPreset('X1', 'Y2'), /already exists/);
}));
test('P09: competing revision edits and parallel chat bindings cannot lose updates', () => sandbox(async ({ root }) => {
  setup(); copyPreset('X1', 'Y2'); const p = loadPreset('X1');
  const files = ['A', 'B'].map(name => { const file = path.join(root, name + '.json'); fs.writeFileSync(file, JSON.stringify({ ...p.preset, name })); return file; });
  const edits = await Promise.all(files.map(file => parallel(['presets', 'save', '--file', file, '--revision', p.revision])));
  assert.equal(edits.filter(e => e.code === 0).length, 1); assert.equal(edits.filter(e => e.code !== 0).length, 1);
  const bindings = await Promise.all(['X1', 'Y2'].map(id => parallel(['context', 'open', '--session', `host:${id}`, '--preset', id])));
  assert.deepEqual(bindings.map(b => JSON.parse(b.out).preset), ['X1', 'Y2']);
}));
test('P10/R02/R05/R06: strict schema, case collisions, arbitrary specialists and review references', () => sandbox(async () => {
  setup(); assert.throws(() => savePreset(preset('x1')), /already exists/);
  assert.throws(() => loadPreset('../X1'), /letters/);
  for (const change of [p => p.schema_version = 99, p => p.extra = 1, p => delete p.agents.general.executor.model,
    p => p.agents.general.executor.model = 'REPLACE_WITH_MODEL', p => p.defaults.reviewer = 'absent']) {
    const p = preset(); change(p); assert.throws(() => validatePreset(p));
  }
  const p = preset(); p.agents.docs = { ...agent(), role: 'docs-specialist' }; validatePreset(p);
  assert.equal(resolveExecutor(p.agents.docs).access, 'read-only');
  p.agents.general.review = { also_run: ['general'] }; assert.throws(() => validatePreset(p), /reference/);
  p.agents.second = { ...agent(), role: 'reviewer' }; p.agents.general.review.also_run = ['second', 'second']; assert.throws(() => validatePreset(p), /duplicate/);
  p.agents.general.role = 'reviewer'; p.defaults = {}; p.agents.general.review.also_run = ['second']; p.agents.second.review = { also_run: ['general'] }; assert.throws(() => validatePreset(p), /cycle/);
}));
test('R03/R04/S02: incompatible provider, reasoning, harness and native access fail explicitly', () => {
  assert.throws(() => resolveExecutor(agent('gemini', { reasoning: 'high' })), /reasoning/);
  assert.throws(() => resolveExecutor(agent('claude', { provider: 'another' })), /provider/);
  assert.throws(() => resolveExecutor(agent('codex', { reasoning: 'fantasy' })), /reasoning/);
  assert.throws(() => resolveExecutor(agent('codex', { transport: 'native' }), [cap('native', 'omp')]), /cannot preserve/);
  assert.throws(() => resolveExecutor(agent('codex', { transport: 'native' }), [{ ...cap(), access: [] }]), /cannot preserve/);
  const a = agent('codex', { transport: 'native', inherit_model: true }); delete a.executor.model;
  assert.throws(() => resolveExecutor(a, [cap()]), /cannot preserve/);
  assert.equal(resolveExecutor(a, [{ ...cap(), current_model: 'test-model' }]).model, 'test-model');
});
test('R01/L02/L03/S01: actual launch argv and resume preserve immutable preset settings', () => sandbox(async ({ brief, state, root }) => {
  setup(); const p = loadPreset('X1'); p.preset.agents.general.executor.model = 'test-$(touch SHOULD_NOT_EXIST);`echo bad`'; savePreset(p.preset, p.revision);
  const r = prep(brief, { cwd: root }); launch(r.id); const first = await wait(r.id, 5000); assert.equal(first.status, 'finished', first.error);
  const edited = loadPreset('X1'); edited.preset.agents.general.executor.model = 'new-model'; savePreset(edited.preset, edited.revision);
  const continuation = resume(r.id, brief); launch(continuation.id); const second = await wait(continuation.id, 5000);
  assert.equal(second.status, 'finished', second.error); assert.equal(second.transport_session_id, first.transport_session_id);
  assert.equal(second.executor.model, first.executor.model); assert.equal(second.attempt_kind, 'continuation');
  const calls = fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.every(c => c.args.includes(first.executor.model))); assert.equal(calls.length, 2);
  assert.equal(fs.existsSync(path.join(root, 'SHOULD_NOT_EXIST')), false);
  assert.equal(readJSON(path.join(state, 'runs', second.id, 'preset.snapshot.json')).agents.general.executor.model, first.executor.model);
  assert.equal(accept(second.id).accepted, true);
}));
test('L01/L04/L07: waiting and repeated dispatch never restart; exit zero cannot validate bad output', () => sandbox(async ({ brief, root }) => {
  setup(); process.env.DK_FAKE_DELAY = '500'; const r = prep(brief); launch(r.id);
  assert.throws(() => launch(r.id), /do not dispatch twice/);
  const pending = await wait(r.id, 40); assert.equal(pending.wait_timed_out, true); assert.ok(['starting', 'running'].includes(pending.status));
  assert.equal((await wait(r.id, 5000)).status, 'finished');
  process.env.DK_FAKE_BAD = '1'; const bad = prep(brief); launch(bad.id);
  const failed = await wait(bad.id, 5000); assert.equal(failed.status, 'failed'); assert.equal(failed.result_validated, false);
  assert.equal(fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').length, 2);
}));
test('Pi and OMP: acknowledged prompt stays running; exact RPC session is continued', () => sandbox(async ({ brief, root }) => {
  for (const harness of ['pi', 'omp']) {
    savePreset(preset(harness, agent(harness, { reasoning: 'high' }))); context({ session: 'test:chat', preset: harness });
    process.env.DK_FAKE_DELAY = '350'; const r = prep(brief, { task: harness }); launch(r.id);
    assert.equal((await wait(r.id, 100)).wait_timed_out, true);
    const first = await wait(r.id, 5000); assert.equal(first.status, 'finished', first.error); assert.equal(first.actual_model, 'test-model');
    const next = resume(r.id, brief); launch(next.id); const second = await wait(next.id, 5000);
    assert.equal(second.status, 'finished', second.error); assert.equal(second.transport_session_id, first.transport_session_id);
    assert.equal(getRun(next.id).transport_session_file, getRun(r.id).transport_session_file);
    assert.deepEqual(readJSON(path.join(root,'pi-user/settings.json')), {retry:{enabled:true},compaction:{enabled:true},transport:'sse'});
  }
}));
test('L09: LF, UTF8 partial data and strict OMP v2 reassembly', () => {
  const events = [], text = JSON.stringify({ type: 'event', text: '\u0441\u0442\u0440\u043e\u043a\u0430\u2028not a new frame\u2029' });
  const d = new FrameDecoder('pi', e => events.push(e)); const bytes = Buffer.from(text + '\n');
  for (const b of bytes) d.push(Buffer.from([b])); d.end(); assert.equal(events.length, 1);
  const decoded = [], omp = new FrameDecoder('omp', e => decoded.push(e)); omp.v2 = true;
  const buffer = Buffer.from(text), chunks = [buffer.subarray(0, 11), buffer.subarray(11)];
  chunks.forEach((part, index) => omp.push(Buffer.from(JSON.stringify({ type: 'rpc_chunk', chunkId: 'x', index, count: 2, byteLength: buffer.length, data: part.toString('base64') }) + '\n')));
  assert.equal(decoded[0].text, events[0].text); omp.end();
  const invalid = new FrameDecoder('omp', () => {}); invalid.v2 = true;
  const frame = { type: 'rpc_chunk', chunkId: 'x', index: 1, count: 2, byteLength: 6, data: 'e30=' };
  assert.throws(() => invalid.frame(frame), /out of order/);
  const partial = new FrameDecoder('pi', () => {}); partial.push(Buffer.from('{')); assert.throws(() => partial.end(), /Incomplete/);
  assert.throws(() => new FrameDecoder('pi', () => {}).frame({ ...frame, index: 0 }), /require negotiated/);
});
test('L10/R06: required review set reserves all slots; parallel admission obeys caps', () => sandbox(async ({ brief }) => {
  const p = preset(); p.agents.general.role = 'reviewer'; p.defaults = {}; p.agents.general.review = { also_run: ['second'] };
  p.agents.second = { ...agent(), role: 'reviewer' }; p.limits = { max_workers: 1 }; savePreset(p); setDefault('X1'); context({ session: 'test:chat' });
  assert.throws(() => prep(brief), /not partially admitted/);
  const current = loadPreset('X1'); delete current.preset.agents.general.review; savePreset(current.preset, current.revision);
  const calls = await Promise.all(Array.from({ length: 5 }, () => parallel(['prepare', '--session', 'test:chat', '--task', 'race', '--agent', 'general', '--brief', brief])));
  assert.equal(calls.filter(c => c.code === 0).length, 1); assert.equal(calls.filter(c => c.code !== 0).length, 4);
}));
test('native bridge: preparation, unique sessions, attach idempotence, correlated completion and same-agent follow-up', () => sandbox(async ({ brief }) => {
  const p = preset('X1', agent('codex', { transport: 'native' })); savePreset(p); setDefault('X1'); context({ session: 'test:chat' });
  const r = prep(brief, { capabilities: [cap()] }); assert.equal(r.status, 'prepared');
  const call = launch(r.id); assert.equal(call.status, 'starting'); assert.equal(call.invoke.arguments.model, 'test-model'); assert.equal(call.invoke.arguments.fork_turns, 'none');
  attach(r.id, 'host-agent'); attach(r.id, 'host-agent'); assert.throws(() => attach(r.id, 'another-agent'), /Already attached/);
  assert.throws(() => ingest(r.id, { hostAgent: 'wrong', event: 'complete', result: done, stopped: true }), /correlated/);
  ingest(r.id, { hostAgent: 'host-agent', event: 'complete', result: done, stopped: true });
  const next = resume(r.id, brief); assert.equal(launch(next.id).invoke.arguments.target, 'host-agent');
  attach(next.id, 'host-agent'); ingest(next.id, { hostAgent: 'host-agent', event: 'complete', result: done, stopped: true });
  assert.equal(accept(next.id).accepted, true);
}));
test('PA01–PA04: Paseo materializes own settings, preserves daemon/workspace and rejects unsupported harness', () => sandbox(async ({ brief }) => {
  savePreset(preset('X1', agent('codex', { transport: 'paseo', reasoning: 'high' }))); setDefault('X1'); context({ session: 'test:chat' });
  const r = prep(brief, { capabilities: [cap('paseo')], workspace: { owner: 'paseo', id: 'ws', daemon: 'fixture-daemon', remote: true }, cwd: '/remote/not-local' });
  const call = launch(r.id); assert.equal(call.invoke.arguments.provider, 'codex/test-model'); assert.equal(call.invoke.arguments.settings.thinkingOptionId, 'high');
  assert.equal(call.invoke.daemon, 'fixture-daemon'); assert.ok(!('profile' in call.invoke.arguments));
  assert.throws(() => attach(r.id, 'a1', 'wrong'), /different workspace/); attach(r.id, 'a1', 'ws');
  ingest(r.id, { hostAgent: 'a1', event: 'complete', result: done, stopped: true });
  const next = resume(r.id, brief); const follow = launch(next.id); assert.equal(follow.invoke.tool, 'send_agent_prompt'); assert.equal(follow.invoke.arguments.agentId, 'a1');
  attach(next.id, 'a1', 'ws'); ingest(next.id, { hostAgent: 'a1', event: 'complete', result: done, stopped: true });
  assert.throws(() => resolveExecutor(agent('omp', { transport: 'paseo' }), [cap('paseo')]), /cannot preserve/);
}));
test('L05: writer cancellation preserves partial edits and releases only after process termination', () => sandbox(async ({ root, brief }) => {
  const repo = path.join(root, 'repo'), wt = path.join(root, 'wt'); fs.mkdirSync(repo);
  const git = a => { const r = spawnSync('git', a, { cwd: repo, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  git(['init', '-q']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'fixture']); git(['worktree', 'add', '-qb', 'test-writer', wt]);
  const a = agent(); a.role = 'implementer'; savePreset(preset('X1', a)); setDefault('X1'); context({ session: 'test:chat' });
  process.env.DK_FAKE_DELAY = '10000'; const r = prep(brief, { cwd: wt }); fs.writeFileSync(path.join(wt, 'partial.txt'), 'keep me'); launch(r.id);
  await wait(r.id, 300); const stopped = await cancel(r.id); assert.equal(stopped.status, 'cancelled'); assert.equal(stopped.error, null);
  assert.equal(fs.readFileSync(path.join(wt, 'partial.txt'), 'utf8'), 'keep me'); assert.equal(fs.existsSync(getRun(r.id).workspace.lock), false);
}));
test('M01/M02: migration materializes shared roles/ladders, rejects ambiguity and is idempotent', () => sandbox(async ({ state }) => {
  fs.mkdirSync(state, { recursive: true }); const config = { roles: { researcher: { backend: 'codex', model: 'research' } }, profiles: { x1: { roles: { implementer: [{ backend: 'claude', model: 'builder' }, { backend: 'codex', model: 'complex', effort: 'high' }] } } }, limits: { max_runs: 4 } };
  fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify(config));
  const plan = migrate(); assert.equal(plan.issues.length, 0); assert.equal(Object.keys(plan.presets[0].agents).length, 3); assert.equal(fs.existsSync(path.join(state, 'presets')), false);
  migrate({ default_preset: 'x1' }, true); const p = loadPreset('x1'); p.preset.name = 'edited'; savePreset(p.preset, p.revision);
  assert.equal(migrate({ default_preset: 'x1' }, true).already_migrated, true); assert.equal(loadPreset('x1').preset.name, 'edited');
  config.profiles.x1.roles.implementer = [{ model: 'ambiguous' }]; fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify(config));
  assert.ok(migrate().issues.some(i => i.includes('declare parents'))); assert.throws(() => migrate({}, true), /requires decisions/);
}));
test('U01/U03/M03: absent setup, relocated package and concrete legacy-run diagnostics', () => sandbox(async ({ state, root }) => {
  assert.throws(() => context({ session: 'new' }), /No preset/);
  const moved = path.join(root, 'installed skill'); fs.cpSync(path.dirname(path.dirname(dk)), moved, { recursive: true });
  const help = spawnSync(process.execPath, [path.join(moved, 'scripts/dk.mjs'), 'help'], { cwd: root, env: process.env, encoding: 'utf8' }); assert.equal(help.status, 0, help.stderr);
  fs.mkdirSync(path.join(state, 'runs', 'old'), { recursive: true }); fs.writeFileSync(path.join(state, 'runs', 'old/meta.json'), JSON.stringify({ id: 'old', model: 'saved-model', status: 'running' }));
  assert.throws(() => status('old'), /Legacy run.*agent-run/);
}));


test('RPC lifecycle: nonterminal agent_end, late errors, clamped reasoning and unsupported version', () => sandbox(async ({ brief }) => {
  savePreset(preset('X1', agent('omp', { reasoning: 'high' }))); setDefault('X1'); context({ session: 'test:chat' });
  process.env.DK_FAKE_RPC_CASE = 'nonterminal'; process.env.DK_FAKE_DELAY = '400';
  const valid = prep(brief); launch(valid.id); assert.equal((await wait(valid.id, 100)).wait_timed_out, true);
  assert.equal((await wait(valid.id, 5000)).status, 'finished');
  for (const scenario of ['late-error', 'clamp', 'protocol', 'eof']) {
    process.env.DK_FAKE_RPC_CASE = scenario;
    const r = prep(brief); launch(r.id); const result = await wait(r.id, 5000);
    assert.equal(result.status, 'failed', `${scenario}: ${result.error}`); assert.equal(result.accepted, false); if(scenario !== 'eof') assert.equal(result.result_validated, false);
  }
}));

test('orphaned supervisor retains capacity while its child lives; cancellation recovers it', () => sandbox(async ({ brief }) => {
  setup(); process.env.DK_FAKE_DELAY = '10000';
  const r = prep(brief); launch(r.id);
  let m;
  for (let i = 0; i < 50; i++) { m = getRun(r.id); if (m.child_pid) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(m.child_pid); process.kill(m.pid, 'SIGKILL');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(status(r.id).status, 'orphaned');
  assert.throws(() => recover(r.id), /may still be writing/);
  assert.equal((await cancel(r.id)).status, 'cancelled');
}));

test('mandatory reviewer cannot be skipped at acceptance and counters include continuations once', () => sandbox(async ({ brief, state }) => {
  const p = preset(); p.agents.general.role = 'reviewer'; p.defaults = {}; p.agents.general.review = { also_run: ['second'] };
  p.agents.second = { ...agent(), role: 'reviewer' }; p.limits = { max_runs: 3, max_retries: 1 };
  savePreset(p); setDefault('X1'); context({ session: 'test:chat' });
  const group = prepare({ session: 'test:chat', task: 'reviews', agent: 'general', brief });
  launch(group.runs[0].id); await wait(group.runs[0].id, 5000);
  assert.throws(() => accept(group.runs[0].id), /second/);
  launch(group.runs[1].id); await wait(group.runs[1].id, 5000); assert.equal(accept(group.runs[0].id).accepted, true);
  const attempt = resume(group.runs[0].id, brief); assert.throws(() => accept(group.runs[1].id), /latest attempt/); launch(attempt.id); await wait(attempt.id, 5000);
  assert.throws(() => resume(attempt.id, brief), /max 3 runs|retries/);
  const m = getRun(attempt.id); const count = readJSON(path.join(state, 'tasks', `${m.budget_task}.json`));
  assert.equal(count.runs, 3); assert.equal(count.retries.general, 1);
}));

test('Claude and Gemini retained adapters work through the v2 snapshot runner', () => sandbox(async ({ brief }) => {
  for (const harness of ['claude', 'gemini']) {
    savePreset(preset(harness, agent(harness))); context({ session: 'test:chat', preset: harness });
    const r = prep(brief, { task: harness }); launch(r.id); const first = await wait(r.id, 5000); assert.equal(first.status, 'finished', first.error);
    const n = resume(r.id, brief); launch(n.id); const next = await wait(n.id, 5000);
    assert.equal(next.status, 'finished', next.error); assert.equal(next.transport_session_id, first.transport_session_id);
  }
}));

test('P03: simultaneous X1/Y2 native definitions never repin a shared role', () => sandbox(async ({ brief, root }) => {
  const p = preset('X1', agent('claude', { transport: 'native' })); savePreset(p); copyPreset('X1', 'Y2');
  const y = loadPreset('Y2'); y.preset.agents.general.executor.model = 'other-model'; savePreset(y.preset, y.revision);
  setDefault('X1'); context({ session: 'host:X1' }); context({ session: 'host:Y2', preset: 'Y2' });
  const capabilities = [{ ...cap('native', 'claude'), host: 'claude', dynamic_roles: true, models: [{ id: 'test-model' }, { id: 'other-model' }] }];
  const ids = ['X1', 'Y2'].map(team => prepare({ session: `host:${team}`, task: 'task', agent: 'general', brief, capabilities }).runs[0].id);
  const calls = ids.map(launch); assert.notEqual(calls[0].invoke.definition.name, calls[1].invoke.definition.name);
  const directory = path.join(root, 'native agents'); fs.mkdirSync(directory); fs.writeFileSync(path.join(directory, 'user-role.md'), 'user definition');
  for (const id of ids) { const r = invoke(['materialize', id, '--directory', directory]); assert.equal(r.status, 0, r.stderr); }
  assert.equal(fs.readFileSync(path.join(directory, `${calls[0].invoke.definition.name}.md`), 'utf8').includes('test-model'), true);
  assert.equal(fs.readFileSync(path.join(directory, `${calls[1].invoke.definition.name}.md`), 'utf8').includes('other-model'), true);
  assert.equal(fs.readFileSync(path.join(directory, 'user-role.md'), 'utf8'), 'user definition');
}));

test('U03: shipped v2 example requires replacing placeholders; relocated skill references resolve', t => {
  const source = path.dirname(path.dirname(dk)), relocated = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-package-'));
  t.after(() => fs.rmSync(relocated, { recursive: true, force: true }));
  const skill = path.join(relocated, 'skill'); fs.cpSync(source, skill, { recursive: true });
  const p = readJSON(path.join(skill, 'examples/config.json'));
  assert.throws(() => validatePreset(p), /placeholder/);
  for (const a of Object.values(p.agents)) a.executor.model = 'verified-model';
  validatePreset(p);
  const files = [path.join(skill, 'SKILL.md'), ...fs.readdirSync(path.join(skill, 'references')).filter(f => f.endsWith('.md')).map(f => path.join(skill, 'references', f))];
  for (const file of files) for (const [, link] of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(link)) continue;
    assert.ok(fs.existsSync(path.resolve(path.dirname(file), link.split('#')[0])), `${file}: missing ${link}`);
  }
});


test('Native failed dispatch releases its reservation only with confirmed host evidence', () => sandbox(async ({ brief }) => {
  const p = preset('X1', agent('codex', { transport: 'native' })); p.limits = { max_workers: 1 };
  savePreset(p); setDefault('X1'); context({ session: 'test:chat' });
  const r = prep(brief, { capabilities: [cap()] }); const call = launch(r.id);
  await cancel(r.id);
  assert.throws(() => dispatchFailed(r.id, { dispatchToken: call.dispatch_token, evidence: 'timed out' }), /confirming/);
  assert.throws(() => prep(brief, { capabilities: [cap()] }), /max 1/);
  assert.equal(dispatchFailed(r.id, { dispatchToken: call.dispatch_token, confirmedNotStarted: true, evidence: 'Host rejected request before creating an agent' }).status, 'cancelled');
  const next = prep(brief, { capabilities: [cap()] }); launch(next.id); await cancel(next.id);
  attach(next.id, 'late-host-id'); assert.equal(status(next.id).status, 'cancelling');
  ingest(next.id, { hostAgent: 'late-host-id', event: 'running' }); assert.equal(status(next.id).status, 'cancelling');
  ingest(next.id, { hostAgent: 'late-host-id', event: 'permission' }); assert.equal(status(next.id).status, 'cancelling');
  assert.throws(() => dispatchFailed(next.id, { dispatchToken: getRun(next.id).claim, confirmedNotStarted: true, evidence: 'no' }), /unattached/);
  assert.equal(ingest(next.id, { hostAgent: 'late-host-id', event: 'cancelled', stopped: true }).status, 'cancelled');
}));

test('Native continuation rejects a previous turn result even if caller labels it with the new token', () => sandbox(async ({ brief }) => {
  savePreset(preset('X1', agent('codex', { transport: 'native' }))); setDefault('X1'); context({ session: 'test:chat' });
  const r = prep(brief, { capabilities: [cap()] }); const first = launch(r.id); attach(r.id, 'host');
  const old = { dispatch_token: first.dispatch_token, result: done };
  ingest(r.id, { hostAgent: 'host', event: 'complete', result: done, stopped: true });
  const next = resume(r.id, brief); const second = launch(next.id); attach(next.id, 'host');
  assert.notEqual(first.dispatch_token, second.dispatch_token);
  assert.ok(second.invoke.arguments.message.includes(second.dispatch_token));
  assert.throws(() => ingestRaw(next.id, { hostAgent: 'host', dispatchToken: first.dispatch_token, event: 'complete', result: old, stopped: true }), /token/);
  assert.throws(() => ingestRaw(next.id, { hostAgent: 'host', dispatchToken: second.dispatch_token, event: 'complete', result: old, stopped: true }), /token/);
  assert.equal(status(next.id).status, 'running');
  ingest(next.id, { hostAgent: 'host', event: 'complete', result: done, stopped: true }); assert.equal(accept(next.id).accepted, true);
  const rejected = resume(next.id, brief), call = launch(rejected.id);
  assert.equal(dispatchFailed(rejected.id, { dispatchToken: call.dispatch_token, confirmedNotStarted: true, evidence: 'Host rejected follow-up before starting a new turn in existing session' }).status, 'failed');
  assert.equal(getRun(rejected.id).transport_session_id, 'host');
  const retry = resume(rejected.id, brief); assert.equal(retry.transport_session_id, 'host'); await cancel(retry.id);
}));

test('No implicit worker cap; coordinator can admit independent workers', () => sandbox(async ({ brief }) => {
  setup(); const runs = Array.from({ length: 3 }, () => prep(brief));
  assert.equal(runs.length, 3); assert.equal(getRun(runs[0].id).limits.workers, null);
  for (const r of runs) await cancel(r.id);
}));

test('Watchdog reports an alive but quiet CLI without killing it or losing ownership', () => sandbox(async ({ brief }) => {
  setup(); process.env.DK_FAKE_DELAY = '10000'; const r = prep(brief, { stallMs: 150 }); launch(r.id);
  const observed = await wait(r.id, 2000);
  assert.equal(observed.status, 'running'); assert.equal(observed.health.state, 'no_progress');
  assert.equal(observed.health.attention_required, true); assert.equal(getRun(r.id).status, 'running');
  await cancel(r.id);
}));

test('Watchdog requests native status and preserves progress age across unchanged probes', () => sandbox(async ({ brief, state }) => {
  savePreset(preset('X1', agent('codex', { transport: 'native' }))); setDefault('X1'); context({ session: 'test:chat' });
  const r = prep(brief, { capabilities: [cap()] }); launch(r.id); attach(r.id, 'host');
  const file = path.join(state, 'runs', r.id, 'meta.json'), m = getRun(r.id);
  m.host_checked_at = new Date(Date.now() - 61000).toISOString(); fs.writeFileSync(file, JSON.stringify(m));
  assert.equal((await wait(r.id, 1000)).health.state, 'check_host');
  ingest(r.id, { hostAgent: 'host', event: 'running', progress: 'cursor1' });
  const stale = getRun(r.id); stale.progress_at = new Date(Date.now() - 301000).toISOString(); fs.writeFileSync(file, JSON.stringify(stale));
  ingest(r.id, { hostAgent: 'host', event: 'running', progress: 'cursor1' });
  assert.equal((await wait(r.id, 1000)).health.state, 'no_progress');
  ingest(r.id, { hostAgent: 'host', event: 'running', progress: 'cursor2' });
  assert.equal(status(r.id).health.attention_required, false);
}));

test('Watchdog detects frozen supervisor heartbeats while the process remains alive', () => sandbox(async ({ brief, state }) => {
  setup(); process.env.DK_FAKE_DELAY = '10000'; const r = prep(brief); launch(r.id); await wait(r.id, 300);
  const m = getRun(r.id); process.kill(m.pid, 'SIGSTOP');
  try {
    fs.writeFileSync(path.join(state, 'runs', r.id, 'heartbeat.json'), JSON.stringify({ pid: m.pid, claim: m.claim, at: new Date(Date.now() - 31000).toISOString() }));
    assert.equal(status(r.id).health.state, 'supervisor_unresponsive');
  } finally { process.kill(m.pid, 'SIGCONT'); await cancel(r.id); }
}));

test('Migration retains an explicit parent harness and refuses ambiguous family routing', () => sandbox(async ({ state }) => {
  fs.mkdirSync(state, { recursive: true });
  const config = { backends: { custom: { family: 'gpt', adapter: 'opencode' } }, profiles: { x1: { roles: { researcher: { family: 'gpt', runner: 'auto', model: 'provider/model' } } } } };
  fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify(config));
  assert.ok(migrate().issues.some(i => i.includes('parent-dependent')));
  const plan = migrate({ parents: { x1: 'custom' } }); assert.deepEqual(plan.issues, []);
  assert.equal(plan.presets[0].agents['researcher-1'].executor.harness, 'opencode');
}));

test('RPC usage includes tool-call turns once and keeps absent measurements unknown', () => {
  const first = { usage: { input: 100, output: 10, totalTokens: 110, cost: { total: 1 } } };
  const last = { usage: { input: 200, output: 20, totalTokens: 220, cost: { total: 2 } } };
  assert.deepEqual(sumUsage([first, last]), { input: 300, output: 30, totalTokens: 330, cost: { total: 3 } });
  assert.equal(sumUsage([first, {}]), null);
  assert.equal(sumUsage([first, { usage: { input: 5 } }]).cost, null);
});


test('RPC supervisor records complete current-turn usage without double-counting message_end', () => sandbox(async ({ brief }) => {
  for (const harness of ['pi', 'omp']) {
    savePreset(preset(harness, agent(harness))); setDefault(harness); context({ session: 'test:chat', preset: harness });
    process.env.DK_FAKE_RPC_CASE = 'multi-usage'; const r = prep(brief); launch(r.id);
    const result = await wait(r.id, 5000); assert.equal(result.status, 'finished', result.error);
    assert.equal(result.usage.totalTokens, 330); assert.equal(result.cost_usd, 3);
    const n = resume(r.id, brief); launch(n.id); const next = await wait(n.id, 5000);
    assert.equal(next.usage.totalTokens, 330); assert.equal(next.cost_usd, 3);
  }
}));


test('Live smoke requires opt-in and never calls models when showing help', () => sandbox(async ({ root, state }) => {
  const file = fileURLToPath(new URL('./live-codex.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [file], { cwd: root, env: process.env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /--execute/);
  assert.equal(fs.existsSync(path.join(state, 'runs')), false);
}));

test('Installed CLI runs through a skill-directory symlink', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-symlink-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.dirname(path.dirname(dk)), installed = path.join(root, 'installed'), linked = path.join(root, 'skill-link');
  fs.cpSync(source, installed, { recursive: true }); fs.symlinkSync(installed, linked, 'dir');
  const result = spawnSync(process.execPath, [path.join(linked, 'scripts/dk.mjs'), 'help'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).commands.includes('run ID'));
  validatePreset(readJSON(path.join(installed, 'examples/main.json')));
  const limits = spawnSync(process.execPath, [path.join(linked, 'scripts/limits.mjs'), '--max-workers', '2'], { encoding: 'utf8' });
  assert.equal(limits.status, 0, limits.stderr); assert.equal(JSON.parse(limits.stdout).workers, 2);
  const pi = spawnSync(process.execPath, [path.join(linked, 'scripts/pi-worker.mjs'), '--sdk', path.join(root, 'absent-sdk.mjs')], { encoding: 'utf8' });
  assert.equal(pi.status, 1); assert.match(pi.stderr, /Pi SDK startup failed/);
});


test('Native writers require an enforced binding to the leased worktree before admission', () => sandbox(async ({ root, brief, state }) => {
  const repo = path.join(root, 'repo'), wt = path.join(root, 'writer'), alias = path.join(root, 'writer-link');
  fs.mkdirSync(repo);
  const git = args => { const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git(['init', '-q']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture']);
  git(['worktree', 'add', '-qb', 'writer', wt]); fs.symlinkSync(wt, alias);
  const lock = path.join(spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: wt, encoding: 'utf8' }).stdout.trim(), 'delegate-kit.lock');
  for (const harness of ['codex', 'claude']) {
    savePreset(preset(harness, { ...agent(harness, { transport: 'native' }), role: 'implementer' }));
    context({ session: 'test:chat', preset: harness });
    const host = { ...cap('native', harness), host: harness, dynamic_roles: true };
    for (const binding of [undefined, { cwd: repo, enforced: true }, { cwd: wt, enforced: false }, { cwd: 'writer', enforced: true }]) {
      assert.throws(() => prep(brief, { cwd: wt, capabilities: [{ ...host, workspace_binding: binding }] }), /Native writer requires.*worktree/);
      assert.equal(fs.existsSync(lock), false);
      assert.equal(fs.existsSync(path.join(state, 'runs')) && fs.readdirSync(path.join(state, 'runs')).length > 0, false);
    }
  }
  const host = { ...cap(), workspace_binding: { cwd: alias, enforced: true } };
  context({ session: 'test:chat', preset: 'codex' });
  const r = prep(brief, { cwd: wt, capabilities: [host] });
  assert.equal(fs.existsSync(lock), true);
  assert.equal(bridgeInvocation(getRun(r.id), 'task').tool, 'spawn_agent');
  const legacy = getRun(r.id); delete legacy.executor.capability.workspace_binding;
  assert.throws(() => bridgeInvocation(legacy, 'task'), /Native writer requires/);
  legacy.resume_of = 'previous'; legacy.transport_session_id = 'host-agent';
  assert.throws(() => bridgeInvocation(legacy, 'continue'), /Native writer requires/);
  await cancel(r.id);
}));
