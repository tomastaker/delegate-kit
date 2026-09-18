import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectPermissions, narrowPermissions, mergeInline } from '../skills/delegate-kit/scripts/opencode-permissions.mjs';
import { buildCommand, extractResult } from '../skills/delegate-kit/scripts/adapters.mjs';
const skillDir = fileURLToPath(new URL('../skills/delegate-kit/', import.meta.url));
import { resultSchema } from '../skills/delegate-kit/scripts/results.mjs';
const schema = resultSchema({ role: 'researcher' });
const done = { status: 'done', summary: 'Checked', not_verified: [], questions: [], sources: [] };
const build = (adapter, extra = {}) => buildCommand({ adapter, model: null, effort: null, prompt: 'task', write: false, skillDir, schemaFile: path.join(skillDir, 'assets/result-fields.json'), ...extra });
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
    ]) { const r = extractResult(adapter, stdout, '/nonexistent', schema); assert.equal(r.result, null); assert.ok(r.error); }
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
  assert.equal(extractResult('claude', stdout, '/nonexistent', schema).result, null);
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