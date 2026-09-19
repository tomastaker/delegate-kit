import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createSnapshot, assertSnapshot, getSnapshot, verifySnapshot, getEvidence } from '../skills/delegate-kit/scripts/checkpoints.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-checkpoint-test-'));
  const cwd = path.join(dir, 'source');
  fs.mkdirSync(cwd);
  const previous = process.env.DELEGATE_KIT_HOME;
  process.env.DELEGATE_KIT_HOME = path.join(dir, 'state');
  t.after(() => { if (previous === undefined) delete process.env.DELEGATE_KIT_HOME; else process.env.DELEGATE_KIT_HOME = previous; fs.rmSync(dir, { recursive: true, force: true }); });
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(cwd, 'file'), 'original');
  fs.writeFileSync(path.join(cwd, 'remove'), 'remove');
  git('add', '.'); git('commit', '-m', 'base');
  return { cwd, git, snapshot: () => createSnapshot({ cwd, specDigest: 'spec-1', contractRevision: 1, session: 's', task: 't' }) };
}
const check = (code, extra = {}) => ({ id: 'check-1', requirements: ['req-1'], argv: [process.execPath, '-e', code], cwd: '.', expected_exit: 0, required: true, ...extra });

test('snapshot captures dirty, staged, untracked, deletions and modes without moving source refs/index', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.cwd, 'file'), 'staged'); f.git('add', 'file');
  fs.writeFileSync(path.join(f.cwd, 'file'), 'unstaged');
  fs.writeFileSync(path.join(f.cwd, 'new'), 'untracked'); fs.chmodSync(path.join(f.cwd, 'new'), 0o755);
  fs.unlinkSync(path.join(f.cwd, 'remove'));
  const head = f.git('rev-parse', 'HEAD'), index = f.git('write-tree');
  const s = f.snapshot();
  assert.equal(f.git('rev-parse', 'HEAD'), head); assert.equal(f.git('write-tree'), index);
  assert.equal(fs.readFileSync(path.join(s.cwd, 'file'), 'utf8'), 'unstaged');
  assert.equal(fs.readFileSync(path.join(s.cwd, 'new'), 'utf8'), 'untracked');
  assert.ok(fs.statSync(path.join(s.cwd, 'new')).mode & 0o111);
  assert.equal(fs.existsSync(path.join(s.cwd, 'remove')), false);
  assert.deepEqual(getSnapshot(s.id), s); assertSnapshot(s, { source: true });
  fs.writeFileSync(path.join(f.cwd, 'new'), 'changed');
  assert.throws(() => assertSnapshot(s, { source: true }), /Stale/);
  assertSnapshot(s);
  fs.writeFileSync(path.join(s.cwd, 'file'), 'changed');
  assert.throws(() => assertSnapshot(s), /Stale/);
});

test('runtime persists full logs, success and failure tied to snapshot/spec', t => {
  const f = fixture(t), s = f.snapshot();
  const r = verifySnapshot(s.id, check("console.log('verified'); console.error('diagnostic')"));
  assert.equal(r.status, 'passed'); assert.equal(r.snapshot_match, true); assert.equal(r.spec_digest, 'spec-1');
  assert.match(fs.readFileSync(r.stdout_path, 'utf8'), /verified/);
  assert.match(fs.readFileSync(r.stderr_path, 'utf8'), /diagnostic/);
  assert.deepEqual(getEvidence(r.id), r);
  assert.equal(verifySnapshot(s.id, check('process.exit(2)')).status, 'failed');
  assert.equal(verifySnapshot(s.id, check('', { argv: ['nonexistent-dk-command'] })).status, 'inconclusive');
});

test('test report requires executed tests and complete counts', t => {
  const f = fixture(t), s = f.snapshot();
  const run = report => verifySnapshot(s.id, check(`require('fs').writeFileSync(process.env.DELEGATE_KIT_REPORT_PATH, JSON.stringify(${JSON.stringify(report)}))`, { report: { min_tests: 1 } }));
  assert.equal(run({ tests: 0, passed: 0, failed: 0, skipped: 0 }).status, 'inconclusive');
  assert.equal(run({ tests: 1, passed: 0, failed: 0, skipped: 1 }).status, 'inconclusive');
  assert.equal(run({ tests: 1, passed: 1, failed: 0, skipped: 0 }).status, 'passed');
  assert.equal(run({ tests: 1, passed: 0, failed: 1, skipped: 0 }).status, 'failed');
  assert.equal(verifySnapshot(s.id, check('', { report: {} })).status, 'inconclusive');
});

