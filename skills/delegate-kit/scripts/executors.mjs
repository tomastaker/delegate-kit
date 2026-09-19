import { spawnSync } from 'node:child_process';
import { check, accessOf, harnesses } from './presets.mjs';

const efforts = {
  codex: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  pi: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  omp: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
};
export function discover() {
  return harnesses.map(harness => {
    const r = spawnSync(harness, ['--version'], { encoding: 'utf8', timeout: 5000 });
    // Version only: never print tool stderr, auth configuration or environment.
    const version = r.status === 0 ? (r.stdout || '').match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?/)?.[0] : null;
    return { harness, installed: !r.error || r.error.code !== 'ENOENT', version: version || 'unknown',
      authentication: 'unknown', live_tested: false, models: 'unknown; use the configured executor model picker',
      cli: { fresh: 'supported', resume: 'supported', cancel: 'supported', wait: 'supported',
        access: 'tool restrictions; not a universal OS sandbox', actual_model: ['pi', 'omp'].includes(harness) ? 'runtime message metadata' : 'unknown' } };
  });
}

// One execution path. Legacy presets remain readable, but never switch accounts
// or replace a native/Paseo route silently during an upgrade.
export function resolveExecutor(agent, capabilities = [], available = () => true) {
  check(Array.isArray(capabilities), 'Capability evidence must be an array');
  const e = agent.executor, access = accessOf(agent), desired = e.transport || 'auto';
  check(['auto', 'cli'].includes(desired), `${desired} launch is retired; explicitly configure transport cli with the intended model/provider. Saved presets have not been changed.`);
  check(!capabilities.some(c => ['native', 'paseo'].includes(c.transport)), 'Host dispatch is retired; select the intended CLI connection explicitly and remove host capabilities');
  check(!e.inherit_model, 'CLI defaults cannot inherit the parent chat model');
  if (e.provider !== undefined) check(['codex', 'opencode', 'pi', 'omp'].includes(e.harness), `${e.harness}: provider selection is unsupported; use its configured connection without a provider override`);
  if (e.reasoning !== undefined) {
    check(e.harness !== 'gemini', 'Gemini CLI has no reasoning flag');
    check(e.harness === 'opencode' || efforts[e.harness]?.includes(e.reasoning), `${e.harness}: unsupported reasoning ${e.reasoning}`);
  }
  let model = e.model;
  if (e.harness === 'opencode') {
    if (e.provider) { check(!model.includes('/') || model.startsWith(`${e.provider}/`), 'OpenCode model conflicts with provider'); model = model.includes('/') ? model : `${e.provider}/${model}`; }
    check(model.includes('/'), 'OpenCode needs an exact provider/model identifier');
  }
  const cliCapability = capabilities.find(c => c.transport === 'cli' && c.harness === e.harness && c.verified === true && c.version &&
    (e.provider === undefined || c.provider === e.provider) && c.models?.some(m => m.id === model && m.reasoning?.includes(e.reasoning)));
  if (e.harness === 'opencode' && e.reasoning !== undefined) check(cliCapability, 'OpenCode reasoning variant needs verified per-model CLI capability evidence; unknown variants must not be silently ignored');
  if (['pi', 'omp'].includes(e.harness)) check(e.provider, `${e.harness}: specify provider for exact RPC model selection`);
  check(available(e.harness), `${e.harness} CLI is unavailable; the selected profile has not been replaced`);
  return { ...e, model, transport: 'cli', access, ...(cliCapability ? { capability: cliCapability } : {}), actual_model: null };
}
