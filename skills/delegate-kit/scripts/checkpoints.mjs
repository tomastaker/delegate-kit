import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { home, identifier, atomicJSON, readJSON, hash } from './presets.mjs';
import { withVerificationLease } from './locks.mjs';

const now = () => new Date().toISOString();
const directory = id => path.join(home(), 'checkpoints', identifier(id, 'checkpoint'));
function git(cwd, argv, extra = {}) {
  const r = spawnSync('git', argv, { cwd, encoding: 'utf8', ...extra });
  if (r.error || r.status !== 0) throw new Error(`Snapshot git ${argv[0]}: ${r.error?.message || r.stderr}`);
  return r.stdout.trim();
}
function root(cwd) {
  const real = fs.realpathSync(cwd);
  if (fs.realpathSync(git(real, ['rev-parse', '--show-toplevel'])) !== real) throw new Error('Checkpoint cwd must be the repository root');
  return real;
}
export function contentTree(cwd) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, 'index') };
  try {
    // Preserve staged additions (including ignored files) in a private index.
    const index = path.resolve(cwd, git(cwd, ['rev-parse', '--git-path', 'index']));
    if (fs.existsSync(index)) {
      fs.copyFileSync(index, env.GIT_INDEX_FILE);
      // Rebuild entries with empty stat caches: a copied index's newer mtime can
      // otherwise conceal same-size, same-tick edits as clean (racy Git).
      const staged = git(cwd, ['write-tree'], { env });
      fs.rmSync(env.GIT_INDEX_FILE);
      git(cwd, ['read-tree', staged], { env });
    } else git(cwd, ['read-tree', 'HEAD'], { env });
    if (git(cwd, ['ls-files', '--stage']).split('\n').some(line => line.startsWith('160000 '))) throw new Error('Submodule checkpoints are unsupported');
    if (git(cwd, ['ls-files', '-v']).split('\n').some(line => /^[a-zS] /.test(line))) throw new Error('Sparse/assume-unchanged checkpoints are unsupported');
    git(cwd, ['-c', 'core.filemode=true', 'add', '-A', '--', '.'], { env });
    const value = git(cwd, ['write-tree'], { env });
    if (git(cwd, ['ls-tree', '-r', value]).split('\n').some(line => line.startsWith('160000 '))) throw new Error('Nested repository checkpoints are unsupported');
    return value;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
export function createSnapshot({ cwd, base = 'HEAD', specDigest, contractRevision, session, task, specification }) {
  cwd = root(cwd);
  if (!specDigest || contractRevision == null) throw new Error('Snapshot requires spec digest and contract revision');
  const repo = fs.realpathSync(path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir'])));
  const resolvedBase = git(cwd, ['rev-parse', '--verify', `${base}^{commit}`]);
  const id = randomUUID();
  const dir = directory(id);
  if (dir === cwd || dir.startsWith(cwd + path.sep)) throw new Error('Checkpoint storage must be outside the writer repository');
  const snapshotTree = contentTree(cwd);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const frozen = path.join(dir, 'repo');
  try {
    git(dir, ['clone', '--shared', '--no-checkout', '--', cwd, frozen]);
    const commit = git(cwd, ['-c', 'user.name=Delegate Kit', '-c', 'user.email=checkpoint@localhost', 'commit-tree', snapshotTree, '-p', resolvedBase, '-m', 'Delegate Kit checkpoint']);
    git(frozen, ['checkout', '--detach', commit]);
    // Own reachable objects so source garbage collection cannot destroy the receipt's code.
    git(frozen, ['repack', '-a', '-d']);
    fs.rmSync(path.join(frozen, '.git', 'objects', 'info', 'alternates'));
    if (specification !== undefined) {
      if (hash(specification) !== specDigest) throw new Error('Specification digest mismatch');
      fs.writeFileSync(path.join(dir, 'specification.md'), specification, { mode: 0o600 });
    }
    const record = { version: 1, ...(specification !== undefined ? { spec_path: path.join(dir, 'specification.md') } : {}), id, cwd: fs.realpathSync(frozen), source_cwd: cwd, repo, base: resolvedBase, tree: snapshotTree, spec_digest: specDigest, contract_revision: contractRevision, session, task, created_at: now() };
    assertSnapshot(record, { source: true });
    atomicJSON(path.join(dir, 'snapshot.json'), record);
    return record;
  } catch (error) { fs.rmSync(dir, { recursive: true, force: true }); throw error; }
}
export const getSnapshot = id => readJSON(path.join(directory(id), 'snapshot.json'));
export function assertSnapshot(record, { source = false } = {}) {
  if (record.spec_path && hash(fs.readFileSync(record.spec_path, 'utf8')) !== record.spec_digest) throw new Error('Stale checkpoint: frozen specification changed');
  for (const entry of git(record.cwd, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean)) {
    if (!entry.startsWith('120000 ')) continue;
    const file = entry.slice(entry.indexOf('\t') + 1);
    let target;
    try { target = fs.realpathSync(path.join(record.cwd, file)); } catch { throw new Error('Checkpoint has a dangling/cyclic symlink'); }
    if (!target.startsWith(record.cwd + path.sep) || target === path.join(record.cwd, '.git') || target.startsWith(path.join(record.cwd, '.git') + path.sep)) throw new Error('Checkpoint has an external or Git-metadata symlink');
  }
  if (contentTree(root(record.cwd)) !== record.tree) throw new Error('Stale checkpoint: frozen content changed');
  if (source) {
    const cwd = root(record.source_cwd);
    const repo = fs.realpathSync(path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir'])));
    if (repo !== record.repo || contentTree(cwd) !== record.tree) throw new Error('Stale checkpoint: source content changed');
  }
  return true;
}
const evidenceDirectory = id => path.join(home(), 'evidence', identifier(id, 'evidence'));
export const getEvidence = id => readJSON(path.join(evidenceDirectory(id), 'receipt.json'));
export function verifySnapshot(id, contract) {
  const snapshot = getSnapshot(id);
  return withVerificationLease(snapshot.source_cwd, () => verifyWorkspace(snapshot, contract));
}
function verifyWorkspace(snapshot, contract) {
  const id = snapshot.id;
  if (!contract?.id || !Array.isArray(contract.argv) || !contract.argv.length || contract.argv.some(x => typeof x !== 'string') || !Array.isArray(contract.requirements) || !contract.requirements.length || !Number.isInteger(contract.expected_exit)) throw new Error('Invalid check contract');
  if (path.isAbsolute(contract.cwd || '.') || (contract.timeout_ms != null && (!Number.isInteger(contract.timeout_ms) || contract.timeout_ms <= 0))) throw new Error('Invalid check cwd/timeout');
  assertSnapshot(snapshot, { source: true });
  const workspace = snapshot.source_cwd;
  const cwd = fs.realpathSync(path.resolve(workspace, contract.cwd || '.'));
  if (cwd !== workspace && !cwd.startsWith(workspace + path.sep)) throw new Error('Check cwd escapes checkpoint source workspace');
  const evidenceId = randomUUID();
  const dir = evidenceDirectory(evidenceId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stdoutPath = path.join(dir, 'stdout.log'), stderrPath = path.join(dir, 'stderr.log');
  const externalReport = path.join(dir, 'report.json');
  const previousReport = contract.report?.path && fs.existsSync(path.resolve(cwd, contract.report.path));
  const receipt = { version: 1, id: evidenceId, checkpoint_id: id, spec_digest: snapshot.spec_digest, contract_revision: snapshot.contract_revision, check_id: contract.id, requirements: contract.requirements, source: 'runtime', argv: contract.argv, cwd, started_at: now(), environment: { platform: process.platform, arch: process.arch, node: process.version }, stdout_path: stdoutPath, stderr_path: stderrPath };
  const out = fs.openSync(stdoutPath, 'w', 0o600), err = fs.openSync(stderrPath, 'w', 0o600);
  let result;
  try {
    result = spawnSync(contract.argv[0], contract.argv.slice(1), { cwd, env: { ...process.env, DELEGATE_KIT_REPORT_PATH: externalReport,
      DELEGATE_KIT_CHECKPOINT: snapshot.id, DELEGATE_KIT_SOURCE_TREE: snapshot.tree, DELEGATE_KIT_WORKSPACE: workspace },
      timeout: contract.timeout_ms ?? 120000, killSignal: 'SIGKILL', stdio: ['ignore', out, err] });
  } finally { fs.closeSync(out); fs.closeSync(err); }
  Object.assign(receipt, { ended_at: now(), exit_code: result.status, signal: result.signal, status: result.error || result.signal ? 'inconclusive' : result.status === contract.expected_exit ? 'passed' : 'failed', summary: result.error?.message || `Exited ${result.status}` });
  if (contract.report) {
    try {
      if (previousReport) throw new Error('Report existed before this check; use a fresh report path');
      const reportPath = contract.report.path ? fs.realpathSync(path.resolve(cwd, contract.report.path)) : externalReport;
      if (contract.report.path && !reportPath.startsWith(workspace + path.sep)) throw new Error('Report escapes checkpoint');
      const report = readJSON(reportPath);
      if (['tests', 'passed', 'failed', 'skipped'].some(k => !Number.isInteger(report[k]) || report[k] < 0) || report.tests !== report.passed + report.failed + report.skipped) throw new Error('Invalid test counts');
      receipt.tests = Object.fromEntries(['tests', 'passed', 'failed', 'skipped'].map(k => [k, report[k]]));
      const minimum = contract.report.min_tests ?? 1;
      if (!Number.isInteger(minimum) || minimum < 1 || report.tests - report.skipped < minimum) throw new Error('Insufficient executed tests');
      if (report.failed) receipt.status = 'failed';
      if (contract.report.targets) {
        if (!Array.isArray(report.targets) || report.targets.length !== contract.report.targets.length
          || new Set(report.targets.map(t => t?.name)).size !== report.targets.length
          || report.targets.some(t => !t || !contract.report.targets.includes(t.name) || typeof t.identity !== 'string' || !t.identity.trim() || t.source_tree !== snapshot.tree)) {
          throw new Error('Missing or mismatched test target identity; verify the service belongs to the checkpoint');
        }
        receipt.targets = report.targets.map(({ name, identity, source_tree }) => ({ name, identity, source_tree }));
      }
      if (reportPath !== externalReport) fs.copyFileSync(reportPath, externalReport);
      receipt.report_path = externalReport;
    } catch (error) { receipt.status = 'inconclusive'; receipt.summary = error.message; }
  }
  try { assertSnapshot(snapshot, { source: true }); receipt.snapshot_match = true; }
  catch (error) { receipt.snapshot_match = false; receipt.status = 'inconclusive'; receipt.summary = error.message; }
  atomicJSON(path.join(dir, 'receipt.json'), receipt);
  return receipt;
}