test('browser target reports cannot certify a server from a different source tree', t => {
  const f = fixture(t), s = f.snapshot();
  const run = tree => verifySnapshot(s.id, check(`
    const http = require('node:http'), fs = require('node:fs');
    const server = http.createServer((_, res) => res.end(JSON.stringify({tree:${JSON.stringify(tree)}})));
    server.listen(0, '127.0.0.1', async () => {
      try {
        const identity = 'http://127.0.0.1:' + server.address().port;
        const actual = await (await fetch(identity)).json();
        fs.writeFileSync(process.env.DELEGATE_KIT_REPORT_PATH, JSON.stringify({tests:1,passed:1,failed:0,skipped:0,
          targets:[{name:'app',identity,source_tree:actual.tree}]}));
      } finally { server.close(); }
    });`, { report: { min_tests: 1, targets: ['app'] } }));
  const wrong = run('another-worktree');
  assert.equal(wrong.status, 'inconclusive');
  assert.match(wrong.summary, /target identity/);
  const correct = run(s.tree);
  assert.equal(correct.status, 'passed');
  assert.equal(correct.targets[0].source_tree, s.tree);
  assert.match(correct.targets[0].identity, /^http:\/\/127\.0\.0\.1:/);
});

test('wrong cwd and changed snapshot cannot produce valid evidence', t => {
  const f = fixture(t), s = f.snapshot();
  assert.throws(() => verifySnapshot(s.id, check('', { cwd: '../..' })), /escapes/);
  assert.throws(() => verifySnapshot(s.id, check('', { cwd: '/' })), /cwd/);
  assert.equal(verifySnapshot(s.id, check("require('fs').writeFileSync('file', 'tampered')")).status, 'inconclusive');
  assert.throws(() => verifySnapshot(s.id, check('')), /Stale/);
});

test('timeout and unsupported gitlinks fail closed', t => {
  const f = fixture(t), s = f.snapshot();
  assert.equal(verifySnapshot(s.id, check('setInterval(() => {}, 100)', { timeout_ms: 20 })).status, 'inconclusive');
  f.git('update-index', '--add', '--cacheinfo', `160000,${f.git('rev-parse', 'HEAD')},submodule`);
  assert.throws(f.snapshot, /Submodule/);
});

test('frozen objects survive source removal and old reports cannot certify another run', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.cwd, '.gitignore'), 'report.json\n');
  const s = f.snapshot();
  fs.writeFileSync(path.join(f.cwd, 'report.json'), JSON.stringify({ tests: 1, passed: 1, failed: 0, skipped: 0 }));
  const r = verifySnapshot(s.id, check('', { report: { path: 'report.json', min_tests: 1 } }));
  assert.equal(r.status, 'inconclusive'); assert.match(r.summary, /existed before/);
  fs.rmSync(f.cwd, { recursive: true, force: true });
  assertSnapshot(s);
});

test('checkpoints reject external, dangling and Git metadata symlinks', t => {
  const f = fixture(t);
  const external = path.join(path.dirname(f.cwd), 'external.txt');
  fs.writeFileSync(external, 'mutable outside content');
  const link = path.join(f.cwd, 'linked');
  for (const target of [external, 'missing-file', '.git', '.git/config']) {
    fs.symlinkSync(target, link);
    assert.throws(f.snapshot, /symlink/, `must reject ${target}`);
    fs.unlinkSync(link);
  }
  fs.symlinkSync('linked', link);
  assert.throws(f.snapshot, /dangling\/cyclic symlink/);
});

test('internal symlinks resolve to the frozen content and remain verifiable', t => {
  const f = fixture(t);
  fs.symlinkSync('file', path.join(f.cwd, 'linked'));
  const s = f.snapshot();
  assert.equal(fs.readlinkSync(path.join(s.cwd, 'linked')), 'file');
  assert.equal(fs.readFileSync(path.join(s.cwd, 'linked'), 'utf8'), 'original');
  fs.writeFileSync(path.join(f.cwd, 'file'), 'new source content');
  assert.equal(fs.readFileSync(path.join(s.cwd, 'linked'), 'utf8'), 'original');
  assertSnapshot(s);
  assert.throws(() => verifySnapshot(s.id, check('')), /Stale checkpoint: source/);
});

