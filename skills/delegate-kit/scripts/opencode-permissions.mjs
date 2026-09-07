// Inspect effective host permissions without emitting the config or making a model call.
import { spawnSync } from 'node:child_process';
const actions = ['allow', 'ask', 'deny'];
const patternMatches = (pattern, text) => new RegExp('^' + pattern.split('').map(c => c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$').test(text);
export function mergeInline(config, env = process.env) {
  let inherited;
  try { inherited = JSON.parse(env.OPENCODE_CONFIG_CONTENT || '{}'); } catch { throw new Error('Invalid OPENCODE_CONFIG_CONTENT; no configuration values were logged'); }
  if (!inherited || typeof inherited !== 'object' || Array.isArray(inherited)) throw new Error('OPENCODE_CONFIG_CONTENT must be an object');
  return JSON.stringify({ ...inherited, ...config, agent: { ...inherited.agent, ...config.agent } });
}
export function inspectPermissions({ cwd, agentName, model, env = process.env }) {
  const probe = { agent: { [agentName]: { description: 'Delegate-kit permission preflight', mode: 'primary', model } } };
  const result = spawnSync('opencode', ['debug', 'agent', agentName, '--pure'], {
    cwd, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024,
    env: { ...env, OPENCODE_CONFIG_CONTENT: mergeInline(probe, env), OPENCODE_AUTO_SHARE: 'false' },
  });
  if (result.status !== 0) throw new Error('Unable to inspect OpenCode effective permissions; no worker started and diagnostic output was withheld');
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error('OpenCode permission inspection did not return JSON; no worker started'); }
  const rules = parsed.permission;
  if (!Array.isArray(rules) || rules.length === 0 || rules.some(r => !r || typeof r.permission !== 'string' || typeof r.pattern !== 'string' || !actions.includes(r.action))) {
    throw new Error('Unsupported OpenCode permission format; no worker started');
  }
  return rules;
}
export function narrowPermissions(rules, write) {
  // A unique per-run agent avoids merging with an existing custom role's extra tools.
  // Resolve each allowlisted tool using the host's ordered rules, then cap its access.
  const permission = Object.create(null);
  permission['*'] = 'deny';
  const tools = ['read', 'glob', 'grep', 'list', 'webfetch', 'websearch', ...(write ? ['edit', 'bash'] : [])];
  for (const tool of tools) {
    const ordered = new Map([['*', 'deny']]);
    for (const rule of rules) {
      if (!patternMatches(rule.permission, tool)) continue;
      // Delete/reinsert preserves last-match order when a path pattern is repeated.
      ordered.delete(rule.pattern);
      ordered.set(rule.pattern, tool === 'bash' && rule.action === 'allow' ? 'ask' : rule.action);
    }
    const patterns = Object.fromEntries(ordered);
    if (JSON.stringify(Object.keys(patterns)) !== JSON.stringify([...ordered.keys()])) throw new Error('OpenCode permission pattern order cannot be represented safely; no worker started');
    permission[tool] = patterns;
  }
  permission.edit ||= 'deny';
  permission.bash ||= 'deny';
  permission.task = 'deny';
  permission.external_directory = 'deny';
  return permission;
}
