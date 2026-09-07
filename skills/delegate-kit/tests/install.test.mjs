import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const skill = new URL('..', import.meta.url).pathname;
const installer = path.join(skill, 'hooks/native-agents.mjs');
const invoke = (action, home, dry = '0') => spawnSync(process.execPath, [installer, action, skill, home, dry], { encoding: 'utf8' });
test('native install removes legacy pins, preserves user config, is idempotent and reversible', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-install-'));
  try {
    const unrelated = 'model = "user-selected"\n';
    fs.writeFileSync(path.join(home, 'config.toml'), unrelated + '# >>> delegate-kit agents >>>\n[agents.dk-planner]\nmodel = "old-pin"\n# <<< delegate-kit agents <<<\n');
    const before = fs.readFileSync(path.join(home, 'config.toml'), 'utf8');
    assert.equal(invoke('install', home, '1').status, 0);
    assert.equal(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), before);
    assert.ok(!fs.existsSync(path.join(home, 'agents')));
    assert.equal(invoke('install', home).status, 0);
    assert.equal(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), unrelated);
    const parsed = spawnSync('python3', ['-c', 'import pathlib,sys,tomllib,json;print(json.dumps([tomllib.loads(p.read_text()) for p in pathlib.Path(sys.argv[1]).glob("*.toml")]))', path.join(home, 'agents')], { encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
    const agents = JSON.parse(parsed.stdout); assert.equal(agents.length, 6);
    for (const a of agents) { assert.ok(a.name); assert.ok(a.developer_instructions); assert.ok(!('model' in a)); assert.ok(!('model_reasoning_effort' in a)); }
    assert.equal(invoke('install', home).stdout, '');
    assert.equal(invoke('uninstall', home).status, 0);
    assert.equal(fs.readdirSync(path.join(home, 'agents')).filter(x => x.endsWith('.toml')).length, 0);
    assert.ok(fs.readdirSync(home).some(x => x.includes('bak-delegate-kit')));
  } finally { fs.rmSync(home, { recursive: true }); }
});
test('unmanaged native role is never overwritten', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-install-'));
  try {
    fs.mkdirSync(path.join(home, 'agents'));
    const file = path.join(home, 'agents/dk-planner.toml'); fs.writeFileSync(file, 'user-owned');
    const r = invoke('install', home); assert.notEqual(r.status, 0); assert.match(r.stderr, /unmanaged/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'user-owned'); assert.equal(fs.readdirSync(path.dirname(file)).length, 1);
  } finally { fs.rmSync(home, { recursive: true }); }
});
