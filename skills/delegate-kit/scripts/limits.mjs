import path from 'node:path';
import { fileURLToPath } from 'node:url';

const names = ['writers', 'workers', 'runs', 'retries'];
function integer(value, name, minimum, strings = false) {
  const number = strings && typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return number;
}
export function validateLimits(limits) {
  if (limits === undefined) return;
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw new Error('limits must be an object');
  for (const [key, value] of Object.entries(limits)) {
    if (!names.some(name => key === `max_${name}`)) throw new Error(`Unknown limits.${key}`);
    integer(value, `limits.${key}`, key === 'max_retries' ? 0 : 1);
  }
}

// A missing limit is deliberately unbounded; one explicit cap never raises another.
export function resolveLimits(opts = {}, config = {}, env = process.env) {
  validateLimits(config.limits);
  return Object.fromEntries(names.map(name => {
    const flag = `max-${name}`, variable = `DELEGATE_KIT_MAX_${name.toUpperCase()}`, key = `max_${name}`;
    const [value, source] = opts[flag] !== undefined ? [opts[flag], `--${flag}`]
      : env[variable] !== undefined && env[variable] !== '' ? [env[variable], variable]
      : [config.limits?.[key], `limits.${key}`];
    return [name, value === undefined ? null : integer(value, source, name === 'retries' ? 0 : 1, true)];
  }));
}

// Small argv-only bridge for agent-wt; never interpolate configuration into shell code.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fail = error => {
    process.stderr.write(`delegate-kit: ${error.message}\n`);
    process.exitCode = 1;
  };
  try {
    const opts = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i];
      if (!['--config', ...names.map(name => `--max-${name}`)].includes(key) || process.argv[i + 1] === undefined) {
        throw new Error(`Invalid limits option: ${key}`);
      }
      opts[key.slice(2)] = process.argv[i + 1];
    }
    // Finish this module before routing imports its validateLimits export.
    import('./routing.mjs').then(({ readConfig }) => {
      const config = opts.config ? readConfig(opts.config) : {};
      process.stdout.write(JSON.stringify(resolveLimits(opts, config)) + '\n');
    }).catch(fail);
  } catch (error) {
    fail(error);
  }
}