test('verification deadline kills a process even when it ignores SIGTERM', t => {
  const f = fixture(t), s = f.snapshot();
  // The fallback bounds a regression in this test: the old SIGTERM implementation
  // would wait for it and return without SIGKILL, failing the assertion below.
  const r = verifySnapshot(s.id, check("process.on('SIGTERM', () => {}); console.log('handler ready'); setTimeout(() => process.exit(0), 3000)", { timeout_ms: 1000 }));
  assert.match(fs.readFileSync(r.stdout_path, 'utf8'), /handler ready/);
  assert.equal(r.signal, 'SIGKILL');
  assert.equal(r.status, 'inconclusive');
  assert.equal(r.exit_code, null);
});

test('changing frozen specification invalidates snapshot and new verification', t => {
  const f = fixture(t);
  const specification = 'The file must contain original.\n';
  const s = createSnapshot({ cwd: f.cwd, specDigest: createHash('sha256').update(specification).digest('hex'), contractRevision: 1, session: 's', task: 't', specification });
  assert.equal(fs.readFileSync(s.spec_path, 'utf8'), specification);
  assert.equal(verifySnapshot(s.id, check('')).status, 'passed');
  fs.writeFileSync(s.spec_path, 'Different requirements.\n');
  assert.throws(() => assertSnapshot(s), /frozen specification changed/);
  assert.throws(() => verifySnapshot(s.id, check('')), /frozen specification changed/);
});


test('final checks reuse prepared dependencies and preserve immutable review material', t => {
  const f=fixture(t);
  fs.writeFileSync(path.join(f.cwd,'.gitignore'),'node_modules/\n');
  fs.mkdirSync(path.join(f.cwd,'node_modules/fixture'),{recursive:true});
  fs.writeFileSync(path.join(f.cwd,'node_modules/fixture/ready'),'available');
  const s=f.snapshot();
  assert.equal(fs.existsSync(path.join(s.cwd,'node_modules')),false);
  const r=verifySnapshot(s.id,check("if(require('fs').readFileSync('node_modules/fixture/ready','utf8')!=='available')process.exit(1)"));
  assert.equal(r.status,'passed'); assert.equal(r.cwd,fs.realpathSync(f.cwd));
  assertSnapshot(s,{source:true});
});

test('verification owns the source workspace lease and releases it after failure', t => {
  const f=fixture(t), s=f.snapshot();
  const lock=path.join(f.git('rev-parse','--absolute-git-dir'),'delegate-kit.lock');
  fs.writeFileSync(lock,JSON.stringify({id:'other-writer'}));
  assert.throws(()=>verifySnapshot(s.id,check('')),/Workspace is owned/);
  assert.equal(JSON.parse(fs.readFileSync(lock)).id,'other-writer'); fs.unlinkSync(lock);
  const r=verifySnapshot(s.id,check(`if(!require('fs').existsSync(${JSON.stringify(lock)}))process.exit(3);process.exit(2)`));
  assert.equal(r.exit_code,2); assert.equal(fs.existsSync(lock),false);
});

for (const timedOut of [false, true]) test(`verification stops owned descendants before releasing its lease (${timedOut ? 'timeout' : 'leader exit'})`, t => {
  const f = fixture(t), s = f.snapshot();
  const marker = path.join(path.dirname(f.cwd), 'child.pid');
  const childCode = `require('fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setTimeout(() => require('fs').writeFileSync('file', 'late mutation'), 4000)`;
  const code = `
    require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore' }).unref();
    while (!require('fs').existsSync(${JSON.stringify(marker)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    ${timedOut ? 'setInterval(() => {}, 100)' : ''}
  `;
  const r = verifySnapshot(s.id, check(code, { timeout_ms: 1500 }));
  assert.equal(r.status, 'inconclusive');
  const pid = Number(fs.readFileSync(marker, 'utf8'));
  t.after(() => { try { process.kill(pid, 'SIGKILL'); } catch {} });
  let state = '';
  try { state = execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim(); } catch {}
  assert.ok(!state || state.startsWith('Z'), `Check descendant is still running: ${pid} ${state}`);
  assert.equal(fs.readFileSync(path.join(f.cwd, 'file'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(f.git('rev-parse', '--absolute-git-dir'), 'delegate-kit.lock')), false);
});
