import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildCommand } from '../skills/delegate-kit/scripts/adapters.mjs';
import { rpcCommand } from '../skills/delegate-kit/scripts/rpc.mjs';
import { validatePreset } from '../skills/delegate-kit/scripts/presets.mjs';

const cli = fileURLToPath(new URL('../skills/delegate-kit/scripts/dk.mjs', import.meta.url));
const preset = permissions => ({ schema_version: 2, id: 'test', agents: { writer: {
  role: 'implementer', when: 'Fixture work', executor: { harness: 'codex', transport: 'cli', model: 'fixture', permissions },
} } });

test('execution permissions are explicit, adapter-specific and never broaden readers', () => {
  const p = preset({ network: true, writable_roots: ['/tmp/approved-cache'] });
  validatePreset(p);
  for (const resumeId of [undefined, 'saved-session']) {
    const args = buildCommand({ adapter: 'codex', write: true, permissions: p.agents.writer.executor.permissions, schemaFile: 'schema.json', prompt: 'fixture', resumeId }).args;
    assert.ok(args.includes('sandbox_workspace_write.network_access=true'));
    assert.ok(args.includes('sandbox_workspace_write.writable_roots=["/tmp/approved-cache"]'));
    assert.ok(args.includes('sandbox_mode="workspace-write"'));
  }
  p.agents.writer.access = 'read-only'; assert.throws(() => validatePreset(p), /CLI writer/);
  delete p.agents.writer.access;
  p.agents.writer.executor.transport = 'native'; assert.throws(() => validatePreset(p), /CLI writer/);
  p.agents.writer.executor.transport = 'cli'; p.agents.writer.executor.harness = 'omp';
  assert.throws(() => validatePreset(p), /unknown field/);
  p.agents.writer.executor.permissions = { shell: true }; validatePreset(p);
  const args = rpcCommand({ ...p.agents.writer.executor, access: 'workspace-write' }, '/run').args;
  assert.ok(args[args.indexOf('--tools') + 1].split(',').includes('bash'));
  assert.equal(args[args.indexOf('--approval-mode') + 1], 'write');
  const readOnly = rpcCommand({ ...p.agents.writer.executor, access: 'read-only' }, '/run').args;
  assert.equal(readOnly[readOnly.indexOf('--tools') + 1].includes('bash'), false);
});

