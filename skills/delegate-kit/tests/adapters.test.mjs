import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectPermissions, narrowPermissions, mergeInline } from '../scripts/opencode-permissions.mjs';
import { buildCommand, extractResult } from '../scripts/adapters.mjs';
const skillDir = new URL('..', import.meta.url).pathname;
const schema = JSON.parse(fs.readFileSync(path.join(skillDir, 'references/result-schema.json')));
const done = { status: 'done', summary: 'Checked', changes: [], checks_run: [], not_verified: [], plan: [], findings: [], questions: [], sources: [], next_steps: [] };
const build = (adapter, extra = {}) => buildCommand({ adapter, model: null, effort: null, prompt: 'task', write: false, skillDir, ...extra });
test('Codex inheritance omits model/effort on fresh and resume; sandbox persists', () => {
  for (const resumeId of [null, 'exact-thread']) {
    const b = build('codex', { resumeId });
    assert.ok(!b.args.includes('-m')); assert.ok(!b.args.some(a => a.startsWith('model_reasoning_effort=')));
    assert.ok(b.args.includes('sandbox_mode="read-only"')); assert.ok(b.args.includes('agents.enabled=false'));
    if (resumeId) assert.ok(b.args.includes(resumeId));
  }
});
test('Claude readonly excludes shell/delegation/MCP and preserves explicit model', () => {
  const b = build('claude', { model: 'user-choice', effort: 'high' });
  assert.ok(b.args.includes('user-choice')); assert.ok(b.args.includes('Agent,Task'));
  assert.ok(b.args.includes('Read,Glob,Grep,WebFetch,WebSearch')); assert.ok(b.args.includes('--strict-mcp-config'));
  assert.ok(!b.args.includes('--dangerously-skip-permissions'));
});
test('Gemini has no invented effort and writer retains sandbox', () => {
  assert.throws(() => build('gemini', { effort: 'high' }), /does not expose/);
  const b = build('gemini', { write: true });
  assert.ok(b.args.includes('--sandbox')); assert.ok(b.args.includes('auto_edit')); assert.ok(!b.args.includes('yolo'));
});
test('OpenCode model stays one argument and read-only tools cannot edit or delegate', () => {
  const b = build('opencode', { model: 'provider/model', permissionRules: [{ permission: '*', pattern: '*', action: 'allow' }], prompt: 'text $(touch /tmp/not-executed)' });
  assert.equal(b.cmd, 'opencode'); assert.equal(b.args.at(-1), 'text $(touch /tmp/not-executed)');
  const p = b.config.agent['delegate-kit'].permission;
  assert.equal(p.bash, 'deny'); assert.equal(p.edit, 'deny'); assert.equal(p.task, 'deny'); assert.equal(p.external_directory, 'deny');
  assert.equal(b.config.share, 'disabled');
});
test('all adapters reject prose, partial objects and invalid nested findings', () => {
  for (const value of ['done', { status: 'done' }, { ...done, findings: [{ severity: 'high' }] }]) {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    for (const [adapter, stdout] of [
      ['claude', JSON.stringify({ result: payload })],
      ['codex', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: payload } })],
      ['gemini', JSON.stringify({ type: 'message', role: 'assistant', content: payload })],
      ['opencode', JSON.stringify({ type: 'text', part: { text: payload } })],
    ]) { const r = extractResult(adapter, stdout, '/nonexistent', schema); assert.equal(r.result.status, 'failed'); assert.ok(r.error); }
  }
});
test('Gemini deltas retain session but configured model is not execution identity', () => {
  const text = JSON.stringify(done);
  const stdout = [{ type: 'init', session_id: 's', model: 'actual' }, { type: 'message', role: 'assistant', delta: true, content: text.slice(0, 20) }, { type: 'message', role: 'assistant', delta: true, content: text.slice(20) }, { type: 'result', status: 'success', stats: {} }].map(JSON.stringify).join('\n');
  const r = extractResult('gemini', stdout, '/nonexistent', schema);
  assert.deepEqual(r.result, done); assert.equal(r.sessionId, 's'); assert.equal(r.actualModel, null);
});
test('OpenCode emits session from event metadata; unknown actual model stays unknown', () => {
  const r = extractResult('opencode', JSON.stringify({ type: 'text', sessionID: 's', part: { text: JSON.stringify(done) } }), '/nonexistent', schema);
  assert.equal(r.sessionId, 's'); assert.equal(r.actualModel, null); assert.equal(r.error, null);
});
test('CLI transport errors are not overridden by a valid done object', () => {
  const stdout = JSON.stringify({ is_error: true, structured_output: done });
  assert.equal(extractResult('claude', stdout, '/nonexistent', schema).result.status, 'failed');
});
test('real supervisor with fake CLI preserves target on resume and fails malformed output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-adapter-'));
  try {
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
    const fake = `#!${process.execPath}\nconst fs=require('node:fs');\nfs.appendFileSync(process.env.ARGS_LOG, JSON.stringify(process.argv.slice(2))+'\\n');\nconsole.log(JSON.stringify({type:'thread.started',thread_id:'thread-original'}));\nconst result=process.env.BAD_RESULT ? 'not-json' : ${JSON.stringify(JSON.stringify(done))};\nconst i=process.argv.indexOf('-o'); if(i>=0)fs.writeFileSync(process.argv[i+1],result);\n`;
    fs.writeFileSync(path.join(bin, 'codex'), fake, { mode: 0o755 });
    const env = { ...process.env, PATH: bin, DELEGATE_KIT_HOME: path.join(dir, 'state'), DELEGATE_KIT_DEPTH: '', DELEGATE_KIT_PRESET: 'auto', ARGS_LOG: path.join(dir, 'args') };
    const run = args => spawnSync(process.execPath, [path.join(skillDir, 'scripts/agent-run'), ...args], { env, encoding: 'utf8', timeout: 15000 });
    const first = run(['run', '--role', 'planner', '--parent', 'codex', '--backend', 'codex', '--model', 'gpt-6-astra', '--effort', 'high', '--prompt', 'x']);
    assert.equal(first.status, 0, first.stderr); const result = JSON.parse(first.stdout);
    assert.equal(result.model, 'gpt-6-astra'); assert.equal(result.sessionId, 'thread-original');
    fs.writeFileSync(path.join(env.DELEGATE_KIT_HOME, 'config.json'), JSON.stringify({ roles: { planner: { backend: 'claude', model: 'different' } } }));
    const resumed = run(['resume', result.id, '--prompt', 'followup']); assert.equal(resumed.status, 0, resumed.stderr);
    assert.equal(JSON.parse(resumed.stdout).model, 'gpt-6-astra');
    const args = fs.readFileSync(env.ARGS_LOG, 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(args[1].includes('thread-original')); assert.ok(args[1].includes('gpt-6-astra'));
    env.BAD_RESULT = '1';
    const bad = run(['run', '--role', 'planner', '--backend', 'codex', '--prompt', 'x']);
    assert.equal(bad.status, 1); assert.equal(JSON.parse(bad.stdout).status, 'failed');
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('Gemini final JSON excludes prose before tool rounds', () => {
  const events = [{type:'message',role:'assistant',delta:true,content:'Inspecting files'}, {type:'tool_use'}, {type:'tool_result'}, {type:'message',role:'assistant',delta:true,content:JSON.stringify(done)}];
  assert.deepEqual(extractResult('gemini', events.map(JSON.stringify).join('\n'), '/nonexistent', schema).result, done);
});
test('schema rejects prototype-named additional properties', () => {
  const payload = JSON.parse(JSON.stringify(done));
  Object.defineProperty(payload, '__proto__', {value: {}, enumerable: true});
  assert.match(extractResult('claude', JSON.stringify({structured_output:payload}), '/nonexistent', schema).error, /unexpected/);
});
test('OpenCode narrows inherited permissions without erasing file restrictions', () => {
  const rules = [{permission:'*',pattern:'*',action:'allow'}, {permission:'read',pattern:'.env*',action:'ask'}, {permission:'read',pattern:'secret/**',action:'deny'}, {permission:'edit',pattern:'locked/**',action:'deny'}];
  const readonly = narrowPermissions(rules, false);
  assert.deepEqual({...readonly.read}, {'*':'allow','.env*':'ask','secret/**':'deny'});
  assert.equal(readonly['*'], 'deny'); assert.equal(readonly.edit, 'deny');
  const writer = narrowPermissions(rules, true);
  assert.equal(writer.edit['locked/**'], 'deny'); assert.equal(writer.bash['*'], 'ask');
  const ordered = narrowPermissions([...rules, {permission:'r*',pattern:'*',action:'deny'}], false);
  assert.deepEqual(Object.keys(ordered.read), ['.env*','secret/**','*']); assert.equal(ordered.read['*'], 'deny');
  assert.equal(JSON.parse(mergeInline({agent:{worker:{}}}, {OPENCODE_CONFIG_CONTENT:'{"agent":{"existing":{}},"permission":{"read":"deny"}}'})).permission.read, 'deny');
});
test('OpenCode preflight uses diagnostic only and withholds failed output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-permission-'));
  try {
    const exe = path.join(dir, 'opencode');
    fs.writeFileSync(exe, `#!${process.execPath}\nif(JSON.stringify(process.argv.slice(2))!==JSON.stringify(['debug','agent','unique','--pure']))process.exit(2); console.log(JSON.stringify({permission:[{permission:'read',pattern:'.env',action:'deny'}]}));`, {mode:0o755});
    const env = {...process.env, PATH:dir};
    assert.equal(inspectPermissions({cwd:dir,agentName:'unique',model:'provider/model',env})[0].action, 'deny');
    fs.writeFileSync(exe, `#!${process.execPath}\nconsole.log('sensitive diagnostic');process.exit(1);`);
    assert.throws(() => inspectPermissions({cwd:dir,agentName:'unique',model:'provider/model',env}), error => /withheld/.test(error.message) && !/sensitive/.test(error.message));
  } finally { fs.rmSync(dir, {recursive:true}); }
});

