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
