import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLimits, validateLimits } from '../scripts/limits.mjs';

test('no configured limits means unbounded without a derived worker cap', () => {
  assert.deepEqual(resolveLimits({}, {}, {}), { writers: null, workers: null, runs: null, retries: null });
  assert.deepEqual(resolveLimits({ 'max-writers': '20' }, {}, {}), { writers: 20, workers: null, runs: null, retries: null });
});
test('explicit flags override environment and config independently', () => {
  assert.deepEqual(resolveLimits({ 'max-writers': '12' }, {
    limits: { max_writers: 2, max_workers: 6, max_runs: 8, max_retries: 0 },
  }, { DELEGATE_KIT_MAX_WRITERS: '3', DELEGATE_KIT_MAX_WORKERS: '1' }), {
    writers: 12, workers: 1, runs: 8, retries: 0,
  });
});
test('invalid explicit values fail without coercing booleans or silently raising limits', () => {
  for (const value of [true, false, null, '', ' ', '1.5', '-1', 'NaN', '1e2', 0, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => resolveLimits({ 'max-workers': value }, {}, {}), /must be an integer/);
  }
  assert.equal(resolveLimits({ 'max-retries': '0' }, {}, {}).retries, 0);
  assert.throws(() => resolveLimits({}, {}, { DELEGATE_KIT_MAX_RUNS: 'bad' }), /DELEGATE_KIT_MAX_RUNS/);
});
test('all config limits validate even when a flag overrides them', () => {
  for (const limits of [null, [], 1, { workers: 2 }, { max_workers: '2' }, { max_runs: 0 }, { max_retries: -1 }]) {
    assert.throws(() => resolveLimits({ 'max-workers': 2 }, { limits }, {}));
  }
  assert.doesNotThrow(() => validateLimits({ max_writers: 100, max_retries: 0 }));
});
