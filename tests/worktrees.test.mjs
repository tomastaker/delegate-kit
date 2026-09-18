import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const script = new URL('../skills/delegate-kit/scripts/agent-wt', import.meta.url).pathname;
test('worktree inspection preserves staged state; owned trees cannot be forcibly removed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-worktrees-')), repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const command = (cmd, args, cwd = repo) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  const git = (args, cwd = repo) => { const r = command('git', args, cwd); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const wt = (...args) => command('bash', [script, ...args]);
  try {
    git(['init', '-q']); fs.writeFileSync(path.join(repo, 'file.txt'), 'base\n'); git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base']);
    const created = wt('create', 'writer'); assert.equal(created.status, 0, created.stderr); const dir = JSON.parse(created.stdout).path;
    fs.writeFileSync(path.join(dir, 'file.txt'), 'staged\n'); git(['add', '.'], dir); fs.writeFileSync(path.join(dir, 'file.txt'), 'unstaged\n'); fs.writeFileSync(path.join(dir, 'new.txt'), 'new file\n');
    const index = git(['rev-parse', '--git-path', 'index'], dir), indexPath = path.resolve(dir, index);
    const before = fs.readFileSync(indexPath); const diff = wt('diff', 'writer'); assert.equal(diff.status, 0, diff.stderr); assert.match(diff.stdout, /unstaged/); assert.match(diff.stdout, /new file/);
    assert.deepEqual(fs.readFileSync(indexPath), before);
    const lock = path.join(git(['rev-parse', '--absolute-git-dir'], dir), 'delegate-kit.lock'); fs.writeFileSync(lock, JSON.stringify({ id: 'active-runtime' }));
    assert.notEqual(wt('remove', 'writer', '--force').status, 0); assert.ok(fs.existsSync(dir)); assert.ok(fs.existsSync(lock));
    assert.notEqual(wt('release', 'writer', '--force').status, 0); assert.ok(fs.existsSync(lock));
    fs.unlinkSync(lock); assert.notEqual(wt('remove', 'writer').status, 0); assert.equal(wt('remove', 'writer', '--force').status, 0); assert.ok(!fs.existsSync(dir));
    assert.notEqual(wt('remove', '..', '--force').status, 0); assert.ok(fs.existsSync(repo));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
