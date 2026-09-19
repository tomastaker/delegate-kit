// The detached group leader publishes ownership before running project code.
// This preserves the synchronous verification API without an unrecorded child
// running while its verifier is blocked or has been interrupted.
import { spawnSync } from 'node:child_process';
import { readJSON, atomicJSON, check } from './presets.mjs';

const [leaseFile, leaseId, resultFile, command, ...args] = process.argv.slice(2);
try {
  const lease = readJSON(leaseFile);
  check(lease.id === leaseId, 'Verification ownership changed before command start');
  const stamp = spawnSync('ps', ['-p', String(process.pid), '-o', 'lstart='], { encoding: 'utf8' });
  check(stamp.status === 0 && stamp.stdout.trim(), 'Cannot identify check process group');
  atomicJSON(leaseFile, { ...lease, child_pid: process.pid, child_fingerprint: stamp.stdout.trim() });
  // Inherit this group: the outer verifier owns timeout and group cleanup.
  const result = spawnSync(command, args, { stdio: 'inherit' });
  atomicJSON(resultFile, { status: result.status, signal: result.signal, error: result.error?.message || null });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
