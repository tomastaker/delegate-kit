import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { home, check, readJSON, atomicJSON } from './presets.mjs';

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const lockTimeout = () => process.env.NODE_ENV === 'test' && Number.isSafeInteger(Number(process.env.DELEGATE_KIT_TEST_LOCK_TIMEOUT_MS)) && Number(process.env.DELEGATE_KIT_TEST_LOCK_TIMEOUT_MS) > 0
  ? Number(process.env.DELEGATE_KIT_TEST_LOCK_TIMEOUT_MS) : 15000;
export function alive(pid) { if (!Number.isSafeInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
// Fully publish the PID
// before taking the lock so another process never sees an empty owner.
export function admission(fn) {
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  const mutex = path.join(home(), 'caps.lock'), temp = `${mutex}.${randomUUID()}`;
  fs.writeFileSync(temp, String(process.pid), { mode: 0o600 });
  const deadline = Date.now() + lockTimeout();
  try {
    for (;;) {
      try { fs.linkSync(temp, mutex); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let pid;
        try { pid = Number(fs.readFileSync(mutex, 'utf8')); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
        if (!pid) {
          check(Date.now() < deadline, `Admission lock has no published owner: ${mutex}; verify no operation is running, then remove it explicitly before retrying`);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25); continue;
        }
        check(alive(pid), `Admission lock is stale or invalid: ${mutex}; verify no operation is running, then remove it explicitly before retrying`);
        check(Date.now() < deadline, 'Admission lock held; wait or verify its owner before recovery');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    }
    try { return fn(); } finally {
      let owner = null; try { owner = Number(fs.readFileSync(mutex, 'utf8')); } catch {}
      if (owner === process.pid) fs.rmSync(mutex, { force: true });
    }
  } finally { fs.rmSync(temp, { force: true }); }
}

// Writer ownership is repository-global, while DELEGATE_KIT_HOME may differ
// between coordinators. Lock order is state mutex first, repository second. Readers tolerate
// the bounded mkdir-to-PID publication window but never steal an unknown owner.
export function repositoryAdmission(cwd, fn) {
  if (!cwd) return fn();
  const common = git(cwd, ['rev-parse', '--git-common-dir']);
  check(common.status === 0, 'Cannot resolve repository admission lock');
  const target = path.join(path.resolve(cwd, common.stdout.trim()), 'delegate-kit.caps.lock');
  const deadline = Date.now() + lockTimeout();
  let created = false, owned = false;
  try {
    for (;;) {
      try {
        fs.mkdirSync(target, { mode: 0o700 });
        created = true;
        fs.writeFileSync(path.join(target, 'pid'), String(process.pid), { mode: 0o600 });
        owned = true; break;
      }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let holder = 0;
        try { holder = Number(fs.readFileSync(path.join(target, 'pid'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (!holder) {
          check(Date.now() < deadline, `Repository admission lock has no published owner: ${target}; verify no operation is running, then remove it explicitly before retrying`);
        } else {
          check(alive(holder), `Repository admission lock is stale: ${target}; verify no operation is running, then remove it explicitly before retrying`);
          check(Date.now() < deadline, `Repository admission lock held by ${holder}; wait or verify its owner before recovery`);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    }
    try { return fn(); } finally {
      let owner = 0; try { owner = Number(fs.readFileSync(path.join(target, 'pid'), 'utf8')); } catch {}
      if (owned && owner === process.pid) fs.rmSync(target, { recursive: true, force: true });
    }
  } catch (error) {
    if (created && !owned) fs.rmSync(target, { recursive: true, force: true });
    throw error;
  }
}
// Checks use the existing workspace lease, including across runtime homes.
// Holding only the lease lets unrelated worktrees continue during a long test.
export function withVerificationLease(cwd, fn) {
  const id = randomUUID();
  const r = git(cwd, ['rev-parse', '--absolute-git-dir']);
  check(r.status === 0, 'Cannot resolve verification workspace');
  const file = path.join(r.stdout.trim(), 'delegate-kit.lock');
  repositoryAdmission(cwd, () => {
    check(!readJSON(file, null), 'Workspace is owned; stop its writer or check before verification');
    atomicJSON(file, { id, kind: 'verification', cwd, pid: process.pid });
  });
  try { return fn(); }
  finally { repositoryAdmission(cwd, () => { if (readJSON(file, null)?.id === id) fs.rmSync(file); }); }
}
