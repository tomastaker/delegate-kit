import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const skill = fileURLToPath(new URL('../skills/delegate-kit/', import.meta.url));
test('optional hook install is idempotent, preserves custom settings and does not install static roles', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-install-'));
  try {
    const env = { ...process.env, CODEX_HOME: path.join(root, 'codex'), CLAUDE_CONFIG_DIR: path.join(root, 'claude') };
    fs.mkdirSync(env.CODEX_HOME); fs.mkdirSync(env.CLAUDE_CONFIG_DIR);
    const file = path.join(env.CODEX_HOME, 'hooks.json');
    fs.writeFileSync(file, JSON.stringify({ custom: true, hooks: { PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'user-hook' }] }] } }));
    const call = (name, args = []) => { const r = spawnSync('bash', [path.join(skill, 'hooks', name + '.sh'), ...args], { env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
    const before = fs.readFileSync(file, 'utf8'); call('install', ['--dry-run']); assert.equal(fs.readFileSync(file, 'utf8'), before);
    call('install'); const first = fs.readFileSync(file, 'utf8'); call('install'); assert.equal(fs.readFileSync(file, 'utf8'), first);
    assert.equal(JSON.parse(first).hooks.PreToolUse.length, 2); assert.ok(!fs.existsSync(path.join(env.CODEX_HOME, 'agents')));
    call('uninstall'); const after = JSON.parse(fs.readFileSync(file)); assert.equal(after.custom, true); assert.equal(after.hooks.PreToolUse.length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