test('OpenCode numeric patterns cannot reorder a denial into an allow', () => {
  assert.throws(() => narrowPermissions([{permission:'*',pattern:'*',action:'allow'}, {permission:'grep',pattern:'123',action:'deny'}], false), /order cannot be represented safely/);
});
test('detached OpenCode records a failed second preflight before returning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-detached-'));
  try {
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
    const count = path.join(dir, 'count');
    fs.writeFileSync(path.join(bin, 'opencode'), `#!${process.execPath}\nconst fs=require('node:fs'); const file=process.env.PROBE_COUNT; const n=fs.existsSync(file)?Number(fs.readFileSync(file)):0;fs.writeFileSync(file,String(n+1));if(n)process.exit(1);console.log(JSON.stringify({permission:[{permission:'*',pattern:'*',action:'allow'}]}));`, {mode:0o755});
    const state = path.join(dir, 'state');
    const result = spawnSync(process.execPath, [path.join(skillDir,'scripts/agent-run'), 'run','--role','planner','--backend','kimi','--model','provider/model','--prompt','x','--detach'], {encoding:'utf8',timeout:15000,env:{...process.env,PATH:bin,PROBE_COUNT:count,DELEGATE_KIT_HOME:state,DELEGATE_KIT_DEPTH:'',DELEGATE_KIT_PRESET:'auto'}});
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /did not start/);
    const runs = fs.readdirSync(path.join(state,'runs'));
    assert.equal(runs.length,1);
    const meta = JSON.parse(fs.readFileSync(path.join(state,'runs',runs[0],'meta.json')));
    assert.equal(meta.status,'failed'); assert.match(meta.error,/permissions/);
  } finally { fs.rmSync(dir,{recursive:true}); }
});
