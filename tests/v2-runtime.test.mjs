import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrationPlan } from '../skills/delegate-kit/scripts/migrate.mjs';

const skill = fileURLToPath(new URL('../skills/delegate-kit', import.meta.url));
const cli = path.join(skill, 'scripts/dk.mjs');

function command(args, options = {}) {
  return spawnSync(args[0], args.slice(1), { encoding: 'utf8', ...options });
}

test('v2 example validates through the public CLI', () => {
  const result = command([process.execPath, cli, 'presets', 'validate', '--file', path.join(skill, 'examples/main.json')]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { id: 'main', valid: true });
});

test('migration preserves the parent-selected backend-map default and refuses to guess without it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-migrate-v2-'));
  try {
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
      roles: { implementer: { codex: ['gpt-model', 'high'], claude: ['claude-model', 'high'] } },
    }));
    const decided = migrationPlan({ parents: { legacy: 'claude' } }, root);
    assert.deepEqual(decided.issues, []);
    const selected = decided.presets[0].agents[decided.presets[0].defaults.implementer].executor;
    assert.equal(selected.harness, 'claude');
    assert.equal(selected.model, 'claude-model');

    const ambiguous = migrationPlan({}, root);
    assert.match(ambiguous.issues.join('\n'), /needs an explicit parents\.legacy decision/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migration preserves cross-family duo reviewer routing and requires author identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-migrate-reviewer-'));
  try {
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
      mode: 'duo',
      families: ['codex', 'claude'],
      roles: { reviewer: { codex: ['gpt-review', 'high'], claude: ['claude-review', 'high'] } },
    }));
    const decided = migrationPlan({ parents: { legacy: 'claude' }, authors: { legacy: 'claude' } }, root);
    assert.deepEqual(decided.issues, []);
    const selected = decided.presets[0].agents[decided.presets[0].defaults.reviewer].executor;
    assert.equal(selected.harness, 'codex');
    assert.equal(selected.model, 'gpt-review');

    const ambiguous = migrationPlan({ parents: { legacy: 'claude' } }, root);
    assert.match(ambiguous.issues.join('\n'), /authors\.legacy/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migration materializes a selected backend missing from a partial role override map', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-migrate-partial-'));
  try {
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
      backends: { codex: { model: 'gpt-default' } },
      roles: { implementer: { claude: ['claude-override', 'high'] } },
    }));
    const plan = migrationPlan({ parents: { legacy: 'codex' } }, root);
    assert.deepEqual(plan.issues, []);
    const selected = plan.presets[0].agents[plan.presets[0].defaults.implementer].executor;
    assert.equal(selected.harness, 'codex');
    assert.equal(selected.model, 'gpt-default');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('different state roots cannot reserve the same worktree concurrently', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-v2-lease-'));
  try {
    const repo = path.join(root, 'repo');
    const worktree = path.join(root, 'writer');
    fs.mkdirSync(repo);
    assert.equal(command(['git', 'init', '-q', '-b', 'main'], { cwd: repo }).status, 0);
    command(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
    assert.equal(command(['git', 'worktree', 'add', '-q', '-b', 'dk/writer', worktree], { cwd: repo }).status, 0);
    const brief = path.join(root, 'brief.md'); fs.writeFileSync(brief, 'Implement the bounded fixture.');
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const preset = JSON.parse(fs.readFileSync(path.join(skill, 'examples/main.json'), 'utf8'));
    const repoMutex = path.join(repo, '.git', 'delegate-kit.caps.lock');
    fs.mkdirSync(repoMutex);
    const legacyOwner = spawn(process.execPath, ['-e', `const fs=require('fs');const d=process.argv[1];setTimeout(()=>fs.writeFileSync(d+'/pid',String(process.pid)),100);setTimeout(()=>{fs.rmSync(d,{recursive:true,force:true});process.exit(0)},400)`, repoMutex]);
    const legacyOwnerDone = new Promise(resolve => legacyOwner.on('close', resolve));
    const startedAt = Date.now();
    const starts = [];
    for (let i = 0; i < 8; i++) {
      const home = path.join(root, `state-${i}`);
      fs.mkdirSync(path.join(home, 'presets'), { recursive: true });
      fs.writeFileSync(path.join(home, 'presets/main.json'), JSON.stringify(preset));
      starts.push(new Promise(resolve => {
        const child = spawn(process.execPath, [cli, 'prepare', '--session', `codex:race-${i}`, '--preset', 'main', '--task', 'race', '--agent', 'implementer', '--brief', brief, '--cwd', worktree], {
          env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, DELEGATE_KIT_HOME: home },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '', stderr = '';
        child.stdout.on('data', data => { stdout += data; });
        child.stderr.on('data', data => { stderr += data; });
        child.on('close', code => resolve({ code, stdout, stderr }));
      }));
    }
    const results = await Promise.all(starts);
    await legacyOwnerDone;
    assert.ok(Date.now() - startedAt >= 350, 'v2 must wait for the v1 repository owner instead of replacing its empty lock directory');
    assert.equal(results.filter(result => result.code === 0).length, 1, results.map(result => result.stderr).join('\n'));
    assert.equal(results.filter(result => /already owned/.test(result.stderr)).length, 7);
    const gitDir = command(['git', 'rev-parse', '--absolute-git-dir'], { cwd: worktree }).stdout.trim();
    assert.equal(JSON.parse(fs.readFileSync(path.join(gitDir, 'delegate-kit.lock'), 'utf8')).kind, 'v2');

    fs.mkdirSync(repoMutex);
    const blockedHome = path.join(root, 'state-blocked');
    fs.mkdirSync(path.join(blockedHome, 'presets'), { recursive: true });
    fs.writeFileSync(path.join(blockedHome, 'presets/main.json'), JSON.stringify(preset));
    const blocked = command([process.execPath, cli, 'prepare', '--session', 'codex:empty-lock', '--preset', 'main', '--task', 'empty-lock', '--agent', 'implementer', '--brief', brief, '--cwd', worktree], {
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, DELEGATE_KIT_HOME: blockedHome, NODE_ENV: 'test', DELEGATE_KIT_TEST_LOCK_TIMEOUT_MS: '100' },
      timeout: 5000,
    });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /no published owner/);
    assert.equal(fs.existsSync(repoMutex), true, 'unknown repository lock must be retained for diagnosis');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failed child registration stops the process group before releasing the writer lease', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-v2-child-'));
  try {
    const repo = path.join(root, 'repo');
    const worktree = path.join(root, 'writer');
    fs.mkdirSync(repo);
    command(['git', 'init', '-q', '-b', 'main'], { cwd: repo });
    command(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
    command(['git', 'worktree', 'add', '-q', '-b', 'dk/writer', worktree], { cwd: repo });
    const brief = path.join(root, 'brief.md'); fs.writeFileSync(brief, 'Implement the bounded fixture.');
    const childPid = path.join(root, 'child.pid');
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\necho $$ > "$CHILD_PID_FILE"\nwhile :; do sleep 1; done\n', { mode: 0o755 });
    const home = path.join(root, 'state'); fs.mkdirSync(path.join(home, 'presets'), { recursive: true });
    fs.writeFileSync(path.join(home, 'presets/main.json'), fs.readFileSync(path.join(skill, 'examples/main.json')));
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, DELEGATE_KIT_HOME: home, CHILD_PID_FILE: childPid, NODE_ENV: 'test' };
    const prepared = command([process.execPath, cli, 'prepare', '--session', 'codex:child-failure', '--preset', 'main', '--task', 'child-failure', '--agent', 'implementer', '--brief', brief, '--cwd', worktree], { env });
    assert.equal(prepared.status, 0, prepared.stderr);
    const id = JSON.parse(prepared.stdout).runs[0].id;
    env.DELEGATE_KIT_TEST_FAIL_CHILD_REGISTRATION = id;
    const launched = command([process.execPath, cli, 'run', id], { env });
    assert.equal(launched.status, 0, launched.stderr);

    const metaFile = path.join(home, 'runs', id, 'meta.json');
    let meta;
    for (let i = 0; i < 100; i++) {
      meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      if (['failed', 'orphaned'].includes(meta.status)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(meta.status, 'failed');
    assert.match(meta.error, /Injected child registration failure/);
    const gitDir = command(['git', 'rev-parse', '--absolute-git-dir'], { cwd: worktree }).stdout.trim();
    assert.equal(fs.existsSync(path.join(gitDir, 'delegate-kit.lock')), false);
    if (fs.existsSync(childPid)) {
      const pid = Number(fs.readFileSync(childPid, 'utf8'));
      assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('interrupted child registration retains ownership until evidenced recovery', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-v2-recover-'));
  try {
    const repo = path.join(root, 'repo');
    const worktree = path.join(root, 'writer');
    fs.mkdirSync(repo);
    command(['git', 'init', '-q', '-b', 'main'], { cwd: repo });
    command(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
    command(['git', 'worktree', 'add', '-q', '-b', 'dk/writer', worktree], { cwd: repo });
    const brief = path.join(root, 'brief.md'); fs.writeFileSync(brief, 'Implement the bounded fixture.');
    const evidence = path.join(root, 'evidence.txt'); fs.writeFileSync(evidence, 'Process table and worktree handles inspected; no child or descendant exists.');
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin); fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const home = path.join(root, 'state'); fs.mkdirSync(path.join(home, 'presets'), { recursive: true });
    fs.writeFileSync(path.join(home, 'presets/main.json'), fs.readFileSync(path.join(skill, 'examples/main.json')));
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, DELEGATE_KIT_HOME: home };
    const prepared = command([process.execPath, cli, 'prepare', '--session', 'codex:recover', '--preset', 'main', '--task', 'recover', '--agent', 'implementer', '--brief', brief, '--cwd', worktree], { env });
    assert.equal(prepared.status, 0, prepared.stderr);
    const id = JSON.parse(prepared.stdout).runs[0].id;
    const metaFile = path.join(home, 'runs', id, 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    Object.assign(meta, { status: 'orphaned', pid: 999999, pid_fingerprint: null, child_pid: null, launch_registration_pending: true });
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    const gitDir = command(['git', 'rev-parse', '--absolute-git-dir'], { cwd: worktree }).stdout.trim();
    const lease = path.join(gitDir, 'delegate-kit.lock');

    const refused = command([process.execPath, cli, 'recover', id], { env });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /registration was interrupted/);
    assert.equal(fs.existsSync(lease), true);

    const recovered = command([process.execPath, cli, 'recover', id, '--confirmed-not-started', '--evidence', evidence], { env });
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(JSON.parse(recovered.stdout).status, 'failed');
    assert.equal(fs.existsSync(lease), false);
    assert.match(JSON.parse(fs.readFileSync(metaFile, 'utf8')).launch_recovery_evidence, /Process table/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resume uses repository-global ownership across different state roots', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-v2-resume-'));
  try {
    const repo = path.join(root, 'repo');
    const worktree = path.join(root, 'writer');
    fs.mkdirSync(repo);
    command(['git', 'init', '-q', '-b', 'main'], { cwd: repo });
    command(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
    command(['git', 'worktree', 'add', '-q', '-b', 'dk/writer', worktree], { cwd: repo });
    const brief = path.join(root, 'brief.md'); fs.writeFileSync(brief, 'Continue the bounded fixture.');
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin); fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const homes = [path.join(root, 'state-a'), path.join(root, 'state-b')];
    for (const home of homes) { fs.mkdirSync(path.join(home, 'presets'), { recursive: true }); fs.writeFileSync(path.join(home, 'presets/main.json'), fs.readFileSync(path.join(skill, 'examples/main.json'))); }
    const envA = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, DELEGATE_KIT_HOME: homes[0] };
    const prepared = command([process.execPath, cli, 'prepare', '--session', 'codex:resume-race', '--preset', 'main', '--task', 'resume-race', '--agent', 'implementer', '--brief', brief, '--cwd', worktree], { env: envA });
    assert.equal(prepared.status, 0, prepared.stderr);
    const id = JSON.parse(prepared.stdout).runs[0].id;
    const runA = path.join(homes[0], 'runs', id);
    const metaFile = path.join(runA, 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    Object.assign(meta, { status: 'finished', transport_session_id: 'exact-session', result_validated: true, result: { status: 'done' }, finished: new Date().toISOString() });
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    const gitDir = command(['git', 'rev-parse', '--absolute-git-dir'], { cwd: worktree }).stdout.trim();
    fs.rmSync(path.join(gitDir, 'delegate-kit.lock'));
    fs.mkdirSync(path.join(homes[1], 'runs'), { recursive: true });
    fs.cpSync(runA, path.join(homes[1], 'runs', id), { recursive: true });

    const results = await Promise.all(homes.map(home => new Promise(resolve => {
      const child = spawn(process.execPath, [cli, 'resume', id, '--brief', brief], { env: { ...envA, DELEGATE_KIT_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = ''; child.stderr.on('data', data => { stderr += data; }); child.on('close', code => resolve({ code, stderr }));
    })));
    assert.equal(results.filter(result => result.code === 0).length, 1, results.map(result => result.stderr).join('\n'));
    assert.equal(results.filter(result => /already owned/.test(result.stderr)).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('v2 waits through v1 empty-owner publication windows', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-v1-v2-lock-'));
  try {
    const home = path.join(root, 'state'); fs.mkdirSync(home, { recursive: true });
    const mutex = path.join(home, 'caps.lock'); fs.writeFileSync(mutex, '');
    const owner = spawn(process.execPath, ['-e', `const fs=require('fs');const f=process.argv[1];setTimeout(()=>fs.writeFileSync(f,String(process.pid)),100);setTimeout(()=>{fs.rmSync(f,{force:true});process.exit(0)},400)`, mutex]);
    const ownerDone = new Promise(resolve => owner.on('close', resolve));
    const overview = command([process.execPath, cli, 'overview', '--session', 'codex:window'], { env: { ...process.env, DELEGATE_KIT_HOME: home }, timeout: 5000 });
    assert.equal(overview.status, 0, overview.stderr);
    await ownerDone;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