for (const probe of ['pass', 'fail', 'timeout', 'registration']) test(`Codex readiness ${probe} runs before the model under matching permissions`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-ready-'));
  const repo = path.join(root, 'repo'), wt = path.join(root, 'writer'), home = path.join(root, 'state'), bin = path.join(root, 'bin');
  fs.mkdirSync(repo); fs.mkdirSync(bin); fs.mkdirSync(path.join(home, 'presets'), { recursive: true });
  const env = { ...process.env, NODE_ENV: 'test', DELEGATE_KIT_HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, DK_FIXTURE_ROOT: root };
  const git = args => { const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  const dk = args => { const r = spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 20000 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  let id;
  try {
    git(['init', '-q']); fs.writeFileSync(path.join(repo, 'file'), 'unchanged'); git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'init']);
    git(['worktree', 'add', '-qb', 'writer', wt]);
    const spec = path.join(root, 'spec.md'); fs.writeFileSync(spec, 'Check environment before implementation.');
    fs.writeFileSync(path.join(home, 'presets/test.json'), JSON.stringify(preset({ network: true, writable_roots: [root] })));
    fs.writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}
      const fs=require('node:fs'), cp=require('node:child_process'), path=require('node:path');
      const args=process.argv.slice(2), root=process.env.DK_FIXTURE_ROOT;
      fs.appendFileSync(path.join(root,'calls.jsonl'),JSON.stringify(args)+'\\n');
      if(args[0]==='sandbox') {
        const command=args.slice(args.indexOf('--')+1);
        const result=cp.spawnSync(command[0],command.slice(1),{stdio:'inherit'}); process.exit(result.status??1);
      }
      if(process.env.DELEGATE_KIT_TEST_FAIL_MODEL_REGISTRATION)setTimeout(()=>process.exit(0),10000);
      fs.writeFileSync(path.join(root,'model-started'),'yes');
      const result={status:'done',summary:'Fixture',changes:[],checks_run:['readiness passed'],not_verified:[],questions:[],check_results:[{id:'ready',status:'passed',evidence:'fixture command passed'}]};
      fs.writeFileSync(args[args.indexOf('-o')+1],JSON.stringify(result));
      console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-session'}));
      console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1}}));
    `, { mode: 0o755 });
    const contract = { session: 'fixture:ready', task: 'test', repo, specification: { path: spec, goal: 'Readiness', requirements: [{ id: 'R', text: 'Environment available' }] },
      work_items: [{ id: 'work', profile: 'writer', routing: { defined: true, risk: 'ordinary', reason: 'Probe rejects missing environment' }, scope: { include: ['file'] }, checks: ['ready'] }],
      checks: [{ id: 'ready', requirements: ['R'], before_edit: true, argv: [process.execPath, '-e', ['pass', 'registration'].includes(probe) ? `console.log(JSON.stringify({type:'error',message:'expected negative test'}))` : probe === 'fail' ? 'process.exit(23)' : 'setInterval(()=>{},100)'], timeout_ms: probe === 'timeout' ? 100 : 5000 }],
      review: { required: false, profiles: [] }, trivial: true };
    const contractFile = path.join(root, 'contract.json'); fs.writeFileSync(contractFile, JSON.stringify(contract));
    dk(['task', 'open', '--session', contract.session, '--task', 'test', '--contract', contractFile]);
    id = dk(['prepare', '--session', contract.session, '--preset', 'test', '--task', 'test', '--work-item', 'work', '--cwd', wt]).runs[0].id;
    if (probe === 'registration') env.DELEGATE_KIT_TEST_FAIL_MODEL_REGISTRATION = id;
    dk(['run', id]);
    const result = dk(['wait', id, '--timeout-ms', '15000']);
    if (probe === 'registration') {
      assert.equal(result.status, 'failed');
      const child = JSON.parse(fs.readFileSync(path.join(home, 'runs', id, 'injected-child.json')));
      assert.ok(child.pid);
      assert.throws(() => process.kill(child.pid, 0), e => e.code === 'ESRCH');
      assert.equal(fs.existsSync(result.workspace.lock), false);
      return;
    }
    assert.equal(result.status, probe === 'pass' ? 'finished' : 'blocked', JSON.stringify(result));
    assert.equal(fs.existsSync(path.join(root, 'model-started')), probe === 'pass');
    assert.equal(result.execution_started, probe === 'pass');
    assert.equal(result.preflight_results[0].status, probe === 'pass' ? 'passed' : 'blocked');
    const calls = fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls[0][0], 'sandbox');
    assert.equal(calls[0].includes('-C'), false); // Installed Codex requires a named profile with -C.
    assert.match(fs.readFileSync(path.join(home, 'runs', id, 'stdout.log'), 'utf8'), probe === 'pass' ? /expected negative test/ : /.*/);
    assert.equal(calls.length, probe === 'pass' ? 2 : 1);
    for (const args of calls) assert.ok(args.includes('sandbox_workspace_write.network_access=true'));
    assert.equal(fs.readFileSync(path.join(wt, 'file'), 'utf8'), 'unchanged');
  } finally {
    if (id) dk(['cancel', id]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('OMP inherits LSP and PTY preferences without enabling undeclared tools', () => {
  const command=rpcCommand({harness:'omp',model:'fixture',provider:'fixture',access:'workspace-write',permissions:{shell:true}},'/tmp/fixture');
  assert.equal(command.args.includes('--no-lsp'),false);
  assert.equal(command.args.includes('--no-pty'),false);
  assert.equal(command.args[command.args.indexOf('--tools')+1],'read,grep,glob,edit,write,bash');
});
